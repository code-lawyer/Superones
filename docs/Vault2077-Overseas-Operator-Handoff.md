---
type: runbook
status: active
updated: 2026-08-02
---

# Vault2077 境外采集运营交接

本手册面向只负责 GitHub Actions 境外采集的运营人员。完整故障处置和验收命令以[GitHub Actions 向阿里云生产环境投递操作手册](Vault2077-GitHub-Actions-Aliyun-Delivery-Operations-Manual.md)为准；本文只定义交接边界、最少权限、首次接管顺序和必须移交的证据。

> [!danger] 密钥边界
> 本文件和 Git 仓库不得包含 pipeline 签名密钥、Frontier 读取密钥、SSH 私钥、数据库连接串、LLM Key、支付或 OSS 凭证。秘密只能在密码管理器、GitHub Actions Secrets 和 VPS root-only 环境文件之间受控交付，不得通过聊天、邮件、工单、日志或 artifact 传输。

## 1. 职责边界

境外运营负责：

- 管理 `.github/workflows/collect-content.yml` 所需的 GitHub Actions Secrets；
- 观察 `information`、`roadside`、`sic`、`rankings` 四条通道；
- 手动触发首次 incremental 验收和一次性 bootstrap；
- 保存 GitHub run ID、batch ID、artifact 与脱敏失败日志；
- 发生异常时停止新投递，但不修改或删除境内 inbox。

境外运营不得持有或操作：

- 境内 SSH、RDS、LLM、支付宝、OSS、后台 worker 或管理员恢复秘密；
- 境内数据库和业务写模型；
- `/api/internal/acquisition/process` 或其他境内 worker 接口；
- 任何通过放宽签名、schema、adapter 或 TLS 门禁来“恢复投递”的操作。

境内负责人负责 VPS、Nginx、RDS、worker、编辑模型、公开发布和 inbox/quarantine 处置。

## 2. 当前采集计划

GitHub cron 使用 UTC；北京时间为 UTC+8。当前代码中的权威时间表是 `.github/workflows/collect-content.yml`：

| 通道 | 内容 | UTC | 北京时间 |
| --- | --- | --- | --- |
| `information` | 综合信息 | `00:05–14:05`，每两小时 | `08:05–22:05`，每两小时 |
| `roadside` | 路边快讯 | `00:55–14:55`，每两小时 | `08:55–22:55`，每两小时 |
| `sic` | SiC 来源 | 每天 `00:25` | 每天 `08:25` |
| `rankings` | 榜单 | `00:35/04:35/08:35/12:35` | `08:35/12:35/16:35/20:35` |

GitHub schedule 不是可靠业务时钟。漏跑时以境内新鲜度和 inbox 告警为准，通过 `workflow_dispatch` 补跑对应通道，不通过增加高频 cron 掩盖故障。

## 3. 仓库、接口与权限

| 项目 | 值 |
| --- | --- |
| GitHub 仓库 | `code-lawyer/Superones` |
| Workflow | `.github/workflows/collect-content.yml` |
| 最小 GitHub 权限 | Actions Secrets 管理权限和 workflow 运行查看权限 |
| 生产网站 | `https://superones.top` |
| 采集投递接口 | `POST https://superones.top/api/internal/acquisition` |
| Frontier 任务接口 | `GET https://superones.top/api/internal/frontier/tasks` |
| 接收成功 | `202 Accepted`；仅表示 inbox 已持久化，不表示 worker 已发布 |

无仓库权限时，由仓库管理员在 GitHub 网页录入 Secrets；不得为了方便向运营人员授予境内服务器或数据库权限。

## 4. GitHub Actions Secrets

必须配置以下五项：

| Secret | 内容 |
| --- | --- |
| `VAULT2077_DOMESTIC_ACQUISITION_URL` | `https://superones.top/api/internal/acquisition` |
| `VAULT2077_FRONTIER_PUBLIC_TASKS_URL` | `https://superones.top/api/internal/frontier/tasks` |
| `VAULT2077_PIPELINE_SIGNING_KEYS` | HMAC keyring 单行 JSON |
| `VAULT2077_PIPELINE_ACTIVE_KEY_ID` | 当前活动 key ID |
| `VAULT2077_FRONTIER_TASKS_SECRET` | 与 pipeline 完全独立的随机秘密 |

pipeline secret 与 Frontier secret 必须分别生成，至少 32 个随机字节，不得复用任何数据库、后台、worker、LLM、支付或 OSS 密钥。key ID 只能包含字母、数字、下划线和连字符，最长 64 字符。

推荐通过标准输入写入敏感值，避免出现在 shell history：

```powershell
gh secret set VAULT2077_PIPELINE_SIGNING_KEYS --repo code-lawyer/Superones
gh secret set VAULT2077_PIPELINE_ACTIVE_KEY_ID --repo code-lawyer/Superones
gh secret set VAULT2077_FRONTIER_TASKS_SECRET --repo code-lawyer/Superones
gh secret list --repo code-lawyer/Superones
```

对应 keyring、活动 key ID 和 Frontier secret 由境内负责人通过密码管理器写入 `/etc/vault2077/production.env`。两侧字符必须逐字一致。

## 5. 接管前边界检查

从境外网络检查公开边界：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://superones.top/
curl -sS -o /dev/null -w '%{http_code}\n' https://superones.top/api/internal/acquisition
curl -sS -o /dev/null -w '%{http_code}\n' https://superones.top/api/internal/frontier/tasks
```

预期分别为网站成功、acquisition 无签名 GET 返回 `405`、Frontier 无凭证 GET 返回 `401`。如果出现 `404`、`502`、证书或 DNS 错误，先由境内负责人修复边界，不继续配置或放宽 Actions。

## 6. 首次 incremental 验收

先只运行 `information`：

```powershell
gh workflow run collect-content.yml --repo code-lawyer/Superones -f lane=information -f run_mode=incremental -f require_delivery=true
gh run list --repo code-lawyer/Superones --workflow collect-content.yml --limit 5
gh run watch <run-id> --repo code-lawyer/Superones --exit-status
```

通过标准：

1. checkout、依赖安装与采集器成功；
2. 生成批次、来源报告和不含秘密的 artifact；
3. 境内接口返回 `202`；
4. 对应 batch 可在 PostgreSQL inbox 追踪；
5. worker 将批次处理为 `processed`，或留下受监控的 retry/quarantine 状态；
6. 公开页面或快照时间得到正确更新；
7. job 不得在“只采集、未投递”时显示绿色。

`information` 闭环成功后，依次验收其余通道：

```powershell
gh workflow run collect-content.yml --repo code-lawyer/Superones -f lane=roadside -f run_mode=incremental -f require_delivery=true
gh workflow run collect-content.yml --repo code-lawyer/Superones -f lane=sic -f run_mode=incremental -f require_delivery=true
gh workflow run collect-content.yml --repo code-lawyer/Superones -f lane=rankings -f run_mode=incremental -f require_delivery=true
```

每条通道保存 run ID、workflow 结论、batch ID、inbox 最终状态、worker 日志时间和公开页面抽样结果。分享日志前必须遮盖意外出现的敏感字段。

## 7. 一次性 bootstrap

只有四条 incremental 通道均闭环后才执行 bootstrap，并逐条运行，避免同时启动大批量模型请求：

```powershell
gh workflow run collect-content.yml --repo code-lawyer/Superones -f lane=information -f run_mode=bootstrap -f require_delivery=true
gh workflow run collect-content.yml --repo code-lawyer/Superones -f lane=roadside -f run_mode=bootstrap -f require_delivery=true
gh workflow run collect-content.yml --repo code-lawyer/Superones -f lane=sic -f run_mode=bootstrap -f require_delivery=true
gh workflow run collect-content.yml --repo code-lawyer/Superones -f lane=rankings -f run_mode=bootstrap -f require_delivery=true
```

SiC 必须证明每个 approved 来源存在至少一条合格记录，或留下明确、可恢复且受监控的失败。第一次 incremental 不能代替上线基线。

## 8. 停止与恢复

紧急停止境外新投递：

```powershell
gh workflow disable collect-content.yml --repo code-lawyer/Superones
```

恢复：

```powershell
gh workflow enable collect-content.yml --repo code-lawyer/Superones
```

只停止境内消费时，由境内负责人停 worker timer，不删除 inbox：

```bash
sudo systemctl stop vault2077-acquisition-worker.timer
sudo systemctl enable --now vault2077-acquisition-worker.timer
sudo systemctl start vault2077-acquisition-worker.service
```

恢复和补跑继续依靠同一 batch ID 的幂等合同，不修改 artifact 后重发。

## 9. 常见故障

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 缺少境内 URL | Secret 名称错误或未设置 | 核对五个 Secret 名称 |
| `401 INVALID_SIGNATURE` | 两侧 secret、key ID 或 JSON 不一致 | 对照密码管理器重新写入，不放宽验签 |
| `409 UNKNOWN_REGISTRY_REVISION` | 收到旧 `AcquisitionBatch v1`，且 revision 不在境内兼容白名单 | 由境内负责人审核旧 revision 或部署对应版本；v2 清单变动不依赖此白名单 |
| `409 UNSUPPORTED_SOURCE_ADAPTER` / `UNSUPPORTED_SOURCE_REGISTRY_VERSION` | 境外使用了境内尚未实现的新 adapter 或快照协议 | 停止该批次，先部署兼容代码，不放宽 schema 门禁 |
| `409 BATCH_CONFLICT` | 同一 batch ID 对应不同正文 | 保存证据并排查生成逻辑，不手改 artifact |
| `413` | 请求体超限 | 核对 8 MB Nginx 上限和批次拆分 |
| `429` | 接收限流 | 等待窗口并排查异常重复投递 |
| `503` | Web、RDS、迁移或持久化不可用 | 通知境内负责人检查 journal、RDS 和迁移 |
| GitHub 绿色但页面未更新 | 只完成接收，worker 未消费或编辑失败 | 检查 inbox、timer、worker 和 quarantine |
| TLS/DNS 超时 | 证书、DNS、安全组或跨境网络 | 从境内外分别探测，保留有界重试证据 |

## 10. 交接证据

交接时现场重新验证运行状态，不把某一天的服务器状态永久写成当前事实。交付包至少包含：

- 五个 GitHub Secrets 的名称清单，不含值；
- 四条 incremental 和四条 bootstrap 的 run ID 与结论；
- 对应 batch ID、inbox/worker 最终状态和公开页面抽样；
- 最近一次密钥轮换日期和下一次轮换负责人，不含秘密；
- 新投递停止、恢复和境内 worker 停止/恢复的演练记录；
- 运营联系人、境内负责人和异常升级路径。

任何 `quarantined` 批次、签名不一致、adapter/schema 不兼容或 TLS 错误都应立即升级；在原因明确前停止新投递，不删除 inbox，不绕过门禁。
