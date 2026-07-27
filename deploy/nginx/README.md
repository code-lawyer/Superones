# Vault2077 双入口反向代理

本目录是生产部署模板，不是完整的身份网关替代品。`vault2077.com` 只提供公开站，`admin.vault2077.com` 必须先经过支持签名 JWT、邮箱白名单和 Passkey/MFA 的身份网关，再进入 Nginx 与仅监听 `127.0.0.1:3000` 的应用。

部署时：

1. 将 `vault2077-admin-proxy.conf.example` 复制为 `/etc/nginx/snippets/vault2077-admin-proxy.conf`；
2. 将 `vault2077.conf.example` 复制到 Nginx 站点目录，并替换域名与证书路径；
3. 确保公开主机在内部命名空间只精确开放 `POST /api/internal/acquisition` 与只读 `GET /api/internal/frontier/tasks`，并拒绝其余 `/api/internal/*`、`/admin`、`/api/admin/*`、`/pipeline`；
4. 确保管理主机在到达 Nginx 前已由身份网关认证，网关会覆盖而非追加身份断言头；
5. 防火墙不得把 Node 端口暴露给公网；应用只监听回环地址；
6. 生产必须使用模板中的 `proxy_set_header X-Forwarded-For $remote_addr` 与 `X-Real-IP $remote_addr` 后启用 `VAULT2077_TRUST_PROXY_HEADERS=true`。若前置 CDN/网关，先用 `set_real_ip_from` 限定受信出口，不能信任用户自行提交的转发头；
7. 接收入口的 `limit_req_zone` 必须位于 Nginx `http` 上下文；若发行版不从 `http` 上下文 include 站点文件，应把该声明移动到 `nginx.conf` 的 `http {}` 内；
8. 监控、worker、Frontier tick 和 `/pipeline` 使用回环或受控内网，不得为了方便把内部路径重新放回公开 `location /`；
9. 运行 `nginx -t`，然后从公网验证内部/管理路径为 `404`、伪造转发头不会被保留、接收入口非 POST 为 `405`，管理域名未认证时由身份网关拦截。

应用仍会验证管理主机、JWT 发行者/受众/签名/白名单、同源写请求与服务端会话。因此代理错误不会自动降级为共享密码登录；但“绕过身份网关直达源站”仍必须由防火墙和网络规则阻断。
