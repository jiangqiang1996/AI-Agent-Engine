# JDBC 驱动参考

本文件提供各数据库 JDBC 驱动的 Maven 坐标、下载地址与匹配规则，供 SKILL.md 引用。

## 公共仓库驱动（Maven Central）

以下驱动的 JAR 可从 Maven 中央仓库下载，放进 `scripts/drivers/` 目录：

| JDBC URL 前缀 | 数据库 | Maven 坐标 | 建议文件名 |
|---|---|---|---|
| `jdbc:mysql:` | MySQL | `com.mysql:mysql-connector-j:9.1.0` | `mysql-connector.jar` |
| `jdbc:postgresql:` | PostgreSQL | `org.postgresql:postgresql:42.7.5` | `postgresql.jar` |
| `jdbc:sqlite:` | SQLite | `org.xerial:sqlite-jdbc:3.47.2.0` | `sqlite-jdbc.jar` |
| `jdbc:sqlserver:` | SQL Server | `com.microsoft.sqlserver:mssql-jdbc:12.8.1.jre11` | `mssql-jdbc.jar` |
| `jdbc:oracle:` | Oracle | `com.oracle.database.jdbc:ojdbc11:23.6.0.24.10` | `ojdbc11.jar` |
| `jdbc:mariadb:` | MariaDB | `org.mariadb.jdbc:mariadb-java-client:3.5.1` | `mariadb.jar` |

下载地址形如：

```
https://repo1.maven.org/maven2/<groupId 路径>/<artifactId>/<version>/<artifactId>-<version>.jar
```

例：MySQL 驱动

```
https://repo1.maven.org/maven2/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar
```

不知道坐标时，用宿主的网页抓取能力查官方文档或 Maven 中央仓库，不要凭印象猜版本号。

## 需手动安装（国产数据库）

以下数据库的 JDBC 驱动通常不在公共仓库里，需要从官方渠道获取后放入 `scripts/drivers/`：

| JDBC URL 前缀 | 数据库 | 驱动文件名包含 | 来源说明 |
|---|---|---|---|
| `jdbc:dm:` | 达梦 DM | `DmJdbcDriver` | 达梦官网数据库下载页，选择 JDBC 驱动 |
| `jdbc:kingbase8:` | 人大金仓 KingbaseES | `kingbase8` | 金仓官网产品下载页 |
| `jdbc:opengauss:` | openGauss / GaussDB | `opengauss-jdbc` | openGauss 官网下载页 |
| `jdbc:oceanbase:` | OceanBase | `oceanbase-client` | OceanBase 官网社区版下载页 |

手动安装提示：告知用户"此数据库驱动需手动下载。请从官方渠道获取 JAR 文件后放入 `scripts/drivers/` 目录，然后重新执行。"

## JDBC URL 与驱动匹配规则

1. 提取 JDBC URL 的前缀（如 `jdbc:postgresql://...` → 前缀为 `jdbc:postgresql:`）。
2. 在 `scripts/drivers/` 目录下查找文件名**包含**匹配关键字的 JAR 文件。
3. 匹配成功 → 使用该驱动。
4. 匹配失败 → 从公共仓库获取（见上表），或提示手动安装（见国产数据库表）。

## 下载命令模板

用宿主的命令执行能力下载到 `scripts/drivers/` 目录即可。

### macOS / Linux

```bash
curl -L -o scripts/drivers/{filename} '{url}'
```

### Windows（PowerShell）

```powershell
Invoke-WebRequest -Uri '{url}' -OutFile 'scripts/drivers/{filename}'
```
