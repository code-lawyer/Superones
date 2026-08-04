---
type: runbook
status: active
updated: 2026-08-01
---

# Vault2077 GitHub Actions 向阿里云生产环境投递操作手册

本手册用于接通并验收以下生产链路：

```text
GitHub Actions 境外采集
  → HTTPS + HMAC 签名投递
  → 阿里云 VPS 上的接收接口
  → PostgreSQL inbox 持久化
  → VPS 本地 acquisition worker
  → 编辑处理与公开内容更新
```

适用仓库：`code-lawyer/Superones`。当前 workflow 为 `.github/workflows/collect-content.yml`。

> [!danger] 密钥安全边界
> 不要把 SSH 私钥、GitHub Token、签名密钥、数据库连接串、LLM Key、支付宝私钥或 OSS Secret 发到聊天、提交到 Git、写入工单或打印到日志。执行者只需要 SSH alias、用户名、项目目录和脱敏状态输出。秘密应直接写入密码管理器、GitHub Actions Secrets 和 VPS 的 root-only 环境文件。

## 1. 职责与边界

GitHub Actions 负责：

- 从境外公开来源采集 `information`、`roadside`、`sic`、`rankings` 四条通道；
- 生成版本化批次；
- 使用 HMAC keyring 签名；
- 将批次 POST 到境内接收接口；
- 保存不含秘密的采集报告与 artifact。

阿里云生产环境负责：

- 校验签名、时间戳、批次 ID 与来源 revision；
- 把合法批次持久化到 PostgreSQL inbox；
- 每五分钟由本机 worker 消费；
- 调用境内编辑模型、重试、隔离并发布；
- 监控 inbox、worker 和内容新鲜度。

GitHub Actions 不得持有或调用：

- RDS 数据库连接串；
- worker、health、后台会话或 Passkey 密钥；
- 境内 LLM 密钥；
- 支付宝密钥；
- OSS 写入密钥；
- `/api/internal/acquisition/process` 或任何远程处理入口。

## 2. 开始前需要准备的信息

### 2.1 可以交给执行者的非敏感信息

| 项目 | 示例 | 说明 |
| --- | --- | --- |
| GitHub 仓库 | `code-lawyer/Superones` | 执行账号需有 Actions Secrets 管理权限 |
| SSH alias 或 Host | `vault2077-prod` | 优先提供已配置好的 alias |
| SSH 端口 | `22` 或自定义端口 | 不提供私钥 |
| SSH 用户 | 独立运维账户 | 应通过个人公钥登录 |
| 项目目录 | `/srv/vault2077/current` | 当前 systemd 模板使用该目录 |
| 操作系统 | Ubuntu 版本 | 用于确认命令和 systemd 路径 |
| 生产域名 | `superones.top` | 需要有效 DNS 与 HTTPS |

### 2.2 必须由负责人保管的秘密

准备两个彼此独立、至少 32 字节的随机秘密：

1. pipeline 签名密钥；
2. Frontier 公开任务读取密钥。

优先使用密码管理器的随机密码生成器，建议生成 48 字节以上随机值。不得复用任何现有数据库、后台、worker、LLM、支付或 OSS 密钥。

选择一个活动 key ID，例如：

```text
2026-08-a
```

key ID 只能包含字母、数字、下划线和连字符，最长 64 个字符。

## 3. 生产地址与 GitHub Secrets 对照

GitHub 仓库需要配置以下五个 Actions Secrets：

| Secret 名称 | 值或格式 |
| --- | --- |
| `VAULT2077_DOMESTIC_ACQUISITION_URL` | `https://superones.top/api/internal/acquisition` |
| `VAULT2077_FRONTIER_PUBLIC_TASKS_URL` | `https://superones.top/api/internal/frontier/tasks` |
| `VAULT2077_PIPELINE_SIGNING_KEYS` | 单行 JSON，例如 `{"2026-08-a":"<pipeline-secret>"}` |
| `VAULT2077_PIPELINE_ACTIVE_KEY_ID` | `2026-08-a` |
| `VAULT2077_FRONTIER_TASKS_SECRET` | 独立的 Frontier 随机秘密 |

VPS 的 `/etc/vault2077/production.env` 至少需要包含对应的服务端配置：

```dotenv
VAULT2077_PIPELINE_SIGNING_KEYS='{"2026-08-a":"<与 GitHub 相同的 pipeline-secret>"}'
VAULT2077_PIPELINE_ACTIVE_KEY_ID=2026-08-a
VAULT2077_FRONTIER_TASKS_SECRET='<与 GitHub 相同的 Frontier secret>'
```

> [!warning] 两侧必须严格一致
> pipeline JSON 中的 key ID、活动 key ID 和 secret 必须逐字一致。Frontier secret 也必须逐字一致，但它不得与 pipeline secret 相同。

## 4. 第一阶段：检查阿里云接收端

在写入 GitHub Secrets 前，先确认 VPS 能安全接收请求。

### 4.1 检查当前服务

SSH 登录 VPS 后执行：

```bash
systemctl status vault2077-web.service --no-pager
systemctl status vault2077-acquisition-worker.timer --no-pager
systemctl list-timers 'vault2077-*' --all
sudo nginx -t
```

通过标准：

- `vault2077-web.service` 为 `active (running)`；
- acquisition worker timer 为 `active (waiting)`；
- Nginx 配置检查成功；
- timer 能看到上次和下次触发时间。

### 4.2 写入生产环境变量

使用安全编辑器打开环境文件：

```bash
sudoedit /etc/vault2077/production.env
```

加入第 3 节的三个服务端字段。然后确认权限：

```bash
sudo chown root:root /etc/vault2077/production.env
sudo chmod 600 /etc/vault2077/production.env
sudo stat /etc/vault2077/production.env
```

不要使用包含秘密的 `echo ... >>` 命令，避免秘密进入 shell history、终端录屏或进程参数。

### 4.3 重启并触发生产门禁

当前 Web systemd 单元会在启动前自动执行 `deploy:check` 和 `db:migrate`：

```bash
sudo systemctl restart vault2077-web.service
sudo systemctl status vault2077-web.service --no-pager
sudo journalctl -u vault2077-web.service -n 200 --no-pager
```

如果启动失败，只回传错误字段名和脱敏日志，不回传环境变量的实际值。

### 4.4 检查公网边界

从 VPS 之外的电脑执行：

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://superones.top/
curl -sS -o /dev/null -w '%{http_code}\n' https://superones.top/api/internal/acquisition
curl -sS -o /dev/null -w '%{http_code}\n' https://superones.top/api/internal/frontier/tasks
```

预期结果：

- 主站为 `200` 或合理的 HTTPS 跳转；
- acquisition 的无签名 GET 请求为 `405`；
- Frontier tasks 的无凭证 GET 请求为 `401`。

如果得到 `404`、`502` 或 TLS 错误，先修复 DNS、证书、Nginx 或 Web 服务，不要继续配置 Actions。

> [!note] GitHub Runner 网络
> GitHub 托管 runner 的出口地址不适合在安全组里硬编码成单一固定 IP。当前链路依靠公网 HTTPS、HMAC 签名、时间戳、幂等批次和限流保护接收端；Node 3000 端口仍必须只监听回环地址。

## 5. 第二阶段：配置 GitHub Actions Secrets

### 5.1 验证 GitHub CLI 权限

在本地受信任电脑执行：

```powershell
gh auth status
gh repo view code-lawyer/Superones
```

账号必须能管理该仓库的 Actions Secrets。如果没有权限，由仓库管理员在 GitHub 网页完成本节操作。

### 5.2 设置两个 URL

URL 不是秘密，但 workflow 当前从 Secrets 读取：

```powershell
gh secret set VAULT2077_DOMESTIC_ACQUISITION_URL --repo code-lawyer/Superones --body "https://superones.top/api/internal/acquisition"
gh secret set VAULT2077_FRONTIER_PUBLIC_TASKS_URL --repo code-lawyer/Superones --body "https://superones.top/api/internal/frontier/tasks"
```

### 5.3 交互式设置三个秘密值

逐条执行以下命令，并在提示出现后从密码管理器粘贴对应值：

```powershell
gh secret set VAULT2077_PIPELINE_SIGNING_KEYS --repo code-lawyer/Superones
gh secret set VAULT2077_PIPELINE_ACTIVE_KEY_ID --repo code-lawyer/Superones
gh secret set VAULT2077_FRONTIER_TASKS_SECRET --repo code-lawyer/Superones
```

`VAULT2077_PIPELINE_SIGNING_KEYS` 应粘贴完整单行 JSON。不要把实际秘密直接写在命令行参数中。

### 5.4 检查名称，不检查明文

```powershell
gh secret list --repo code-lawyer/Superones
```

确认五个 Secret 名称全部存在。GitHub 不会重新显示秘密明文，这是正常安全行为。

## 6. 第三阶段：第一次强制投递验收

第一次不要等待定时任务。手动运行 `information` 通道，并要求境内投递成功，否则 workflow 必须失败。

### 6.1 启动 workflow

```powershell
gh workflow run collect-content.yml --repo code-lawyer/Superones -f lane=information -f run_mode=incremental -f require_delivery=true
gh run list --repo code-lawyer/Superones --workflow collect-content.yml --limit 5
```

记录最新 run ID，然后执行：

```powershell
gh run watch <run-id> --repo code-lawyer/Superones --exit-status
```

也可以在 GitHub 网页的 `Actions → Collect and deliver one acquisition lane` 中手动运行，参数选择：

- `lane`: `information`
- `run_mode`: `incremental`
- `require_delivery`: `true`

### 6.2 GitHub 侧通过标准

workflow 必须满足：

- checkout、Node/Python 依赖安装成功；
- collector 生成批次与 source report；
- 境内接口返回接收凭据，通常为 HTTP `202`；
- job 最终为绿色；
- artifact 已生成，且不含密钥或私人资料；
- artifact 包含 `run-manifest.json`、`acquisition-report.json` 与 `acquisition-batches/*.json`，manifest 中的 SHA256 与文件一致；失败运行也必须留下状态为 `failed` 的脱敏 manifest；
- 不能出现“采集完成但未投递”仍为绿色的情况。

workflow 使用隐藏目录 `.collector-output`，上传步骤只允许白名单中的 `run-manifest.json`、`acquisition-report.json`、`acquisition-batches/` 与 `.validated-for-upload`，不得归档 collector 临时目录。上传步骤必须保留 `include-hidden-files: true` 与 `if-no-files-found: error`。删除这些门禁会让 Actions 在证据丢失或范围失控时错误显示成功。

如需查看失败日志：

```powershell
gh run view <run-id> --repo code-lawyer/Superones --log-failed
```

分享日志前必须检查并遮盖意外出现的敏感字段。

## 7. 第四阶段：境内接收与处理验收

GitHub workflow 绿色只证明“采集并交付成功”，不能证明内容已经处理发布。

### 7.1 检查 inbox

通过受控的 RDS 查询入口执行：

```sql
SELECT status, count(*)
FROM vault2077_acquisition_inbox
GROUP BY status
ORDER BY status;
```

检查最近批次：

```sql
SELECT batch_id, lane, run_mode, status, attempts,
       record_count, source_count, received_at, updated_at,
       left(coalesce(last_error, ''), 200) AS error_summary
FROM vault2077_acquisition_inbox
ORDER BY received_at DESC
LIMIT 20;
```

预期先看到 `received`，随后由 worker 变为 `processing`，最终变为 `processed`。`retryable` 表示等待自动重试；新增 `quarantined` 必须人工排查。

不要把数据库连接串放入查询命令、截图或聊天记录。

### 7.2 手工触发一次 worker

```bash
sudo systemctl start vault2077-acquisition-worker.service
sudo systemctl status vault2077-acquisition-worker.service --no-pager
sudo journalctl -u vault2077-acquisition-worker.service -n 200 --no-pager
```

通过标准：

- oneshot 服务退出码为 `0`；
- 最新批次变为 `processed`，或者有清晰的受控重试状态；
- 没有新增 quarantine；
- 日志不包含数据库 URL、Authorization、LLM Key 或原始隐私材料。

### 7.3 检查公开结果

在公开页面确认：

- 新内容出现或来源快照时间推进；
- 发布时间仍是原始内容时间，不是采集时间；
- Markdown 段落、列表和代码块没有被压平；
- 单一来源失败没有阻塞其他成功来源；
- 页面没有显示原样的 `###` 或代码围栏。

## 8. 四通道验收顺序

第一条通道成功后，依次手动运行：

1. `roadside`
2. `sic`
3. `rankings`

每次都设置：

```text
run_mode=incremental
require_delivery=true
```

每条通道均需保留：

- GitHub run ID；
- workflow 结论；
- 接收 batch ID；
- inbox 最终状态；
- worker 日志时间；
- 公开页面抽样结果。

`rankings` 还必须验证 Frontier 公开任务接口；如果没有待处理任务，返回空任务列表仍可视为接口成功。

## 9. 首次上线 bootstrap

只有四通道 incremental 均完成闭环后，才执行一次性上线回填。

手动选择：

```text
run_mode=bootstrap
require_delivery=true
```

bootstrap 需要逐通道运行并保存报告。SiC 必须证明每个 approved 来源至少存在一条合格记录，或有明确的可恢复失败。不要把第一次 incremental 当作上线基线，也不要同时启动所有大批量模型请求。

完整规则见[统一采集运行手册](Vault2077-Unified-Acquisition-Runbook.md#12-首次上线回填)。

## 10. 启用日常计划任务

确认以下条件全部满足后，保留 workflow 的 schedule：

- 四通道真实投递均成功；
- inbox 与 worker 闭环成功；
- timer 已启用；
- 告警能发现 worker 非零退出、quarantine 和内容过期；
- bootstrap 已完成或已明确不处于首次上线阶段。

境内 worker 与业务健康 timer：

```bash
sudo systemctl enable --now vault2077-acquisition-worker.timer vault2077-healthcheck.timer
systemctl list-timers 'vault2077-acquisition-worker*' 'vault2077-healthcheck*' --all
```

`vault2077-healthcheck.service` 使用 VPS root-only 环境文件中的独立 health 密钥，从回环地址核对数据库、队列和四通道最终发布时间。生产主告警接收人为 `lanzhouda@163.com`，当前没有备用接收人；联系人配置保存在阿里云监控侧，不写入应用代码或 GitHub Secrets。任一新增 quarantine 立即告警；其他新鲜度和队列延迟按连续检查与对应通道 deadline 告警。

GitHub schedule 不是可靠业务时钟。漏跑时以境内内容新鲜度告警为准，并通过 `workflow_dispatch` 补跑对应通道。

## 11. 常见故障定位

| 现象 | 常见原因 | 处理 |
| --- | --- | --- |
| workflow 提示缺少境内 URL | Secret 名称错误或未设置 | 核对五个 Secret 名称 |
| HTTP `401 INVALID_SIGNATURE` | 两侧 secret、key ID 或 JSON 不一致 | 对照密码管理器重新写入两侧，不放宽验签 |
| HTTP `409 UNKNOWN_REGISTRY_REVISION` | 收到了旧 `AcquisitionBatch v1`，且其来源修订不在境内兼容白名单 | 临时加入经过审核的旧修订，或部署对应版本后补跑；`v2` 来源清单变动不依赖此白名单 |
| HTTP `409 UNSUPPORTED_SOURCE_ADAPTER` / `UNSUPPORTED_SOURCE_REGISTRY_VERSION` | 批次使用了境内代码尚未实现的新 adapter 或来源快照协议 | 审核并完整部署新的采集合同/adapter 后补跑，不放宽验签或 schema 门禁 |
| HTTP `409 BATCH_CONFLICT` | 同一 batch ID 对应了不同正文 | 保留证据并排查生成逻辑，不手工改 artifact 重发 |
| HTTP `413` | 请求体超过 Nginx 或应用上限 | 核对 `client_max_body_size 8m` 与批次拆分 |
| HTTP `429` | 接收限流 | 等待窗口并检查是否发生异常重复投递 |
| HTTP `503` | Web、RDS、迁移或持久化不可用 | 查 Web journal、RDS 连通性和迁移状态 |
| `404` | Nginx 精确路由未部署或域名指错 | 核对站点配置、DNS 和当前 release |
| `502` | Nginx 无法连接 `127.0.0.1:3000` | 检查 Web service 与本机监听 |
| TLS/DNS 超时 | 证书、DNS、安全组或跨境网络问题 | 分别从境外与境内探测，保留四次重试 |
| GitHub 绿色但内容未更新 | 只完成接收，worker 未消费或处理失败 | 查 inbox、timer 和 worker journal |
| inbox 长期 `received` | timer 未启用或 worker 无法启动 | 手工触发 worker 并检查 systemd |
| inbox 为 `retryable` | 模型、数据库或暂时依赖失败 | 保留批次等待指数退避，不重新采集制造重复批次 |
| 新增 `quarantined` | 达到最大尝试次数或不可恢复输入错误 | 停止扩大影响，保留批次并定位具体错误 |
| rankings 读取 Frontier 返回 `401` | Frontier secret 两侧不一致 | 重新同步独立 Secret |

## 12. 密钥轮换

pipeline keyring 支持 1–8 把密钥。轮换顺序固定如下：

1. 生成新 key ID 和新随机 secret；
2. 先在 VPS keyring 中加入新 key，同时保留旧 key；
3. 重启 Web 并确认生产门禁通过；
4. 在 GitHub 更新同一完整 keyring；
5. 把 GitHub 的 active key ID 切换为新 key；
6. 强制运行一次 `information` 投递并完成两端验收；
7. 经过既定重叠窗口后，从 VPS 与 GitHub 同步移除旧 key；
8. 更新密码管理器中的轮换时间、负责人和验证证据。

Frontier secret 独立轮换：先让服务端接受新值，再立即更新 GitHub Secret 并运行 `rankings` 验收。由于该接口当前是单值 Bearer secret，轮换窗口应提前安排，避免定时任务恰好运行。

## 13. 紧急停止与恢复

### 13.1 停止境外新投递

```powershell
gh workflow disable collect-content.yml --repo code-lawyer/Superones
```

恢复：

```powershell
gh workflow enable collect-content.yml --repo code-lawyer/Superones
```

### 13.2 停止境内消费

```bash
sudo systemctl stop vault2077-acquisition-worker.timer
```

不要删除 inbox。问题修复后恢复 timer，依靠原 batch ID 幂等重试：

```bash
sudo systemctl enable --now vault2077-acquisition-worker.timer
sudo systemctl start vault2077-acquisition-worker.service
```

如果只是境外采集失败，不要停止健康的境内 worker；如果是处理逻辑可能污染内容，则先停止 worker，保留所有已接收批次。

## 14. 交给执行者的最小资料模板

复制以下模板，填写非敏感部分即可：

```text
GitHub 仓库：code-lawyer/Superones
GitHub 管理权限：已就绪 / 由我自行录入 Secrets
SSH alias 或 Host：
SSH 端口：
SSH 用户：
项目目录：/srv/vault2077/current
操作系统：
生产域名：https://superones.top
DNS/HTTPS：已完成 / 待检查
RDS 连接和迁移：已完成 / 待检查
Web service：正常 / 异常
Acquisition worker timer：正常 / 异常
Nginx 检查：通过 / 未通过
密钥：已在密码管理器生成，不通过聊天发送
```

附上以下命令的脱敏输出：

```bash
systemctl status vault2077-web.service --no-pager
systemctl status vault2077-acquisition-worker.timer --no-pager
systemctl list-timers 'vault2077-*' --all
sudo nginx -t
```

## 15. 完成标准

只有同时满足以下条件，才可认定 GitHub Actions 已正常向生产项目输送信息：

- 五个 GitHub Actions Secrets 名称正确；
- 接收端使用有效 HTTPS，公网只开放指定 acquisition 与 Frontier 路由；
- GitHub 强制投递运行成功并取得境内接收凭据；
- 对应 batch 可在 PostgreSQL inbox 追踪；
- worker 将批次处理为 `processed`，或给出明确且受监控的重试/隔离状态；
- 公开页面内容或快照时间正确更新；
- 日志、artifact、Git 历史和聊天中没有秘密；
- 四通道均完成真实闭环验收；
- 发生故障时可以停止新投递、保留 inbox，并按同一 batch ID 安全恢复。

相关文档：

- [统一采集运行手册](Vault2077-Unified-Acquisition-Runbook.md)
- [部署配置手册](Vault2077-Deployment-Configuration-Manual.md)
- [阿里云中国大陆生产部署与迁移 Handoff](Vault2077-Aliyun-Mainland-Production-Handoff.md)
- [ADR-0013：境外可靠投递与境内独立消费](adr/0013-reliable-delivery-and-domestic-worker.md)
