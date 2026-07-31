# Vault2077 systemd 部署单元

生产安装以下单元：

- `vault2077-web.service`：Web 进程，启动前执行生产配置检查和数据库迁移。
- `vault2077-acquisition-worker.service/.timer`：每五分钟消费境内 PostgreSQL inbox。
- `vault2077-frontier-tick.service/.timer`：北京时间 08:45–22:45 每两小时观察当前参赛仓库并推进结算。

示例安装：

```bash
sudo install -m 0644 deploy/systemd/vault2077-*.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/vault2077-*.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/vault2077-*.service /etc/systemd/system/vault2077-*.timer
sudo systemctl daemon-reload
sudo systemctl enable --now vault2077-web.service
sudo systemctl enable --now vault2077-acquisition-worker.timer vault2077-frontier-tick.timer
```

部署前必须把模板中的用户、目录、npm 路径和环境文件改成目标服务器实际值。环境文件权限应为 `0600`，归 `root` 所有；应用用户只通过 systemd 读取，不得把密钥写进仓库。

验收至少包括：

```bash
systemctl status vault2077-web.service
systemctl list-timers 'vault2077-*'
journalctl -u vault2077-acquisition-worker.service -n 100 --no-pager
journalctl -u vault2077-frontier-tick.service -n 100 --no-pager
```

oneshot 本轮返回非零、timer 超过两个周期没有成功、inbox 新增 quarantine 或频道超过新鲜度阈值都必须告警。历史 quarantine 不应让每次 worker 永久返回非零；worker 失败后按最多六次指数退避保留 inbox，成功记录保留 30 天、隔离记录保留 180 天后自动清理。不得从 GitHub Actions 远程调用处理接口。

## 2 核 2G 基线

仓库内的 service 模板以 2 核 2G 的小型生产机为最低运行基线：

- Web 进程的 V8 old-space 上限为 384 MB；采集 worker 为 512 MB；Frontier 定时任务为 384 MB。
- 后台任务使用较低的 CPU 权重，发生争用时优先保证 Web 请求。
- `VAULT2077_DATABASE_POOL_SIZE` 默认设为 `4`。不要用进程数乘以 `10` 的默认连接池挤占 PostgreSQL 与系统内存。
- 不要在这台机器上执行生产构建。应在 CI 或构建机完成 `npm run build`，再发布构建产物。
- 本机同时运行 PostgreSQL 时，建议配置 1–2 GB swap 作为突发保护；swap 不能替代内存监控或持续扩容。

上线后至少观察一周的进程 RSS、swap、数据库活跃连接数、请求 P95 与 worker 峰值。若持续使用 swap、Web RSS 接近 700 MB、或请求延迟在后台任务运行时明显抬升，应优先升级到 2 核 4G，而不是继续提高连接池或堆上限。
