# Vault2077 systemd 部署单元

生产安装以下单元：

- `vault2077-web.service`：Web 进程，启动前执行生产配置检查和数据库迁移。
- `vault2077-acquisition-worker.service/.timer`：每五分钟消费境内 PostgreSQL inbox。
- `vault2077-healthcheck.service/.timer`：每五分钟使用独立 health 密钥检查数据库、队列、四个采集通道和最终发布时间；任一业务检查降级时 oneshot 非零退出。
- `vault2077-frontier-tick.service/.timer`：北京时间 08:45–22:45 每两小时观察当前参赛仓库并推进结算。
- `vault2077-ranger-media-cleanup.service/.timer`：每天清理超过 7 天的孤儿头像和超过 30 天的已替换头像。
- `vault2077-opc-order-maintenance.service/.timer`：每分钟发送 OPC 付款 outbox 脱敏邮件并执行订单联系方式分层保留清理；失败触发统一 systemd 告警。

示例安装：

```bash
sudo install -m 0644 deploy/systemd/vault2077-*.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/vault2077-*.timer /etc/systemd/system/
sudo install -m 0644 deploy/logrotate/vault2077 /etc/logrotate.d/vault2077
sudo systemd-analyze verify /etc/systemd/system/vault2077-*.service /etc/systemd/system/vault2077-*.timer
sudo systemctl daemon-reload
sudo systemctl enable --now vault2077-web.service
sudo systemctl enable --now vault2077-acquisition-worker.timer vault2077-healthcheck.timer vault2077-frontier-tick.timer vault2077-ranger-media-cleanup.timer vault2077-opc-order-maintenance.timer
```

模板默认把受控 Node.js 运行时固定在 `/opt/node`，并使用 `/opt/node/bin/npm`；完整安装和校验方法见 `docs/Vault2077-Aliyun-Mainland-Production-Handoff.md`。若采用发行版软件包，必须同步修改全部 service 的 `PATH` 与 npm 绝对路径，再运行 `systemd-analyze verify`。部署前还必须核对用户、目录和环境文件。环境文件权限应为 `0600`，归 `root` 所有；应用用户只通过 systemd 读取，不得把密钥写进仓库。

生产数据库是外部阿里云 RDS，因此 unit 只等待 `network-online.target`，不依赖本机 `postgresql.service`。若迁移到其他外部数据库，同样不得为了满足 unit 依赖在应用机安装空的 PostgreSQL 服务。

验收至少包括：

```bash
systemctl status vault2077-web.service
systemctl list-timers 'vault2077-*'
journalctl -u vault2077-acquisition-worker.service -n 100 --no-pager
journalctl -u vault2077-healthcheck.service -n 100 --no-pager
journalctl -u vault2077-frontier-tick.service -n 100 --no-pager
journalctl -u vault2077-ranger-media-cleanup.service -n 100 --no-pager
journalctl -u vault2077-opc-order-maintenance.service -n 100 --no-pager
```

oneshot 本轮返回非零、timer 超过两个周期没有成功、inbox 新增 quarantine 或频道超过新鲜度阈值都必须告警。历史 quarantine 不应让每次 worker 永久返回非零；worker 失败后按最多六次指数退避保留 inbox，成功记录保留 30 天、隔离记录保留 180 天后自动清理。不得从 GitHub Actions 远程调用处理接口。

## 失败事件与健康心跳

`vault2077-failure-notify@.service` 会在 Web、采集 worker、健康探针或 Frontier 单元失败时，把统一事件写入 journald 和 `/var/log/vault2077/failures.log`。健康探针成功时会向 `/var/log/vault2077/health-heartbeat.log` 追加最小心跳。两类日志只包含状态、单元名和时间，不包含密钥或业务正文；`deploy/logrotate/vault2077` 每日轮转并保留 14 份。

阿里云联系人、LoongCollector、SLS 规则和邮件送达演练见 `docs/Vault2077-Aliyun-Alert-Manual-Checklist.md`。

## 2 核 2G 基线

仓库内的 service 模板以 2 核 2G 的小型生产机为最低运行基线：

- Web 进程的 V8 old-space 上限为 384 MB；采集 worker 为 512 MB；Frontier 定时任务为 384 MB。
- 后台任务使用较低的 CPU 权重，发生争用时优先保证 Web 请求。
- `VAULT2077_DATABASE_POOL_SIZE` 默认设为 `4`。不要用进程数乘以 `10` 的默认连接池挤占 PostgreSQL 与系统内存。
- 不要在这台机器上执行生产构建。应在 CI 或构建机完成 `npm run build`，再发布构建产物。
- 本机同时运行 PostgreSQL 时，建议配置 1–2 GB swap 作为突发保护；swap 不能替代内存监控或持续扩容。

上线后至少观察一周的进程 RSS、swap、数据库活跃连接数、请求 P95 与 worker 峰值。若持续使用 swap、Web RSS 接近 700 MB、或请求延迟在后台任务运行时明显抬升，应优先升级到 2 核 4G，而不是继续提高连接池或堆上限。
