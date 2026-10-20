---
name: linux-remote-ops
description: 通过 SSH 远程操作内网 Linux 服务器：执行 shell 命令/脚本（支持 sudo 提权）、SFTP 上传/下载文件（MD5 校验）、查状态、看日志，无需堡垒机或远程桌面。服务器 IP、用户名、密码由使用者自行配置，支持任意内网 Linux 机器。当用户要远程操作/连接/管理 Linux 服务器、在远程服务器上跑命令、传文件、装软件、查日志，或提到 SSH、Linux/Ubuntu/CentOS、内网服务器 IP + 账号密码时触发。
metadata:
  ae-group: 运维
---

# SSH 远程操作 Linux 服务器（通用版）

从本机通过 **SSH（22/TCP，Node + ssh2）** 远程驱动任意内网 Linux 服务器：
跑 shell、sudo 提权、SFTP 传文件、查状态。**服务器信息不写死在代码里**，由使用者配置。

依赖：**零安装** —— Node ≥ 20 即可。ssh2 及其全部纯 JS 依赖已打包为技能内置单文件
`scripts/ssh2.dist.cjs`（无需 npm install，技能目录内无 package.json / node_modules）。

**工作目录约定**：以下所有 `node scripts/...` 命令均以技能目录
`.agents/skills/linux-remote-ops/` 为 cwd 执行；换 shell 时注意脚本路径写法。

## 第 0 步：检查配置（每次会话首次使用时做）

配置文件固定在**项目根目录**：`linux-remote-ops.config.json`（与 `package.json` 同级）；
**示例模板在技能 `references/` 内**：`.agents/skills/linux-remote-ops/references/linux-remote-ops.config.example.json`。

- **不存在** → 向用户要信息：**服务器 IP、SSH 用户名、密码**（可用 AskUserQuestion）；
  如 sudo 密码与登录密码不同，一并向用户要。然后参照技能 `references/` 内的
  `linux-remote-ops.config.example.json` 写出项目根目录的 `linux-remote-ops.config.json`。
- **已存在但用户提到的是另一台服务器** → 临时用环境变量覆盖，不改配置：
  - cmd：`set SSH_HOST=x.x.x.x&& set SSH_USER=xxx&& set SSH_PASSWORD=xxx&& node scripts\run-remote.mjs ...`
  - PowerShell：`$env:SSH_HOST='x.x.x.x'; $env:SSH_USER='xxx'; $env:SSH_PASSWORD='xxx'; node scripts\run-remote.mjs ...`

支持的覆盖环境变量：`SSH_HOST` / `SSH_PORT` / `SSH_USER` / `SSH_PASSWORD`（或 `SSH_PASS`）/
`SSH_SUDO_PASSWORD` / `SSH_KEY_FILE` / `SSH_CONFIG`（指定其它配置文件路径）。

配置字段说明：

| 字段 | 必填 | 说明 |
|---|---|---|
| host | 是 | 服务器 IP 或域名 |
| port | 否 | 默认 22 |
| user | 是 | SSH 用户名 |
| password | 是* | 登录密码（用密钥时可留空） |
| sudo_password | 否 | 留空=与登录密码相同；免密 sudo 机器不用管 |
| key_file | 否 | 私钥路径（OpenSSH 格式），填了优先用公钥认证 |
| key_passphrase | 否 | 私钥口令（如有） |
| host_fingerprint | 否 | 见「安全红线」严格模式；留空 = TOFU 自动接受 |
| timeout_sec | 否 | 连接超时，默认 15 |
| exec_timeout_sec | 否 | 单条命令超时，默认 300 |
| keepalive_interval_sec | 否 | SSH keepalive 间隔秒数，默认 10，0 关闭（防 NAT/防火墙空闲断链） |

目标服务器前置条件：SSH 服务在跑（绝大多数 Linux 默认开启，`systemctl status ssh`），
防火墙放行 22/TCP。公钥认证可选：把 `key_file` 填进配置即可（优先于密码）。

## 第 1 步：连通性自检

```bash
node scripts/check-connection.mjs
```

输出主机名/用户/发行版/时间并打印 `[OK] SSH 通道可用` 即成功。失败时按「故障排查表」排查
（超时→网络/防火墙；Permission denied→账号密码）。

## 第 2 步：执行命令（run-remote.mjs）

```bash
node scripts/run-remote.mjs cmd.sh           # 执行 .sh 文件（推荐，多行脚本）
node scripts/run-remote.mjs -c "hostname"    # 单条命令
type cmd.sh | node scripts/run-remote.mjs    # stdin（cmd；git-bash 用 cat，PowerShell 用 Get-Content -Raw）
node scripts/run-remote.mjs -c "whoami" --sudo   # 以 root 执行
```

规则：

- **把复杂/多行命令写进 .sh 文件再传路径**，不要在 bash 命令行内联
  （git-bash 会吞 `$`、`{{}}` 等，见「坑速查」）。脚本读入时自动归一 CRLF、去 BOM。
- `--sudo` 通过 `sudo -S` 从 stdin 喂密码（密码不出现在远端进程列表里）；
  sudo 密码默认取登录密码，可在配置里单独设 `sudo_password`。
  实现：`sudo -S -p "" bash -c '<命令>'`，`-p ""` 关掉提示语，stdout 干净；
  密码走 channel stdin，不出现在远端 `ps`；免密 sudo（NOPASSWD）机器同样兼容。
- 以 RC + stdout 判定成败；stderr 单独汇聚到 stderr 通道原样输出（`--- stderr ---` 分隔）。
- 超过 `exec_timeout_sec` 的命令被主动中止并报中文超时错误；长任务要脱离会话：
  exec 通道关闭时未脱离的子进程会收到 SIGHUP，命令里加 `nohup ... >log 2>&1 &`
  或 `setsid ... &`；常驻服务用 systemd unit。

## 第 3 步：文件传输（SFTP，MD5 双向校验）

```bash
node scripts/push-file.mjs 本地文件 /远端/路径/文件     # 上传
node scripts/pull-file.mjs /远端/路径/文件 本地文件     # 下载
```

- 单文件传输，自动建远端/本地父目录（相对远端路径自动按远端 home 解析成绝对路径），
  上传/复核走同一 SSH 连接，两端 MD5 比对一致才报 `[ok]`。
- **目标目录需要 root 时**：SFTP 无法提权，先
  `node scripts/run-remote.mjs --sudo -c "mkdir -p /opt/app && chown <用户>:<组> /opt/app"`
  再 push；目录属主不对会以中文权限提示报错。
- **git-bash 调用时**：以 `/` 开头的远端路径参数可能被 MSYS 改写成 Windows 路径，
  导致误报 PermissionError / “远端文件不存在”。调用这两条命令请前缀
  `MSYS_NO_PATHCONV=1`（或远端路径写成 `//tmp/...` 双斜杠）。
- 目录请先自行打包成 zip/tar 再传，到远端再解开（见「常用配方」）。
- 二进制安全：脚本内部全程二进制模式读写，勿用文本模式预处理待传文件
  （Windows 文本模式会把 `\n` 变 `\r\n`，导致 MD5 基准失真）。

## 安全红线

- `linux-remote-ops.config.json` 含明文密码——**分享/发布本技能时必须剔除**（已在 .gitignore 排除）；
  技能 `references/` 内只携带 `linux-remote-ops.config.example.json` 模板（无真实凭据）。
- 主机密钥校验两种模式：缺省 TOFU（自动接受并可选记录指纹）；严格模式 =
  配置 `host_fingerprint` 字段后，连接将校验服务器主机密钥 SHA-256 指纹，
  不匹配立即拒绝并打印期望/实际值。指纹获取：服务器上执行
  `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` 得 `SHA256:...` 值
  （填 `SHA256:...` 全串或 64 位十六进制均可）。
- 远端破坏性操作（rm、重启服务）前先确认影响面：共享 VM 上可能有别人的服务，
  重启整机/容器引擎类命令要特别谨慎，优先精确操作单个服务
  （动手前 `ps aux`/`docker ps` 看清邻居）。
- sudo 密码经 stdin 传入，不落远端命令行；但仍建议目标机逐步改用密钥认证并收紧弱密码。

## 坑速查

1. **git-bash 吞特殊字符 / MSYS 路径转换**：bash 命令行里 `$`、`{{.Names}}` 花括号可能被
   转义，命令写进 .sh 文件交给 run-remote.mjs 即可避免；`/` 开头的远端路径对策见第 3 步。
2. **Windows 文本模式换行**：文本模式写出的文件是 `\r\n`，拿去算 MD5 当基准会和
   Linux 端不一致，误判传输失败。对策：传输与校验一律二进制模式（本技能脚本已保证；
   脚本读命令时自动归一 CRLF）。
3. **cmd/PowerShell 吞 `$()` 和 `%{http_code}`**：curl 的 `-w '%{http_code}'` 要整体单引号
   包住或写进脚本文件。
4. **sudo 直接调用会挂起**：非交互环境里裸 `sudo` 等待 tty 输密码会卡死，必须走 `--sudo`。
5. **Docker Hub 国内直连不通**：`docker pull` 卡死时换镜像源。
6. **SELinux/AppArmor**（CentOS/RHEL 常见）：容器挂载目录权限异常时先想到它们
   （`getenforce`、`ausearch -m avc`），别急着 chmod 777。
7. **dockerd 日志的 `failed to validate image signature`** 是无害噪音，容器照常运行。
8. **远端命令中文乱码**：locale 不是 UTF-8，命令前加 `export LANG=C.UTF-8;`。
9. **PowerShell 环境变量语法**：`$env:SSH_HOST='...'`，`set` 是 cmd 专属。

## 故障排查表

| 现象 | 常见原因 | 处理 |
|---|---|---|
| connect timeout | 机器没开/网段不通/防火墙拦 22 | `ping IP`、`Test-NetConnection IP -Port 22`（PS）确认链路 |
| Permission denied (password) | 密码错/服务器禁密码登录 | 核对密码；`sshd -T | grep passwordauthentication` 看策略 |
| Permission denied (publickey) | 配置填了 key_file 但公钥未装 | 换回密码，或把公钥装进远端 `~/.ssh/authorized_keys` |
| 主机密钥指纹不匹配 | 配置的 host_fingerprint 过期/错误，或遭遇中间人 | 服务器上重取 `ssh-keygen -lf` 指纹核对后更新配置 |
| sudo 报 sorry, try again | sudo 密码与登录密码不同 | 配置里设 `sudo_password` 或环境变量 `SSH_SUDO_PASSWORD` |
| 远程命令超时已中止 | 命令耗时超过 exec_timeout_sec | 长任务改 nohup/setsid 脱离会话，或临时调大该字段 |
| SFTP 传大文件慢 | 千兆内网约 100MB/s 上限 | 大文件先压缩；或走目标机上的对象存储/HTTP 通道 |
| 缺少 ssh2.dist.cjs | 技能目录不完整 | 重新获取技能 `scripts/` 目录（须含内置单文件 `ssh2.dist.cjs`） |

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
#   node scripts/push-file.mjs app.tar.gz /tmp/app.tar.gz
tar xzf /tmp/app.tar.gz -C /opt/ && rm -f /tmp/app.tar.gz   # 需 --sudo（视目录）

# 健康检查（示例：HTTP 服务）
curl -sk -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/health
```
