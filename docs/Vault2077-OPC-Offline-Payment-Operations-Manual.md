---
type: runbook
status: active
updated: 2026-08-11
---

# OPC 线下付款资料替换与启用手册

## 1. 存放模型

生产运行时只从 PostgreSQL 读取已发布付款资料。VPS 目录是替换入口，不是生产事实源；现有两个 OSS Bucket 都不用于本功能，避免扩大 `rangers/*` 和 `opc-contracts/*` 的既有最小权限。

VPS 固定目录：

```text
/srv/vault2077/shared/opc-offline-payment/
├── payment-profile.json
├── service-agreement.pdf
└── contact-qr.png
```

仓库模板位于 `config/opc-offline-payment-profile.template.json`，首版协议生成脚本位于 `scripts/build-opc-offline-agreement-pdf.py`。本地首版输出位于 `output/pdf/OPC-服务订单及线下对公转账协议-v1.pdf`。

## 2. 首次准备与替换

1. 在 VPS 创建目录，权限设为运行发布命令的受控运维用户可读写、Web 服务用户不可直接公开列目录。
2. 将模板复制为 `payment-profile.json`，填写新 `revision`、企业开户行、支行、银行账号和可选联行号。户名固定为“上海睿诚明达咨询管理有限公司”。占位文本会被发布器拒绝。
3. 把经负责人复核的协议覆盖为 `service-agreement.pdf`；文件必须为 PDF，最大 5MB。
4. 把联系人二维码覆盖为 `contact-qr.png`；也可在 JSON 中改为 `.jpg/.jpeg/.webp`，最大 2MB。页面只显示二维码，不显示联系人介绍。
5. 在当前 release 目录、加载 `/etc/vault2077/production.env` 的受控环境中执行：

```bash
npm run opc:publish-offline-payment-profile -- /srv/vault2077/shared/opc-offline-payment
```

6. 只核对命令返回的 `revision`、`publishedAt`、`agreementSha256` 和 `contactQrSha256`。命令不会打印银行账号。发布失败不影响旧修订。

每次替换必须同时准备三个文件并升级 `revision`，再执行一次发布命令。相同修订与相同内容可以幂等重放；相同修订出现任何账户或资产变化时发布器会拒绝，不能把旧页面静默指向新资料。不得直接修改数据库 JSON、release 内文件或公开 API 响应。历史订单保存原修订和哈希，新资料只影响后续页面与新订单。

## 3. 发布与开关

生产环境必须明确：

```text
VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED=false
VAULT2077_OPC_PAYMENTS_ENABLED=false
VAULT2077_OPC_PAPER_CHECKOUT_ENABLED=false
VAULT2077_OPC_PAYMENT_EMAIL_ENABLED=true
```

生产事务邮件必须使用 `superones.top` 或其子域发件地址，SMTP 用户名必须与 From 一致。首发已经确认复用根域现有飞书邮箱：公共发件地址为 `orders@superones.top`，生产使用 `smtp.feishu.cn:465`、同名 user/from 与飞书生成的专用密码，回复地址固定为 `lanzhouda@163.com`；根域 MX 不迁移，专用密码只写入 VPS root-only 环境。若后续订单量、退信治理或投递统计需要独立通道，再迁移到不改动根域飞书 MX/SPF 的阿里云邮件推送子域 `notify.superones.top`，并按控制台当时生成的 SPF、DKIM、DMARC、MX 和所有权记录原样配置。完整官方依据见[同域事务邮件调研](research/domain-transactional-email-superones-2026-08-11.md)。

启用前先向一个外部测试用户邮箱和 `lanzhouda@163.com` 各发送真实测试。用户应收到下单与到账摘要并只链接公开订单状态页；负责人应在下单和到账时收到脱敏摘要并只链接独立管理域名。四类事件必须各发送一次，失败重试不得生成新的 Message-ID。邮件不得嵌入联系人二维码、微信/QQ、完整联系人、付款户名、企业银行账号或恢复凭证。

先发布付款资料，再部署包含线下付款代码的 release，运行 `npm run deploy:check`、数据库迁移、health 和后台验收。Nginx 必须使用随 release 提供的精确协议 PDF location，先通过 `nginx -t`，再确认该 PDF 只有一个 `X-Frame-Options: SAMEORIGIN`、弹窗可预览且跨站嵌入失败；二维码和其他页面仍须为 `DENY`。确认企业户名、账号、协议弹窗预览/下载、二维码、移动端布局和后台到账核验全部通过后，负责人明确 Go 才可把 `VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED` 改为 `true` 并重启 Web。线上支付宝开关必须继续为 `false`；该开关只禁止新建支付宝付款，不得删除生产中既有的支付宝 APPID、PID、私钥和支付宝公钥，因为历史支付宝订单仍需验真、查询、关单和退款。

## 4. 到账核验

管理员进入独立管理域名，查看 OPC 待付款订单，点击“确认银行到账”。系统要求最近五分钟 Passkey 再认证，并依次输入银行流水号、付款户名和北京时间入账时间；后台使用 `datetime-local` 输入并在提交时转换为带时区的 ISO 8601。金额来自订单固定金额，不能在后台改写。确认后系统校验唯一流水号、金额、订单版本和账户快照，成功才进入“已到账”。

银行流水号会在保存、判重和审计指纹前统一规范为大写。尚未确认到账且用户明确不再付款的订单，可在后台点击“取消未付款订单”；该操作同样要求最近五分钟再认证并写审计，取消满 90 天后由维护任务清除非必要联系人。已确认到账的订单不得使用此取消入口。

不得凭用户截图直接确认到账。少付、超付、分笔、第三方代付、无订单号或重复金额先人工查清，不要用错误流水强行绑定。付款户名加密保存，审计只留流水指纹。

## 5. 回滚

- 立即停止新订单：把 `VAULT2077_OPC_OFFLINE_PAYMENT_ENABLED=false`，重启 Web，并验证公开订单页 404、创建接口 503。
- 资料错误但无需停站：在暂存目录放入纠正后的三个文件，使用新修订号重新发布；不要改写旧修订或历史订单。
- 代码回滚：按标准 release 回滚流程切回上一 release；PostgreSQL 中已形成的线下订单和资料快照不得删除。
- 错误确认到账：不要直接改数据库或伪造退款状态；立即停止后续履约，保留审计和银行证据，由负责人决定纠正与退款流程。

## 6. 当前生产发布状态

负责人已于 2026-08-11 提供真实企业银行账户和联系人二维码，审阅正式版协议并授权上线测试。这些真实业务资料不进入 Git；必须经固定暂存目录原子发布到 PostgreSQL。完成目标 VPS 的资料发布、release 部署、生产验收和开关核验前，仍不能描述为已开放收款。
