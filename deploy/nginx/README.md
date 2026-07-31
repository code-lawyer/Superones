# Vault2077 双入口反向代理

本目录是生产双域名反向代理模板。`superones.top` 只提供公开站，`admin.superones.top` 提供管理页面和阿里云 IDaaS OIDC 登录/回调接口；Node 仅监听 `127.0.0.1:3000`。

阿里云轻量应用服务器是应用源站，IDaaS 是后台身份提供方，两者不是同一种服务。Cloudflare 不在当前生产链路中。应用使用 OIDC 授权码、state、nonce、PKCE、ID Token/JWKS、唯一邮箱白名单和可撤销会话完成认证；不能用 Nginx Basic Auth 或共享密码替代。完整决策见 `docs/Vault2077-Aliyun-Identity-Gateway-Decision.md`。

部署时：

1. 将 `vault2077-admin-proxy.conf.example` 复制为 `/etc/nginx/snippets/vault2077-admin-proxy.conf`；
2. 将 `vault2077.conf.example` 复制到 Nginx 站点目录，并替换域名与证书路径；
3. 确保公开主机在内部命名空间只精确开放 `POST /api/internal/acquisition` 与只读 `GET /api/internal/frontier/tasks`，并拒绝其余 `/api/internal/*`、`/admin`、`/api/admin/*`、`/pipeline`；
4. 在 IDaaS 自研应用中只授权唯一 owner，配置登录回调 `https://admin.superones.top/api/admin/oidc/callback`、登出回调和 `openid email profile`；
5. 防火墙不得把 Node 端口暴露给公网；应用只监听回环地址；
6. 生产必须使用模板中的 `proxy_set_header X-Forwarded-For $remote_addr` 与 `X-Real-IP $remote_addr` 后启用 `VAULT2077_TRUST_PROXY_HEADERS=true`。若前置 CDN/网关，先用 `set_real_ip_from` 限定受信出口，不能信任用户自行提交的转发头；
7. 接收入口的 `limit_req_zone` 必须位于 Nginx `http` 上下文；若发行版不从 `http` 上下文 include 站点文件，应把该声明移动到 `nginx.conf` 的 `http {}` 内；
8. 监控、worker、Frontier tick 和 `/pipeline` 使用回环或受控内网，不得为了方便把内部路径重新放回公开 `location /`；
9. 运行 `nginx -t`，然后从公网验证公开域名的内部/管理路径为 `404`、伪造转发头不会被保留、接收入口非 POST 为 `405`，管理写接口未登录时为 `401`，OIDC 回调缺少或伪造 state 时无法创建会话。

应用验证管理主机、OIDC issuer/client ID/nonce/JWKS/签名/白名单、同源写请求与服务端会话。生产不会降级为共享密码登录；Node 端口仍必须由轻量防火墙阻断公网访问。
