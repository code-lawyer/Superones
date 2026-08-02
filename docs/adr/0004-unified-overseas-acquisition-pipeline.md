---
type: adr
status: amended
updated: 2026-07-25
amended-by: ADR-0005, ADR-0007, ADR-0008, ADR-0009, ADR-0013, ADR-0017
---

# 统一境外公开数据采集

通用内容、SiC 和平台原生榜等境外公开数据使用同一个 workflow 文件、统一批次格式和同一套签名协议采集并交付。各产品不得建立平行的境外采集系统。ADR-0007 为 Frontier 定义唯一例外：境内服务端可以直接读取已知参赛仓库的公开 GitHub 数据，用于交互式核验和动态观察，但浏览器与普通页面不得直连，失败必须进入可重试回退。

ADR-0005 将“单一每小时批次”修订为四个职责独立的采集通道，并删除 MCP 与本地增量榜单；本 ADR 继续约束通用境外采集的统一模块、统一协议和单一 workflow 文件，不把 Frontier 境内业务调度误算成第二套境外采集器。

ADR-0008 进一步规定内容单一主去向，以及社区原生来源不递归抓取外链；本 ADR 的“统一采集”不代表同一内容可以跨通道重复采集。

ADR-0009 进一步区分采集通道与频道编辑配置：information、roadside 和 Vault 事件编排共享 `vault_editorial`，SiC 使用独立 `sic_editorial`；统一采集不等于所有内容共用一个处理提供方或一条处理队列。

ADR-0013 将交付进一步收敛为“境外采集并可靠投递、境内独立 worker 消费”。境外 workflow 不得触发或等待境内编辑处理。

ADR-0017 下架 Hacker News/Lobsters，引入经人物去重的 Follow Builders X 补充与 SiC 官方入口，并允许这些显式隔离的补充来源失败时不阻断统一 workflow。
