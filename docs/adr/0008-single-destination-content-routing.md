---
type: adr
status: accepted
updated: 2026-08-02
amends: ADR-0004, ADR-0005
amended-by: ADR-0017
---

# 公开内容实行单一主去向

机构新闻、公告和重大版本进入资讯瀑布；机构深度研究、技术报告、系统卡、方法论、长篇工程材料与播客进入 SiC。同一原始内容只有一个公开主去向，统一内容身份层可合并不同发现路径。

固定来源通常按来源边界确定主去向。对于同一 feed 内混合多种内容形态的来源，可以先使用可验证的结构信号确定路由或事件资格，再由境内 LLM 进行语义归类；LLM 不得改变 canonical 来源、伪造事实，也不得推翻确定性的 `eventEligible=false`。Latent Space 的 `[AINews]`/`/p/ainews-*` 属于完整保留但不可形成事件的 `digest`。

ADR-0017 规定 Follow Builders 三个中央 feed 的主去向：X 进入 roadside，Blogs 进入 SiC documents，Podcasts 进入 SiC podcasts。Vault2077 信任 Follow Builders 的上游选择，不为这些 feed 增加本地来源审核；单一主去向和内容身份合并仍然有效。
