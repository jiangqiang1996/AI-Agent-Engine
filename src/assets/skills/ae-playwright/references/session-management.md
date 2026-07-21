# 浏览器会话管理

并发运行多个隔离的浏览器会话，并支持状态持久化。

## 命名浏览器会话

使用 `-s` 标志隔离浏览器上下文：

```bash
# 浏览器 1：认证流程
playwright-cli -s=auth open https://app.example.com/login

# 浏览器 2：公共浏览（独立的 cookies 和存储）
playwright-cli -s=public open https://example.com

# 命令按浏览器会话隔离
playwright-cli -s=auth fill e1 "user@example.com"
playwright-cli -s=public snapshot
```

## 浏览器会话隔离属性

每个浏览器会话独立拥有：
- Cookies
- LocalStorage / SessionStorage
- IndexedDB
- 缓存
- 浏览历史
- 已打开的标签页

## 浏览器会话命令

```bash
# 列出所有浏览器会话
playwright-cli list

# 停止浏览器会话（关闭浏览器）
playwright-cli close                # 停止默认浏览器
playwright-cli -s=mysession close   # 停止命名浏览器

# 停止所有浏览器会话
playwright-cli close-all

# 强制终止所有守护进程（用于清理残留/僵尸进程）
playwright-cli kill-all

# 删除浏览器会话的用户数据（配置目录）
playwright-cli delete-data                # 删除默认浏览器数据
playwright-cli -s=mysession delete-data   # 删除命名浏览器数据
```

## 环境变量

通过环境变量设置默认浏览器会话名称：

```bash
export PLAYWRIGHT_CLI_SESSION="mysession"
playwright-cli open example.com  # 自动使用 "mysession"
```

## 常见模式

### 并发抓取

```bash
#!/bin/bash
# 并发抓取多个站点

# 启动所有浏览器
playwright-cli -s=site1 open https://site1.com &
playwright-cli -s=site2 open https://site2.com &
playwright-cli -s=site3 open https://site3.com &
wait

# 从每个会话获取快照
playwright-cli -s=site1 snapshot
playwright-cli -s=site2 snapshot
playwright-cli -s=site3 snapshot

# 清理
playwright-cli close-all
```

### A/B 测试会话

```bash
# 测试不同的用户体验
playwright-cli -s=variant-a open "https://app.com?variant=a"
playwright-cli -s=variant-b open "https://app.com?variant=b"

# 对比
playwright-cli -s=variant-a screenshot
playwright-cli -s=variant-b screenshot
```

### 持久化配置

默认情况下，浏览器配置仅保留在内存中。在 `open` 时使用 `--persistent` 标志可将浏览器配置持久化到磁盘：

```bash
# 使用持久化配置（自动生成位置）
playwright-cli open https://example.com --persistent

# 使用持久化配置并指定自定义目录
playwright-cli open https://example.com --profile=/path/to/profile
```

## 连接到正在运行的浏览器

使用 `attach` 连接已经运行的浏览器，而非启动新实例。

> **Windows 阻塞警告**：`attach` 命令在 Windows 上通过 opencode bash 工具执行会永久阻塞（daemon 进程无法脱离进程树）。Windows 上必须使用 `ae-async-bash` 后台执行 `attach`，然后读取日志文件。详见 [SKILL.md Windows 平台阻塞警告](../SKILL.md)。

### 通过通道名称连接

通过通道名称连接正在运行的 Chrome 或 Edge 实例。目标浏览器必须启用远程调试 — 在浏览器中导航到 `chrome://inspect/#remote-debugging` 并勾选"允许此浏览器实例进行远程调试"。

```bash
# 连接到 Chrome
playwright-cli attach --cdp=chrome

# 连接到 Chrome Canary
playwright-cli attach --cdp=chrome-canary

# 连接到 Microsoft Edge
playwright-cli attach --cdp=msedge

# 连接到 Edge Dev
playwright-cli attach --cdp=msedge-dev
```

支持的通道：`chrome`、`chrome-beta`、`chrome-dev`、`chrome-canary`、`msedge`、`msedge-beta`、`msedge-dev`、`msedge-canary`。

当未提供 `--session` 时，会话以通道名称命名（例如 `--cdp=msedge` 创建名为 `msedge` 的会话），因此并行连接 Chrome 和 Edge 不会在 `default` 上冲突。传入 `--session=<name>` 可覆盖。

### 通过 CDP 端点连接

连接暴露了 Chrome DevTools Protocol 端点的浏览器：

```bash
playwright-cli attach --cdp=http://localhost:9222
```

### 通过浏览器扩展连接

连接已安装 Playwright 扩展的浏览器：

```bash
playwright-cli attach --extension
```

### 断开连接

断开已连接的会话，不影响外部浏览器：

```bash
# 断开默认的已连接会话
playwright-cli detach

# 断开指定的已连接会话
playwright-cli -s=msedge detach
```

`detach` 仅对通过 `attach` 创建的会话有效。对于通过 `open` 创建的会话，请使用 `close`。

## 默认浏览器会话

省略 `-s` 时，命令使用默认浏览器会话：

```bash
# 以下命令使用同一个默认浏览器会话
playwright-cli open https://example.com
playwright-cli snapshot
playwright-cli close  # 停止默认浏览器
```

## 浏览器会话配置

打开时使用特定设置配置浏览器会话：

```bash
# 使用配置文件打开
playwright-cli open https://example.com --config=.playwright/my-cli.json

# 使用指定浏览器打开
playwright-cli open https://example.com --browser=firefox

# 以有头模式打开
playwright-cli open https://example.com --headed

# 使用持久化配置打开
playwright-cli open https://example.com --persistent
```

## 最佳实践

### 1. 为浏览器会话赋予语义化名称

```bash
# 推荐：用途清晰
playwright-cli -s=github-auth open https://github.com
playwright-cli -s=docs-scrape open https://docs.example.com

# 避免：无意义名称
playwright-cli -s=s1 open https://github.com
```

### 2. 始终清理

```bash
# 完成后停止浏览器
playwright-cli -s=auth close
playwright-cli -s=scrape close

# 或一次性停止所有
playwright-cli close-all

# 如果浏览器无响应或残留僵尸进程
playwright-cli kill-all
```

### 3. 删除过期的浏览器数据

```bash
# 删除旧的浏览器数据以释放磁盘空间
playwright-cli -s=oldsession delete-data
```
