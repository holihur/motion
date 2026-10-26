# 部署

## Docker Compose

```bash
cp .env.example .env
# 修改 JWT_SECRET、ENCRYPTION_KEY、ADMIN_EMAILS、OPS_TOKEN
docker compose up -d --build
```

默认端口 `8787`，MongoDB 数据保存在 `motion-mongo` volume。请在 `.env` 中设置 `OPS_TOKEN`（可用 `openssl rand -base64 32` 生成），否则 `/ops` 会保持关闭。

## 一键安装（Linux）

```bash
curl -fsSL https://raw.githubusercontent.com/holihur/motion/main/install.sh | sudo bash -s -- \
  --admin-email you@example.com
```

前置：MongoDB 已运行，或者使用 Docker Compose 启动 Mongo。安装脚本会：

1. 下载最新 GitHub Release 并校验 SHA256
2. 安装到 `/opt/motion/motion`
3. 创建 `motion` 系统用户
4. 生成 `/etc/motion/motion.env`（含随机 JWT/加密密钥与 `OPS_TOKEN`）
5. 安装并启动 `motion.service`（`Restart=always`，支持自动更新重启）

安装完成后脚本会输出 Ops 地址与独立 Ops token。Ops 与普通用户账号完全分离，即使账号是工作区管理员，也必须输入 `OPS_TOKEN` 才能进入。token 保存在 `/etc/motion/motion.env`（root:motion, 0640）；轮换时修改该值并重启 Motion。

常用命令（仅在需要排障时）：

```bash
systemctl status motion
journalctl -u motion -f
```

## 反向代理

Motion 需要 WebSocket（`/api/ws`）与普通 HTTP。Caddy 示例：

```caddyfile
motion.example.com {
    reverse_proxy 127.0.0.1:8787
}
```

Nginx 需要转发 Upgrade：

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## 备份

```bash
mongodump --db motion --out /backup/motion-$(date +%F)
mongorestore --db motion /backup/motion-YYYY-MM-DD/motion
```

## 自动更新

在 **Ops → Updates** 中选择：

- `off`：关闭
- `check`：定期检查并提示
- `apply`：检查、下载、SHA256 校验、替换二进制并退出，由 systemd/Docker 拉起

Docker 部署建议使用镜像更新（`docker compose pull && docker compose up -d`），不要在容器内自更新。

## 单二进制

`make build` 会把前端打包进 Go 二进制：

```bash
./server/bin/motion
```

没有外部 `web/` 目录也可以运行。开发时如果存在 `web/dist`，会优先使用磁盘文件。

## 运行时配置优先级

环境变量只提供初始默认值。通过 Ops token 登录后在 Ops 页面保存的 OIDC、注册开关、MCP、管理员邮箱、AI 默认模型、更新策略都以数据库配置为准，立即生效，无需重启。

## Ops 访问控制

- `/ops` 使用独立 `OPS_TOKEN`，不读取用户 JWT，也不依赖 `ADMIN_EMAILS`。
- API 请求使用 `X-Ops-Token` 头；token 只保存在浏览器 `sessionStorage`，关闭标签页即失效。
- `OPS_TOKEN` 为空时 Ops API 返回 503，相当于关闭 Ops。
- 建议使用 32 字节以上随机值，并通过 HTTPS 访问。
