---
type: project-readme
status: active
updated: 2026-07-24
---

# Vault2077

面向超级个体与一人公司的公开网站，包含 Vault 信息流、OPC 服务台、SiC 学院和边境计划。

当前仓库处于 MVP 预览阶段：页面、主要业务模块、统一采集批次与测试链路已经可运行，但生产数据库、边境计划统一公开任务、后台安全硬化、真实业务输入和运维证据尚未完成，因此不能视为生产就绪。

## 本地运行

```powershell
npm.cmd install --cache .npm-cache
npm.cmd run dev
```

## 质量检查

```powershell
npm.cmd run docs:check
npm.cmd run typecheck
npm.cmd test
python -m unittest discover -s collector/tests -p "test_*.py"
npm.cmd run build
```

## 文档

- [文档权威索引](docs/README.md)
- [统一语言](CONTEXT.md)
- [实现追踪矩阵](docs/Vault2077-Implementation-Traceability.md)
- [上线清单](docs/Vault2077-Launch-Checklist.md)
- [统一采集运行手册](docs/Vault2077-Unified-Acquisition-Runbook.md)
