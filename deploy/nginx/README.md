# Vault2077 双入口反向代理

本目录是生产部署模板，不是完整的身份网关替代品。`vault2077.com` 只提供公开站，`admin.vault2077.com` 必须先经过支持签名 JWT、邮箱白名单和 Passkey/MFA 的身份网关，再进入 Nginx 与仅监听 `127.0.0.1:3000` 的应用。

部署时：

1. 将 `vault2077-admin-proxy.conf.example` 复制为 `/etc/nginx/snippets/vault2077-admin-proxy.conf`；
2. 将 `vault2077.conf.example` 复制到 Nginx 站点目录，并替换域名与证书路径；
3. 确保公开主机明确拒绝 `/admin`、`/api/admin/*`、`/pipeline`；
4. 确保管理主机在到达 Nginx 前已由身份网关认证，网关会覆盖而非追加身份断言头；
5. 防火墙不得把 Node 端口暴露给公网；应用只监听回环地址；
6. 若启用 `VAULT2077_TRUST_PROXY_HEADERS=true`，还必须在 Nginx/网关中配置受信任代理地址和真实客户端 IP 头，不能信任用户自行提交的转发头；
7. 运行 `nginx -t`，然后从公网验证公开域名无法访问管理路径，管理域名未认证时由身份网关拦截。

应用仍会验证管理主机、JWT 发行者/受众/签名/白名单、同源写请求与服务端会话。因此代理错误不会自动降级为共享密码登录；但“绕过身份网关直达源站”仍必须由防火墙和网络规则阻断。
