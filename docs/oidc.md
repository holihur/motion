# OIDC 单点登录

可以在 **Ops → Single sign-on (OIDC)** 中配置，也可以使用环境变量作为首次启动默认值。Ops 保存后立即生效，无需重启。

## 字段

- Issuer URL
- Client ID
- Client Secret（加密存储）
- Callback URL：默认 `https://你的域名/api/auth/oidc/callback`，留空时按请求主机自动推导
- Scopes：默认 `openid,email,profile`
- Allowed email domains：可选
- Auto create accounts：关闭时只允许已存在的 Motion 账号登录

## Google

1. Google Cloud Console → APIs & Services → Credentials → OAuth client ID（Web）
2. Authorized redirect URI 填 `https://你的域名/api/auth/oidc/callback`
3. Ops 填写：
   - Issuer: `https://accounts.google.com`
   - Client ID / Secret
   - Button label: `Continue with Google`

## Keycloak

- Issuer: `https://keycloak.example.com/realms/<realm>`
- Client: confidential，Standard Flow
- Valid redirect URI: `https://你的域名/api/auth/oidc/callback`
- Scopes 默认 `openid,email,profile`

## Auth0

- Issuer: `https://<tenant>.auth0.com/`
- Application: Regular Web Application
- Allowed Callback URLs 同上

## 行为

- 通过邮箱匹配已有 Motion 账号，自动关联 OIDC Subject
- 新用户会自动创建工作区和 Welcome 页面
- `email_verified=false` 会被拒绝
- 登录成功后通过一次性 HttpOnly Cookie 交换 JWT，再重定向到 `/auth/callback`
