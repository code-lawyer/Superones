---
type: decision
status: superseded
updated: 2026-07-31
---

# 阿里云轻量服务器与后台 OIDC 身份决策

> 2026-08-12 更新：负责人明确不购买阿里云 IDaaS。本决策仅保留为已退役 OIDC 提案的历史说明，不再描述当前实现；OIDC 路由和配置已经从运行时代码删除。当前实现是项目内原生 Passkey，见 ADR-0012 与 `Vault2077-Aliyun-Mainland-Production-Handoff.md`；上线前仍须按当前上线清单完成真实设备、域名、TLS、RDS 和网络边界验收。

## 1. 结论

阿里云轻量应用服务器负责运行 Nginx、Node 应用和境内 Worker；阿里云 IDaaS EIAM 负责管理员账号、MFA 和 OIDC 身份签发，Vault2077 自身负责 OIDC 授权码流程与后台会话。两者职责不同，但都可以采用阿里云产品。

Cloudflare 与阿里云轻量服务器没有必然关系。Cloudflare Access 是一种可选的外部身份访问网关，能够在任意源站前完成登录并签发 JWT，所以早期模板使用了其默认断言头 `cf-access-jwt-assertion`。本项目没有必须使用 Cloudflare 的业务或技术条件。

面向中国大陆首发，确定采用：

1. `superones.top` 与 `admin.superones.top` 解析到阿里云境内入口；
2. 阿里云轻量应用服务器运行应用，但 Node 仅监听 `127.0.0.1:3000`；
3. 公开站由 Nginx 直接代理；
4. 后台使用阿里云 IDaaS EIAM 的 OIDC 登录、管理员白名单和 WebAuthn/TOTP MFA；
5. 应用使用原生 OIDC 授权码回调适配，成功后创建可撤销后台会话；
6. 不引入 Cloudflare，除非以后有明确的 CDN、抗攻击或统一零信任需求，并完成大陆可用性与合规评估。

## 2. 为什么仍然需要托管身份服务

后台可以发布服务目录和赛季奖励、处理订单、查看联系方式并执行退款等高风险操作。只依靠“隐藏 URL”、Nginx Basic Auth 或一个长期共享密码，缺少以下上线必需能力：

- 管理员身份白名单；
- 抗钓鱼 MFA 或 Passkey；
- 登录失败与账号恢复策略；
- 短期身份凭证与密钥轮换；
- 注销、单会话撤销和高风险操作重新认证；
- 统一的身份审计。

托管身份服务不是为了让公开网站可访问，而是为了避免管理后台成为整站最薄弱的入口。当前实现是应用原生 OIDC，不在 Nginx 前增加一个注入 JWT 请求头的代理网关。

## 3. 当前实现

应用已实现：

- `/api/admin/oidc/start` 登录与再认证入口；
- `/api/admin/oidc/callback` 授权码回调；
- 短期 HttpOnly 签名事务 Cookie；
- state、nonce、PKCE S256；
- authorization code 服务端换取 Token；
- ID Token issuer、client ID、RS256/JWKS、时效、nonce 和邮箱白名单验证；
- 唯一 owner `lanzhouda@163.com`；
- IDaaS 注销、五分钟强制重新认证、可撤销应用会话与不可变审计；
- 生产配置门禁和自动化测试。

尚需在真实 IDaaS 实例中取得 issuer、client ID、client secret，配置回调和 MFA 后完成端到端验收。

## 4. 轻量服务器的网络事实

轻量应用服务器使用独立的自动化 VPC，不会因为与 RDS 在同一地域就自动进入同一 VPC。若继续使用 RDS PostgreSQL，应在同账号、同地域下配置轻量服务器与 VPC 的内网互通，并用数据库白名单、安全组、TLS 和最小权限限制访问。

首发网络验收至少包括：

- 公网只开放 `80/443`，SSH 只允许固定运维来源；
- Node 端口和数据库端口不对公网开放；
- 公开域名不能访问 `/admin` 和 `/api/admin/*`；
- 后台域名未登录时只能看到登录入口，不能读取后台数据或执行后台写操作；
- 裸服务器 IP、回源地址和伪造身份请求头不能绕过认证；
- RDS 私网连接、TLS、备份和隔离恢复均验证成功。

## 5. 已确认负责人决策

负责人已于 2026-07-30 确认：

- 接受购买或使用支持自研 OIDC 应用的阿里云 IDaaS EIAM 版本；
- 唯一生产管理员邮箱为 `lanzhouda@163.com`。

该账户必须由负责人本人独占、长期可用，在 IDaaS 中保持启用并通过 `email` scope 返回同一小写邮箱。

## 6. 官方依据

- [阿里云 IDaaS 产品概述](https://help.aliyun.com/zh/idaas/product-overview/product-overview-2)
- [阿里云 IDaaS EIAM 自研应用 OIDC 单点登录](https://help.aliyun.com/zh/idaas/eiam/user-guide/sso-integration-through-oidc)
- [阿里云 IDaaS EIAM OIDC 开发参考](https://help.aliyun.com/zh/idaas/eiam/developer-reference/integrate-sso-with-oidc)
- [阿里云 IDaaS EIAM 常用安全配置](https://help.aliyun.com/zh/idaas/eiam/user-guide/common-configuration)
- [阿里云 IDaaS 计费说明](https://help.aliyun.com/zh/idaas/eiam/product-overview/pricing)
- [轻量应用服务器网络与内网互通](https://help.aliyun.com/zh/simple-application-server/network-security01)
