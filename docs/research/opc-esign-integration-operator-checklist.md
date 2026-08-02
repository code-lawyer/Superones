---
type: research
status: reference
updated: 2026-08-01
---

> 本地界面预览无需 e 签宝或支付宝凭证：开发环境不设置 `VAULT2077_OPC_ESIGN_PROVIDER`，运行 `npm run dev` 后即可使用模拟签署页走到“协议已签，付款暂不可用”。模拟流程不执行实名认证，也不产生有效电子合同；生产环境不会启用该降级路径。

# OPC 接入 e签宝：技术流程与操作责任清单

> 核查日期：2026-08-01
> 资料范围：仅使用 e签宝开放平台、公有云 SaaS API V3 官方文档。
> 目标场景：用户创建 OPC 服务订单后、进入支付宝付款码前，先签署一份服务协议；服务提供企业作为另一签署方自动盖章。
> 边界：本文说明技术集成与平台操作，不代替合同、印章授权或个人信息处理的法律审查。

## 结论

**不能完全由 Codex 一个人从零做到生产上线，但用户需要亲自操作的部分很少且集中在一次性的平台治理环节。**

- 必须由用户侧企业管理员、法定代表人或被授权人员完成：注册和实名认证、商务购买及套餐生效、正式应用开通、企业印章及自动用印授权、批准合同正文，以及首次生产上线确认。这些动作涉及真实身份、人脸/短信认证、企业权限、付费或签署授权书，Codex 不能代替有权人员表达意愿。
- 用户完成上述前置并把必要的非秘密 ID、批准文本和环境配置交付后，Codex 可以独立完成本仓库里的服务端 API 适配、订单状态机、托管 H5 跳转、回调验签、主动查询、最终 PDF 下载验签归档、测试和运维文档。
- `AppSecret` 不应发在聊天、Issue 或本文中。用户或运维人员应把它写入本地 `.env`（不提交）及生产密钥管理服务；Codex 只读取环境变量名完成接线。

推荐首版采用“**合同文件模板 + 基于文件发起签署 + appId 所属企业自动落章 + 自然人手动签署 + e签宝托管 H5 全页跳转**”。这比让用户在 Vault2077 页面内自行画签名更可靠，也比首版做 iframe、纯 API 实名页面或跨企业用印更简单。

## 一、一次性开通：谁必须做什么

| 顺序 | 工作 | 必须操作的人 | Codex 能做什么 | 交付给开发的结果 | 官方依据 |
|---|---|---|---|---|---|
| 1 | 注册个人账号、个人实名，创建企业并完成企业实名 | 企业管理员本人；认证环节可能需要法定代表人或经办人配合 | 提供逐步操作说明，不能代替实名、短信或刷脸 | 已实名的企业开发者账号、确定的企业法定全称 | [企业开发者账号注册及实名认证流程](https://open.esign.cn/doc/opendoc/helper/ogfnv9) |
| 2 | 确认购买版本、计费项、短信/实名子服务，完成商务合同或支付 | 有采购/付款权限的人；与 e签宝商务经理确认 | 根据已批准场景列所需能力，不能代替购买 | 已支付、可用的签署及认证服务订单 | [公有云接入流程](https://open.esign.cn/doc/opendoc/helper3/szivwh)、[套餐生效说明](https://open.esign.cn/doc/opendoc/helper/xw5hlihdd1zdrzx9) |
| 3 | 生效套餐 | **仅企业管理员**；官方说明套餐生效后有效期开始，且不可更改 | 提醒在系统联调完成、准备上线时再生效 | 正式应用可计费调用；确认计费模式与套餐一致 | [如何生效订购的套餐](https://open.esign.cn/doc/opendoc/helper/xw5hlihdd1zdrzx9) |
| 4 | 给工程实施人员开“开发者”角色/权限 | 企业管理员 | 可告知所需最小权限，不能自行授予 | 可创建/查看沙箱、应用和相关配置的账号 | [开发者指南（SaaS API V3）](https://open.esign.cn/doc/opendoc/dev-guide3/lbva7leuuze3zwt9)、[如何设置开发者角色权限](https://open.esign.cn/doc/opendoc/helper/etspg7l01wy74nrm) |
| 5 | 创建沙箱应用并配置沙箱安全项 | 企业管理员或已获开发者权限的人员 | 若控制台权限已经安全交付，可协助配置；无需接触生产密钥即可先写代码 | 沙箱 `AppId`、沙箱 `AppSecret`、IP 白名单、重定向域名、沙箱 API Host | [沙箱环境使用说明](https://open.esign.cn/doc/detail?id=opendoc%2Fsaas_api%2Fvwtg6m&namespace=opendoc%2Fsaas_api) |
| 6 | 创建正式应用，配置出口 IP、重定向域名等 | 企业管理员或已获开发者权限的人员；若无应用额度需先生效相应套餐 | 可给出准确配置值并验证应用连通性；生产密钥应由用户/运维写入密钥管理系统 | 正式 `AppId`、生产 Host、安全配置和密钥注入完成 | [正式生产环境使用说明](https://open.esign.cn/doc/opendoc/dev-guide3/mezw5n) |
| 7 | 批准最终服务协议母版及动态字段 | 签约主体的业务负责人和法律审核人 | 可把批准版本制作成技术模板、定义字段白名单和版本号，不能自行批准合同含义 | 最终 PDF/Word 母版，动态字段清单，成立/生效规则，版本号 | e签宝要求签署前向用户展示待签文件并取得同意，见[公有云接入流程及规范](https://open.esign.cn/doc/opendoc/helper3/szivwh) |
| 8 | 在沙箱和正式环境分别制作/发布合同模板 | 企业管理员或有模板创建权限的人；Codex 可在其授权下协助录入 | 可准备底稿、控件 Key、坐标和校验表；也可通过官方“制作模板页面”API接线 | 两套环境各自的 `docTemplateId`、控件 Key/ID、模板版本 | [流程模板官网制作及使用手册](https://open.esign.cn/doc/opendoc/helper/ih4q808l3x7f5olw)、[填写模板生成文件](https://open.esign.cn/doc/opendoc/pdf-sign3/mv8a3i) |
| 9 | 确认企业印章和用印方式 | 企业管理员、法定代表人或有印章管理权限的人 | 可查询和接线印章 ID，不能替代企业作出印章使用授权 | 选定的 `sealId` 或确认使用 appId 企业默认印章 | [产品概念：企业实名后自动创建默认模板印章](https://open.esign.cn/doc/opendoc/dev-guide3/fvey1bfux7vxtxgp)、[官网查看企业印章 ID](https://open.esign.cn/doc/opendoc/helper/xvglqhiq48prkf4m) |
| 10 | 若采用模板限定的自动落章，签署印章授权书 | **企业管理员或法定代表人必须亲自完成授权书签署和意愿认证** | 可调用授权 API、生成授权链接、接收回调、保存授权业务编号，但不能代签授权书 | 已生效的授权、授权期限、模板范围、`sealAuthBizId` | [流程模板如何自动落章](https://open.esign.cn/doc/opendoc/helper/si1ih3va3oilpd24)、[内部成员印章授权](https://open.esign.cn/doc/opendoc/seal3/fu6ov5) |
| 11 | 若签约企业不是 appId 所属企业，做跨企业印章授权 | 授权企业的**管理员或法定代表人**亲自签授权书并完成意愿认证；该能力还要求相应高级版本 | 可发起授权、生成授权链接、接收生效/失效回调并在签署接口中传 `assignedSealId` | 委托企业 `orgId`、授权印章 `sealId`、生效授权和期限 | [跨企业印章授权与自动签署流程](https://open.esign.cn/doc/opendoc/helper/ryllt4y4x6bemr7b)、[印章开放服务介绍](https://open.esign.cn/doc/opendoc/seal-open-api/intro) |
| 12 | 上线报备与最终启用 | 用户方项目负责人；与 e签宝交付顾问协调 | 可提供测试报告、生产检查单并执行代码部署 | e签宝侧确认 appId 计费配置、上线窗口和启用批准 | 官方建议提前 2—3 天报备，见[沙箱环境使用说明](https://open.esign.cn/doc/detail?id=opendoc%2Fsaas_api%2Fvwtg6m&namespace=opendoc%2Fsaas_api)与[正式环境说明](https://open.esign.cn/doc/opendoc/dev-guide3/mezw5n) |

### 两种企业自动落章路径

1. **推荐首版：appId 所属企业就是合同服务方。**在“基于文件发起签署”中把企业签署方设为 `signerType=1`、`autoSign=true`；`assignedSealId` 可指定自身企业印章，不传则使用默认印章。官方参数表把它明确列为“appId 对应的自身机构自动落章”。该路径不涉及“把其他企业的印章委托给平台”的跨企业授权。[基于文件发起签署（完整版）](https://open.esign.cn/doc/opendoc/pdf-sign3/su5g42/)
2. **备选：签约主体与 appId 所属企业不同，或使用流程模板自动落章。**必须另走跨企业授权或模板限定的内部印章授权；授权书必须由管理员/法定代表人签署。跨企业自动落章自 2024-09-12 起需高级版或生态伙伴版本。[跨企业授权说明](https://open.esign.cn/doc/opendoc/helper/ryllt4y4x6bemr7b)、[流程模板自动落章](https://open.esign.cn/doc/opendoc/helper/si1ih3va3oilpd24)

因此，立项时最关键的组织问题是：**合同盖章主体是否就是购买 e签宝服务、持有正式 appId 的企业。**若是，技术与授权复杂度显著下降；若不是，不能用代码绕过印章委托授权。

## 二、每笔 OPC 订单的具体技术链路

以下步骤在前置配置完成后均可由 Vault2077 服务端自动执行；用户只在 e签宝托管页面完成实名、阅读、意愿认证和签名。

1. **创建待签订单。**Vault2077 冻结服务、价格、合同模板版本和客户姓名/手机号，状态设为 `awaiting_signature`，此时不生成支付宝付款链接。
2. **由模板生成逐单 PDF。**服务端调用 `POST /v3/files/create-by-doc-template`，传 `docTemplateId`、文件名和已批准的动态控件值，保存返回的 `fileId`；官方返回的临时下载链接有效期 60 分钟，不能把该 URL 当永久档案。[填写模板生成文件](https://open.esign.cn/doc/opendoc/pdf-sign3/mv8a3i)
3. **发起双方签署。**调用 `POST /v3/sign-flow/create-by-file`：
   - 文档为上一步 `fileId`；
   - 服务企业签署方使用自身机构自动落章；
   - 客户为个人手动签署，使用订单中的姓名和手机号；
   - `autoFinish=true`，所有签署方完成后自动完结；
   - 配置签署截止时间、`notifyUrl`、回跳地址和所需意愿认证方式；
   - 把订单号放入平台自定义业务编号并保存返回的 `signFlowId`。
   官方接口支持基于上传或模板生成的文件发起签署，并分别配置个人手签、机构手签和机构自动落章。[基于文件发起签署（完整版）](https://open.esign.cn/doc/opendoc/pdf-sign3/su5g42/)
4. **获取托管 H5 链接。**流程开启后调用 `POST /v3/sign-flow/{signFlowId}/sign-url`，`operator.psnAccount` 使用与发起时一致的手机号，`urlType=2`、`clientType=ALL`，配置白名单内的 `redirectUrl`。响应包含 90 天短链接和长期链接。[获取签署页面链接](https://open.esign.cn/doc/opendoc/pdf-sign3/pvfkwd/)
5. **浏览器全页跳转到 e签宝。**客户在 e签宝托管页面阅读 PDF、完成首次实名/账号校验、选择可用的意愿认证方式并签名。官方支持短信验证码和多种刷脸/视频方式；具体方式取决于套餐和配置。[查询签署流程详情中的认证方式](https://open.esign.cn/doc/opendoc/pdf-sign3/xxk4q6)、[用户授权与实名认证](https://open.esign.cn/doc/opendoc/auth3/lmfokx)
6. **客户回跳只恢复页面，不确认合同。**`redirectUrl` 上的参数和用户自行访问返回页都不能把订单改为已签；页面只展示“正在确认”，由服务端查 e签宝状态。
7. **接收并验签回调。**e签宝向 `notifyUrl` POST 签署事件；服务端必须验证 `X-Tsign-Open-SIGNATURE`、时间戳和 AppId，可叠加回调来源 IP 白名单，按事件 ID/流程 ID 幂等处理。[签署回调通知接收说明](https://open.esign.cn/doc/opendoc/notify3/sblzg8)、[回调安全机制](https://open.esign.cn/doc/opendoc/notify3/pmy852)
8. **主动查询作最终状态依据。**回调到达或恢复页轮询时，服务端调用 `GET /v3/sign-flow/{signFlowId}/detail`；只有 `signFlowStatus=2`（完成）、双方签署状态和签署区状态均符合预期时才接受完成。回调长期未到也应主动查询补偿。[查询签署流程详情](https://open.esign.cn/doc/opendoc/pdf-sign3/xxk4q6)、[签署流程状态详解](https://open.esign.cn/doc/opendoc/pdf-sign3/gsy6xe)
9. **下载、验签、存证和归档。**完成后调用推荐的 `POST /v3/sign-flow/{signFlowId}/file-download-url` 获取最长 60 分钟的下载地址，立即下载最终 PDF 到私有对象存储、计算本地 SHA-256；再调用 `POST /v3/files/{fileId}/verify` 核验数字证书及文件/签名是否被篡改，并可获取上链文件哈希、统一证据编号和上链编号。[下载已签署文件](https://open.esign.cn/doc/opendoc/pdf-sign3/kczf8g)、[核验文件签名有效性](https://open.esign.cn/doc/opendoc/pdf-sign3/yekrnc)、[获取签署流程存证信息](https://open.esign.cn/doc/opendoc/pdf-sign3/ugtag2)
10. **开放付款。**仅在第 8、9 步通过并且归档至少成功持久化后，订单从 `awaiting_signature` 转为 `awaiting_payment`，此时才生成支付宝支付链接/付款码。拒签、过期、撤销分别进入独立终态，不能进入付款。

## 三、API 鉴权和“嵌入”的技术含义

### API 鉴权

e签宝官方优先推荐请求签名鉴权。服务端用 `AppSecret` 对约定的待签字符串做 HMAC-SHA256，并发送 `X-Tsign-Open-App-Id`、`X-Tsign-Open-Auth-Mode: Signature`、毫秒时间戳、`Content-MD5` 和 `X-Tsign-Open-Ca-Signature` 等请求头；正式和沙箱 Host 分别是：

```text
沙箱：https://smlopenapi.esign.cn
正式：https://openapi.esign.cn
```

鉴权代码、Body MD5、时钟偏差处理、超时/重试和日志脱敏都可由 Codex 在本仓库独立实现。[请求签名鉴权方式说明](https://open.esign.cn/doc/opendoc/dev-guide3/tggw2e)

### H5 集成方式

这里的“嵌入”不是把签名画布复制进 Vault2077，而是：

```text
Vault2077 下单页
  → Vault2077 服务端创建合同和签署流程
  → 浏览器跳转 e签宝托管 H5
  → e签宝完成实名、意愿认证、预览和签名
  → 浏览器回到 Vault2077 恢复页
  → Vault2077 服务端查询确认并开放付款
```

首版建议使用**顶层页面跳转**，不要 iframe。官方签署链接支持 `H5`、`PC`、`ALL` 自适应及回跳地址；同时部分刷脸认证明确不支持 iframe，顶层跳转能减少相机、支付宝/微信唤起、第三方 Cookie 和 CSP 兼容问题。[获取签署页面链接](https://open.esign.cn/doc/opendoc/pdf-sign3/pvfkwd/)、[身份核验认证服务产品介绍](https://open.esign.cn/doc/opendoc/identity_service/shiming)

## 四、Codex 可以独立完成的仓库工作

在合同文本、主体和平台配置确定后，Codex 无需用户逐行参与即可完成：

- e签宝 V3 服务端客户端：请求签名、环境切换、超时、重试、错误映射、日志脱敏；
- 模板控件填充、文件生成、双方签署流程发起和 H5 链接生成；
- OPC 状态机和数据库迁移：未签绝不生成付款链接；
- 签署恢复页和跨页面恢复令牌；
- 回调原始 Body 验签、防重放、幂等和乱序处理；
- 回调失败后的主动查询和定时补偿；
- 最终 PDF 下载、本地 SHA-256、e签宝验签、存证元数据和私有对象存储归档；
- 后台签署状态、失败重试、合同下载和审计记录；
- 沙箱自动化测试及拒签、过期、伪造回跳、重复回调、归档失败等异常测试；
- 生产配置门禁、监控告警和上线/回滚手册。

Codex **不能**独立决定或代替用户完成：合同条款批准、签约主体选择、企业/个人实名认证、购买与套餐生效、生产 AppSecret 的权限治理、印章授权书签署、法定代表人/管理员的意愿认证、上线授权。

## 五、开始编码前用户需要提供的最小输入

### 可以发给 Codex 的资料

- 实际服务提供/收款/开票/盖章企业的法定全称及统一社会信用代码；
- 已批准的服务协议母版和动态字段清单；
- 首版只支持自然人签署的确认；
- 沙箱 `AppId`、沙箱 `docTemplateId`、控件 Key/ID、沙箱 `sealId`（若指定）；
- 正式 `AppId`、正式 `docTemplateId`、正式 `sealId`（准备上线时提供）；
- 生产域名、回调 URL、回跳 URL、部署出口公网 IP；
- 选定的客户实名和意愿认证方式、签署期限、合同保留期限；
- 对象存储桶/目录等非秘密标识和所需访问策略。

### 不要发到聊天或提交 Git 的秘密

- 沙箱及正式 `AppSecret`；
- 对象存储 AccessKey/Secret；
- 数据库、支付宝等其他生产密钥；
- 身份证照片、刷脸视频、短信验证码或企业管理员登录验证码。

这些秘密由用户/运维写入本地未跟踪环境文件和部署平台的 Secret Manager。代码只引用类似 `ESIGN_APP_ID`、`ESIGN_APP_SECRET`、`ESIGN_API_BASE_URL`、`ESIGN_DOC_TEMPLATE_ID`、`ESIGN_SEAL_ID` 的变量。

## 六、建议的协作交付顺序

1. 用户确认签约主体与 appId 所属企业一致，并批准合同母版。
2. 用户完成企业开发者实名，开沙箱应用，给出沙箱 AppId/模板 ID；沙箱 Secret 注入本地环境。
3. Codex 独立完成沙箱 PoC：模板填充 → 企业自动章 → 自然人签署 → H5 → 回调/查询 → 下载验签归档。
4. 用户亲自验收合同显示效果、实名步骤和盖章主体；管理员/法定代表人完成必要的印章授权。
5. Codex 实现完整 OPC 状态机、后台、异常补偿和测试。
6. 用户完成购买和套餐生效、正式应用/模板/印章配置，并把生产密钥注入部署环境。
7. Codex 运行生产前只读检查和小流量真实签署验收；用户批准后打开功能开关。

实际回答“是否需要你来操作”：**需要你操作一次性企业与法律权限事项；代码和后续逐单自动流程可以由我完成。**只要第 1—2 步的主体、合同和沙箱配置准备好，我就可以开始做 PoC，不需要你参与日常编码。
