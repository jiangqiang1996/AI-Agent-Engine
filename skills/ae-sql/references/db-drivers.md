# JDBC 驱动下载参考

本文件提供各数据库 JDBC 驱动的下载映射表和命令模板，供 SKILL.md 引用。

## 自动下载（Maven Central）

以下驱动的 JAR 可直接从 Maven Central 下载到 `drivers/` 目录：

| JDBC URL 前缀 | 数据库 | 驱动文件名 | 下载 URL |
|---|---|---|---|
| `jdbc:mysql:` | MySQL | `mysql-connector.jar` | `https://repo1.maven.org/maven2/com/mysql/mysql-connector-j/9.1.0/mysql-connector-j-9.1.0.jar` |
| `jdbc:postgresql:` | PostgreSQL | `postgresql.jar` | `https://repo1.maven.org/maven2/org/postgresql/postgresql/42.7.5/postgresql-42.7.5.jar` |
| `jdbc:sqlite:` | SQLite | `sqlite-jdbc.jar` | `https://repo1.maven.org/maven2/org/xerial/sqlite-jdbc/3.47.2.0/sqlite-jdbc-3.47.2.0.jar` |
| `jdbc:sqlserver:` | SQL Server | `mssql-jdbc.jar` | `https://repo1.maven.org/maven2/com/microsoft/sqlserver/mssql-jdbc/12.8.1.jre11/mssql-jdbc-12.8.1.jre11.jar` |
| `jdbc:oracle:` | Oracle | `ojdbc11.jar` | `https://repo1.maven.org/maven2/com/oracle/database/jdbc/ojdbc11/23.6.0.24.10/ojdbc11-23.6.0.24.10.jar` |
| `jdbc:mariadb:` | MariaDB | `mariadb.jar` | `https://repo1.maven.org/maven2/org/mariadb/jdbc/mariadb-java-client/3.5.1/mariadb-java-client-3.5.1.jar` |

## 需手动安装（国产数据库）

以下数据库的 JDBC 驱动未发布到 Maven Central，需用户从官方渠道获取后放入 `drivers/` 目录：

| JDBC URL 前缀 | 数据库 | 驱动文件名包含 | 来源说明 |
|---|---|---|---|
| `jdbc:dm:` | 达梦 DM | `DmJdbcDriver` | 达梦官网数据库下载页，选择 JDBC 驱动 |
| `jdbc:kingbase8:` | 人大金仓 KingbaseES | `kingbase8` | 金仓官网产品下载页 |
| `jdbc:opengauss:` | openGauss / GaussDB | `opengauss-jdbc` | openGauss 官网下载页 |
| `jdbc:oceanbase:` | OceanBase | `oceanbase-client` | OceanBase 官网社区版下载页 |

手动安装提示：告知用户"此数据库驱动需手动下载。请从官方渠道获取 JAR 文件后放入 `drivers/` 目录，然后重新执行。"

## JDBC URL 与驱动匹配规则

AI 通过以下规则自动匹配驱动：

1. 提取 JDBC URL 的前缀（如 `jdbc:postgresql://...` → 前缀为 `jdbc:postgresql:`）
2. 在 `drivers/` 目录下查找文件名**包含**匹配表中"驱动文件名"关键字的 JAR 文件
3. 匹配成功 → 使用该驱动
4. 匹配失败 → 尝试自动下载（自动下载表）或提示手动安装（手动安装表）

## 下载命令模板

### Windows（PowerShell）

```powershell
Invoke-WebRequest -Uri '{url}' -OutFile 'drivers/{filename}'
```

### Linux / macOS

```bash
curl -L -o drivers/{filename} '{url}'
```
