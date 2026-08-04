---
type: runbook
status: active
updated: 2026-08-04
---

# Vault2077 阿里云告警手动配置清单

> 适用范围：生产 VPS `101.132.39.174`。主接收人固定为 `lanzhouda@163.com`，不配置备用接收人。项目代码、VPS 环境文件和 GitHub Secrets 都不得保存阿里云控制台登录凭据。

## 1. 创建并认证唯一通知对象

1. 登录阿里云云监控 2.0，进入 **所有功能 → 告警中心 → 通知管理 → 通知对象**。
2. 新建联系人：
   - 名称：`Vault2077 Owner`
   - 标识符：`vault2077-owner`
   - 邮箱：`lanzhouda@163.com`
   - 语言：中文
   - 电话、短信、Webhook：留空
3. 打开 `lanzhouda@163.com` 收到的认证邮件并完成认证。未认证的邮箱不能用于事件通知。
4. 新建通知组 `vault2077-production`，成员只选择 `Vault2077 Owner`。确认成员数为 **1**，不添加备用联系人。

官方入口与约束：[云监控 2.0 通知对象](https://help.aliyun.com/zh/cms/cloudmonitor-2-0/notification-object)、[事件订阅与邮箱认证要求](https://help.aliyun.com/zh/cms/cloudmonitor-2-0/subscribe-to-events-monitored-by-cloud-products-and-send-notifications)。

## 2. 启用主机与进程基础告警

1. 进入 **云资源监控 → 主机监控**，确认目标主机的 `argusagent` 为“运行中”；否则按页面提示安装云监控插件。
2. 为目标主机添加进程监控，使用控制台实际识别到的 Next.js 进程名（VPS 上应对应 `next-server`），创建“进程数小于 1、连续 2 个周期”的紧急告警。
3. 至少创建以下主机规则，并全部绑定 `vault2077-production`：
   - 实例不可用：1 个周期，紧急；
   - CPU ≥ 90%：连续 3 个周期，警告；
   - 内存 ≥ 90%：连续 3 个周期，警告；
   - 磁盘使用率 ≥ 80%：连续 3 个周期，警告；≥ 90%：1 个周期，紧急。
4. 通知方式只选择邮件；开启恢复通知，并设置合理静默期，避免持续故障造成邮件风暴。

官方操作说明：[主机监控与报警规则](https://help.aliyun.com/zh/cms/user-guide/monitoring-host)、[进程监控](https://help.aliyun.com/zh/cms/cloudmonitor-1-0/user-guide/process-monitoring)。

## 3. 采集 Vault2077 业务失败与心跳日志

部署完成后，VPS 会产生两个不含业务正文和密钥的日志：

- `/var/log/vault2077/failures.log`：Web、采集 worker、健康探针或 Frontier 单元失败时写入；
- `/var/log/vault2077/health-heartbeat.log`：健康探针成功时每五分钟追加一条心跳。

在日志服务 SLS 中选择与 VPS 相同地域，新建 Project/Logstore，并使用 LoongCollector 持续采集上述两个文件；解析方式选 JSON，字符集选 UTF-8，只采集新增内容。日志文件由 `/etc/logrotate.d/vault2077` 每日轮转并保留 14 份。

官方操作说明：[LoongCollector 持续采集主机文本日志](https://help.aliyun.com/zh/sls/host-text-log-collection-auto-install)。

## 4. 创建两条业务告警

在 SLS 为上述 Logstore 创建新版告警：

1. `Vault2077 unit failure`
   - 查询范围：最近 10 分钟；检查频率：5 分钟；
   - 查询：`source: vault2077-alert | select count(1) as failures`；
   - 触发：`failures > 0`，连续触发阈值 1，严重；
   - 开启恢复通知，通知对象选择 `vault2077-production`。
2. `Vault2077 health heartbeat missing`
   - 查询范围：最近 12 分钟；检查频率：5 分钟；
   - 查询：`source: vault2077-health | select count(1) as heartbeats`；
   - 触发：`heartbeats = 0`，或开启“无数据告警”；连续触发阈值 2，严重；
   - 开启恢复通知，通知对象选择 `vault2077-production`。

SLS 支持无数据告警、连续触发阈值和恢复通知，参见：[创建日志告警规则](https://help.aliyun.com/zh/sls/create-an-alert-monitoring-rule-for-logs)、[无数据告警说明](https://help.aliyun.com/zh/sls/set-query-statistics-statement)。

## 5. 必须完成的送达演练

1. SSH 登录 VPS，执行一次不影响生产服务的合成失败事件：

   ```bash
   sudo systemctl start 'vault2077-failure-notify@manual-test.service'
   sudo tail -n 5 /var/log/vault2077/failures.log
   sudo tail -n 5 /var/log/vault2077/health-heartbeat.log
   ```

2. 在 SLS 查询到 `unit=manual-test.service` 后，确认 `Vault2077 unit failure` 进入告警状态。
3. 确认 `lanzhouda@163.com` 实际收到测试邮件；记录发送时间、到达时间和主题。
4. 确认告警历史的通知结果为成功，并确认恢复通知也能送达。
5. 最终验收证据至少包括：联系人已认证截图、通知组成员数 1、两条业务规则启用状态、一次告警邮件、一次恢复邮件、CloudMonitor Agent 运行状态。

只有上述送达演练完成，才能把“生产告警已上线”标记为完成；仅创建联系人或看到规则为启用不算验收通过。
