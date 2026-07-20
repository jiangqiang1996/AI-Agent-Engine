---
name: ae:playwright
description: "@playwright/mcp 浏览器能力中枢：启动或接管浏览器，打开 URL，执行指定任务。ae:playwright 是 ae-playwright-mcp 工具的唯一管理入口，上层技能和代理不应直接调用 ae-playwright-mcp。"
---

# @playwright/mcp 浏览器能力中枢

本技能负责根据用户参数和当前环境，决策浏览器 MCP 的注册方式，并在注册完成后打开 URL、执行浏览器任务。`ae-playwright-mcp` 工具是本技能调用的底层工具，本技能是其唯一管理入口。

> @playwright/mcp 支持 Chromium、Firefox、WebKit 三大浏览器内核。本技能涉及的"浏览器"均指该工具支持的浏览器，`detect` 可检测 Chrome、Edge、Chromium、Firefox、WebKit 五种。

## 唯一管理入口

`ae:playwright` 是 `ae-playwright-mcp` 工具的**唯一管理入口**。上层技能和代理不得直接调用 `ae-playwright-mcp`，必须通过本技能完成浏览器 MCP 的注册、检查和断开。

## 三种浏览器模式

| 模式 | mode 值 | 说明 | 适用场景 |
|------|---------|------|----------|
| 接管现有浏览器 | `attach` | 通过 CDP 端点连接运行中的 Chromium 内核浏览器 | 复用已有登录态、调试会话、已打开的标签页 |
| 新开浏览器 | `launch` | 启动新的有头浏览器实例（可见窗口） | 需要观察浏览器行为、手动登录、验证码、扫码 |
| 新开无头浏览器 | `launch-headless` | 启动新的无头浏览器实例（无 UI） | CI 环境、服务器环境、无人值守自动化 |

> **硬约束**：任务涉及手动登录、验证码、扫码等需要人工干预的环节时，**禁止**使用 `launch-headless`，必须使用 `attach` 或 `launch`。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | 否 | 目标页面 URL。注册并验证连接后自动打开。 |
| `task` | 否 | 浏览器中执行的任务描述。 |
| `action` | 否 | 操作类型，默认自动推断（未连接则按 mode 注册）。 |
| `mode` | 否 | 浏览器模式：`attach` / `launch` / `launch-headless`。未指定时使用 mcpArgs 直接透传。 |
| `browser` | 否 | 浏览器类型：`Chrome` / `Edge` / `Chromium` / `Firefox` / `WebKit`。 |
| `port` | 否 | CDP 远程调试端口号（仅 `attach` 模式）。未提供时自动检测。 |
| `executablePath` | 否 | 浏览器可执行文件路径（仅 `launch` / `launch-headless` 模式）。 |
| `mcpArgs` | 否 | 追加的 @playwright/mcp CLI 参数数组，实现高级特性。 |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：

   | 值模式 | 推断为 |
   |--------|--------|
   | http:// 或 https:// 开头 | url |
   | attach / launch / launch-headless | mode |
   | check / detect / disconnect | action |
   | Chrome / Edge / Chromium / Firefox / WebKit | browser |
   | 独立纯数字 1-65535 | port |

3. 顺序兜底：值特征有交集时，按 `url → mode → action → browser → port → task` 顺序匹配

**内部调用约定**：本技能被其他技能自动调用时，参数必须使用显式命名格式，不依赖值特征推断。

## 模式详解

### attach（接管现有浏览器）

通过 CDP 端点连接运行中的 Chromium 内核浏览器（Chrome/Edge/Chromium）。

**前提条件**：浏览器已启用远程调试端口。启用方法：

**途径 A（推荐，无需重启浏览器，仅 Chrome >= M144）**：在已运行的 Chrome 地址栏访问 `chrome://inspect/#remote-debugging` 启用。Chrome 会弹出权限对话框，需点击"允许"。

**途径 B（命令行启动，适用于所有浏览器和版本）**：关闭浏览器后以参数启动：
- Chrome：`chrome --remote-debugging-port=9222 --user-data-dir=<路径>`
- Edge：`msedge --remote-debugging-port=9222 --user-data-dir=<路径>`

> **安全要求**：Chrome 要求启用远程调试端口时**必须**使用非默认的 `--user-data-dir`，确保常规浏览数据和配置文件不暴露给调试会话。调试端口开启期间，本机任何应用均可连接该端口控制浏览器，请勿在此期间浏览敏感网站。

**流程**：
1. 如果提供了 `port`，直接用该端口连接
2. 如果未提供 `port`，自动检测运行中且可调试的浏览器
3. 如果指定了 `browser`，只检测该浏览器；否则检测所有支持的浏览器
4. 多个可调试浏览器时，按优先级选择（Chrome > Edge > Chromium）
5. 构造 `--cdp-endpoint http://127.0.0.1:<port>` 注册 MCP

> `attach` 仅支持 Chromium 内核浏览器（Chrome、Edge、Chromium）。Firefox 和 WebKit 不支持 CDP，需使用 `launch` 或 `launch-headless`。

### launch（新开浏览器）

启动新的有头浏览器实例，可见浏览器窗口。

**流程**：
1. 如果提供了 `executablePath`，直接用该路径
2. 如果未提供 `executablePath` 但指定了 `browser`，自动检测该浏览器的安装路径
3. 如果都未指定，自动检测所有已安装的浏览器，按优先级选择
4. 构造参数：`--isolated` + `--browser <内核名>` + `--executable-path <路径>`
5. 注册 MCP

> `--isolated` 使用临时用户数据目录，浏览器关闭后自动清理，避免污染用户常规配置。

### launch-headless（新开无头浏览器）

启动新的无头浏览器实例，无 UI 界面。流程与 `launch` 相同，额外添加 `--headless` 参数。

**适用场景**：CI 环境、服务器环境、无人值守自动化、批量测试。
**不适用场景**：手动登录、验证码、扫码、需要人工干预的环节。

## 高级参数透传（mcpArgs）

`mcpArgs` 追加到 `mode` 生成的基础参数之后，实现 @playwright/mcp 的全部 CLI 特性。`mode` 省略时 `mcpArgs` 作为完整参数直接透传。

完整 CLI 参数列表详见 `references/configuration.md`，常用示例：

| mcpArgs | 说明 |
|---------|------|
| `["--caps", "vision,pdf,devtools"]` | 启用坐标交互、PDF、开发者工具能力 |
| `["--caps", "network,storage,testing"]` | 启用网络控制、存储管理、测试断言 |
| `["--device", "iPhone 15"]` | 模拟设备 |
| `["--mobile"]` | 模拟通用移动设备 |
| `["--viewport-size", "1280x720"]` | 设置视口尺寸 |
| `["--proxy-server", "http://myproxy:3128"]` | 使用代理 |
| `["--storage-state", "path/to/state.json"]` | 加载存储状态（cookie/localStorage） |
| `["--user-data-dir", "/path/to/profile"]` | 指定持久用户数据目录 |
| `["--config", "path/to/config.json"]` | 使用 JSON 配置文件 |
| `["--extension"]` | 通过 Playwright 扩展连接已运行的 Edge/Chrome |
| `["--init-script", "path/to/init.js"]` | 添加初始化脚本 |
| `["--init-page", "path/to/setup.ts"]` | 添加页面初始化 TypeScript |
| `["--ignore-https-errors"]` | 忽略 HTTPS 证书错误 |
| `["--blocked-origins", "https://ads.example.com"]` | 阻止指定来源 |
| `["--image-responses", "omit"]` | 省略图片响应以节省 token |
| `["--snapshot-mode", "none"]` | 禁用快照响应 |
| `["--console-level", "error"]` | 仅返回 error 级别控制台消息 |
| `["--codegen", "none"]` | 禁用代码生成 |
| `["--timeout-action", "10000"]` | 设置操作超时 10 秒 |
| `["--no-sandbox"]` | 禁用沙箱（Docker 环境） |
| `["--save-session"]` | 保存 Playwright 会话 |
| `["--secrets", "path/to/.env"]` | 脱敏工具响应中的敏感数据 |

组合示例：

```
# 新开无头 Chrome + 启用 vision/pdf + 模拟移动设备
mode=launch-headless browser=Chrome mcpArgs=["--caps","vision,pdf","--mobile"]

# 接管现有浏览器 + 启用网络控制和存储管理
mode=attach mcpArgs=["--caps","network,storage"]

# 纯透传模式（不使用 mode）
mcpArgs=["--isolated","--headless","--browser","firefox","--caps","vision"]
```

## 浏览器内核名映射

`browser` 参数值到 @playwright/mcp `--browser` CLI 参数的映射：

| browser 参数 | --browser 值 | 说明 |
|-------------|-------------|------|
| Chrome | chrome | Chromium 内核 |
| Edge | msedge | Chromium 内核 |
| Chromium | chrome | Chromium 内核 |
| Firefox | firefox | Firefox 内核 |
| WebKit | webkit | WebKit 内核 |

## 输入处理

1. 解析参数（url、task、action、mode、browser、port、executablePath、mcpArgs），按三级解析策略推断。
2. 根据 action 决定操作：
   - `action=disconnect` → 调用工具断开连接
   - `action=detect` → 调用工具检测环境，返回结果
   - `action=check` → 调用工具检查 MCP 状态
   - 未指定 action 但指定了 mode → 按 mode 执行注册流程
   - 未指定 action 和 mode → 先检查 MCP 状态，已连接则跳过，未连接则提示用户选择模式
3. 注册流程（遵守注册前检查约束）：
   - 调用 `ae-playwright-mcp action=check` 检查 MCP 是否已注册且已连接
   - **已注册且已连接** → 调用 `ae-playwright-mcp action=disconnect` 先注销，再重新注册
   - **未注册或未连接** → 直接注册
   - 按 mode 执行对应注册逻辑（attach / launch / launch-headless），生成基础参数
   - 追加 mcpArgs 到基础参数之后
   - 调用 `ae-playwright-mcp action=register mode=<mode> browser=<browser> port=<port> executablePath=<path> mcpArgs=<追加参数>` 注册 MCP
4. 注册完成后，**必须**调用 `browser_tabs action=list` 验证连接可用。此步骤不可省略，调用失败说明注册未生效。
5. 若提供了 url，打开页面（遵守标签页复用约束）：
   - 调用 `browser_tabs action=list` 获取已打开标签页列表
   - 遍历标签页列表，若某标签页的 URL 与目标 URL 匹配 → 调用 `browser_tabs action=select index=<索引>` 复用该标签页
   - 无匹配标签页 → 调用 `browser_tabs action=new url=<目标URL>` 打开新标签页
6. 若提供了 task，使用 `browser_*` 工具执行任务。工具用法参考 `references/browser-tools.md`，工作流参考 `references/workflows.md`，配置选项参考 `references/configuration.md`，故障排查参考 `references/troubleshooting.md`。
7. 任务执行完毕后，**必须**关闭本次打开的标签页：调用 `browser_tabs action=list` 找到目标标签页的索引，调用 `browser_tabs action=close index=<索引>` 关闭。

## 约束

### 注册前检查约束（硬约束）

注册 MCP 前必须先调用 `ae-playwright-mcp action=check` 检查当前 MCP 注册和连接状态。可能的 status 值：`connected`、`not_registered`、`disabled`、`failed`、`needs_auth`、`needs_client_registration`、`check_failed`。

- **已注册且已连接**（`status=connected`）→ **必须**先调用 `action=disconnect` 注销，再重新注册。不得在已连接状态下直接重复注册。
- **未注册**（`status=not_registered`）→ 直接注册。
- **已注册但未连接**（`status=failed` / `needs_auth` / `needs_client_registration`）→ 先调用 `action=disconnect` 清理旧状态，再重新注册。
- **已禁用**（`status=disabled`）→ 提示用户在 opencode 配置中启用 playwright MCP。
- **检查失败**（`status=check_failed`）→ 提示无法确认 MCP 状态，由用户决定是否继续。

禁止在未检查 MCP 状态的情况下直接注册，禁止在已连接状态下不注销就重复注册。

### 标签页复用约束（硬约束）

打开标签页前必须先调用 `browser_tabs action=list` 检查是否已有同 URL 的标签页打开：

- **已有同 URL 标签页** → 调用 `browser_tabs action=select index=<索引>` 复用该标签页，禁止重复打开
- **无同 URL 标签页** → 调用 `browser_tabs action=new url=<URL>` 打开新标签页

禁止反复打开已经打开的标签页。

### 标签页清理约束（硬约束）

打开某个标签页执行完毕任务之后，**必须**关闭该标签页：

1. 任务完成后调用 `browser_tabs action=list` 获取当前标签页列表
2. 找到本次打开的标签页的索引
3. 调用 `browser_tabs action=close index=<索引>` 关闭该标签页

禁止打开标签页后不关闭。任务异常中断时，在恢复流程中也应尝试关闭遗留的标签页。

## 示例

### 接管现有 Edge 浏览器

```
/ae-playwright mode=attach browser=Edge
```

自动检测 Edge 的远程调试端口并连接。也可显式指定端口：

```
/ae-playwright mode=attach browser=Edge port=9222
```

### 新开 Chrome 浏览器

```
/ae-playwright mode=launch browser=Chrome
```

### 新开无头 Firefox 浏览器

```
/ae-playwright mode=launch-headless browser=Firefox
```

### 新开浏览器并打开页面执行任务

```
/ae-playwright https://example.com mode=launch task=填写登录表单
```

### 新开无头浏览器 + 启用 vision/pdf 能力

```
/ae-playwright mode=launch-headless mcpArgs=["--caps","vision,pdf"]
```

### 接管现有浏览器 + 启用网络控制和存储管理

```
/ae-playwright mode=attach mcpArgs=["--caps","network,storage"]
```

### 新开无头浏览器 + 模拟移动设备 + 代理

```
/ae-playwright mode=launch-headless mcpArgs=["--mobile","--proxy-server","http://myproxy:3128"]
```

### 纯透传模式（不使用 mode）

```
/ae-playwright mcpArgs=["--isolated","--headless","--browser","firefox","--caps","vision"]
```

### 通过 Playwright 扩展连接已运行的浏览器

```
/ae-playwright mcpArgs=["--extension"]
```

### 使用 JSON 配置文件

```
/ae-playwright mcpArgs=["--config","path/to/config.json"]
```

### 仅检测环境

```
/ae-playwright action=detect
```

### 检查 MCP 状态

```
/ae-playwright action=check
```

### 断开连接

```
/ae-playwright action=disconnect
```

## 安全边界

- 未完成 MCP 注册或连接确认前不得执行任何浏览器操作工具。
- 不在对话、日志或产物中明文记录密码、Token、Cookie、Authorization 头或私密路径。
- `browser_evaluate` 不得包含敏感信息或对生产环境造成副作用的操作。
- `browser_run_code_unsafe` 是 RCE 等价操作，仅在可信场景下使用，不得执行来源不明的代码。
