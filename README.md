# Vault2077

一人公司，全栈运行。

当前仓库包含已确认的产品与设计规格，以及可部署的最小 MVP。Vault 信息流、SiC 和 OPC 使用待替换的结构化内容；边境计划已连接本地持久化存储与 GitHub 仓库验证接口。

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
```

## 主要内容

- `docs/Vault2077-Design-Spec.md`：产品、设计、数据与系统规格。
- `app/`：Next.js App Router 页面。
- `components/`：纯文字界面组件。
- `lib/data.ts`：第一阶段示例内容。

## 当前边界

- OPC 价格、服务范围与联系方式均为待替换示例。
- Vault 信息流和 SiC 趋势尚未连接自动采集与 LLM 管线。
- 边境计划会请求 GitHub 的公开 API；生产环境建议配置 `GITHUB_TOKEN`，以避免未认证的额度限制。
- 报名邮箱以 AES-GCM 密文存储在 `data/mvp-store.json`，该文件不会纳入版本控制。
- 此文件存储只适合单实例 MVP；接入长期运营环境前需迁移到设计规格中的 PostgreSQL。
- 运营后台位于 `/admin`；本地开发默认共享密码为 `vault2077-local-admin`，生产环境必须通过环境变量替换。
- 正式部署前需接入自托管字体、备案信息、真实 OPC 联系方式、隐私文本与赛事条款。
