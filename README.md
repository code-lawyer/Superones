---
type: project-readme
status: active
updated: 2026-07-31
---

# Vault2077

面向超级个体与一人公司的公开网站，包含 Vault 信息流、OPC 服务台、SiC 学院和边境计划。

当前仓库已进入准上线工程阶段：统一四通道、bootstrap、版本化签名与敏感数据密钥环、跨境可靠投递、境内独立 worker、双编辑配置、PostgreSQL 适配与迁移、Frontier GitHub 快速路径/公开回退、后台安全、游骑兵头像 OSS/本地适配器、nonce CSP、生产配置门禁和统一 E2E 已实现。尚未完成的发布门禁主要是阿里云目标 RDS 的备份恢复演练、真实 OSS Bucket/媒体域名/RAM 权限联调、头像撤回与无引用对象清理验收、Nginx/systemd/监控安装证据、目标模型容量/切换证据、真实 OPC/赛季/法律输入和最终发布签字，因此仍不能直接视为生产就绪。

## 本地运行

```powershell
npm.cmd install --cache .npm-cache
npm.cmd run dev
```

## 质量检查

```powershell
npm.cmd run docs:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
ruff check collector
python -m unittest discover -s collector/tests -p "test_*.py"
npm.cmd run build
```

生产部署还必须在最终环境变量下执行：

```powershell
npm.cmd run deploy:check
npm.cmd run db:migrate
npm.cmd run acquisition:work
npm.cmd run frontier:tick
```

## 文档

- [文档权威索引](docs/README.md)
- [统一语言](CONTEXT.md)
- [实现追踪矩阵](docs/Vault2077-Implementation-Traceability.md)
- [上线清单](docs/Vault2077-Launch-Checklist.md)
- [统一采集运行手册](docs/Vault2077-Unified-Acquisition-Runbook.md)
