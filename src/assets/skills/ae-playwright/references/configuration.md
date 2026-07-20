# 配置选项与概念

本文档记录 `@playwright/mcp` 的 CLI 配置选项和核心概念。所有 CLI 参数均可通过 `ae-playwright-mcp` 工具的 `register` action 以 `mcpArgs` 数组传入，原样追加到 `npx -y @playwright/mcp@latest` 之后执行。

> 配置选项对齐 [@playwright/mcp 官方 README](https://github.com/microsoft/playwright-mcp#configuration)。

## 连接参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--cdp-endpoint` | string | 无 | CDP 端点，连接运行中的 Chromium 内核浏览器，如 `http://127.0.0.1:9222` |
| `--cdp-header` | array | 无 | CDP 连接请求的自定义头，可多次指定 |
| `--cdp-timeout` | number | 30000 | CDP 连接超时（毫秒） |
| `--extension` | boolean | false | 通过 Playwright 浏览器扩展连接已运行的 Edge/Chrome（需安装扩展） |
| `--endpoint` | string | 无 | 绑定浏览器端点，连接远程 Playwright 服务器 |

### 连接参数选择建议

- **启动新实例**：`--isolated` 使用临时用户数据目录，浏览器关闭后自动清理
- **连接已有 Chromium 实例**：`--cdp-endpoint http://127.0.0.1:<端口>`
- **连接已有 Edge/Chrome（需扩展）**：`--extension`
- **非 Chromium 浏览器**：`--browser firefox` 或 `--browser webkit` 启动独立实例

> `detect` action 会返回 `executablePath`、`port`、`wsEndpoint` 等信息，供调用方直接构造对应的 `mcpArgs`。

## 启动参数

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--isolated` | boolean | false | 使用临时用户数据目录启动浏览器，关闭后自动清理。多会话独立配置文件场景必需 |
| `--headless` | boolean | false | 无头（无 UI）模式运行，默认 headed |
| `--browser` | string | chromium | 浏览器或 Chrome 通道，可选 `chrome`、`firefox`、`webkit`、`msedge` |
| `--executable-path` | string | 无 | 指定浏览器可执行文件路径 |
| `--device` | string | 无 | 模拟设备，如 `iPhone 15` |
| `--mobile` | boolean | false | 模拟通用移动设备（Chromium 用 Pixel 10，WebKit 用 iPhone 17），不能与 `--device` 同时使用 |
| `--viewport-size` | string | 无 | 视口尺寸，如 `1280x720` |

## 能力开关

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--caps` | string | 无 | 逗号分隔的额外能力列表，可选 `vision`、`pdf`、`devtools`、`network`、`storage`、`config`、`testing`。`core` 及其子能力（core-navigation/core-tabs/core-input/core-install）默认启用，通常无需显式指定 |

### 能力说明

| 能力 | 启用的工具 |
|------|-----------|
| `core` | 核心自动化工具（默认启用，含导航、快照、点击、输入、控制台、网络请求等，子能力 core-navigation/core-tabs/core-input/core-install 可用于配置文件细粒度控制） |
| `vision` | 坐标交互工具（`browser_mouse_click_xy`、`browser_mouse_move_xy`、`browser_mouse_drag_xy`、`browser_mouse_down`、`browser_mouse_up`、`browser_mouse_wheel`） |
| `pdf` | `browser_pdf_save` |
| `devtools` | `browser_start_tracing`、`browser_stop_tracing`、`browser_start_video`、`browser_stop_video`、`browser_video_chapter`、`browser_video_show_actions`、`browser_video_hide_actions`、`browser_highlight`、`browser_hide_highlight`、`browser_annotate`、`browser_resume` |
| `network` | `browser_network_state_set`、`browser_route`、`browser_route_list`、`browser_unroute` |
| `storage` | cookie/localStorage/sessionStorage 系列工具、`browser_storage_state`、`browser_set_storage_state` |
| `config` | `browser_get_config` |
| `testing` | `browser_verify_element_visible`、`browser_verify_text_visible`、`browser_verify_list_visible`、`browser_verify_value`、`browser_generate_locator` |

## 网络与代理

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--proxy-server` | string | 无 | 代理服务器，如 `http://myproxy:3128` 或 `socks5://myproxy:8080` |
| `--proxy-bypass` | string | 无 | 逗号分隔的代理绕过域名 |
| `--ignore-https-errors` | boolean | false | 忽略 HTTPS 证书错误 |
| `--allowed-origins` | string | 无 | 分号分隔的允许请求的来源列表 |
| `--blocked-origins` | string | 无 | 分号分隔的阻止请求的来源列表 |
| `--block-service-workers` | boolean | false | 阻止 Service Worker |

## 会话与存储

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--user-data-dir` | string | 临时目录 | 用户数据目录。未指定时使用临时目录 |
| `--storage-state` | string | 无 | 隔离会话的存储状态文件路径 |
| `--shared-browser-context` | boolean | false | 在所有 HTTP 客户端间复用同一浏览器上下文 |
| `--save-session` | boolean | false | 保存 Playwright MCP 会话到输出目录 |
| `--secrets` | string | 无 | dotenv 格式的密钥文件路径，用于脱敏工具响应 |

## 初始化脚本

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--init-page` | array | 无 | TypeScript 文件路径，在 Playwright page 对象上执行 |
| `--init-script` | array | 无 | JavaScript 文件路径，作为初始化脚本在每页加载前执行 |

## 输出与日志

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--output-dir` | string | 无 | 输出文件目录 |
| `--output-mode` | string | stdout | 输出模式，`file` 或 `stdout` |
| `--output-max-size` | number | 无 | 输出文件淘汰阈值（字节） |
| `--image-responses` | string | allow | 图片响应模式，`allow` 或 `omit` |
| `--snapshot-mode` | string | full | 快照模式，`full` 或 `none` |
| `--console-level` | string | info | 控制台消息级别，`error`、`warning`、`info`、`debug` |
| `--codegen` | string | typescript | 代码生成语言，`typescript` 或 `none` |

## 超时

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--timeout-action` | number | 5000 | 操作超时（毫秒） |
| `--timeout-navigation` | number | 60000 | 导航超时（毫秒） |

## 其他

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `--config` | string | 无 | JSON 配置文件路径 |
| `--test-id-attribute` | string | data-testid | 测试 ID 属性名 |
| `--user-agent` | string | 无 | 自定义 User-Agent |
| `--grant-permissions` | array | 无 | 授予浏览器上下文的权限，如 `geolocation`、`clipboard-read`、`clipboard-write` |
| `--host` | string | localhost | 服务器绑定主机，`0.0.0.0` 绑定所有接口 |
| `--port` | number | 无 | SSE 传输监听端口 |
| `--no-sandbox` | boolean | false | 禁用沙箱 |
| `--sandbox` | boolean | false | 启用沙箱 |
| `--allow-unrestricted-file-access` | boolean | false | 允许访问工作区根目录外的文件 |

## 配置文件

@playwright/mcp 支持 JSON 配置文件，通过 `--config` 指定：

```json
{
  "browser": {
    "browserName": "chromium",
    "isolated": true,
    "launchOptions": { "headless": true },
    "contextOptions": { "viewport": { "width": 1280, "height": 720 } }
  },
  "capabilities": ["core", "pdf", "vision"],
  "timeouts": { "action": 5000, "navigation": 60000 }
}
```

## 核心概念

### 持久用户配置

默认使用持久用户配置目录（非 isolated 模式），不同项目自动获得独立配置：

- Windows：`%USERPROFILE%\AppData\Local\ms-playwright\mcp-{channel}-{workspace-hash}`
- macOS：`~/Library/Caches/ms-playwright/mcp-{channel}-{workspace-hash}`
- Linux：`~/.cache/ms-playwright/mcp-{channel}-{workspace-hash}`

`{workspace-hash}` 基于 MCP 客户端工作区根目录派生，不同项目自动分离。

> 持久配置只能被一个浏览器实例同时使用。并发 MCP 客户端共享同一工作区会冲突，需为每个额外客户端使用 `--isolated` 或指定不同的 `--user-data-dir`。

### 隔离模式

`--isolated` 使用内存中的临时配置，浏览器关闭后所有存储状态丢失。可通过 `--storage-state` 提供初始存储状态。

### 元素引用

Playwright MCP 通过**无障碍快照**（accessibility snapshot）提供元素引用。调用 `browser_snapshot` 获取页面快照，每个元素带有 `ref` 引用。后续交互工具通过 `target` 参数传入该 `ref` 定位元素。这是比截图更高效、更确定性的元素定位方式。

### 能力分层

核心工具（导航、快照、点击、输入等）默认可用。高级能力通过 `--caps` 启用：
- `vision` — 坐标交互（配合视觉模型使用）
- `pdf` — PDF 生成
- `devtools` — 开发者工具（追踪、录屏、高亮、标注）
- `network` — 网络控制（路由模拟、离线模式）
- `storage` — 存储管理（cookie、localStorage、sessionStorage、存储状态）
- `config` — 配置查询
- `testing` — 测试断言（元素可见性、文本可见性、值验证、定位器生成）

## 环境要求

- Node.js 18 或更新版本
- npm
- 浏览器：Chromium、Firefox 或 WebKit（Playwright 会自动管理浏览器安装）

## 数据安全提示

@playwright/mcp 将浏览器实例的内容暴露给 MCP 客户端，允许检查、调试和修改浏览器中的任何数据。避免在浏览器中处理不希望与 MCP 客户端共享的敏感或个人信息。`browser_run_code_unsafe` 是 RCE 等价操作，谨慎使用。
