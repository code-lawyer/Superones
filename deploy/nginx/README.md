# Vault2077 双入口反向代理

本目录是生产双域名反向代理模板。`superones.top` 只提供公开站，`admin.superones.top` 提供管理页面与项目内原生 WebAuthn/Passkey 接口；Node 仅监听 `127.0.0.1:3000`。Cloudflare 和付费 IDaaS 均不在当前生产链路中。

生产认证由应用校验 RP ID、HTTPS 来源、一次性挑战、认证器签名、用户验证和签名计数器，并创建可撤销服务端会话。不得用 Nginx Basic Auth、共享密码或客户端身份头替代。恢复只允许 SSH 本地签发十分钟注册令牌或使用离线恢复码。

部署步骤：

1. 将 `vault2077-admin-proxy.conf.example` 复制为 `/etc/nginx/snippets/vault2077-admin-proxy.conf`。
2. 将 `vault2077-edge-error-security.conf.example` 复制为 `/etc/nginx/snippets/vault2077-edge-error-security.conf`。
3. 将 `vault2077-default-reject.conf.example` 复制到 Nginx 站点目录并确保启用；它必须作为 HTTP/HTTPS 的 `default_server` 拒绝未知 Host 和直接源站 IP 访问。
4. 将 `vault2077.conf.example` 复制到 Nginx 站点目录，并替换域名与证书路径。
5. 确保公开主机只精确开放 `POST /api/internal/acquisition` 与只读 `GET /api/internal/frontier/tasks`；其余 `/api/internal/*`、`/admin`、`/api/admin/*`、`/pipeline` 必须拒绝。
6. 配置 `VAULT2077_ADMIN_ORIGIN=https://admin.superones.top`。应用从该来源派生 Passkey RP ID；更换管理域名会改变凭证适用范围，必须先完成迁移演练。
7. 通过 SSH 在应用目录执行 `npm run admin:passkey:enroll`，把一次性令牌仅交给唯一 owner；在真实 HTTPS 管理域名注册至少两个独立认证器，并离线保存首次显示的恢复码。
8. 防火墙不得把 Node 端口暴露给公网；应用只监听回环地址。
9. 保留模板中的 `proxy_set_header X-Forwarded-For $remote_addr` 与 `X-Real-IP $remote_addr` 后再启用 `VAULT2077_TRUST_PROXY_HEADERS=true`。若增加 CDN/网关，先用 `set_real_ip_from` 限定受信出口。
10. `limit_req_zone` 必须位于 Nginx `http` 上下文；若发行版不从该上下文 include 站点文件，应把声明移动到 `nginx.conf` 的 `http {}` 内。
11. 监控、worker、Frontier tick 和 `/pipeline` 使用回环或受控内网，不得为方便重新公开内部路径。
12. 运行 `nginx -t` 后，从公网验证：公开域名的内部/管理路径为 `404`；接收入口非 POST 为 `405`；匿名管理写接口为 `401`；伪造转发头和身份断言头无效；服务器 IP 与 Node 端口不能绕过管理域名。
13. 验证 Passkey 注册、登录、注销、五分钟内再认证、凭证撤销、恢复码兑换和紧急 `--revoke-existing` 流程，并保存验收证据。

完整配置与恢复步骤见 `docs/Vault2077-Deployment-Configuration-Manual.md` 和 `docs/Vault2077-Admin-Operations-Spec.md`。
