# 配置选项与概念

本文档记录 `chrome-devtools-mcp` 的 CLI 配置选项和核心概念。所有 CLI 参数均可通过 `ae-chrome-devtools-mcp` 工具的 `register` action 以 `mcpArgs` 数组传入，原样追加到 `npx -y chrome-devtools-mcp@latest` 之后执行。

> 配置选项对齐 [chrome-devtools-mcp 官方 README](https://github.com/ChromeDevTools/chrome-devtools-mcp#configuration)。

## 连接参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--autoConnect` / `--auto-connect` | boolean | false | 自动连接本地运行的 Chrome（>= M144），需在浏览器中启用 `chrome://inspect/#remote-debugging` |
| `--browserUrl` / `--browser-url` / `-u` | string | false | 通过 HTTP URL 连接运行中的可调试 Chrome 实例，如 `http://127.0.0.1:9222` |
| `--wsEndpoint` / `--ws-endpoint` / `-w` | string | false | 通过 WebSocket 端点连接运行中的 Chrome 实例，如 `ws://127.0.0.1:9222/devtools/browser/<id>` |
| `--wsHeaders` / `--ws-headers` | string | false | WebSocket 自定义头 JSON，如 `{"Authorization":"Bearer token"}`，仅配合 `--wsEndpoint` |

### 连接参数选择建议

- **启动新实例**：`--isolated` 使用临时用户数据目录，浏览器关闭后自动清理
- **连接已有 Chrome（>= M144）**：`--autoConnect` 自动发现，从 `--channel` 确定的用户数据目录连接（默认 stable 通道），需在浏览器中启用 `chrome://inspect/#remote-debugging`
- **连接已有实例（指定端口）**：`--browserUrl http://127.0.0.1:<端口>` 或 `--wsEndpoint ws://127.0.0.1:<端口>/devtools/browser/<id>`
- **非 Chrome 浏览器**：`--isolated --executablePath <path>` 启动指定浏览器

> `detect` action 会返回 `executablePath`、`wsEndpoint`、`port` 等信息，供调用方直接构造对应的 `mcpArgs`。

## 启动参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--isolated` | boolean | false | 使用临时用户数据目录启动浏览器，关闭后自动清理。多会话独立配置文件场景必需 |
| `--headless` | boolean | false | 无头（无 UI）模式运行 |
| `--viewport` | string | 无 | 初始视口尺寸，如 `1280x720`。无头模式下最大 3840x2160 |

## 浏览器与通道

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--channel` | string（canary / dev / beta / stable） | stable | 指定使用的 Chrome 通道版本 |
| `--executablePath` / `--executable-path` / `-e` | string | 无 | 指定 Chrome 可执行文件路径，用于启动非默认 Chrome 浏览器 |
| `--userDataDir` / `--user-data-dir` | string | 平台默认 | Chrome 用户数据目录。默认：Linux/macOS `$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`，Windows `%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL` |

## 网络与代理

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--proxyServer` / `--proxy-server` | string | 无 | Chrome 代理服务器配置，透传为 `--proxy-server` |
| `--acceptInsecureCerts` / `--accept-insecure-certs` | boolean | false | 忽略自签名和过期证书错误，谨慎使用 |
| `--blockedUrlPattern` / `--blocked-url-pattern` | array | 无 | 阻止浏览器访问指定 URL 模式（[URLPattern](https://urlpattern.spec.whatwg.org/) 语法），连接时静默分离目标，运行时阻止请求 |
| `--allowedUrlPattern` / `--allowed-url-pattern` | array | 无 | 仅允许访问指定 URL 模式（需 Chrome 149+），阻止其余所有请求 |
| `--redactNetworkHeaders` / `--redact-network-headers` | boolean | false | 返回网络头前对敏感头进行脱敏 |

## Chrome 启动参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--chromeArg` / `--chrome-arg` | array | 无 | 传递给 Chrome 的额外参数，仅在 chrome-devtools-mcp 启动 Chrome 时生效 |
| `--ignoreDefaultChromeArg` / `--ignore-default-chrome-arg` | array | 无 | 显式禁用默认 Chrome 参数 |

## 工具类别开关

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--categoryEmulation` / `--category-emulation` | boolean | true | 设为 false 排除模拟相关工具 |
| `--categoryPerformance` / `--category-performance` | boolean | true | 设为 false 排除性能相关工具 |
| `--categoryNetwork` / `--category-network` | boolean | true | 设为 false 排除网络相关工具 |
| `--categoryExtensions` / `--category-extensions` | boolean | false | 设为 true 启用扩展管理工具。**注意：当前仅支持 pipe 连接，autoConnect / browserUrl / wsEndpoint 不兼容** |
| `--categoryExperimentalThirdParty` / `--category-experimental-third-party` | boolean | false | 设为 true 启用第三方开发工具 |
| `--categoryExperimentalWebmcp` / `--category-experimental-webmcp` | boolean | false | 设为 true 启用 WebMCP 工具，需 Chrome 149+ 且启用 `--enable-features=WebMCP,DevToolsWebMCPSupport` |

## 实验性功能

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--experimentalPageIdRouting` / `--experimental-page-id-routing` | boolean | false | 暴露 pageId 并按页面 ID 路由请求，适用于多个 agent 共享同一服务器实例的并发场景 |
| `--experimentalDevtools` / `--experimental-devtools` | boolean | false | 启用 DevTools 目标的自动化 |
| `--experimentalVision` / `--experimental-vision` | boolean | false | 启用坐标工具（如 `click_at(x,y)`），通常需计算机使用类模型 |
| `--memoryDebugging` / `--memory-debugging` / `-experimentalMemory` | boolean | false | 启用内存调试工具（堆快照比较、保留者分析等） |
| `--experimentalStructuredContent` / `--experimental-structured-content` | boolean | false | 输出结构化格式内容 |
| `--experimentalIncludeAllPages` / `--experimental-include-all-pages` | boolean | false | 包含所有类型页面（webview、后台页面等）作为可操作页面 |
| `--experimentalScreencast` / `--experimental-screencast` | boolean | false | 启用录屏工具，需 ffmpeg |
| `--experimentalFfmpegPath` / `--experimental-ffmpeg-path` | string | 无 | 指定 ffmpeg 可执行文件路径 |
| `--allowUnrestrictedPaths` / `--allow-unrestricted-paths` | boolean | false | 禁用默认路径限制（MCP 客户端未协商 roots 能力时，文件写入工具默认限制在 OS 临时目录）。仅在可信本地客户端需要访问临时目录外路径时使用 |

## 截图优化

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--screenshotFormat` / `--screenshot-format` | string（jpeg / png / webp） | png | `take_screenshot` 调用方未指定格式时的默认格式。jpeg/webp 比 png 小 3-5 倍，减少上下文体积 |
| `--screenshotQuality` / `--screenshot-quality` | number | 无 | jpeg/webp 默认压缩质量（0-100），值越小文件越小，png 忽略 |
| `--screenshotMaxWidth` / `--screenshot-max-width` | number | 无 | 截图最大宽度（像素），超出则等比缩小 |
| `--screenshotMaxHeight` / `--screenshot-max-height` | number | 无 | 截图最大高度（像素），超出则等比缩小 |

## 精简模式

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--slim` | boolean | false | 暴露 3 个精简工具（导航、脚本执行、截图），适合基础浏览器任务 |

## 日志与统计

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--logFile` / `--log-file` | string | 无 | 调试日志输出文件路径。设置环境变量 `DEBUG=*` 启用详细日志 |
| `--performanceCrux` / `--performance-crux` | boolean | true | 设为 false 禁止将追踪 URL 发送到 CrUX API 获取真实用户体验数据 |
| `--usageStatistics` / `--usage-statistics` | boolean | true | 设为 false 关闭使用统计。Google 收集工具调用成功率、延迟和环境信息以改进工具。设置环境变量 `CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS` 或 `CI` 也可关闭 |

## 核心概念

### 并发会话

大多数 MCP 客户端为每个对话启动一个 chrome-devtools-mcp 服务器。如需多个 agent 共享同一服务器实例，注册时传入 `--experimentalPageIdRouting`，使页面级工具暴露 `pageId`，各 agent 路由到自己的页面；如需每个会话独立临时 Chrome 配置文件，追加 `--isolated`。

### 用户数据目录

默认用户数据目录（非 isolated 模式）：

- Linux / macOS：`$HOME/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`
- Windows：`%HOMEPATH%/.cache/chrome-devtools-mcp/chrome-profile-$CHANNEL`

该目录在多次运行间不被清除，且在所有 chrome-devtools-mcp 实例间共享。设置 `--isolated` 使用临时目录，浏览器关闭后自动清理。

### 连接到运行中的 Chrome

默认情况下 chrome-devtools-mcp 会以专用配置文件启动新 Chrome 实例。如需连接到已有实例（复用登录态、绕过沙箱限制等），有两种方式：

1. **自动连接**（Chrome >= M144）：在浏览器中启用 `chrome://inspect/#remote-debugging`，MCP 服务器用 `--autoConnect` 自动发现并连接。从 `--channel` 参数确定的用户数据目录连接（默认 stable 通道），适合手动和自动化测试间共享状态。Chrome 会弹出权限对话框，需点击"允许"。
2. **手动端口连接**：以 `--remote-debugging-port=<端口>` 启动 Chrome，MCP 服务器用 `--browserUrl=http://127.0.0.1:<端口>` 或 `--wsEndpoint=ws://127.0.0.1:<端口>/devtools/browser/<id>` 连接。适合沙箱环境。

> **安全要求**：Chrome 要求启用远程调试端口时**必须**使用非默认 `--user-data-dir`，确保常规浏览数据和配置不暴露给调试会话。调试端口开启后，本机任何应用均可连接该端口控制浏览器，请勿在此期间浏览敏感网站。

### 浏览器启动时机

MCP 服务器连接本身不会自动启动浏览器。浏览器在 MCP 客户端首次使用需要运行浏览器实例的工具（如 `navigate_page`、`take_snapshot` 等）时才自动启动。`--autoConnect` 模式要求用户已先手动启动 Chrome。

### slim 精简模式

仅需基础浏览器任务（导航、脚本执行、截图）时使用 `--slim`，工具集从 51 个缩减为 3 个，减少上下文占用。可配合 `--headless` 实现无头精简模式。

### 更新检查

默认定期检查 npm 注册表更新。设置环境变量 `CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS` 禁用。

## 环境要求

- Node.js LTS 版本
- Chrome 当前稳定版或更新版本
- npm
- 录屏功能需 ffmpeg

## 数据安全提示

chrome-devtools-mcp 将浏览器实例的内容暴露给 MCP 客户端，允许检查、调试和修改浏览器中的任何数据。避免在浏览器中处理不希望与 MCP 客户端共享的敏感或个人信息。
