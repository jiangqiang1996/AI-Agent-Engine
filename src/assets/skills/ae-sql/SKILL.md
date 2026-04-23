---
name: ae:sql
description: "通过 JDBC 连接任意数据库并执行 SQL（MySQL、PostgreSQL、Oracle、SQL Server、SQLite、达梦、人大金仓、openGauss 等）。自动检测项目中的 Spring Boot 数据库配置，自动管理 JRE 运行时和 JDBC 驱动。"
argument-hint: "[SQL 语句]"
---

# AE SQL

通过 JDBC 连接任意关系型数据库并执行 SQL。所有提供 JDBC 驱动的数据库均受支持。

## 角色

SQL 执行器。接收用户确认的 SQL 语句，通过 sql-tool（JDBC CLI 工具）连接数据库并执行，返回格式化结果。

## 何时使用

- 需要查询数据库中的数据
- 需要执行经用户确认的写入操作（INSERT / UPDATE / DELETE / DDL）
- 需要检查表结构或数据库状态
- 需要在数据库中执行管理操作（经用户确认）

## 边界

- 不负责 SQL 设计或改写 — 用户应提供明确的 SQL 语句
- 不负责 Liquibase / Flyway 迁移脚本管理
- 不负责表结构设计
- 不把 Spring Boot 配置中的连接信息当成本次执行的唯一来源 — 以用户明确提供的信息为准
- 不支持 NoSQL 数据库（仅 JDBC 覆盖的关系型数据库）

## 第一步：环境准备（JRE 检查与下载）

所有命令的 workdir 为 `script/`（本技能根目录下的 `script/` 子目录）。禁止使用 `cd ... &&` 串联命令。

### 1.1 平台检测

检测操作系统和架构，确定 `java` 可执行文件路径和 Adoptium 下载参数：

```bash
# 检测平台
if ($env:COMSPEC -ne $null) {
  # Windows
  $JAVA_CMD = "jre\bin\java.exe"
  $PLATFORM = "windows"
} elseif ($(uname -s) -eq "Darwin") {
  $JAVA_CMD = "./jre/bin/java"
  $PLATFORM = "mac"
} else {
  $JAVA_CMD = "./jre/bin/java"
  $PLATFORM = "linux"
}

# 检测架构
$ARCH = $(uname -m)
if ($ARCH -eq "arm64" -or $ARCH -eq "aarch64") {
  $DOWNLOAD_ARCH = "aarch64"
} else {
  $DOWNLOAD_ARCH = "x64"
}
```

### 1.2 JRE 检查

检查 `script/jre/bin/java[.exe]` 是否存在：

- **存在** → 跳到第二步
- **不存在** → 执行 1.3 下载

### 1.3 JRE 下载

从国内镜像下载 Eclipse Temurin JRE 17。按以下优先级依次尝试镜像源，首个成功即可：

#### 镜像源列表

| 优先级 | 镜像源 | 基础 URL |
|--------|--------|----------|
| 1（首选） | 清华大学 TUNA | `https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jre/{arch}/{platform}/` |
| 2（备选） | 阿里云 | `https://mirrors.aliyun.com/eclipse/temurin-compliance/temurin/17/` |

> `{arch}` = x64 / aarch64，`{platform}` = windows / linux / mac

#### 获取下载文件名

清华和阿里云镜像的文件名包含具体版本号，需先解析目录页面获取最新文件名。

> **重要**：必须使用 `webfetch` 工具访问目录页，禁止使用任何带缓存的网页读取工具（如 web-reader），否则可能返回过时文件名导致下载 404。

**清华 TUNA 目录 URL**（按 `{arch}/{platform}` 组合）：

```
https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jre/{arch}/{platform}/
```

目录页为 Apache 风格索引，用 `webfetch` 工具（format=text）访问目录 URL，从页面中提取 `.zip`（Windows）或 `.tar.gz`（Linux/macOS）文件名。
文件名格式为 `OpenJDK17U-jre_{arch}_{platform}_hotspot_{version}.{ext}`，取最新日期对应的文件。

**阿里云目录 URL**：

```
https://mirrors.aliyun.com/eclipse/temurin-compliance/temurin/17/
```

阿里云所有平台文件在同一目录，文件名包含平台和架构。从页面中找到匹配 `OpenJDK17U-jre_{arch}_{platform}_hotspot_*.{ext}` 的最新文件。
阿里云版本目录名为 `jdk-17.0.XX+X` 格式（注意：虽然目录名含 jdk，但内部同时包含 jre 文件）。
若顶层目录页未直接列出 JRE 文件，需进入最新版本目录查找。

> **解压注意事项**：压缩包解压后的目录名格式为 `jdk-{版本}-jre`（如 `jdk-17.0.18+6-jre`），必须使用从目录页解析到的实际版本号拼接目录名，禁止使用 `jdk-*` 通配符。通配符在 `script/` 下存在多个 `jdk-*` 目录时会匹配错误。

#### Windows 下载命令（workdir 为 `script/`）

```powershell
# 镜像 1：清华 TUNA
$TUNA_DIR_URL = "https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jre/x64/windows/"
# 用 webfetch 工具访问 $TUNA_DIR_URL，提取 .zip 文件名赋值给 $JRE_FILENAME
# 从 $JRE_FILENAME 中提取版本号（如 17.0.18_6），拼接解压目录名 $EXTRACTED_DIR（如 jdk-17.0.18+6-jre）
# 然后执行下载：
Invoke-WebRequest -Uri "${TUNA_DIR_URL}${JRE_FILENAME}" -OutFile "jre.zip"
# 下载后校验文件大小，若小于 1MB 说明下载了 404 页面，文件名已过期，需重新获取
if ((Get-Item "jre.zip").Length -lt 1MB) { Remove-Item "jre.zip"; Write-Error "下载失败：文件名可能已过期，请重新用 webfetch 获取目录页" }
Expand-Archive -Path "jre.zip" -DestinationPath "."
Move-Item -Path ".\$EXTRACTED_DIR" -Destination "jre" -Force
Remove-Item -Path "jre.zip"
```

若清华镜像下载失败，使用阿里云备选：

```powershell
# 镜像 2：阿里云
$ALI_DIR_URL = "https://mirrors.aliyun.com/eclipse/temurin-compliance/temurin/17/"
# 用 webfetch 工具访问 $ALI_DIR_URL，找到最新版本目录（如 jdk-17.0.18+8/），
# 进入该目录找到 OpenJDK17U-jre_x64_windows_hotspot_*.zip 文件名赋值给 $JRE_FILENAME
# 从 $JRE_FILENAME 中提取版本号，拼接解压目录名 $EXTRACTED_DIR
# 然后执行下载：
Invoke-WebRequest -Uri "${ALI_DIR_URL}${VERSION_DIR}${JRE_FILENAME}" -OutFile "jre.zip"
if ((Get-Item "jre.zip").Length -lt 1MB) { Remove-Item "jre.zip"; Write-Error "下载失败：文件名可能已过期，请重新用 webfetch 获取目录页" }
Expand-Archive -Path "jre.zip" -DestinationPath "."
Move-Item -Path ".\$EXTRACTED_DIR" -Destination "jre" -Force
Remove-Item -Path "jre.zip"
```

#### Linux / macOS 下载命令（workdir 为 `script/`）

```bash
# 镜像 1：清华 TUNA
TUNA_DIR_URL="https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jre/x64/linux/"
# 用 webfetch 工具访问 $TUNA_DIR_URL，提取 .tar.gz 文件名赋值给 JRE_FILENAME
# 从 JRE_FILENAME 中提取版本号，拼接解压目录名 EXTRACTED_DIR（如 jdk-17.0.18+6-jre）
# 然后执行下载：
curl -L -o jre.tar.gz "${TUNA_DIR_URL}${JRE_FILENAME}"
tar -xzf jre.tar.gz
mv "${EXTRACTED_DIR}/" jre/
rm jre.tar.gz
```

若清华镜像下载失败，使用阿里云备选：

```bash
# 镜像 2：阿里云
ALI_DIR_URL="https://mirrors.aliyun.com/eclipse/temurin-compliance/temurin/17/"
# 用 webfetch 工具访问 $ALI_DIR_URL，找到最新版本目录（如 jdk-17.0.18+8/），
# 进入该目录找到 OpenJDK17U-jre_x64_linux_hotspot_*.tar.gz 文件名赋值给 JRE_FILENAME
# 从 JRE_FILENAME 中提取版本号，拼接解压目录名 EXTRACTED_DIR
# 然后执行下载：
curl -L -o jre.tar.gz "${ALI_DIR_URL}${VERSION_DIR}${JRE_FILENAME}"
tar -xzf jre.tar.gz
mv "${EXTRACTED_DIR}/" jre/
rm jre.tar.gz
```

若所有镜像均下载失败（网络不可达），提示用户：

"JRE 17 自动下载失败（已尝试清华 TUNA 和阿里云镜像）。请手动安装 JRE 17 并将运行时目录放置或链接到 `script/jre/`（确保 `script/jre/bin/java` 或 `script/jre/bin/java.exe` 存在）。也可手动访问以下地址下载：\n- 清华镜像：https://mirrors.tuna.tsinghua.edu.cn/Adoptium/17/jre/\n- 阿里云镜像：https://mirrors.aliyun.com/eclipse/temurin-compliance/temurin/17/"

### 1.4 JRE 验证

```bash
# Windows
jre\bin\java.exe -version

# Linux / macOS
./jre/bin/java -version
```

验证输出包含 `17` 版本号。若失败，提示用户检查 JRE 安装。

## 第二步：获取连接信息

### 2.1 用户显式提供

如果本次对话中用户已明确提供了 JDBC URL、用户名和密码，直接使用，不再解析配置文件。

### 2.2 Spring Boot 配置自动解析

仅当用户未提供连接信息时，扫描当前项目的 Spring Boot 配置文件：

**扫描顺序**（按优先级）：

1. `application.yml`
2. `application.yaml`
3. `application.properties`
4. `bootstrap.yml`
5. `bootstrap.yaml`
6. `bootstrap.properties`

同时检查 `spring.profiles.active` 配置，若存在则额外扫描 `application-{profile}.yml` / `.properties`。

**解析字段**：

| 字段 | 配置键 | 用途 |
|------|--------|------|
| JDBC URL | `spring.datasource.url` | 连接地址 |
| 用户名 | `spring.datasource.username` | 数据库用户名 |
| 密码 | `spring.datasource.password` | 数据库密码 |
| 驱动类名 | `spring.datasource.driver-class-name` | 辅助驱动匹配（可选） |

**多数据源场景**：

若配置中存在 `spring.datasource.*.url` 模式（如 `spring.datasource.primary.url`、`spring.datasource.secondary.url`），使用 `question` 工具让用户选择要连接的数据源。

**加密密码**：

若密码值为 `ENC(...)` 或 `{cipher}...` 格式，跳过配置解析，改用 2.3 手动询问。

**解析方式**：

使用 Read 工具读取配置文件内容，使用 Grep 工具搜索上述字段。YAML 文件注意缩进层级解析。

### 2.3 手动询问

若用户未提供且无法从配置文件解析，使用 `question` 工具依次询问：

1. JDBC URL（必填）
2. 数据库用户名（可选，SQLite 等不需要）
3. 数据库密码（可选）

## 第三步：驱动检查与下载

### 3.1 匹配驱动

根据 JDBC URL 前缀，在 `drivers/` 目录下查找匹配的 JAR 文件。匹配规则见 `@./references/db-drivers.md` 中的"JDBC URL 与驱动匹配规则"。

### 3.2 驱动存在

匹配到 JAR 文件 → 继续到第四步。

### 3.3 驱动缺失（可自动下载）

对于 MySQL、PostgreSQL、SQLite、SQL Server、Oracle、MariaDB 等发布到 Maven Central 的驱动，自动下载到 `drivers/` 目录。下载 URL 见 `@./references/db-drivers.md`。

**Windows 下载命令**（workdir 为 `script/`）：

```powershell
Invoke-WebRequest -Uri "{下载URL}" -OutFile "drivers\{文件名}"
```

**Linux / macOS 下载命令**（workdir 为 `script/`）：

```bash
curl -L -o drivers/{文件名} "{下载URL}"
```

### 3.4 驱动缺失（需手动安装）

对于达梦、人大金仓、openGauss 等国产数据库驱动，提示用户：

"此数据库的 JDBC 驱动需要手动获取。请从官方渠道下载驱动 JAR 文件，放入 `script/drivers/` 目录后重新执行。数据库：{数据库名}，驱动文件名应包含：{关键字}。"

## 第四步：SQL 执行与安全规范

### 4.1 连通性验证

首次连接或连接信息变更时，先执行连通性验证：

```bash
# Windows
jre\bin\java.exe -jar sql-tool-1.0.0.jar -u "{jdbc_url}" -user "{username}" -p "{password}" -d "drivers" -s "SELECT 1"

# Linux / macOS
./jre/bin/java -jar sql-tool-1.0.0.jar -u "{jdbc_url}" -user "{username}" -p "{password}" -d "drivers" -s "SELECT 1"
```

若连接失败，根据错误信息排查：

| 错误现象 | 处理方式 |
|---------|---------|
| `No suitable driver found` | 检查 drivers/ 目录中是否有匹配 URL 前缀的 JAR |
| `Connection refused` | 检查数据库服务状态和端口 |
| `Authentication failed` | 核对用户名和密码 |
| `Unknown database` | 检查数据库名称是否正确 |

### 4.2 安全检查规则

**执行前必须检查 SQL 语句，符合以下条件时必须使用 `question` 工具请求用户确认：**

| SQL 模式 | 处理方式 |
|---------|---------|
| `DROP DATABASE` | 必须确认 |
| `DROP TABLE` | 必须确认 |
| `TRUNCATE` | 必须确认 |
| `DELETE` 无 `WHERE` 子句 | 必须确认 |
| `UPDATE` 无 `WHERE` 子句 | 必须确认 |
| 大结果集查询（无 LIMIT） | 建议添加 LIMIT |

确认提示格式：

```
即将执行以下操作，这可能不可恢复：

{SQL 语句}

确认执行？
```

用户拒绝 → 不执行，返回"操作已取消"。

### 4.3 执行命令

确认安全后，执行 SQL：

**Windows**（workdir 为 `script/`）：

```powershell
jre\bin\java.exe -jar sql-tool-1.0.0.jar -u "{jdbc_url}" -user "{username}" -p "{password}" -d "drivers" -s "{sql}"
```

**Linux / macOS**（workdir 为 `script/`）：

```bash
./jre/bin/java -jar sql-tool-1.0.0.jar -u "{jdbc_url}" -user "{username}" -p "{password}" -d "drivers" -s "{sql}"
```

参数说明：

| 参数 | 必填 | 说明 |
|------|------|------|
| `-u` | 是 | JDBC 连接地址 |
| `-user` | 否* | 数据库用户名 |
| `-p` | 否* | 数据库密码 |
| `-s` | 是 | 要执行的 SQL 语句 |
| `-d` | 否 | 驱动目录（默认为可执行文件同级的 `drivers` 目录） |

*SQLite 等嵌入式数据库通常不需要用户名和密码。

### 4.4 输出格式

- **查询（SELECT）**：结果以 ASCII 表格展示，末尾显示行数
- **DML（INSERT / UPDATE / DELETE）**：显示影响行数
- **DDL（CREATE / ALTER / DROP）**：显示执行成功确认

### 4.5 实操建议

- 先做连通性验证（`SELECT 1`），再做写操作
- PostgreSQL 管理动作（如创建数据库）建议先连接 `postgres` 维护库执行
- 不确定表结构时，先查 `information_schema` 或使用 `SHOW TABLES` / `\dt` 等命令
- 大表查询始终添加 `LIMIT`，避免 Token 溢出

## 参考

驱动下载映射表和命令模板：@./references/db-drivers.md
