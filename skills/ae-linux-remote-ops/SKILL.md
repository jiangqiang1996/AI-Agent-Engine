---
name: ae-linux-remote-ops
description: SSH 远程操作内网 Linux 服务器：执行 shell 命令/脚本（支持 sudo 提权）、SFTP 上传下载文件（带 MD5 校验）、连通性自检、查看服务状态与日志。Use when the user needs to run commands on a remote Linux server over SSH, upload or download files via SFTP, check connectivity, or inspect service status and logs on an intranet host. 触发关键词：SSH、远程执行、远程服务器、内网服务器、Linux 服务器、远程运维、远程登录、传文件、上传文件、下载文件、sudo 提权、remote command over ssh、sftp upload、sftp download、server ops.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 20+（运行本技能脚本）。零外部依赖：ssh2 及其纯 JS 依赖已打包为技能内置单文件 scripts/ssh2.dist.cjs，无需 npm install、无需 node_modules。需要能访问目标服务器的 SSH 端口（默认 22/TCP）。
metadata:
  version: "1.0.0"
  ae-group: 运维
  author: ae-skills
---

# ae-linux-remote-ops — SSH 远程操作 Linux 服务器

从本机通过 **SSH（Node + 内置 ssh2）** 远程驱动内网 Linux 服务器：跑 shell、sudo 提权、SFTP 传文件、查状态与日志。**服务器信息不写死在代码里**，统一由 `ae.jsonc` 提供。

- **零安装**：ssh2 及其全部纯 JS 依赖已打包为技能内置单文件 `scripts/ssh2.dist.cjs`，技能目录内没有 `package.json` / `node_modules`，不需要 `npm install`。
- **执行位置**：下文所有命令都在**项目根目录（当前工作目录）**下执行——产物按 cwd 落盘到 `<项目>/ae/linux-remote-ops/`、日志落到 `<项目>/ae/logs/linux-remote-ops/`。**不要**切到技能目录里执行，否则会把产物写进技能自身的目录。
- **脚本路径**：命令里的 `<技能目录>` 是占位符，指本技能所在目录（内含 `scripts/` 的那一层），执行前替换成实际路径，例如 `node /abs/path/skills/ae-linux-remote-ops/scripts/run-remote.mjs -c "hostname"`。

## 何时使用

- 用户要在远程 Linux 服务器上执行命令、跑脚本、装软件、改配置。
- 用户要在服务器之间传文件（上传部署包、下载日志或产物）。
- 用户要做连通性自检，或查看远程主机上的服务状态与日志。
- 关键词命中：SSH、远程执行、内网服务器、远程运维、传文件、sudo 提权 / remote command over SSH, SFTP upload, SFTP download, server ops。

## 何时不使用

- 本机就能完成的事 → 直接使用宿主的命令执行能力，不要绕道 SSH。
- 需要图形界面 / 远程桌面 → 本技能只走 SSH 文本通道。
- 需要复杂跳板机拓扑 → 先在本地打通隧道，再把隧道出口当普通主机使用。

## 配置

配置统一从 `ae.jsonc` 读取，本技能只读自己的顶层 key `ae-linux-remote-ops`（与其它技能互不干扰）。

在项目根目录建 `ae.jsonc`（或放到用户主目录 `~/.ae.jsonc`），只写这一个 key：

```jsonc
{
  "ae-linux-remote-ops": {
    "host": "10.0.0.1",
    "port": 22,
    "user": "app",
    "passwordEnv": "SSH_PASSWORD",
    "sudoPasswordEnv": "SSH_SUDO_PASSWORD",
    "keyFile": "C:/Users/me/.ssh/id_ed25519",
    "keyPassphraseEnv": "SSH_KEY_PASSPHRASE",
    "hostFingerprint": "SHA256:...",
    "timeoutSec": 15,
    "execTimeoutSec": 300,
    "keepaliveIntervalSec": 10
  }
}
```

| 字段 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `host` | 是 | 服务器 IP 或域名 | — |
| `port` | 否 | SSH 端口 | `22` |
| `user` | 是 | SSH 用户名 | — |
| `passwordEnv` | 否 | **存放登录密码的环境变量名**（密码本身不进配置文件） | — |
| `sudoPasswordEnv` | 否 | 存放 sudo 密码的环境变量名；留空 = 与登录密码相同 | — |
| `keyFile` | 否 | 私钥路径（OpenSSH 格式），填了优先走公钥认证 | — |
| `keyPassphraseEnv` | 否 | 存放私钥口令的环境变量名（口令本身不进配置文件） | — |
| `hostFingerprint` | 否 | 主机密钥 SHA-256 指纹，填了启用严格模式校验 | — |
| `timeoutSec` | 否 | 连接超时秒数 | `15` |
| `execTimeoutSec` | 否 | 单条远程命令超时秒数 | `300` |
| `keepaliveIntervalSec` | 否 | keepalive 间隔秒数，`0` 关闭 | `10` |
| `hosts` | 否 | 多服务器映射表，见「多服务器」 | — |

字段名只认上表这套 camelCase 写法；旧的 snake_case 写法与配置文件内明文口令字段都不再识别（写了会被忽略），请按上表改写。

**配置文件查找顺序**（先命中先用）：

1. 环境变量 `AE_CONFIG` 指向的文件（标准显式覆盖）
2. `<当前工作目录>/ae.jsonc`
3. 从 `<当前工作目录>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`

> 本技能**不读取** OpenSSH 用来指定 `~/.ssh/config` 的那个环境变量（那是它的常规语义），配置覆盖只用 `AE_CONFIG`。

**环境变量优先级**（高于 `ae.jsonc`）：

| 环境变量 | 作用 | 覆盖字段 |
|----------|------|----------|
| `SSH_HOST` | 服务器地址 | `host` |
| `SSH_PORT` | 端口 | `port` |
| `SSH_USER` | 用户名 | `user` |
| `SSH_PASSWORD` / `SSH_PASS` | 登录密码（直接给值） | `passwordEnv` 指向的变量 |
| `SSH_SUDO_PASSWORD` | sudo 密码（直接给值） | `sudoPasswordEnv` 指向的变量 |
| `SSH_KEY_FILE` | 私钥路径 | `keyFile` |
| `SSH_KEY_PASSPHRASE` | 私钥口令（直接给值） | `keyPassphraseEnv` 指向的变量 |
| `SSH_TARGET` | 目标别名 | `hosts` 分片选择 |
| `AE_CONFIG` | 配置文件路径 | 整个配置文件 |

最终生效顺序：**环境变量 → `hosts.<别名>` 分片 → `ae-linux-remote-ops` 分片 → 内置默认值**。
完整字段说明与多服务器写法见 `references/ae-config.md`。

密码只放环境变量，不写进 `ae.jsonc`：

```bash
export SSH_PASSWORD=...      # macOS / Linux
set SSH_PASSWORD=...         # Windows cmd
$env:SSH_PASSWORD='...'      # Windows PowerShell
```

## 第 0 步：确认配置

- **没有配置** → 使用宿主的交互式提问能力向用户索取**服务器地址、SSH 用户名、密码**；sudo 密码与登录密码不同时一并索取。然后按上面的片段写好 `ae.jsonc` 的 `ae-linux-remote-ops` key。
- **用户临时换了一台服务器** → 不改配置文件，用环境变量临时覆盖：

```bash
# cmd
set SSH_HOST=10.0.0.9&& set SSH_USER=app&& set SSH_PASSWORD=xxx&& node <技能目录>/scripts/run-remote.mjs -c "hostname"
# PowerShell
$env:SSH_HOST='10.0.0.9'; $env:SSH_USER='app'; $env:SSH_PASSWORD='xxx'; node <技能目录>/scripts/run-remote.mjs -c "hostname"
```

目标机前置条件：SSH 服务在跑（`systemctl status ssh`）、防火墙放行 SSH 端口。

## 第 1 步：连通性自检

```bash
node <技能目录>/scripts/check-connection.mjs
```

输出主机名 / 用户 / 发行版 / 时间并打印 `[OK] SSH 通道可用` 即成功。失败按「故障排查表」处理（超时 → 网络/防火墙；Permission denied → 账号密码）。

## 第 2 步：执行命令

```bash
node <技能目录>/scripts/run-remote.mjs cmd.sh                    # 执行 .sh 文件（推荐，多行脚本）
node <技能目录>/scripts/run-remote.mjs -c "hostname"             # 单条命令
type cmd.sh | node <技能目录>/scripts/run-remote.mjs             # stdin（cmd 用 type；git-bash 用 cat；PowerShell 用 Get-Content -Raw）
node <技能目录>/scripts/run-remote.mjs -c "whoami" --sudo        # 以 root 执行
```

规则：

- **复杂 / 多行命令写进 .sh 文件再传路径**，不要在命令行内联（bash 会吞 `$`、`{{}}` 等，见「坑速查」）。脚本读入时自动归一 CRLF、去 BOM。
- `--sudo` 通过 `sudo -S` 从 stdin 喂密码（密码不出现在远端进程列表里）；sudo 密码默认取登录密码，可在配置里用 `sudoPasswordEnv` 单独指定。实现是 `sudo -S -p "" bash -c '<命令>'`，`-p ""` 关掉提示语让 stdout 干净；密码走 channel stdin，不出现在远端 `ps`；免密 sudo（NOPASSWD）机器同样兼容。
- 以 RC + stdout 判定成败；stderr 单独汇聚到 stderr 通道原样输出（`--- stderr ---` 分隔）。
- **RC 语义**：正常退出码原样透传；远端进程被信号杀死（如 OOM-kill 的 `SIGKILL`）时返回 `128 + 信号编号`（`SIGKILL` → 137）并打印信号名；SSH 通道异常关闭、始终没收到退出码时返回 `255`。**这两种情况都不是成功**，不要再当成 `RC=0` 放过。
- 超过 `execTimeoutSec` 的命令被主动中止并报中文超时错误；长任务要脱离会话：exec 通道关闭时未脱离的子进程会收到 SIGHUP，命令里加 `nohup ... >log 2>&1 &` 或 `setsid ... &`；常驻服务用 systemd unit。

## 第 3 步：文件传输（SFTP，MD5 双向校验）

```bash
node <技能目录>/scripts/push-file.mjs 本地文件 /远端/路径/文件     # 上传
node <技能目录>/scripts/pull-file.mjs /远端/路径/文件 本地文件     # 下载
```

- 单文件传输，自动建远端/本地父目录（相对远端路径自动按远端 home 解析成绝对路径），上传/复核走同一 SSH 连接，两端 MD5 比对一致才报 `[ok]`。
- **目标目录需要 root 时**：SFTP 无法提权，先 `node <技能目录>/scripts/run-remote.mjs --sudo -c "mkdir -p /opt/app && chown <用户>:<组> /opt/app"` 再 push；目录属主不对会以中文权限提示报错。
- **git-bash 调用时**：以 `/` 开头的远端路径参数可能被 MSYS 改写成 Windows 路径，导致误报 PermissionError / 「远端文件不存在」。调用这两条命令请前缀 `MSYS_NO_PATHCONV=1`（或远端路径写成 `//tmp/...` 双斜杠）。
- 目录请先自行打包成 zip/tar 再传，到远端再解开（见「常用配方」）。
- 二进制安全：脚本内部全程二进制模式读写，勿用文本模式预处理待传文件（Windows 文本模式会把换行改成 CRLF，导致 MD5 基准失真）。

## 第 4 步：查看状态与日志

状态与日志都通过远程命令获取，复用第 2 步的执行通道：

```bash
# 状态
node <技能目录>/scripts/run-remote.mjs -c "systemctl status nginx --no-pager"
node <技能目录>/scripts/run-remote.mjs -c "docker ps --format '{{.Names}}\t{{.Status}}'"
node <技能目录>/scripts/run-remote.mjs -c "ss -tlnp"                       # 需 --sudo
node <技能目录>/scripts/run-remote.mjs -c "df -h; free -m; uptime"

# 日志
node <技能目录>/scripts/run-remote.mjs -c "journalctl -u nginx -n 100 --no-pager"   # 需 --sudo
node <技能目录>/scripts/run-remote.mjs -c "docker logs --tail 100 <容器>"
node <技能目录>/scripts/run-remote.mjs -c "tail -n 100 /var/log/syslog"
```

- 只读取、不修改的查询可直接执行；带 `journalctl`、`docker logs` 这类命令需要更高权限时加 `--sudo`。
- 远端日志量大时优先用 `-n` / `--tail` 限量，并把输出落到本地文件再分析，避免刷屏。

## 多服务器

配置里用 `hosts` 定义多台机器，用 `--target <别名>`（或环境变量 `SSH_TARGET`）选中：

```jsonc
{
  "ae-linux-remote-ops": {
    "user": "app",
    "passwordEnv": "SSH_PASSWORD",
    "hosts": {
      "web-01": { "host": "10.0.0.2", "port": 2222 },
      "db-01": { "host": "10.0.0.3", "user": "dba", "keyFile": "C:/Users/me/.ssh/dba_ed25519" }
    }
  }
}
```

```bash
node <技能目录>/scripts/run-remote.mjs -c "hostname" --target web-01
```

别名分片里没写的字段回落到顶层同名字段；别名不存在时脚本报错并列出可用别名。

## 产物与日志

| 类别 | 路径 | 内容 |
|------|------|------|
| 会话记录 | `ae/linux-remote-ops/session-<时间戳>.json` | 目标、命令、退出码、起止时间、输出摘要 |
| 传输记录 | `ae/linux-remote-ops/transfer-<时间戳>.json` | 本地/远端路径、字节数、两端 MD5 |
| 命令执行日志 | `ae/logs/linux-remote-ops/<时间戳>-<操作>.log` | 完整命令、stdout、stderr、退出码 |

- 每次执行命令 / 传输文件 / 连通性自检都会自动落盘上述文件，脚本结束时会在标准输出打印实际路径。
- **失败同样留痕**：连接失败、命令异常终止、传输出错时，也会写出会话 / 传输记录（含 `status: "failed"` 与错误原因）和对应日志，路径一并回报，不会只留一句报错。
- 日志与记录里的密码、私钥口令一律脱敏成 `***`（成功与失败两条路径都脱敏）。
- 这些目录都在**当前工作目录（项目根目录）**下，随项目走；不要写进其它技能的产物目录，也**不要**切到技能目录里执行脚本。

## 安全边界

- **破坏性命令需授权**：`rm -rf`、`mkfs`、重启整机 / 容器引擎、改防火墙规则、动数据库数据等操作，动手前必须先向用户说明影响面并取得明确同意；共享 VM 上可能有别人的服务，优先精确操作单个服务（先 `ps aux` / `docker ps` 看清邻居）。
- **密钥与密码不落盘**：密码只放环境变量（`passwordEnv` / `SSH_PASSWORD`），私钥口令走 `keyPassphraseEnv` / `SSH_KEY_PASSPHRASE`，私钥只写路径；`ae.jsonc` 与日志里不出现明文密码，脚本日志已做脱敏。
- **不出现在命令行历史**：密码一律通过 stdin 传给 `sudo -S`，不拼进命令行参数，避免进 shell 历史与远端 `ps`。
- **主机密钥**：默认 TOFU（首次自动接受）；配置 `hostFingerprint` 后启用严格模式，指纹不匹配立即拒绝连接。
- **只读优先**：默认不写远端文件；需要写入时先确认目标路径与权限归属。
- **不改本机**：除 `ae/linux-remote-ops/`、`ae/logs/linux-remote-ops/` 外，不在目标机或本机留下其它文件。

## 完成标准

- 配置可用：`ae.jsonc` 的 `ae-linux-remote-ops` key 齐全，或已用环境变量临时覆盖，且连通性自检输出 `[OK] SSH 通道可用`。
- 目标动作完成：命令按预期执行并回显结果（或明确给出退出码与 stderr），文件传输两端 MD5 一致。
- 产物落盘：`ae/linux-remote-ops/` 下有会话/传输记录，`ae/logs/linux-remote-ops/` 下有对应日志，路径已回报给用户。
- 破坏性操作已获得用户明确授权；日志与记录中不含明文密码或私钥内容。
- 失败时给出可读的中文原因与下一步排查方向（对照「故障排查表」），不静默吞掉错误。

## 坑速查

1. **git-bash 吞特殊字符 / MSYS 路径转换**：bash 命令行里 `$`、`{{.Names}}` 花括号可能被转义，命令写进 .sh 文件交给 `run-remote.mjs` 即可避免；`/` 开头的远端路径对策见第 3 步。
2. **Windows 文本模式换行**：文本模式写出的文件是 CRLF 结尾，拿去算 MD5 当基准会和 Linux 端不一致，误判传输失败。对策：传输与校验一律二进制模式（本技能脚本已保证；脚本读命令时自动归一 CRLF）。
3. **cmd/PowerShell 吞 `$()` 和 `%{http_code}`**：curl 的 `-w '%{http_code}'` 要整体单引号包住或写进脚本文件。
4. **sudo 直接调用会挂起**：非交互环境里裸 `sudo` 等待 tty 输密码会卡死，必须走 `--sudo`。
5. **Docker Hub 国内直连不通**：`docker pull` 卡死时换镜像源。
6. **SELinux/AppArmor**（CentOS/RHEL 常见）：容器挂载目录权限异常时先想到它们（`getenforce`、`ausearch -m avc`），别急着 chmod 777。
7. **dockerd 日志的 `failed to validate image signature`** 是无害噪音，容器照常运行。
8. **远端命令中文乱码**：locale 不是 UTF-8，命令前加 `export LANG=C.UTF-8;`。
9. **PowerShell 环境变量语法**：`$env:SSH_HOST='...'`，`set` 是 cmd 专属。

## 故障排查表

| 现象 | 常见原因 | 处理 |
|---|---|---|
| connect timeout | 机器没开 / 网段不通 / 防火墙拦 SSH 端口 | `ping IP`、`Test-NetConnection IP -Port 22`（PS）确认链路 |
| Permission denied (password) | 密码错 / 服务器禁密码登录 | 核对密码；`sshd -T \| grep passwordauthentication` 看策略 |
| Permission denied (publickey) | 配置填了 `keyFile` 但公钥未装 | 换回密码，或把公钥装进远端 `~/.ssh/authorized_keys` |
| 主机密钥指纹不匹配 | 配置的 `hostFingerprint` 过期 / 错误，或遭遇中间人 | 服务器上重取 `ssh-keygen -lf` 指纹核对后更新配置 |
| sudo 报 sorry, try again | sudo 密码与登录密码不同 | 配置里设 `sudoPasswordEnv` 或环境变量 `SSH_SUDO_PASSWORD` |
| 远程命令超时已中止 | 命令耗时超过 `execTimeoutSec` | 长任务改 nohup/setsid 脱离会话，或临时调大该字段 |
| RC=137 / 提示被 SIGKILL 终止 | 远端进程被信号杀死，常见于内存不足（OOM-kill） | 查远端 `dmesg -T \| grep -i oom` 与内存水位，缩小命令内存占用 |
| RC=255 / 提示通道异常关闭 | SSH 连接中途断开，没收到远端退出码 | 查网络抖动、NAT 超时；必要时调大 `keepaliveIntervalSec` 与 `execTimeoutSec` |
| SFTP 传大文件慢 | 千兆内网约 100MB/s 上限 | 大文件先压缩；或走目标机上的对象存储 / HTTP 通道 |
| 缺少 ssh2.dist.cjs | 技能目录不完整 | 重新获取技能 `scripts/` 目录（须含内置单文件 `ssh2.dist.cjs`） |
| 找不到配置 / 缺少 host | `ae.jsonc` 不在查找路径上，或缺 `ae-linux-remote-ops` key | 确认 `ae.jsonc` 在项目根目录，或用 `AE_CONFIG` 显式指定路径 |

## 常用配方（.sh 文件内容）

```bash
# 看谁在监听（含进程归属）
ss -tlnp                                  # 需 --sudo

# 端口占用→杀进程
pid=$(ss -tlnp 'sport = :8080' | grep -oP 'pid=\K[0-9]+' | head -1)
[ -n "$pid" ] && kill "$pid" && echo "killed $pid" || echo "no listener"

# docker 三件套
docker ps --format '{{.Names}}\t{{.Status}}\t{{.Ports}}'
docker logs --tail 50 <容器>
docker stats --no-stream

# systemd 服务
systemctl status <服务> --no-pager
journalctl -u <服务> -n 50 --no-pager     # 需 --sudo

# 传目录：本地打包 → push → 远端解开
#   本地: tar czf app.tar.gz -C 父目录 子目录
#   node <技能目录>/scripts/push-file.mjs app.tar.gz /tmp/app.tar.gz
tar xzf /tmp/app.tar.gz -C /opt/ && rm -f /tmp/app.tar.gz   # 需 --sudo（视目录）

# 健康检查（示例：HTTP 服务）
curl -sk -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/health
```

## 参考

- `references/ae-config.md` — `ae.jsonc` 的 `ae-linux-remote-ops` key 完整字段说明、查找顺序、环境变量优先级与多服务器写法。
