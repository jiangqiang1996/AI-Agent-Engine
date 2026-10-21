# ae-linux-remote-ops 配置说明

本技能只读 `ae.jsonc` 里的 **`ae-linux-remote-ops`** 顶层 key，与其它技能互不干扰。

> 下文命令里的 `<技能目录>` 指本技能所在目录（内含 `scripts/` 的那一层），执行前替换成实际路径；命令一律在**项目根目录（当前工作目录）**下执行，产物落在 `<项目>/ae/linux-remote-ops/`。

## 配置文件位置（查找顺序，先命中先用）

1. 环境变量 `AE_CONFIG` 指向的文件（标准显式覆盖）
2. `<当前工作目录>/ae.jsonc`
3. 从 `<当前工作目录>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`（用户主目录）

`AE_CONFIG` 指向的文件不存在时脚本会直接报错，不会静默回退。

> 本技能**不读取** OpenSSH 用来指定 `~/.ssh/config` 的那个环境变量——劫持它会让用户导出的真实 SSH 配置被当成 JSON 解析而报错。要显式指定配置文件只用 `AE_CONFIG`。

## 最小配置

```jsonc
{
  "ae-linux-remote-ops": {
    "host": "10.0.0.1",
    "port": 22,
    "user": "app",
    "passwordEnv": "SSH_PASSWORD"
  }
}
```

## 字段说明

| 字段 | 必填 | 类型 | 默认值 | 说明 |
|------|------|------|--------|------|
| `host` | 是 | string | — | 服务器 IP 或域名 |
| `port` | 否 | number | `22` | SSH 端口 |
| `user` | 是 | string | — | SSH 用户名 |
| `passwordEnv` | 否 | string | — | **存放登录密码的环境变量名**（如 `SSH_PASSWORD`）；留空则只支持密钥认证或 `SSH_PASSWORD` 环境变量 |
| `sudoPasswordEnv` | 否 | string | — | 存放 sudo 密码的环境变量名；留空表示与登录密码相同 |
| `keyFile` | 否 | string | — | 私钥路径（OpenSSH 格式），填了优先走公钥认证 |
| `keyPassphraseEnv` | 否 | string | — | **存放私钥口令的环境变量名**（口令本身不进配置文件） |
| `hostFingerprint` | 否 | string | — | 主机密钥 SHA-256 指纹（如 `SHA256:...`）；填了启用严格模式校验 |
| `timeoutSec` | 否 | number | `15` | 连接超时秒数 |
| `execTimeoutSec` | 否 | number | `300` | 单条远程命令超时秒数 |
| `keepaliveIntervalSec` | 否 | number | `10` | SSH keepalive 间隔秒数，`0` 关闭（防 NAT/防火墙空闲断链） |
| `hosts` | 否 | object | — | 多服务器映射表，见下节 |

字段名只认上表这套 camelCase 写法。旧的 snake_case 写法与配置文件内明文口令字段**都不再识别**（写了会被忽略），请按上表改写。

## 密码与密钥

- **密码不要写进配置文件**：用 `passwordEnv` / `sudoPasswordEnv` / `keyPassphraseEnv` 声明环境变量名，密码值只存在于环境变量里。
- 私钥只填**路径**，不要把私钥内容写进 `ae.jsonc`。

## 环境变量覆盖（优先级高于 `ae.jsonc`）

| 环境变量 | 作用 | 覆盖的配置字段 |
|----------|------|----------------|
| `SSH_HOST` | 服务器地址 | `host` |
| `SSH_PORT` | 端口 | `port` |
| `SSH_USER` | 用户名 | `user` |
| `SSH_PASSWORD` / `SSH_PASS` | 登录密码（直接给值） | `passwordEnv` 指向的变量 |
| `SSH_SUDO_PASSWORD` | sudo 密码（直接给值） | `sudoPasswordEnv` 指向的变量 |
| `SSH_KEY_FILE` | 私钥路径 | `keyFile` |
| `SSH_KEY_PASSPHRASE` | 私钥口令（直接给值） | `keyPassphraseEnv` 指向的变量 |
| `SSH_TARGET` | 目标别名 | `hosts` 中选中的分片 |
| `AE_CONFIG` | 配置文件路径 | 整个配置文件 |

最终生效顺序（从高到低）：

1. 环境变量（`SSH_*`）
2. `ae.jsonc` 中 `hosts.<别名>` 分片
3. `ae.jsonc` 中 `ae-linux-remote-ops` 分片
4. 脚本内置默认值

密码取值顺序：`SSH_PASSWORD` / `SSH_PASS` > `passwordEnv` 指向的环境变量（配置文件里没有明文密码这一项）。

## 多服务器：`hosts` 分片

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

选中方式（二选一，命令行优先于环境变量）：

```bash
node <技能目录>/scripts/run-remote.mjs -c "hostname" --target web-01
```

```bash
# PowerShell
$env:SSH_TARGET='web-01'; node <技能目录>/scripts/run-remote.mjs -c "hostname"
# cmd
set SSH_TARGET=web-01&& node <技能目录>/scripts/run-remote.mjs -c "hostname"
```

分片里没写的字段回落到顶层同名字段，再回落到默认值。别名不存在时脚本会报错并列出可用别名。

## 主机密钥指纹

严格模式：在配置里写 `hostFingerprint`，连接时会校验服务器主机密钥的 SHA-256 指纹，不匹配立即拒绝连接。

取值方式：

- 服务器上执行 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`，取 `SHA256:...` 整串；
- 或填 64 位十六进制摘要。

留空表示 TOFU（首次连接自动接受），适合内网临时排查。

## 目标机前置条件

- SSH 服务在跑（绝大多数 Linux 发行版默认开启，可用 `systemctl status ssh` 确认）
- 防火墙放行 SSH 端口
- 公钥认证：把公钥装进目标机 `~/.ssh/authorized_keys`，再在配置里填 `keyFile`
