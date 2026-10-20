---
name: ae-sql
description: JDBC 查询与执行（SQL query / database query / 查库 / 执行 SQL / 数据核对）。用 JRE 17+ 驱动随附的 JDBC CLI，通过 JDBC 连接任意关系型数据库（MySQL、PostgreSQL、Oracle、SQL Server、SQLite、达梦、人大金仓、openGauss 等）并执行用户确认过的 SQL，结果写入 ae/sql/、日志写入 ae/logs/sql/。Use when the user needs to query a database or run a confirmed SQL statement through JDBC. 触发关键词：执行 SQL、查数据库、连库、查表、数据核对、JDBC、sql query、run sql、database query.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+（运行 scripts/run-sql.mjs）与 JRE 17+（PATH 上的 java，或已设置 JAVA_HOME）。JDBC 驱动 JAR 放在 scripts/drivers/。首次准备驱动需要网络访问。
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 数据
---

# ae-sql — JDBC 查询

通过 JDBC 连接任意关系型数据库并执行 SQL。所有提供 JDBC 驱动的数据库都受支持。

## 何时使用

- 需要查询数据库中的数据（表结构、样例数据、对账核对）。
- 需要执行**用户已确认**的写入操作（INSERT / UPDATE / DELETE / DDL）。
- 需要检查数据库或表的状态。

## 何时不使用

- 只需要设计或改写 SQL —— 本技能只执行，不设计。
- 数据迁移工具管理（版本化迁移脚本的编排、发布、冲突处理）—— 不在本技能范围内。
- 表结构设计 —— 先做设计，再来执行。
- 非关系型数据库 —— 仅覆盖 JDBC 支持的关系型数据库。

## 安全红线

**执行前必须先读一遍 SQL**，命中下列任意一条时，必须用宿主的交互式提问能力（常见别名 AskUserQuestion / question）取得用户明确确认后再执行：

| SQL 模式 | 处理方式 |
|---------|---------|
| `DROP DATABASE` / `DROP TABLE` | 必须确认 |
| `TRUNCATE` | 必须确认 |
| `DELETE` / `UPDATE` 且无 `WHERE` 子句 | 必须确认 |
| 大结果集查询（无 `LIMIT`） | 提醒补 `LIMIT` |

确认提示里原样贴出将要执行的语句。用户拒绝就中止，并明确回复"操作已取消"。

## 第一步：准备运行环境

### 1.1 Java 运行时

**需要 JRE 17 或更高版本**（JDK 也可）。脚本会自动在 `JAVA_HOME` 与 `PATH` 中查找 `java`：

- 先查 `JAVA_HOME/bin/java`（Windows 下是 `java.exe`）。
- 找不到再查 `PATH` 里的 `java`。

两者都没有时，脚本会以非零退出码结束，并提示安装 JRE。

**手动安装步骤**（本技能不代为下载运行时）：

1. 打开 Eclipse Temurin（Adoptium）下载页：<https://adoptium.net/temurin/releases/?version=17>
2. 选择与你的操作系统和架构匹配的版本（JDK 与 JRE 都可以，JRE 体积更小）。
3. 安装后确认 `java -version` 能正常输出版本号。
4. Windows 建议把 `JAVA_HOME` 指向安装目录（如 `C:\Program Files\Eclipse Adoptium\jdk-17...`），并把 `%JAVA_HOME%\bin` 加入 `PATH`；macOS / Linux 用 `export JAVA_HOME=/path/to/jdk-17` 写进 shell 配置文件。

也可以用包管理器安装：Windows 用 `winget install EclipseAdoptium.Temurin.17.JRE`，macOS 用 `brew install --cask temurin@17`，Debian / Ubuntu 用 `apt install openjdk-17-jre-headless`。

### 1.2 JDBC 驱动

驱动 JAR 放在技能目录的 `scripts/drivers/` 下（默认目录，`--driver-dir` 可改）。目录里放什么 jar，运行时就会自动加载什么 jar。

- 主流数据库的驱动坐标与下载地址见 `references/db-drivers.md`。
- 达梦、人大金仓、openGauss、OceanBase 等国产数据库的驱动通常不在公共仓库里，需要从官方渠道获取后手动放入 `scripts/drivers/`。
- 不确定某个驱动的 Maven 坐标（`groupId` / `artifactId` / `version`）时，**使用宿主的网页抓取能力**去查官方文档或 Maven 中央仓库；这是能力描述，不绑定任何具体工具。

驱动目录里没有匹配 JDBC URL 前缀的 JAR 时，连接会报 `No suitable driver found`。

## 第二步：拿到连接信息

### 2.1 用户已经给了

本次对话里用户明确提供了 JDBC URL、用户名、密码，就直接用，不再翻配置文件。

### 2.2 从 ae.jsonc 读

推荐做法：把数据源写进项目根目录的 `ae.jsonc`（或用户主目录 `~/.ae.jsonc`），**密码只写环境变量名**：

```jsonc
{
  "ae-sql": {
    "datasources": [
      {
        "name": "dev",
        "url": "jdbc:mysql://127.0.0.1:3306/app",
        "user": "root",
        "passwordEnv": "DB_PASSWORD",
        "driver": "mysql-connector.jar"
      }
    ]
  }
}
```

| 字段 | 说明 |
|------|------|
| `name` | 数据源名称，命令行用 `--datasource <名称>` 选中 |
| `url` | JDBC 连接地址 |
| `user` | 数据库用户名 |
| `passwordEnv` | 存放密码的**环境变量名**（脚本从环境变量读取真实密码） |
| `driver` | 期望的驱动文件名关键字，用于在 `scripts/drivers/` 里做匹配检查 |

**查找顺序**（先命中先用，命中后不再继续）：

1. 环境变量 `AE_CONFIG` 指向的文件（显式覆盖）
2. `<当前工作目录>/ae.jsonc`
3. 从 `<当前工作目录>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`

每个技能只读 `ae.jsonc` 里与自己同名的顶层 key，互不干扰。

### 2.3 项目配置自动解析

用户没给连接信息、配置里也没有 `ae-sql` 时，才去扫描当前项目的 Spring Boot 配置文件（`application.yml` / `application.yaml` / `application.properties` / `bootstrap.*`，以及 `spring.profiles.active` 指向的 profile 变体），读取 `spring.datasource.url` / `username` / `password` / `driver-class-name`。

- 多数据源（`spring.datasource.primary.url` 这类写法）时，用宿主的交互式提问能力让用户选择。
- 密码是 `ENC(...)` / `{cipher}...` 这类密文时，放弃自动解析，改走 2.4。
- 自动解析出来的密码**不写进任何文件**，只在本次执行中使用。

### 2.4 手动询问

仍然拿不到时，用宿主的交互式提问能力依次询问：JDBC URL（必填）、用户名、密码。

## 第三步：执行

### 3.1 脚本用法

```bash
node scripts/run-sql.mjs --url <jdbc url> --user <user> --password <password> --sql "<语句>" [--driver-dir <目录>] [--output <文件>]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--url` | 是¹ | JDBC 连接地址 |
| `--user` | 否 | 数据库用户名 |
| `--password` | 否 | 数据库密码（推荐改用配置里的 `passwordEnv`） |
| `--sql` | 是 | 要执行的 SQL 语句 |
| `--datasource` | 否² | 使用 `ae.jsonc` 中 `ae-sql.datasources` 里指定名称的数据源 |
| `--driver-dir` | 否 | JDBC 驱动目录，默认 `scripts/drivers/` |
| `--output` | 否 | 结果输出文件，默认写入 `ae/sql/` |

¹ 用 `--datasource` 选中配置里的数据源时可以不传。
² 配置文件里只有一个数据源时，不传 `--datasource` 也会自动选中它。

示例：

```bash
# 直接给参数
node scripts/run-sql.mjs --url "jdbc:mysql://127.0.0.1:3306/app" --user root --password "$DB_PASSWORD" --sql "SELECT COUNT(*) FROM orders"

# 用配置里的数据源（密码从 DB_PASSWORD 环境变量读）
node scripts/run-sql.mjs --datasource dev --sql "SELECT id, name FROM users LIMIT 10"
```

脚本内部执行的是：

```
java -cp "<skill>/scripts/sql-tool-1.0.0.jar;<skill>/scripts/drivers" top.jiangqiang.tools.SqlTool -u <url> [-user <user>] [-p <password>] -s <sql> -d <driver-dir>
```

它会：

- 把标准输出与错误输出**流式**转发到终端，同时写进结果文件与日志。
- 把结果 Markdown 写入 `ae/sql/sql-result-<时间戳>.md`（`--output` 可改路径）。
- 把运行日志写入 `ae/logs/sql/run-sql-<时间戳>.log`，其中 URL 与密码**已脱敏**。
- java 退出码非 0 时以非零退出码结束，并打印结果文件与日志路径。

### 3.2 连通性验证

首次连接或连接信息变更后，先跑一次最小查询确认链路通畅：

```bash
node scripts/run-sql.mjs --datasource dev --sql "SELECT 1"
```

| 错误现象 | 处理方式 |
|---------|---------|
| `No suitable driver found` | 检查 `scripts/drivers/` 里有没有匹配 URL 前缀的 JAR |
| `Connection refused` | 检查数据库服务状态与端口 |
| `Authentication failed` | 核对用户名与密码（注意 `passwordEnv` 指向的环境变量是否已导出） |
| `Unknown database` | 核对数据库名 |

### 3.3 输出格式

- **查询（SELECT）**：结果以 ASCII 表格展示，末尾给出行数。
- **DML（INSERT / UPDATE / DELETE）**：显示影响行数。
- **DDL（CREATE / ALTER / DROP）**：显示执行成功确认。

### 3.4 乱码处理

执行 SELECT 后必须检查结果里的中文是否可读。

- **全部乱码**（大量 `???`、`锟斤拷`、`Ã¤Â¸Â` 之类）：编码不匹配，按 `GBK` → `GB18030` → `Big5` 的顺序换编码重跑。MySQL 优先在 JDBC URL 上加 `?characterEncoding=GBK`；其他数据库通过 `JAVA_TOOL_OPTIONS=-Dfile.encoding=<编码>` 切换。
- **局部乱码**（个别字段或个别行）：多半是数据本身的问题，不重跑，在结果里标注"（含乱码，疑为原始数据问题）"。

某个编码恢复正常后，本次会话后续查询都用它；全部编码都无效时，提示用户核对数据库字符集。

## 边界

- 不负责 SQL 设计、改写与表结构设计。
- 不负责迁移脚本的编排与版本管理。
- 不在代码、配置文件或日志里硬编码密码；密码只来自环境变量或一次性命令行参数。
- 不自动下载 Java 运行时——JRE 由用户自行安装。
- 写入类操作必须先取得用户确认。

## 参考

- `references/db-drivers.md` — 主流数据库驱动的 Maven 坐标、下载地址与匹配规则。
