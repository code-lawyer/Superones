---
type: runbook
status: active
updated: 2026-07-31
---

# Vault2077 阿里云中国大陆生产部署与迁移 Handoff

本文是 Vault2077 迁移到中国大陆工作环境后的首要执行文档。目标环境是阿里云服务器、RDS PostgreSQL 和 OSS；目标不是搭一个可访问的演示站，而是在保留现有安全、数据、支付、采集和运营边界的前提下完成**全功能首发**。

若本文与产品规格冲突，以 [`docs/README.md`](README.md) 所列权威层级为准；若本文与阿里云控制台的实际字段冲突，以部署当天的阿里云官方文档和控制台为准，并把差异记录回本文件。

## 1. 交接摘要

### 1.1 已确认的业务决定

| 项目 | 决定 |
| --- | --- |
| 首发范围 | 全功能首发，不做长期功能阉割版 |
| 服务器 | 已开通阿里云 VPS；部署前必须确认它究竟是 ECS 还是轻量应用服务器 |
| 数据库 | 已开通 RDS PostgreSQL |
| 对象存储 | 已开通 OSS |
| 公网站点 | `https://superones.top` |
| 管理后台 | `https://admin.superones.top` |
| 公开媒体 | `https://media.superones.top` |
| 管理员认证 | 原生 WebAuthn/Passkey；生产禁止本地共享密码和已退役 OIDC |
| 支付 | 支付宝材料已完成；仍须在真实生产配置下完成小额支付、异步通知、查询和退款验收 |
| Frontier | 全功能启用，但必须先在后台发布当季真实奖励文案并做真实仓库闭环 |
| 纠错策略 | A：公开报告保持不可变，不建设审核/删改 UI；通过新报告和不可变审计补充纠正 |
| 法务/备案 | 用户已确认完成；配置值仍须与代码锁定值逐字一致 |
| 上线后工作 | 上线后继续补监控、容量数据、恢复演练和低覆盖模块测试；不能把首发 P0 验收全部推迟到公开切流后 |

### 1.2 当前代码与资料状态

- 生产配置门禁、数据库迁移、双域名 Nginx、systemd Web/Worker/Frontier/媒体清理任务、Passkey 注册、支付宝服务端验签、OSS 适配、健康检查和一次性 bootstrap 导入均已有实现。
- 数据库最新迁移必须是 `0006_acquisition_reliability.sql`。
- bootstrap 清单当前可验证：information 132、roadside 728、events 4、SiC 156、ranking boards 5、ranking items 90。
- 本地未保存生产 RDS、OSS、支付宝、GitHub、模型或 SSH 连接凭据；这是正确状态。不得为“方便迁移”把它们写进 Git、文档、聊天记录或发布包。
- 当前 Windows 工作区不能直接产生可在 Linux 生产机复用的 `node_modules`、Sharp 原生依赖或最终发布包。生产构建必须在与服务器同 CPU 架构的 Linux 环境完成。
- 真正的生产 bootstrap、Passkey 注册、OSS 联调、支付验收和浏览器验收尚未执行；在获得目标主机连接与生产密钥后才能完成。

### 1.3 当前唯一基础设施硬阻断

阿里云官方资料确认：RDS PostgreSQL **基础系列不支持日志备份/PITR**。此前项目写过“PostgreSQL 17 基础版 + PITR”，该组合不存在。全功能首发的推荐决策是：若已购实例为基础系列，在导入生产数据前升级或迁移到支持日志备份的系列，优先高可用多可用区，并完成真实时间点恢复演练。若负责人坚持保留基础系列，必须书面接受只能按备份集恢复及相应数据损失窗口，并同步修订项目 RPO、上线清单和事故手册；在此之前不得把数据库可靠性门禁标记为通过。

### 1.4 目标拓扑

```text
公众/管理员浏览器
        |
   阿里云 DNS + HTTPS
        |
     Nginx :443
  +-----+-----------------------+
  |                             |
superones.top             admin.superones.top
公开页面 + 两个精确跨境接口   后台/Passkey/API/_next
  |                             |
  +----------> 127.0.0.1:3000 <-+
                  |
          Vault2077 Node 24
             /           \
  RDS PostgreSQL TLS     OSS 内网上传
       私网连接          media.superones.top 公网只读

境外 GitHub Actions collector
  |-- HMAC POST /api/internal/acquisition
  `-- 只读 GET /api/internal/frontier/tasks

境内 systemd timers
  |-- acquisition worker：每 5 分钟
  |-- Frontier tick：北京时间 08:45–22:45 每 2 小时
  `-- ranger media cleanup：每天 03:25
```

公开 Nginx 只允许两个精确的 `/api/internal/*` 路由；数据库、Node 3000、健康检查、手工处理入口和其余后台能力都不能暴露公网。

## 2. 开始前先填写的交接记录

迁移操作者应先复制本节到一次部署记录，所有秘密只写“已配置”，不写实际值。

| 字段 | 待填写值 |
| --- | --- |
| 变更负责人 |  |
| 复核人 |  |
| 部署日期与北京时间窗口 |  |
| Git branch / commit SHA / tag |  |
| Linux 构建机 OS 与 CPU 架构 |  |
| 发布包 SHA-256 |  |
| VPS 产品（ECS/轻量）、实例 ID、地域、可用区、私网 IP |  |
| RDS 实例 ID、地域、可用区、私网地址、数据库名 |  |
| OSS Bucket、地域、内网 Endpoint、CNAME |  |
| DNS 托管账户 |  |
| 证书签发与续期方式 |  |
| RDS 手工备份/快照 ID |  |
| 上一个可回滚 release |  |
| 监控联系人 |  |
| 支付业务验收人 |  |
| 上线决定与时间 |  |

没有 commit SHA、发布包哈希、RDS 备份证据或回滚 release 时，不得开始公开切流。

## 3. 阿里云资源核对

### 3.1 先辨认“VPS”产品

进入阿里云控制台，记录实例属于哪一种：

1. **ECS 云服务器**：首选。让 ECS、RDS 和 OSS 位于同一地域；ECS 与 RDS 放入可互通的 VPC，RDS 使用私网地址。
2. **轻量应用服务器**：可以使用，但它不应被假设为与 RDS 天然私网互通。需在控制台确认并建立轻量应用服务器到目标 VPC 的服务互联，再实测 RDS 私网地址。无法建立或验证私网链路时，不要临时开放 `0.0.0.0/0` 数据库白名单；应迁移到 ECS 或先由阿里云支持确认安全连接方案。

必须记录：产品类型、地域、可用区、VPC/vSwitch、安全组、私网 IP、公网 IP、系统盘和自动快照策略。建议基线为 2 核 2 GB、Ubuntu 24.04 LTS x86_64；2 GB 只是运行基线，不是构建机。若现有镜像不是 Ubuntu，不要为套用本文命令直接重装；先确认包管理器和服务路径，或创建一台新实例做蓝绿迁移。

### 3.2 地域与网络

- ECS/轻量、RDS、OSS 优先同地域。RDS 私网访问要求网络可达，安全组和白名单同时放行。
- RDS 只向应用服务器私网 IP 或受控安全组开放；不要把开发者家庭 IP 长期留在生产白名单。
- OSS 应用上传使用同地域内网 Endpoint。`VAULT2077_OSS_INTERNAL=true` 只有在真实上传、HEAD、列举和删除均通过后才能保留；否则先设 `false` 完成诊断，随后修复网络，不要把公网访问当长期默认。
- Node 只监听 `127.0.0.1:3000`。安全组不开放 3000、5432 或任何数据库管理端口。

### 3.3 ECS/轻量防火墙

控制台安全组或轻量防火墙建议如下：

| 方向 | 协议/端口 | 来源/目标 | 说明 |
| --- | --- | --- | --- |
| 入方向 | TCP 22 | 固定办公出口 IP；紧急时临时放行后立即收回 | SSH |
| 入方向 | TCP 80 | `0.0.0.0/0`、`::/0` | HTTP 跳转和证书验证 |
| 入方向 | TCP 443 | `0.0.0.0/0`、`::/0` | 公网 HTTPS |
| 入方向 | TCP 3000 | 不放行 | Node 仅回环 |
| 入方向 | TCP 5432 | 不放行 | RDS 不在 VPS 上监听 |
| 出方向 | TCP 443 | 按业务需要 | OSS、GitHub 快速路径、模型、支付宝等 |
| 出方向 | RDS 端口 | RDS 私网地址 | PostgreSQL |

服务器内若使用 UFW：

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from <固定办公出口IP> to any port 22 proto tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

在确认 SSH 来源 IP 前不要启用 UFW，避免锁死维护入口。若 SSH 使用堡垒机，则只允许堡垒机网段。

## 4. RDS PostgreSQL

### 4.1 控制台设置

在 RDS 控制台逐项完成并截图留证：

1. 确认 PostgreSQL 大版本与项目兼容；当前目标为 PostgreSQL 17。禁止未经测试直接跨大版本升级。
2. 确认地域、VPC/vSwitch 与服务器链路；优先使用内网地址。
3. 白名单只加入应用服务器私网 IP/受控安全组，不加入 `0.0.0.0/0`。
4. 开启 SSL，并下载当前 CA 证书链到受控运维位置。
5. 先确认实例系列支持日志备份。支持时开启自动备份、日志备份/时间点恢复能力，并确认可恢复时间窗口覆盖至少最近 7 天；基础系列不支持该能力，不能用备份集恢复冒充 PITR。
6. 开启释放保护/删除保护；确认到期策略不会自动释放。
7. 设置 CPU、内存、存储、连接数、磁盘使用率、只读/连接失败等告警。
8. 上线前执行一次手工备份，记录备份 ID；上线后在隔离实例做一次恢复演练，不能只相信“备份成功”状态。

### 4.2 建库与最小权限账户

不要让应用长期使用 RDS 高权限主账号。通过受控主机运行 `psql`，连接时让客户端交互输入密码，不把密码写进命令行：

```bash
psql "host=<RDS内网地址> port=5432 dbname=postgres user=<RDS管理账号> sslmode=verify-full sslrootcert=/etc/vault2077/rds-ca.pem"
```

在 `psql` 中执行：

```sql
CREATE ROLE vault2077 LOGIN
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
\password vault2077
CREATE DATABASE vault2077 OWNER vault2077 ENCODING 'UTF8';
\connect vault2077
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO vault2077;
```

当前 Web service 在启动前执行迁移，因此应用账户需要拥有本数据库 schema 的建表/改表权限。不要给它 RDS 实例级管理员权限。未来若拆分迁移账户，必须同时修改 systemd 启动流程，避免 Web 启动账户无权执行 `db:migrate`。

### 4.3 连接串与证书

密码中的 `@`、`:`、`/`、`?`、`#`、`%` 等必须 URL 编码。生产环境示例：

```dotenv
VAULT2077_DATABASE_URL=postgresql://vault2077:<URL编码后的密码>@<RDS内网地址>:5432/vault2077
VAULT2077_DATABASE_SSL=require
NODE_EXTRA_CA_CERTS=/etc/vault2077/rds-ca.pem
VAULT2077_DATABASE_POOL_SIZE=4
```

这里的 `VAULT2077_DATABASE_SSL=require` 是**本项目自己的配置语义**：代码会设置 `rejectUnauthorized=true`，使用 RDS DNS 主机名并校验证书链/主机名；它不同于 libpq 连接串里只加密、不校验身份的 `sslmode=require`。`NODE_EXTRA_CA_CERTS` 用于把阿里云 RDS CA 加入 Node 信任链。不要在生产使用 `disable` 或 `allow-self-signed`。证书轮换前先把新旧 CA 都纳入受控证书包并演练重连。

从 VPS 做基础检查：

```bash
getent hosts <RDS内网地址>
nc -vz <RDS内网地址> 5432
openssl s_client -starttls postgres -connect <RDS内网地址>:5432 -servername <RDS内网地址> </dev/null
```

连接失败按 DNS → 路由/VPC → RDS 白名单 → 安全组 → SSL CA → 账号权限的顺序排查，禁止用全面放开白名单来“验证”。

## 5. OSS 公开头像 Bucket

### 5.1 数据边界

这个 Bucket 只保存服务端解码、去元数据、缩放后的公开 WebP 头像，键固定在 `rangers/<slug>/<sha256>/` 下。授权书、原始头像、合同、邮箱、支付资料或其他隐私数据不能进入该 Bucket。浏览器不获取 OSS 写凭证，也不直传；应用服务器负责上传。

### 5.2 控制台配置

1. 确认 Bucket 与服务器同地域，存储类型为标准存储、本地冗余；记录地域标识，例如 `oss-cn-shanghai`。
2. 开启版本控制。当前撤回命令会枚举并永久删除对象当前版本、历史 `versionId` 和删除标记。
3. 选择公开读取方案：此 Bucket 仅含确认可公开的处理后头像，可使用 `public-read`；绝不能使用 `public-read-write`。若账户安全基线强制“阻止公共访问”，则需另行引入 CDN/签名 URL 方案并修改代码，不能一边阻止匿名读一边期待固定公开 URL 可访问。
4. 绑定 `media.superones.top` CNAME。中国大陆地域自定义域名必须满足备案要求。
5. 为 CNAME 配置 HTTPS 证书，禁止明文媒体 URL。
6. Referer 防盗链允许 `https://superones.top/*` 和必要的管理预览来源；是否允许空 Referer 需按真实页面、搜索引擎和直接访问测试决定。防盗链不是认证。
7. 配置流量、请求数和费用告警。首发不接 CDN；以实际流量和延迟数据决定是否引入。
8. 生命周期规则不得早于应用引用清理策略误删现用对象。普通孤儿对象由每天的应用任务处理；版本历史的生命周期与“撤回时永久删除”要求要分别测试。

### 5.3 RAM 最小权限

创建专用 RAM 用户或角色，例如 `vault2077-oss-writer`，禁止控制台登录，不授予全局 `AliyunOSSFullAccess`。策略只覆盖目标 Bucket 和 `rangers/*`，至少需要实际代码用到的 Put、Head/Get 元数据、List、ListVersions、DeleteObject 和版本删除能力。先使用阿里云 RAM 策略编辑器按实际 API 验证，再收紧资源范围。

示意策略中的 `<bucket>` 必须替换；动作名称以部署时 OSS/RAM 官方权限清单为准：

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:ListObjects",
        "oss:ListObjectVersions",
        "oss:DeleteObject",
        "oss:DeleteObjectVersion"
      ],
      "Resource": [
        "acs:oss:*:*:<bucket>",
        "acs:oss:*:*:<bucket>/rangers/*"
      ]
    }
  ]
}
```

如果策略验证显示 SDK 的 `HEAD`、版本列举或删除对应不同动作，以审计日志里的被拒动作和官方文档为准增补，不能改成全权限后长期保留。

生产变量：

```dotenv
VAULT2077_RANGER_MEDIA_STORAGE=oss
VAULT2077_OSS_REGION=<oss-cn-...>
VAULT2077_OSS_BUCKET=<真实Bucket名称>
VAULT2077_OSS_ACCESS_KEY_ID=<专用RAM AccessKey ID>
VAULT2077_OSS_ACCESS_KEY_SECRET=<专用RAM AccessKey Secret>
VAULT2077_OSS_PUBLIC_ORIGIN=https://media.superones.top
VAULT2077_OSS_INTERNAL=true
```

长期更推荐 ECS RAM 角色/STS，避免静态 AccessKey；但当前代码只接受 AccessKey ID/Secret。切换到实例角色前需要新增、测试并审查凭证提供链，不能只清空现有变量。

### 5.4 真实 OSS 验收

在后台上传一张无敏感信息的测试头像，确认：

- 产生 320 和 800 两个 WebP 对象；对象键不可变且含内容哈希。
- Content-Type 为 `image/webp`，Cache-Control 为一年 immutable，`x-oss-meta-sha256` 正确。
- 应用通过内网 Endpoint 完成 PUT/HEAD；浏览器通过 `https://media.superones.top/...` 匿名读取。
- 非 `rangers/*` 写入被 RAM 拒绝。
- `npm run opc:cleanup-ranger-media` 能清理达到条件的未引用对象。
- 在专用测试 slug 上执行 `npm run opc:purge-revoked-ranger-media -- <slug>` 后，当前对象、历史版本和删除标记均不存在。不要拿真实运营头像做首次永久删除演练。

## 6. DNS、备案和 HTTPS

### 6.1 DNS 记录

在 DNS 控制台配置：

| 主机记录 | 类型 | 目标 |
| --- | --- | --- |
| `@` | A/AAAA | VPS 公网 IP；未使用 IPv6 时不要创建无效 AAAA |
| `www` | CNAME 或 A | 指向主站，Nginx 会跳转到裸域 |
| `admin` | A/AAAA | 同一 VPS 公网 IP |
| `media` | CNAME | OSS 控制台给出的 CNAME 目标 |

切流前把旧记录 TTL 临时降到 300 秒；稳定 24–48 小时后恢复常规 TTL。不要在证书、Nginx 和回滚站点都未准备时提前切主域名。

### 6.2 证书

可用阿里云数字证书管理服务或 ACME/Let’s Encrypt。无论采用哪种方式，都必须覆盖：

- `superones.top` 和 `www.superones.top`；
- `admin.superones.top`；
- `media.superones.top` 的证书在 OSS/CNAME 侧配置。

仓库 Nginx 模板当前示例为 Let’s Encrypt 路径。若使用阿里云证书，应把证书和私钥安装到 root 只读目录，并只替换模板中的两条路径。证书续期必须有自动化和到期告警，续期后执行 `nginx -t && systemctl reload nginx`。

Passkey 依赖真实 HTTPS origin 和稳定 RP ID。更换 `admin.superones.top` 会使已注册凭证不再适用，因此管理域名确定后才注册生产 Passkey。

## 7. 服务器初始化

以下命令以 Ubuntu 24.04 为例。若是 Alibaba Cloud Linux，使用其包管理器完成等价操作，不要混用命令。

### 7.1 系统与运维账户

```bash
sudo apt update
sudo apt full-upgrade
sudo apt install -y nginx postgresql-client curl ca-certificates openssl jq rsync tar xz-utils ufw
sudo timedatectl set-timezone Asia/Shanghai
sudo adduser --system --group --home /srv/vault2077 --shell /usr/sbin/nologin vault2077
sudo install -d -o vault2077 -g vault2077 -m 0750 /srv/vault2077/releases
sudo install -d -o root -g root -m 0700 /etc/vault2077
```

系统时区设为北京时间便于读日志；systemd timer 仍应保留显式 `Asia/Shanghai`。启用阿里云时间同步或发行版 chrony/systemd-timesyncd，并确认 `timedatectl status` 显示同步正常。WebAuthn 挑战、会话、签名批次和支付回调都依赖可信时间。

### 7.2 SSH

- 使用个人 SSH 公钥，不启用密码登录；禁止 root 远程密码登录。
- 每人独立账户或使用堡垒机，不共享私钥。
- 验证新会话可登录后再收紧 `PasswordAuthentication no` 和 root 登录。
- 为控制台救援、密钥遗失和磁盘故障写下恢复路径；SSH 私钥不放项目目录。

### 7.3 Node.js

项目要求 Node `>=24.7.0`。当前工作区通过版本为 24.16.0；正式迁移时应使用构建记录中的同一 Node 24 补丁版本。模板将稳定运行时链接固定为 `/opt/node`，避免依赖个人 shell 的 nvm。以 x86_64 和 24.16.0 为例：

```bash
mkdir -p /tmp/vault2077-node
cd /tmp/vault2077-node
V2077_NODE_VERSION=24.16.0
V2077_NODE_ARCH=linux-x64
curl -fSLO "https://nodejs.org/dist/v${V2077_NODE_VERSION}/node-v${V2077_NODE_VERSION}-${V2077_NODE_ARCH}.tar.xz"
curl -fSLO "https://nodejs.org/dist/v${V2077_NODE_VERSION}/SHASUMS256.txt"
grep " node-v${V2077_NODE_VERSION}-${V2077_NODE_ARCH}.tar.xz$" SHASUMS256.txt | sha256sum -c -
sudo tar -xJf "node-v${V2077_NODE_VERSION}-${V2077_NODE_ARCH}.tar.xz" -C /opt
sudo ln -sfn "/opt/node-v${V2077_NODE_VERSION}-${V2077_NODE_ARCH}" /opt/node
```

若 VPS 是 arm64，把架构改成 `linux-arm64`，并确保发布包也在 arm64 Linux 构建。大陆服务器无法稳定访问 nodejs.org 时，在受控构建机下载并校验后，把 tar 与官方 `SHASUMS256.txt` 一起传入；不要从不明镜像下载安装脚本。

安装后必须满足：

```bash
/opt/node/bin/node --version
/opt/node/bin/npm --version
/opt/node/bin/node -p 'process.platform + " " + process.arch'
```

四个 systemd 模板已显式设置 `/opt/node/bin` PATH 并调用 `/opt/node/bin/npm`。生产版本要固定并纳入补丁升级流程；升级补丁时先构建/测试同版本发布包，再原子切换 `/opt/node` 链接和应用 release，不执行无人复核的自动大版本升级。

## 8. 生产构建与发布包

### 8.1 构建原则

- 必须在 Linux 上构建，CPU 架构与 VPS 一致。Windows 的 `.next`、`node_modules` 和 Sharp 二进制不能直接上传。
- 构建输入必须是已提交、已评审的 commit；不要用含未知未提交改动的工作区制作生产包。
- 发布包不得包含 `.git`、`.env.local`、生产环境文件、SSH 密钥、测试上传、数据库转储或个人资料。
- 2 核 2 GB VPS 不承担常规构建。可使用 GitHub Actions Linux runner、临时阿里云构建 ECS 或受控 Linux 工作站。中国大陆 VPS 只接收已验证发布包。

### 8.2 Linux 构建机示例

```bash
git clone <受控仓库地址> vault2077-build
cd vault2077-build
git checkout <审核通过的commit或tag>
npm ci
npm run docs:check
npm run lint
npm run typecheck
npm test
npm run build
npm prune --omit=dev
```

然后从该干净 checkout 打包运行所需的完整仓库内容、`.next` 和生产 `node_modules`：

```bash
cd ..
tar \
  --exclude='vault2077-build/.git' \
  --exclude='vault2077-build/.env*' \
  --exclude='vault2077-build/tests' \
  --exclude='vault2077-build/data/ranger-media' \
  -czf vault2077-<commit>-linux-<arch>.tar.gz vault2077-build
sha256sum vault2077-<commit>-linux-<arch>.tar.gz > vault2077-<commit>-linux-<arch>.tar.gz.sha256
```

`.env.example` 被排除不影响运行；仓库中的 `config/`、`migrations/`、`scripts/`、`lib/`、`data/bootstrap/`、`public/`、`.next/`、`package.json` 和生产 `node_modules/` 必须在包内。若采用 CI artifact，应对同一清单做等价校验。

将发布包通过 SCP、堡垒机或私有 OSS 传到 VPS 的 `/tmp`。不要把生产发布包放进公开媒体 Bucket。

### 8.3 安装 release

```bash
cd /tmp
sha256sum -c vault2077-<commit>-linux-<arch>.tar.gz.sha256
sudo install -d -o vault2077 -g vault2077 -m 0750 /srv/vault2077/releases/<UTC时间>-<短SHA>
sudo tar -xzf vault2077-<commit>-linux-<arch>.tar.gz \
  --strip-components=1 \
  -C /srv/vault2077/releases/<UTC时间>-<短SHA>
sudo chown -R vault2077:vault2077 /srv/vault2077/releases/<UTC时间>-<短SHA>
sudo -u vault2077 test -f /srv/vault2077/releases/<UTC时间>-<短SHA>/.next/BUILD_ID
```

第一次部署在启服务前建立链接；后续部署应先完成新 release 离线校验，再原子切换：

```bash
sudo ln -sfn /srv/vault2077/releases/<UTC时间>-<短SHA> /srv/vault2077/current.new
sudo mv -Tf /srv/vault2077/current.new /srv/vault2077/current
```

保留至少前两个 release。不要自动删除当前或最近回滚版本。

## 9. 生产环境文件

### 9.1 创建与权限

以 [`.env.example`](../.env.example) 为字段模板，在服务器创建 `/etc/vault2077/production.env`：

```bash
sudo install -o root -g root -m 0600 /dev/null /etc/vault2077/production.env
sudoedit /etc/vault2077/production.env
sudo stat -c '%U %G %a %n' /etc/vault2077/production.env
```

一行一个 `KEY=value`。JSON keyring 用单引号包住完整 JSON；私钥必须采用 Node `--env-file` 能解析的单行表示。编辑完成后清理终端剪贴板和本地临时文件。不要 `source` 整个文件，不要用 `env`、`printenv` 或日志输出全部配置。

### 9.2 生成彼此独立的秘密

以下每次命令都要单独执行并直接写入密码管理器；不要复制命令输出到聊天：

```bash
openssl rand -base64 48
```

至少生成并区分：

1. `VAULT2077_DATA_KEYS` 当前 key；
2. `VAULT2077_ADMIN_SESSION_SECRET`；
3. `VAULT2077_AUDIT_HASH_SECRET`；
4. `VAULT2077_PIPELINE_SIGNING_KEYS` 当前 key；
5. `VAULT2077_PIPELINE_WORKER_SECRET`；
6. `VAULT2077_FRONTIER_TASKS_SECRET`；
7. `VAULT2077_FRONTIER_TICK_SECRET`；
8. `VAULT2077_HEALTH_SECRET`。

它们均至少 32 字节且不能复用。keyring 示例：

```dotenv
VAULT2077_DATA_KEYS='{"2026-07":"<随机秘密>"}'
VAULT2077_DATA_ACTIVE_KEY_ID=2026-07
VAULT2077_PIPELINE_SIGNING_KEYS='{"2026-07":"<另一个随机秘密>"}'
VAULT2077_PIPELINE_ACTIVE_KEY_ID=2026-07
```

轮换时先在 keyring 同时保留新旧 key、把 active ID 指向新 key、验证读旧写新，最后才删除旧 key。不要恢复已退役的单值密钥变量。

### 9.3 全功能首发变量

必须逐项填写 [`.env.example`](../.env.example)，尤其是：

- `NODE_ENV=production`；
- RDS URL、TLS、CA 和 pool；
- OSS、公开/后台/媒体 origin；
- 已确认 ICP、营业执照、法律邮箱和生效日；
- 支付宝 App ID、卖家 ID、PKCS8 应用私钥、支付宝公钥、网关和支付模式；
- 服务端只读 `GITHUB_TOKEN`；
- Vault 和 SiC 两套独立编辑模型配置；
- 全部密钥和采集限制。

功能开关的安全顺序：

```dotenv
VAULT2077_ALLOW_FILE_PREVIEW=false
VAULT2077_TRUST_PROXY_HEADERS=true
VAULT2077_OPC_PAYMENTS_ENABLED=false
VAULT2077_FRONTIER_WRITES_ENABLED=false
```

先以支付和 Frontier 写入关闭完成基础部署；真实支付宝闭环和真实 Frontier 奖励发布完成后，才把对应开关改成 `true` 并重启。这里的短暂关闭是部署阶段门禁，不是改变“全功能首发”决定。

`VAULT2077_DATA_DIR` 是本地预览变量，生产文件中应删除或留空；`VAULT2077_ADMIN_PASSWORD_HASH`、任何本地明文密码、旧 OIDC 变量、旧共享 `VAULT2077_LLM_*` 变量都必须删除/留空。

### 9.4 模型配置

Vault 与 SiC 分别需要：HTTPS base URL、API key、明确模型名、超时、并发、批量大小和每轮最大请求数。不要把“自动选择模型”作为生产配置。

2026-08-02 已验证的大陆生产基线如下；API key 只写入 root-owned 环境文件：

```dotenv
VAULT2077_VAULT_LLM_BASE_URL=https://api.deepseek.com/v1
VAULT2077_VAULT_LLM_MODEL=deepseek-v4-flash
VAULT2077_VAULT_LLM_MAX_REQUESTS_PER_RUN=300
VAULT2077_SIC_LLM_BASE_URL=https://api.xiaomimimo.com/v1
VAULT2077_SIC_LLM_MODEL=mimo-v2.5
VAULT2077_SIC_LLM_MAX_REQUESTS_PER_RUN=200
```

`api.mimo.com` 是已知错误域名，生产配置门禁会直接拒绝。两个模型默认不显式设置 `REASONING_EFFORT`；这些结构化抽取、翻译和摘要任务先以默认推理行为运行，只有在保存质量/延迟/成本对照证据后才调整。

迁移到大陆后先在 VPS 上分别验证提供方网络、TLS、响应格式、限速、单次最大 token、余额和内容合规策略。主/备用模型的 base URL、key 和模型名都要显式配置；备用只在受控失败类别触发。若两频道使用同一提供方，生产检查会提示集中风险，应记录接受原因，并在首周准备第二提供方或容量降级方案。

不要把境外上游抓取和 LLM 访问混为一谈：境外公开信息仍由 GitHub Actions collector 获取，境内 Worker 只接收签名包并调用已验证可用的编辑模型。

## 10. 安装 systemd 与 Nginx

### 10.1 systemd

仓库模板已经按外部 RDS、2C2G 运行基线和 `/srv/vault2077/current` 编写。安装：

```bash
cd /srv/vault2077/current
sudo install -m 0644 deploy/systemd/vault2077-*.service /etc/systemd/system/
sudo install -m 0644 deploy/systemd/vault2077-*.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/vault2077-*.service /etc/systemd/system/vault2077-*.timer
sudo systemctl daemon-reload
```

核对 `/opt/node/bin/npm`、用户、工作目录和环境文件路径。如果采用不同的系统级 Node/npm 安装路径，修改全部 unit 的 `PATH` 和 npm 绝对路径后重新 verify。四个 Node service 的 `RestrictAddressFamilies` 必须保留 `AF_UNIX AF_INET AF_INET6 AF_NETLINK`；缺少 `AF_NETLINK` 会在目标运行时触发 `EAFNOSUPPORT`。不要启动 timer，直到数据库、配置、模型探针、bootstrap 和 Web 基础验收完成。

### 10.2 Nginx

```bash
sudo install -m 0644 deploy/nginx/vault2077-admin-proxy.conf.example \
  /etc/nginx/snippets/vault2077-admin-proxy.conf
sudo install -m 0644 deploy/nginx/vault2077.conf.example \
  /etc/nginx/sites-available/vault2077.conf
sudo ln -s /etc/nginx/sites-available/vault2077.conf /etc/nginx/sites-enabled/vault2077.conf
```

编辑证书路径。`limit_req_zone` 必须位于 Nginx `http {}` 上下文；Ubuntu 的 `sites-enabled` 通常在该上下文 include，其他发行版不一定。然后：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

保留模板中覆盖写入的 `X-Forwarded-For`、`X-Real-IP`、`X-Forwarded-Proto` 和清空身份断言头的行为。增加 CDN/SLB 前必须先配置仅信任其出口地址，不能盲目信任客户端转发头。

## 11. 数据库迁移与 bootstrap

### 11.1 生产配置门禁

用 transient systemd unit 让服务用户读取 root-owned 环境文件，不把秘密载入交互 shell：

```bash
sudo systemd-run --unit=vault2077-deploy-check --wait --pipe --collect \
  --uid=vault2077 --gid=vault2077 \
  --working-directory=/srv/vault2077/current \
  --property=EnvironmentFile=/etc/vault2077/production.env \
  --setenv=NODE_ENV=production \
  /opt/node/bin/npm run deploy:check
```

若发行版的 `systemd-run` 不支持这些选项，创建一个与现有 oneshot unit 同权限模型的临时 unit；不要把环境文件改成 world-readable。所有错误归零才能继续。

### 11.2 真实编辑提供方探针

静态门禁通过后、迁移和 worker 启动前，使用同一 root-owned 环境文件分别调用 Vault/SiC 的全部主线路及已配置备用线路：

```bash
sudo systemd-run --unit=vault2077-editorial-probe --wait --pipe --collect \
  --uid=vault2077 --gid=vault2077 \
  --working-directory=/srv/vault2077/current \
  --property=EnvironmentFile=/etc/vault2077/production.env \
  --setenv=NODE_ENV=production \
  /opt/node/bin/npm run deploy:verify-editorial
```

输出只能包含 profile、主/备用线路、提供方主机、模型名和 `status=ok`，不包含 key。该探针同时验证 DNS、TLS、凭证、模型名称、Chat Completions 路径和 JSON 响应协议；任一路失败即停止部署，不得以无 key 的 `401` 或普通 `curl` 代替。

### 11.3 迁移

先在 RDS 控制台建立手工备份。然后：

```bash
sudo systemd-run --unit=vault2077-migrate --wait --pipe --collect \
  --uid=vault2077 --gid=vault2077 \
  --working-directory=/srv/vault2077/current \
  --property=EnvironmentFile=/etc/vault2077/production.env \
  --setenv=NODE_ENV=production \
  /opt/node/bin/npm run db:migrate
```

再执行一次，确认幂等；运行 PostgreSQL 集成测试：

迁移校验值以统一为 LF 的 SQL 正文计算，避免同一迁移在 Windows CRLF 与 Linux LF checkout 间误报变化。迁移器仅兼容相同正文的旧 LF/CRLF 原始校验值；任何 SQL 语义或其他字节变化仍会中止部署，必须新增迁移文件，禁止改写历史迁移或手工更新迁移表。

```bash
sudo systemd-run --unit=vault2077-pg-test --wait --pipe --collect \
  --uid=vault2077 --gid=vault2077 \
  --working-directory=/srv/vault2077/current \
  --property=EnvironmentFile=/etc/vault2077/production.env \
  --setenv=NODE_ENV=production \
  /opt/node/bin/npm run test:postgres:integration
```

验证 `vault2077_schema_migrations` 最新记录是 `0006_acquisition_reliability.sql`。不要手工修改迁移表，不要回滚 SQL 文件，也不要删除已有 migration。

### 11.4 一次性 bootstrap

先在不连接生产数据库的发布目录校验包内内容：

```bash
sudo -u vault2077 /opt/node/bin/npm --prefix /srv/vault2077/current run bootstrap:verify
```

期望计数：information 132、roadside 728、events 4、SiC 156、ranking boards 5、ranking items 90。计数或清单哈希不一致时停止，不得用 `--confirm` 绕过。

确认 RDS 手工备份 ID 后导入：

```bash
sudo systemd-run --unit=vault2077-bootstrap --wait --pipe --collect \
  --uid=vault2077 --gid=vault2077 \
  --working-directory=/srv/vault2077/current \
  --property=EnvironmentFile=/etc/vault2077/production.env \
  --setenv=NODE_ENV=production \
  /opt/node/bin/npm run bootstrap:import -- --confirm
```

再运行一次确认幂等。当前实现按稳定键合并，保留生产中新产生的记录；但它仍是一次性、受审计、备份后的上线作业，不应加入 timer 或每次部署自动执行。

## 12. 启动 Web 与内部健康检查

```bash
sudo systemctl enable --now vault2077-web.service
sudo systemctl status vault2077-web.service --no-pager
sudo journalctl -u vault2077-web.service -n 200 --no-pager
curl -fsS -H 'Host: superones.top' http://127.0.0.1:3000/ >/dev/null
```

健康接口只从回环或受控内网访问。以下命令不会打印密钥：

```bash
sudo /opt/node/bin/node --env-file=/etc/vault2077/production.env -e '
const r = await fetch("http://127.0.0.1:3000/api/internal/health", {
  headers: {Authorization: `Bearer ${process.env.VAULT2077_HEALTH_SECRET}`}
});
console.log(r.status, await r.text());
process.exit(r.ok ? 0 : 1);
'
```

健康为 `200` 且所有检查为 okay 才能继续。它覆盖：最新迁移、inbox 数量与最老 received/processing/retryable、新增 quarantine、四通道最近接收/处理/最终发布时间、榜单 stale/failed/partial、Frontier 回退积压和两套编辑配置。新鲜度按 ADR-0015 的北京时间计划和通道宽限期判断，不能使用会在夜间停采窗口误报的固定 8/36 小时阈值。`503` 不是“服务活着所以忽略”的状态。

## 13. Passkey 管理员接管

### 13.1 签发十分钟注册令牌

只通过 SSH 运行：

```bash
sudo systemd-run --unit=vault2077-admin-enroll --wait --pipe --collect \
  --uid=vault2077 --gid=vault2077 \
  --working-directory=/srv/vault2077/current \
  --property=EnvironmentFile=/etc/vault2077/production.env \
  --setenv=NODE_ENV=production \
  /opt/node/bin/npm run admin:passkey:enroll
```

命令输出一次性令牌和过期时间。令牌只交给固定 owner，不截图到群、不写本文、不进工单。十分钟内打开 `https://admin.superones.top/admin` 完成注册。

### 13.2 必做验收

1. 注册第一枚硬件密钥或平台 Passkey。
2. 首次出现的恢复码立即保存到离线密码库/纸质密封件；页面关闭后不能再次查看明文。
3. 登录后注册第二个独立认证器，不能只在同一台设备保留一个同步副本。
4. 验证登录、注销、会话失效、敏感写操作五分钟内再认证。
5. 验证凭证撤销不会影响另一个有效凭证。
6. 用一条恢复码做受控演练，确认一次性消费；其余恢复码重新核对离线保管。
7. 紧急接管时才运行 `npm run admin:passkey:enroll -- --revoke-existing`；它会签发新令牌并撤销现有管理员会话，必须双人确认。

Passkey 未在真实 HTTPS 管理域名通过前，不能开放运营后台。浏览器可以使用安全钥匙/平台认证器的 PIN 码；ceremony 使用 `userVerification=required`，要求认证器实际完成 PIN 或生物验证并返回签名的 UV 标志，服务端同时执行底层与业务层复核。不要用 Nginx Basic Auth 或共享密码临时代替。

## 14. 支付宝生产接入

### 14.1 配置

在支付宝开放平台核对：App ID、签约产品、应用公钥/支付宝公钥类型、应用私钥 PKCS8、卖家 ID、应用网关/授权回调配置。生产环境使用：

```dotenv
VAULT2077_ALIPAY_GATEWAY=https://openapi.alipay.com/gateway.do
VAULT2077_ALIPAY_KEY_TYPE=PKCS8
VAULT2077_ALIPAY_WEB_PAYMENT_MODE=both
VAULT2077_OPC_PAYMENTS_ENABLED=false
```

支付宝异步通知地址由代码生成：`https://superones.top/api/opc/alipay/notify`；返回地址为 `https://superones.top/opc/payment/return?...`。异步通知必须公网 HTTPS 可达，但支付成功判断只信任服务端验签、金额/商户/订单匹配和服务端查询，不信任浏览器回跳。

### 14.2 上线门禁

使用最低可行真实金额完成：

1. 创建订单，确认订单号唯一、金额和商品正确。
2. PC 和移动至少各完成一次真实支付。
3. 验证异步通知重复投递幂等；伪造签名、错误金额、错误 seller/app ID 被拒绝。
4. 验证浏览器关闭或回跳失败时，服务端查询仍能恢复正确状态。
5. 完成一次全额退款，核对支付宝后台、应用订单状态和审计记录。
6. 对账并保存脱敏证据；不得保存完整私钥、买家身份或支付凭证截图到仓库。

全部通过后：

```bash
sudoedit /etc/vault2077/production.env
# 把 VAULT2077_OPC_PAYMENTS_ENABLED 改为 true
sudo systemctl restart vault2077-web.service
```

再跑生产配置检查、健康检查和一次小额支付。若出现订单状态异常，先把开关恢复 `false`，不要删除订单或手改支付状态。

## 15. Frontier 全功能启用

1. 通过 Passkey 登录后台，在 Frontier 当季配置中填写真实奖励。奖励描述必须是 4–200 个真实字符，写明金额/权益、资格、结算和发放口径，不能使用占位文案。
2. 保存草稿，复核赛季、时间窗、奖励、规则和联系人。
3. 完成最近 Passkey 再认证并发布当季奖励。
4. 用公开测试仓库走一次报名；保留页面生成的 `.vault2077/season-2026-Q3.json` 并提交到仓库。
5. 验证境内 GitHub 快速路径能读取公开仓库；故意制造一次可恢复失败，验证公开回退任务由境外 collector 获取并以 `repository_observation` 回传。
6. 验证榜单刷新、重复观察幂等、退出/无效仓库处理和结算边界。

通过后把 `VAULT2077_FRONTIER_WRITES_ENABLED=true`，重启 Web，并启用 timer。不要在没有真实奖励和端到端测试时仅打开开关。

## 16. 境外采集器与大陆边界

中国大陆 VPS 不应接管全部境外抓取。正式链路保持：

- GitHub Actions 从境外公开来源采集，使用版本化 HMAC keyring 签名，将公开内容包 POST 到 `https://superones.top/api/internal/acquisition`。
- 境外 rankings lane 用独立只读密钥 GET `https://superones.top/api/internal/frontier/tasks`，只获取已脱敏公开任务。
- 境内 acquisition worker 从 PostgreSQL inbox 消费、重试、隔离、调用编辑模型并发布。
- Frontier 境内服务端保留短超时、有界并发的 GitHub 快速路径；失败时进入公开回退任务，而不是让页面报错或无限重试。

GitHub Actions 只配置：

- `VAULT2077_DOMESTIC_ACQUISITION_URL=https://superones.top/api/internal/acquisition`；
- `VAULT2077_FRONTIER_PUBLIC_TASKS_URL=https://superones.top/api/internal/frontier/tasks`；
- 版本化 pipeline 签名 keyring 和 active key ID；
- 独立 `VAULT2077_FRONTIER_TASKS_SECRET`；
- collector 所需的只读 GitHub token；
- `VAULT2077_REQUIRE_DOMESTIC_DELIVERY=true`。

它不得持有 RDS、后台会话、worker、health、支付宝、OSS 写入或境内 LLM 密钥，也不得调用 `/api/internal/acquisition/process`。

先在低 TTL/维护窗口逐通道完成一次真实 incremental：确认接收 `202`、inbox 入库、worker 消费、内容更新、审计记录、模型基础设施故障会变为 `retryable`、确定性坏记录才进入内容 quarantine，且重复包幂等。四通道 incremental 全部闭环后，才按 information → roadside → sic → rankings 逐通道触发一次 bootstrap；每次保存 GitHub run ID、batch ID、inbox 最终状态和内容计数。不要把 workflow 成功当作境内发布成功；两端证据都要看。

## 17. 启用定时任务

完成 Web、RDS、OSS、模型、采集、支付和 Frontier 验收后：

```bash
sudo systemctl enable --now \
  vault2077-acquisition-worker.timer \
  vault2077-healthcheck.timer \
  vault2077-frontier-tick.timer \
  vault2077-ranger-media-cleanup.timer
sudo systemctl list-timers 'vault2077-*' --all
```

分别手工触发一次：

```bash
sudo systemctl start vault2077-acquisition-worker.service
sudo systemctl start vault2077-healthcheck.service
sudo systemctl start vault2077-frontier-tick.service
sudo systemctl start vault2077-ranger-media-cleanup.service
```

检查：

```bash
sudo journalctl -u vault2077-acquisition-worker.service -n 200 --no-pager
sudo journalctl -u vault2077-healthcheck.service -n 200 --no-pager
sudo journalctl -u vault2077-frontier-tick.service -n 200 --no-pager
sudo journalctl -u vault2077-ranger-media-cleanup.service -n 200 --no-pager
```

oneshot 返回非零、timer 超过两个周期没有成功、inbox 出现新增 quarantine 或频道超过调度感知的新鲜度 deadline 都必须告警。生产主告警接收人为 `lanzhouda@163.com`，当前没有备用接收人；阿里云侧必须实际发送测试邮件并记录送达结果。

## 18. 公开切流前验收

### 18.1 自动化门禁

在对应 commit 的 Linux 构建环境保存以下成功记录：

```bash
npm run docs:check
npm run lint
npm run typecheck
npm test
npm run build
npm run test:acquisition:e2e
npm run test:pipeline:e2e
```

生产环境另保存：`deploy:check`、两次 `db:migrate`、PostgreSQL integration、两次 bootstrap import、health 200、三个 oneshot 和 timer 状态。

### 18.2 公网边界

从一台不在服务器内网的机器验证：

```bash
curl -I https://superones.top/
curl -I https://admin.superones.top/admin
curl -i https://superones.top/admin
curl -i https://superones.top/api/internal/health
curl -i https://superones.top/api/internal/acquisition
curl -i -X POST https://superones.top/api/internal/frontier/tasks
curl -i https://<服务器公网IP>:3000/
```

期望：主站 200/合理跳转；后台域可达但未认证；公开域后台与 health 为 404；acquisition 非 POST 为 405；Frontier tasks 非 GET 为 405；公网 3000 无法连接。再验证伪造 `X-Forwarded-For`、`X-Real-IP`、身份断言头不能绕过授权。

### 18.3 浏览器矩阵

不能把所有浏览器 QA 推迟到公开切流后。至少先在真实生产域名但尚未宣传的窗口，按 360、768、1280、1440 px 验证：

- 首页、Vault 信息流、路边社、事件、SiC 列表/详情/榜单；
- OPC 工作台、专家目录/详情、头像加载、订单和支付；
- Frontier 说明、报名、仓库验证、榜单；
- 后台登录、Passkey 注册/认证/再认证、编辑保存/发布、审计；
- 空状态、降级状态、404、慢网、刷新、前进后退和移动触控；
- Chrome/Edge 与 iOS Safari 或 Android Chrome 至少各一条真实设备路径。

发现 P0 问题时停止公开切流；不得以“上线后再测”为由放过登录、支付、数据写入、公开路由、移动主流程或回滚问题。

### 18.4 Go/No-Go

必须同时满足：

- RDS 手工备份存在且可定位；上一个 release 可回滚。
- deploy check、迁移、bootstrap、health、timer 全绿。
- Passkey 至少两个认证器和离线恢复码可用。
- OSS 上传/读取/清理/版本永久删除演练完成。
- 支付小额、重复通知、查询、退款完成，支付开关已启用。
- Frontier 真实奖励发布、仓库闭环和回退链路完成，写入开关已启用。
- 境外采集到境内发布闭环完成。
- Nginx 边界和浏览器 P0 矩阵完成。
- 监控接收人能收到一次人为测试告警。

## 19. 监控、日志与告警

至少监控：

| 层级 | 指标/事件 | 首发动作 |
| --- | --- | --- |
| 域名/证书 | DNS、HTTPS、证书到期 | 到期 30/14/7 天告警 |
| Web | 进程、5xx、P95、RSS、重启次数 | 5xx/重启立即告警 |
| 业务健康 | `/api/internal/health` 状态和各检查 | 503 立即告警 |
| Worker | 最近成功、运行时长、非零退出 | 超过两个周期无成功告警 |
| Inbox | received/processing/retryable/quarantined | 新 quarantine 告警 |
| 内容 | Vault/SiC 新鲜度、榜单 stale/partial | 按健康阈值告警 |
| RDS | CPU、内存、连接、存储、慢 SQL、备份 | 存储/连接提前预警 |
| OSS | 4xx/5xx、流量、请求数、费用 | 异常增长和拒绝告警 |
| 支付 | 通知验签失败、待确认、退款失败、对账差异 | 立即人工核对 |
| 安全 | SSH、Nginx 限速、后台失败认证、RAM 拒绝 | 聚合异常来源 |

日志不得记录：完整 Authorization、Passkey challenge、注册令牌、恢复码、数据库 URL、支付宝私钥、OSS Secret、模型 key 或原始隐私材料。systemd journal 设置容量/保留策略；阿里云日志服务接入若包含用户数据，先定义脱敏和访问控制。

2C2G 首周重点观察 Web RSS、swap、数据库连接、P95 和 worker 峰值。持续 swap、Web RSS 接近 700 MB 或 worker 期间请求延迟显著上升时，优先升级 2C4G，不要先提高 pool 或 Node 堆上限。

## 20. 回滚和故障处理

### 20.1 应用回滚

```bash
sudo systemctl stop \
  vault2077-acquisition-worker.timer \
  vault2077-frontier-tick.timer \
  vault2077-ranger-media-cleanup.timer
sudo ln -sfn /srv/vault2077/releases/<上一稳定版本> /srv/vault2077/current.new
sudo mv -Tf /srv/vault2077/current.new /srv/vault2077/current
sudo systemctl restart vault2077-web.service
```

随后跑 deploy check、health 和主流程 smoke test。只有旧代码兼容当前数据库 schema 时才能回滚代码；迁移是向前执行的，不自动反向执行 SQL。若新迁移破坏兼容，优先部署前向修复版本或从隔离恢复演练后按批准方案恢复 RDS。

### 20.2 功能止损

- 支付故障：先设 `VAULT2077_OPC_PAYMENTS_ENABLED=false` 并重启，保留订单和回调证据。
- Frontier 写入故障：先设 `VAULT2077_FRONTIER_WRITES_ENABLED=false`；保留已发布奖励和审计，不手改榜单。
- 采集故障：停止 acquisition timer；保留 inbox，修复后让幂等 worker 重试，不删除 quarantine。
- OSS 故障：停止头像发布/清理；不要把生产临时切回 VPS 本地媒体真源。
- 密钥泄露：先撤销/轮换对应单一密钥；keyring 按重叠窗口迁移；检查访问和审计，不一次性无计划更换全部密钥。

### 20.3 RDS 恢复

生产故障时优先恢复到新隔离实例，核对时间点、迁移版本、订单、审计和内容数量后再切连接串。不要直接覆盖唯一生产实例。恢复演练记录必须包含 RPO、RTO、恢复点、验证查询和清理方式。

## 21. 上线后必须完善的项目

### P0：公开后 0–24 小时

1. **持续浏览器回归**：补齐真实运营内容、真实支付回调延迟、真实移动网络和缓存行为；原因是预上线 smoke test 无法覆盖真实流量。每个问题记录 URL、时间、设备、复现步骤、请求 ID 和严重度。
2. **告警值校准**：根据首日基线调整 5xx、P95、RDS 连接、OSS 流量和 worker 时长；原因是初始阈值只能防失联，不能代表正常业务分布。
3. **内容新鲜度与跨境投递观察**：逐轮核对 GitHub Actions、签名接收、inbox、Worker 和公开内容时间；原因是大陆网络迁移最大风险是跨境链路部分成功、端到端失败。
4. **支付人工对账**：首日订单逐笔核对；原因是异步回调、主动查询和退款是资金正确性的最后门禁。

### P1：上线后 2–7 天

1. **RDS 恢复演练**：恢复到隔离实例，跑迁移/健康/抽样数据校验，记录 RPO/RTO。备份存在不等于可恢复。
2. **OSS 撤回演练复盘**：验证当前对象、历史版本和删除标记永久删除，核对 RAM 审计。原因是本人撤回要求不能由普通生命周期规则替代。
3. **模型供应风险**：记录两频道成功率、延迟、成本、限额、内容质量；若共享提供方，准备第二提供方。原因是当前是单点容量/合规风险。
4. **容量决策**：按一周 RSS、swap、P95、worker 峰值、RDS 连接决定是否升级 2C4G/RDS 规格。不要凭感觉调大并发。
5. **密钥与 Passkey 交接演练**：验证第二认证器、恢复码、SSH 紧急签发、keyring 轮换步骤，确保不是只有一个人/一台设备能恢复。

### P2：上线后 8–30 天

1. **低覆盖核心模块补测试**：优先提升 content pipeline、GitHub/Frontier、security audit、OPC order store、Frontier store 的失败和并发分支。此前审查中这些模块覆盖明显低于项目平均，首发虽有契约/E2E 门禁，长期仍存在回归风险。
2. **后台模块化**：继续拆分复杂的管理控制台和业务编排边界，减少单文件状态、重复校验和隐式耦合；每次重构保持小提交和现有 E2E。
3. **支付自动对账/运营流程**：把待确认、异常通知、退款和日对账变成可审计例行流程，而不是临时查数据库。
4. **安全与灾备演练**：进行密钥泄露、RDS PITR、release 回滚、OSS 删除、timer 失联、跨境投递失败和模型线路失效后 inbox 自动重试演练。
5. **费用与架构复核**：依据实际 OSS 公网流量决定是否上 CDN；依据 RDS/服务器利用率决定规格，不为了“云原生”提前引入 Redis、Kubernetes 或多机复杂度。
6. **不可变纠错策略运营化**：保持方案 A，不建设删改/审核 UI。形成“发现错误 → 新报告更正 → 关联旧报告 → append-only 审计 → 对外说明”的操作模板。

## 22. 需要项目负责人亲自完成或授权的事项

Codex 可以继续执行代码、配置模板、检查、迁移命令和验收，但以下事项需要负责人在阿里云/支付宝/域名/密码管理器中操作或明确授权：

1. **解决 RDS 系列与 PITR 冲突**

   内容：确认已购 RDS 实例系列；若为基础系列，升级或迁移到支持日志备份的系列，推荐高可用多可用区。
   原因：基础系列不支持日志备份和任意时间点恢复，与当前全功能首发的数据保护门禁直接冲突。
   步骤：RDS 控制台查看“系列” → 咨询/核对目标系列支持日志备份 → 在导入生产数据前升级或创建目标实例迁移 → 启用自动与日志备份 → 恢复到隔离实例并核对 RPO/RTO。若决定保留基础系列，需书面接受备份集级 RPO 并授权修订规格。

2. **提供安全连接入口**

   内容：给执行者 VPS 的 SSH host、端口、用户、公钥授权方式和应用路径，或在新大陆工作环境中配置 SSH alias。
   原因：当前仓库没有目标主机 SSH 配置，不能远程运行部署。
   步骤：在 VPS 创建独立运维账户 → 加入个人公钥 → 限定安全组来源 → 本地 `ssh <alias>` 验证 → 只把 alias 和非秘密路径写进部署记录，不发送私钥。

3. **确认 VPS 产品和网络**

   内容：确认 ECS 还是轻量应用服务器，并提供实例、地域、VPC/vSwitch、私网 IP。
   原因：轻量到 RDS 私网需要服务互联；错误假设会导致数据库暴露公网。
   步骤：控制台查看实例详情 → 记录字段 → ECS 配同 VPC，或轻量建立服务互联 → 从 VPS `nc -vz <RDS内网地址> 5432` → 收紧白名单。

4. **配置 RDS 与保存备份证据**

   内容：开启 SSL、备份/PITR、释放保护、白名单，创建最小权限账户并提供凭据到密码管理器。
   原因：这些是账户控制面的高权限操作，不能由代码仓库代替。
   步骤：按第 4 节逐项配置 → 下载 CA → 创建数据库/用户 → 测试私网 TLS → 创建上线前手工备份 → 记录备份 ID。

5. **创建 OSS RAM 身份并绑定媒体域名**

   内容：配置 Bucket 版本控制、公开只读、CNAME/HTTPS、最小权限 RAM key 和告警。
   原因：真实 AccessKey 与域名所有权只能在账户侧完成。
   步骤：按第 5 节创建策略和身份 → 保存 AccessKey 到密码管理器 → 绑定 `media.superones.top` → 上传测试 → 验证匿名读和越权拒绝 → 做测试 slug 永久删除演练。

6. **填写生产秘密与模型/支付凭据**

   内容：在服务器 `/etc/vault2077/production.env` 填写 RDS、OSS、支付宝、GitHub、两套模型和八类独立秘密。
   原因：这些秘密当前不存在于工作区，也不应交给 Git。
   步骤：从 `.env.example` 逐项复制 → 密码管理器生成/读取 → `sudoedit` 写入 → 权限设为 root 0600 → 执行 `deploy:check` → 只报告缺失字段名，不回传实际值。

7. **完成 Passkey 实体接管**

   内容：由固定 owner 在真实管理域注册两个认证器并保存恢复码。
   原因：WebAuthn 需要 owner 的实体设备和生物识别/PIN，Codex 不能代替。
   步骤：执行第 13 节 SSH 命令 → 十分钟内注册 → 存离线恢复码 → 注册第二认证器 → 做登录/再认证/恢复测试。

8. **发布 Frontier 真实奖励**

   内容：决定并发布当前赛季奖励文本。
   原因：金额、权益和兑现责任是业务承诺，不能由代码或助手臆定。
   步骤：后台填 4–200 字真实文案 → 复核赛季和兑现条件 → Passkey 再认证发布 → 测试仓库闭环 → 启用写入开关。

9. **批准并执行真实支付/退款**

   内容：指定最低测试金额、付款账户和退款验收人。
   原因：涉及真实资金和商户责任，必须由负责人授权。
   步骤：支付开关先关闭 → 配置/验签检查 → 开启测试窗口 → PC/移动支付 → 重复通知/查询 → 全额退款 → 对账 → 正式启用。

10. **做最终 Go/No-Go 决定**

   内容：在所有 P0 证据齐全后批准 DNS 切流和对外发布。
   原因：这是外部状态和商业承诺，不能由技术检查自动替代。
   步骤：双人复核第 18 节 → 记录未解决风险和回滚负责人 → 批准切流时间 → 观察至少两小时 → 再扩大宣传。

## 23. 新环境快速上手顺序

新接手者不要先从代码漫游。按以下顺序：

1. 阅读本文和 [`docs/README.md`](README.md)。
2. 阅读 [`Vault2077-Production-Deployment-Plan-2026-07-31.md`](../Vault2077-Production-Deployment-Plan-2026-07-31.md) 了解发布批次和当前剩余门禁。
3. 阅读 [`Vault2077-Deployment-Configuration-Manual.md`](Vault2077-Deployment-Configuration-Manual.md) 了解全部环境变量。
4. 阅读 [`Vault2077-Unified-Acquisition-Runbook.md`](Vault2077-Unified-Acquisition-Runbook.md) 了解跨境采集、inbox、Worker、Frontier 回退和健康检查。
5. 阅读 [`Vault2077-Admin-Operations-Spec.md`](Vault2077-Admin-Operations-Spec.md) 与 [`Vault2077-OPC-Admin-Manual.md`](Vault2077-OPC-Admin-Manual.md) 了解 Passkey、发布、支付和头像操作。
6. 在任何变更前运行 `git status --short`、记录当前 commit，确认用户已有改动，不要 reset/覆盖。
7. 本地先跑 `npm run docs:check && npm run lint && npm run typecheck && npm test`；只有通过后才接触生产。
8. 生产操作顺序固定为：备份 → 新 release → deploy check → 真实模型探针 → migration → bootstrap（仅首发）→ Web → health → 四通道 incremental/处理闭环 → 逐通道远端 bootstrap → 功能验收 → timer → DNS/公开切流。

## 24. 官方资料与核验日期

以下链接用于部署时复核控制台字段，访问/复核日期为 2026-07-31：

- [阿里云 OSS 地域和 Endpoint](https://help.aliyun.com/zh/oss/user-guide/regions-and-endpoints)
- [阿里云 OSS 自定义域名访问](https://help.aliyun.com/zh/oss/user-guide/access-buckets-via-custom-domain-names)
- [阿里云 OSS Bucket ACL](https://help.aliyun.com/zh/oss/user-guide/oss-bucket-acl)
- [阿里云 OSS 权限和访问控制概述](https://help.aliyun.com/zh/oss/user-guide/permissions-and-access-control-overview)
- [阿里云 OSS RAM Policy](https://help.aliyun.com/zh/oss/user-guide/ram-policy/)
- [阿里云 OSS 版本控制](https://help.aliyun.com/zh/oss/manage-objects-in-a-versioning-enabled-bucket)
- [阿里云 OSS 生命周期规则](https://help.aliyun.com/zh/oss/user-guide/overview-54/)
- [阿里云 RDS PostgreSQL SSL 加密](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-ssl-encryption-for-an-apsaradb-rds-for-postgresql-instance)
- [阿里云 RDS PostgreSQL 设置白名单](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/configure-an-ip-address-whitelist-for-an-apsaradb-rds-for-postgresql-instance)
- [阿里云 RDS PostgreSQL 数据备份](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/back-up-an-apsaradb-rds-for-postgresql-instance)
- [阿里云 RDS PostgreSQL 恢复数据](https://help.aliyun.com/zh/rds/apsaradb-rds-for-postgresql/restore-the-data-of-an-apsaradb-rds-for-postgresql-instance)
- [本项目阿里云官方事实底稿](research/Vault2077-Aliyun-Mainland-Deployment-Official-Facts-2026-07-31.md)

阿里云帮助中心会调整中英文 URL 和控制台导航。链接失效时用页面标题在阿里云帮助中心检索，不要改用未经核验的博客作为安全配置依据。

## 25. 完成交接的定义

满足以下条件才可把迁移标记为完成：

- 新环境能从本文独立定位资源、配置、命令、负责人、回滚和证据；
- 生产秘密只存在于阿里云/支付宝/GitHub/模型提供方和密码管理器的授权位置；
- 相同 commit 的 Linux 发布包可重复构建，SHA-256 可验证；
- 生产 RDS、OSS、Nginx、systemd、Passkey、支付、Frontier 和采集链路均按本文通过验收；
- 公网不可访问 Node、RDS、health 和未授权内部路由；
- P0 未解决项为零，P1/P2 已指定负责人和截止日期；
- 至少一名非原部署者能按本文完成健康检查、停止 timer、应用回滚和 Passkey 恢复演练。
