---
type: research
status: accepted
updated: 2026-07-31
---

# Vault2077 游骑兵头像存储决策（2026-07-31）

状态：已由 ADR-0016 采纳；代码侧上传、处理、存储适配、发布校验、展示、引用感知清理和撤回后全部对象版本永久删除命令已完成，真实 OSS 联调、定时任务、版本化删除演练和一体化撤回操作仍是上线门禁
范围：预计 20–40 名公开游骑兵专家的后台头像上传、发布、访问、替换与撤回

## 结论

生产环境采用阿里云 OSS 标准存储（本地冗余），与应用服务器选择同一地域。OSS 只保存经过服务端解码、去元数据和缩放后的公开头像，不保存授权材料或其他敏感文件；RDS 只保存不可变对象键、内容哈希、尺寸和更新时间。首发不接 CDN，不使用浏览器直传，不把 VPS 磁盘或 PostgreSQL JSONB 作为图片真源。

建议使用独立公开媒体 Bucket 和 `media.superones.top` 自定义域名。匿名用户只可读取，写入只允许应用所使用的最小权限 RAM 身份；开启 HTTPS、Referer 防盗链、流量告警、版本控制或不可变对象键，并设置未引用对象清理规则。

## 为什么不是现有 Base64 / JSONB

早期后台方案曾把文件转成 Data URL，随整个 OPC 目录写入 `opc-service-catalog` 状态文档。生产目录同时保存 draft、published 和每次 publication 的完整快照，因此相同头像会重复进入 JSONB、WAL 和 RDS 备份。Base64 还会增加约三分之一体积，并让公开 HTML 携带图片字节，失去独立浏览器缓存、长缓存和按尺寸交付能力；当前实现已经移除这条写入路径。

即使 40 张头像容量不大，这种耦合仍会放大每次目录保存和发布，且无法独立处理图片替换、撤回、缓存和生命周期。因此不应作为生产最终方案。

## 为什么不把 VPS 磁盘作为图片真源

VPS 本地盘能够承载这一容量，但会把媒体可靠性绑定到单台服务器、部署目录、磁盘快照和人工备份。要达到可恢复标准，还需要自行实现独立目录、原子写、备份复制、校验、恢复演练、缓存头和旧文件清理，实质是在维护一个简化对象存储。

VPS 可以运行上传和图片处理代码，也可以在未来作为 Nginx/CDN 缓存节点，但不应成为唯一持久化副本。

## 规模和成本量级

建议每名专家生成两份 WebP：目录缩略图约 320×320，详情图约 800×800。按两份合计 100–180 KB 估算：

- 40 名专家当前版本约 4–7.2 MB；
- 即使平均保留五个历史版本，也只有约 20–36 MB；
- OSS 标准本地冗余官方示例价为 0.12 元/GB/月，这一容量的存储费接近可忽略；真正需要关注的是公网流出流量和 GET 请求，而不是容量。

流量估算应按 `页面访问量 × 实际加载头像数 × 平均图片大小` 计算。若每月 10,000 次目录访问、懒加载后平均读取 12 张 35 KB 缩略图，约为 4.2 GB/月；若错误地每次加载 40 张，则约为 14 GB/月。首发按量付费即可，达到持续几十至上百 GB/月或出现明显跨地域延迟时，再评估流量包或 CDN。

OSS 官方说明：标准存储按 GB/月计费；上传流量免费；公网下载产生外网流出费用；同地域阿里云资源使用内网 Endpoint 访问时不产生公网流量费；成功读写请求另计请求费。具体地域单价以开通时控制台报价为准。

## 目标数据模型

目录不再保存图片字节或任意第三方 URL，而保存稳定的媒体引用，例如：

```json
{
  "avatar": {
    "schemaVersion": 1,
    "smallKey": "rangers/<slug>/<sha256>/avatar-320.webp",
    "largeKey": "rangers/<slug>/<sha256>/avatar-800.webp",
    "sha256": "<sha256>",
    "width": 800,
    "height": 800,
    "updatedAt": "2026-07-31T00:00:00.000Z"
  }
}
```

对象键必须不可变；替换头像时创建新键，不覆盖旧键。公开 URL 由 `https://media.superones.top/` 与对象键组合，后续接入 CDN 时无需迁移数据库内容。

## 上传与发布流程

1. 管理员在受 Passkey 保护的后台选择图片，浏览器把文件以 `multipart/form-data` 发给本站后台，不直接获得 OSS 凭证。
2. 服务端按魔数解码图片，拒绝 SVG、动画图片、超限文件和超大像素图；自动纠正方向、去除 EXIF/GPS，转换为 sRGB。
3. 服务端生成 320 和 800 两个 WebP 版本，计算 SHA-256，并通过最小权限 RAM 身份上传到不可变对象键；设置正确的 `Content-Type` 与一年期 `Cache-Control: public, max-age=31536000, immutable`。
4. 上传成功后接口把媒体引用返回浏览器并更新当前未保存草稿；管理员执行“保存草稿”或发布时，才按现有修订号冲突保护写入目录。
5. 发布前执行 OSS `HEAD` 校验，确认两个对象存在且哈希元数据匹配；对象类型在受保护上传转换时固定为 WebP。随后按现有再认证流程发布目录并刷新公开缓存。
6. 上传成功但草稿未保存会产生孤儿对象。`npm run opc:cleanup-ranger-media` 已实现引用感知清理：从未进入发布历史且超过 7 天的孤儿对象可删除，已被历史发布引用但不再活跃的替换对象保留 30 天；正式运营前必须把命令接入每日定时任务并完成真实 OSS 演练。

对象存储与 PostgreSQL 无法组成单一事务，因此使用“不可变上传 + 引用校验 + 延迟垃圾回收”，不采用覆盖写或失败时立即删除。

## 权限与公开访问

- Bucket 只包含确认可公开的处理后头像；授权书、原图和其他私人资料不得混入。
- Bucket 或对象可设置为 public-read，但绝不能 public-read-write。阿里云官方说明 public-read 允许匿名读取，但只有所有者或授权身份可以写入。
- 应用写入身份只授予头像前缀所需的 `PutObject`、`HeadObject` 和受控删除权限，不授予全账号 OSS 管理权限。
- 配置 HTTPS、自定义域名、Referer 白名单和流量费用告警。防盗链不是身份验证，不能替代费用监控。
- 生产页面的 CSP 最终收紧到本站和 `https://media.superones.top`，移除任意 HTTPS 图片源。

## 版本、删除和本人授权撤回

- 普通替换：旧版本保留 30–90 天以支持发布回滚，然后在确认无引用后删除；存储很小，不需要转低频或归档。
- 误删保护：可开启 OSS 版本控制；官方说明版本控制本身免费，但历史对象继续计存储费，可配合生命周期规则清理历史版本和删除标记。
- 本人撤回授权：先下架公开档案并刷新缓存，再运行 `npm run opc:purge-revoked-ranger-media -- <ranger-slug>`；命令会枚举并删除该 slug 的当前对象、全部历史 versionId 和删除标记。审计历史只保留对象键和删除事件，不保留已撤回图片字节；生产签字前仍必须在真实开启版本控制的 Bucket 完成永久删除演练。
- 不长期保留原始上传文件。若未来确需重新裁剪原图，应另建 private Bucket，并单独定义授权、保留和删除规则。

## 公开页面性能要求

- 目录使用 320 版本，详情页使用 800 版本；固定 `width`、`height`，提供明确尺寸，避免布局抖动。
- 首屏外头像使用懒加载，不能让 40 张头像在每次目录访问时全部下载。
- 不在运行时通过 Node/RDS 代理公开图片，也不让 Next.js 对每次请求重复处理原图。
- 首发直接使用 OSS 自定义域名；只有实测流量、地域延迟或带宽费用达到阈值后再引入 CDN。

## 迁移现有实现

1. 已完成：OSS/本地适配器、上传接口和媒体引用类型；旧版 PNG/JPEG/WEBP Data URL 只作为临时读兼容，第三方 HTTPS 图片不再加载。
2. 待存在真实旧数据时执行：对 Data URL 进行一次离线解码、处理和上传，写回 OSS 对象键；任意第三方 HTTPS URL 要求管理员重新上传，不由服务器抓取，避免 SSRF 与外链失效。
3. 已完成：后台删除 Base64 上传和任意 HTTPS URL 输入，生产 CSP 收紧到独立媒体 origin；旧字段只保留读取兼容。
4. 已完成：ADR、生产部署方案、环境变量门禁、引用感知清理命令、撤回后全部对象版本永久删除命令和费用/权限要求已同步；待真实 OSS 完成恢复、定时清理、撤回、版本化删除和无引用对象清理验收。

## 官方资料

访问日期均为 2026-07-31：

- [OSS 存储费用](https://help.aliyun.com/zh/oss/storage-fees)：标准本地冗余示例价格、按小时计量。
- [OSS 流量费用](https://help.aliyun.com/zh/oss/traffic-fees)：公网流入免费、公网流出计费、内网流入流出免费、CDN 回源计费。
- [OSS 请求费用](https://help.aliyun.com/zh/oss/api-operation-calling-fees)：成功 Put/Get 等 API 请求按次数计费。
- [OSS 地域与 Endpoint](https://help.aliyun.com/en/oss/user-guide/regions-and-endpoints)：同地域阿里云资源可通过内网访问并避免公网流量费。
- [OSS 权限与访问控制](https://help.aliyun.com/zh/oss/user-guide/permissions-and-access-control-overview)：private、public-read、RAM/Bucket Policy、阻止公共访问和防盗链。
- [Bucket ACL](https://help.aliyun.com/zh/oss/user-guide/oss-bucket-acl)：public-read 的读写边界及公共访问风险。
- [自定义域名访问 OSS](https://help.aliyun.com/zh/oss/user-guide/access-buckets-via-custom-domain-names)：CNAME、自定义域名、ICP备案、HTTPS 与后续 CDN 接入。
- [OSS 图片处理概述](https://help.aliyun.com/zh/oss/user-guide/overview-51)：缩放、裁剪、旋转、格式转换与处理样式。
- [OSS 版本控制](https://help.aliyun.com/zh/oss/manage-objects-in-a-versioning-enabled-bucket)：历史版本、误删恢复和版本删除行为。
- [OSS 生命周期概述](https://help.aliyun.com/zh/oss/user-guide/overview-54/)：对象过期、历史版本和删除标记清理。
- [OSS RAM Policy](https://help.aliyun.com/en/oss/user-guide/ram-policy/)：按资源和操作授予最小权限。
