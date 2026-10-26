#!/usr/bin/env bash
# Motion one-click installer for Linux (systemd) and macOS (binary only).
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/holihur/motion/main/install.sh | sudo bash
#   curl -fsSL ... | sudo bash -s -- --admin-email you@example.com --auto-update
set -euo pipefail

REPO="${UPDATE_REPO:-holihur/motion}"
VERSION=""
MONGO_URI="${MONGODB_URI:-mongodb://127.0.0.1:27017}"
PORT="${PORT:-8787}"
ADMIN_EMAIL=""
OPS_TOKEN="${OPS_TOKEN:-}"
AUTO_UPDATE="off"
NO_SERVICE="false"

for arg in "$@"; do
  case "$arg" in
    --version=*) VERSION="${arg#*=}" ;;
    --mongo-uri=*) MONGO_URI="${arg#*=}" ;;
    --port=*) PORT="${arg#*=}" ;;
    --admin-email=*) ADMIN_EMAIL="${arg#*=}" ;;
    --ops-token=*) OPS_TOKEN="${arg#*=}" ;;
    --auto-update) AUTO_UPDATE="apply" ;;
    --no-service) NO_SERVICE="true" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \{0,1\}//' | head -8
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
esac
case "$OS" in
  linux|darwin) ;;
  *) echo "Motion installer supports Linux and macOS. Use Docker on other systems." >&2; exit 1 ;;
esac

for command in curl tar; do
  command -v "$command" >/dev/null || { echo "Missing required command: $command" >&2; exit 1; }
done

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run the installer as root (for example with sudo)." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "→ Finding the latest Motion release…"
if [[ -n "$VERSION" ]]; then
  API="https://api.github.com/repos/${REPO}/releases/tags/${VERSION}"
else
  API="https://api.github.com/repos/${REPO}/releases/latest"
fi
curl -fsSL "$API" -o "$TMP/release.json"
TAG="$(grep -m1 '"tag_name"' "$TMP/release.json" | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
ASSET_URL="$(grep -o '"browser_download_url": *"[^"]*"' "$TMP/release.json" \
  | sed -E 's/.*"(https:[^"]+)"/\1/' \
  | grep -E "motion_.*_${OS}_${ARCH}\.tar\.gz$" | head -n1 || true)"
CHECKSUM_URL="$(grep -o '"browser_download_url": *"[^"]*"' "$TMP/release.json" \
  | sed -E 's/.*"(https:[^"]+)"/\1/' \
  | grep -E 'checksums\.txt$' | head -n1 || true)"
[[ -n "$ASSET_URL" ]] || { echo "No release asset found for ${OS}/${ARCH}." >&2; exit 1; }
ASSET_NAME="$(basename "$ASSET_URL")"
echo "→ Installing Motion ${TAG} (${OS}/${ARCH})"

curl -fsSL "$ASSET_URL" -o "$TMP/$ASSET_NAME"
if [[ -n "$CHECKSUM_URL" ]]; then
  curl -fsSL "$CHECKSUM_URL" -o "$TMP/checksums.txt"
  EXPECTED="$(grep " ${ASSET_NAME}$" "$TMP/checksums.txt" | awk '{print $1}' | head -n1)"
  if [[ -n "$EXPECTED" ]]; then
    if command -v sha256sum >/dev/null; then
      ACTUAL="$(sha256sum "$TMP/$ASSET_NAME" | awk '{print $1}')"
    else
      ACTUAL="$(shasum -a 256 "$TMP/$ASSET_NAME" | awk '{print $1}')"
    fi
    if [[ "$ACTUAL" != "$EXPECTED" ]]; then
      echo "Checksum verification failed." >&2
      exit 1
    fi
    echo "→ Checksum verified"
  fi
fi

tar -xzf "$TMP/$ASSET_NAME" -C "$TMP"
BINARY="$TMP/motion"
[[ -f "$BINARY" ]] || BINARY="$TMP/motion.exe"
[[ -f "$BINARY" ]] || { echo "Release archive did not contain a motion binary." >&2; exit 1; }

install -d -m 0755 /opt/motion
install -m 0755 "$BINARY" /opt/motion/motion
ln -sf /opt/motion/motion /usr/local/bin/motion

if [[ "$OS" == "darwin" || "$NO_SERVICE" == "true" || ! -d /run/systemd/system ]]; then
  cat <<EOF

Motion is installed at /opt/motion/motion.

Start it with:
  PORT=${PORT} MONGODB_URI=${MONGO_URI} SEED_DEMO=false OPS_TOKEN=${OPS_TOKEN:-<set-a-token>} /opt/motion/motion

Then open http://127.0.0.1:${PORT}/ops and enter the Ops token. See README.md
for Docker instructions if you prefer a supervised container.
EOF
  exit 0
fi

if ! id motion >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/motion --shell /usr/sbin/nologin motion
fi
install -d -o motion -g motion -m 0755 /opt/motion /var/lib/motion
chown motion:motion /opt/motion/motion
install -d -m 0750 /etc/motion

ENV_FILE="/etc/motion/motion.env"
if [[ -f "$ENV_FILE" && -z "$OPS_TOKEN" ]]; then
  OPS_TOKEN="$(grep '^OPS_TOKEN=' "$ENV_FILE" | head -n1 | cut -d= -f2- || true)"
fi
if [[ -z "$OPS_TOKEN" ]]; then
  OPS_TOKEN="$(head -c 32 /dev/urandom | base64 | tr -d '\n=' | tr '/+' '_-')"
fi
if [[ ! -f "$ENV_FILE" ]]; then
  JWT_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n=' | tr '/+' '_-')"
  ENCRYPTION_KEY="$(head -c 48 /dev/urandom | base64 | tr -d '\n=' | tr '/+' '_-')"
  cat > "$ENV_FILE" <<EOF
PORT=${PORT}
MONGODB_URI=${MONGO_URI}
MONGODB_DB=motion
APP_NAME=Motion
SEED_DEMO=false
ALLOW_SIGNUP=true
MCP_ENABLED=true
ADMIN_EMAILS=${ADMIN_EMAIL}
OPS_TOKEN=${OPS_TOKEN}
JWT_SECRET=${JWT_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}
AUTO_UPDATE=${AUTO_UPDATE}
EOF
else
  sed -i "s#^PORT=.*#PORT=${PORT}#" "$ENV_FILE"
  sed -i "s#^MONGODB_URI=.*#MONGODB_URI=${MONGO_URI}#" "$ENV_FILE"
  grep -q '^ADMIN_EMAILS=' "$ENV_FILE" || echo "ADMIN_EMAILS=${ADMIN_EMAIL}" >> "$ENV_FILE"
  if grep -q '^OPS_TOKEN=' "$ENV_FILE"; then
    sed -i "s#^OPS_TOKEN=.*#OPS_TOKEN=${OPS_TOKEN}#" "$ENV_FILE"
  else
    echo "OPS_TOKEN=${OPS_TOKEN}" >> "$ENV_FILE"
  fi
  if [[ -n "$ADMIN_EMAIL" ]]; then
    sed -i "s#^ADMIN_EMAILS=.*#ADMIN_EMAILS=${ADMIN_EMAIL}#" "$ENV_FILE"
  fi
  sed -i "s#^AUTO_UPDATE=.*#AUTO_UPDATE=${AUTO_UPDATE}#" "$ENV_FILE"
fi
chown root:motion "$ENV_FILE"
chmod 0640 "$ENV_FILE"

cat > /etc/systemd/system/motion.service <<'UNIT'
[Unit]
Description=Motion workspace
After=network-online.target mongod.service
Wants=network-online.target

[Service]
Type=simple
User=motion
Group=motion
WorkingDirectory=/opt/motion
EnvironmentFile=/etc/motion/motion.env
ExecStart=/opt/motion/motion
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true
ReadWritePaths=/opt/motion

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable motion >/dev/null 2>&1 || true
systemctl restart motion

echo "→ Waiting for Motion to come online…"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then
  echo "Motion did not become healthy. Check: journalctl -u motion -n 100" >&2
  exit 1
fi

IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
cat <<EOF

✅ Motion is running.

   Local:  http://127.0.0.1:${PORT}
   LAN:    http://${IP:-your-server-ip}:${PORT}
   Ops:    http://127.0.0.1:${PORT}/ops
   Ops token: ${OPS_TOKEN}

Ops is protected by a dedicated access token, separate from user accounts.
The first account you create becomes a workspace administrator. Everything
else — OIDC, BYOK AI keys, MCP, update policy and members — is configured in
Ops, so you do not need to edit the command line after installation.

Keep the Ops token private. It is stored in /etc/motion/motion.env (root:motion,
0640). To rotate it, change OPS_TOKEN there and restart Motion.

Useful only if needed:
   systemctl status motion
   journalctl -u motion -f
   /etc/motion/motion.env
EOF
