# 信息管道运行说明

## 运行边界

`scripts/overseas-collector.mjs` 只部署在境外节点或 GitHub Actions 中。它只读取人工白名单的公开 GitHub 趋势、公开仓库元数据、README 和 Release；它不接触后台密码、站内用户数据或境内 LLM 凭证。

境内站点只暴露 `POST /api/internal/content`。请求必须带有以 `VAULT2077_PIPELINE_SHARED_SECRET` 生成的 `X-Vault2077-Signature: sha256=...`，验签后才会写入内容库、调用境内 LLM 和发布。

## 首发配置

1. 在境外 Docker 节点自托管 [NiklasTiede/Github-Trending-API](https://github.com/NiklasTiede/Github-Trending-API)，将其 JSON endpoint 配到 `VAULT2077_TRENDING_API_URL`。
2. 将 [feed-sources.example.json](../config/feed-sources.example.json) 复制为不纳入版本控制的 `config/feed-sources.json`，逐条审批来源并把 `approved` 改为 `true`。境外 workflow 用 `reader` 采集 RSS、Atom、JSON Feed 和播客 feed。
3. 在 GitHub Actions Secrets 中配置 `VAULT2077_GITHUB_READ_TOKEN`、`VAULT2077_TRENDING_API_URL`、`VAULT2077_DOMESTIC_INGEST_URL`、`VAULT2077_PIPELINE_SHARED_SECRET` 和批准后的 `VAULT2077_FEED_ALLOWLIST_JSON`；把 Release 白名单配置为仓库变量 `VAULT2077_RELEASE_REPOSITORIES`，例如 `owner/repo,owner/repo`。
4. 在境内服务配置同一个 `VAULT2077_PIPELINE_SHARED_SECRET`，以及兼容 OpenAI Chat Completions 的国内 LLM endpoint、key 和 model。
5. 首次手动触发 `Collect public content` 工作流，确认 `/feed` 和 `/sic` 的状态条从 `DEMO DATA` 切换为 `PUBLIC SOURCES / 自动更新`。

## 运行约束

- Release 白名单和 feed 白名单必须经人工批准；不接受请求参数指定的 URL。
- README 只在境内用于摘要，不会公开原文或执行其中的命令。
- 未配置 LLM 或 LLM 返回非 JSON Schema 时，管道以可追溯的降级摘要继续发布；生产环境建议把此类记录送入人工复核队列后再公开。
- Trending 上游是易变 HTML 抓取，必须监控其错误率，并保留 GitHub 官方 API 元数据的兜底。
