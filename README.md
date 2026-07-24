# Vault2077

一人公司，全栈运行。

当前仓库包含已确认的产品与设计规格，以及可部署的最小 MVP。Vault 信息流已接通“境外采集、HMAC 签名传输、境内持久队列、OpenAI-compatible 处理和自动发布”；SiC 使用独立的境外固定源 JSON 包、Bearer 接收和境内榜单快照接口。LLM 供应商配置按要求保持空白。OPC 仍使用待替换的结构化菜单，边境计划已连接本地持久化存储与 GitHub 仓库验证接口。

## 本地运行

```powershell
npm.cmd install --cache .npm-cache
npm.cmd run dev
```

打开 `http://localhost:3000`。

## 验证

```powershell
npm.cmd run build
npm.cmd run typecheck
npm.cmd run docs:check
npm.cmd test
npm.cmd run test:pipeline:e2e
```

## 主要内容

- `docs/README.md`：设计文档地图、权威层级与阅读顺序。
- `docs/Vault2077-Design-Spec.md`：产品、设计、数据与系统规格。
- `docs/Vault2077-Implementation-Traceability.md`：规范与当前实现的差距和验收矩阵。
- `app/`：Next.js App Router 页面。
- `components/`：纯文字界面组件。
- `lib/data.ts`：第一阶段示例内容。
- `collector/horizon_raw_export.py`：基于固定版本 Horizon 采集适配器的境外原文采集、分包与签名发送 CLI。
- `scripts/collect-sic-overseas.ts`：SiC 27 个 approved 固定来源的境外 Node.js 采集入口。
- `collector/vendor/horizon`：固定版本的 Horizon Git 子模块；检出仓库后运行 `git submodule update --init --recursive`。
- `docs/Content-Pipeline-Operations.md`：信息管道配置、恢复和验收手册。

## 当前边界

- OPC 价格、服务范围与联系方式均为待替换示例。
- Vault 信息流在未配置境内 LLM 时保存入站批次并等待处理，不发布伪造实时内容。SiC 固定源在模型未配置时仍保存原始标题、摘要和链接，但中文标题/说明可能缺失；生产环境不会启用本地视觉示例数据。
- 边境计划会请求 GitHub 的公开 API；生产环境建议配置 `GITHUB_TOKEN`，以避免未认证的额度限制。
- 报名邮箱以 AES-GCM 密文存储在 `data/mvp-store.json`，该文件不会纳入版本控制。
- 此文件存储只适合单实例 MVP；接入长期运营环境前需迁移到设计规格中的 PostgreSQL。
- 运营后台位于 `/admin`；本地开发默认共享密码为 `vault2077-local-admin`，生产环境必须通过环境变量替换。
- 正式部署前需接入自托管字体、备案信息、真实 OPC 联系方式、隐私文本与赛事条款。
