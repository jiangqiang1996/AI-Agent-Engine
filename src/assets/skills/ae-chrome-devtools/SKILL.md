---
name: ae:chrome-devtools
description: "chrome-devtools-mcp 浏览器能力中枢：启动或接管浏览器，打开 URL，执行指定任务。ae:chrome-devtools 是 ae-chrome-devtools-mcp 工具的唯一管理入口，上层技能和代理不应直接调用 ae-chrome-devtools-mcp。"
argument-hint: "[url] [action] [browser] [port] [headless] [task=任务描述]"
---

# chrome-devtools-mcp 浏览器能力中枢

本技能控制 `ae-chrome-devtools-mcp` 工具如何注册浏览器 MCP，并在注册完成后打开 URL、执行浏览器任务。

**职责边界**：`ae-chrome-devtools-mcp` 工具是通用 CLI 参数透传层，接受 `mcpArgs` 数组原样追加到 `npx -y chrome-devtools-mcp@latest` 之后执行，并轮询等待连接就绪（稳定性保障）；本技能负责根据用户提供的 `browser`、`port`、`headless` 参数和 `detect` 检测结果，决策使用哪些 CLI 参数组合，构造 `mcpArgs` 传入工具。

> chrome-devtools-mcp 官方正式支持 Chrome 和 Chrome for Testing；Edge、Chromium 等其他 Chromium 内核浏览器可能可用但不保证。本技能 `detect` 可检测 Chrome、Edge、Chromium 三种常见浏览器，用于辅助决策连接方式。

## 唯一管理入口

`ae:chrome-devtools` 是 `ae-chrome-devtools-mcp` 工具的**唯一管理入口**。上层技能和代理不得直接调用 `ae-chrome-devtools-mcp`，必须通过本技能完成浏览器 MCP 的注册、检查和断开。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | 否 | 目标页面 URL。注册并验证连接后自动打开。 |
| `task` | 否 | 浏览器中执行的任务描述。 |
| `action` | 否 | MCP 操作：`check` / `register` / `disconnect` / `detect`。默认自动推断（未连接则注册）。`detect` 需显式指定。 |
| `browser` | 否 | 浏览器类型：`Chrome` / `Edge` / `Chromium`。 |
| `port` | 否 | 远程调试端口号（1-65535）。接管已有浏览器时由 detect 自动获取，用户也可显式指定。 |
| `headless` | 否 | 是否无头模式。仅启动新浏览器实例时生效。值：`true` / `false`。默认 `false`。 |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：

   | 值模式 | 推断为 |
   |--------|--------|
   | http:// 或 https:// 开头 | url |
   | register / disconnect / detect / check | action |
   | Chrome / Edge / Chromium | browser |
   | 独立纯数字 1-65535 | port |
   | true / false（且上下文提及无头/headless） | headless |

3. 顺序兜底：值特征有交集时，按 `url → action → browser → port → headless → task` 顺序匹配

**内部调用约定**：本技能被其他技能自动调用时，参数必须使用显式命名格式，不依赖值特征推断。

## 智能连接决策流程

当用户未显式指定 `port`（接管模式）或仅提供 `browser` + `headless`（启动模式）时，根据 `browser` 和 `headless` 两个参数自动决策注册方式和 `mcpArgs` 构造。这是本技能的核心职责。

### 决策矩阵

| 场景 | browser | headless | 决策 |
|------|---------|----------|------|
| 1 | 指定 | true | 直接用该浏览器启动无头实例 |
| 2 | 指定 | 未指定或 false | 检测该浏览器是否正在运行 → 是则接管，否则新启动 |
| 3 | 未指定 | true | 检测已安装浏览器 → 仅一个直接用，多个自动选一个 |
| 4 | 未指定 | 未指定或 false | 检测正在运行的浏览器 → 仅一个则接管，多个让用户选 |

### 场景 1：指定浏览器 + 无头

直接启动该浏览器的无头实例。从 detect 结果或 findBrowserExecutable 获取 `executablePath`，构造 `mcpArgs`：

```
ae-chrome-devtools-mcp action=register mcpArgs=["--isolated", "--headless", "--executablePath", "<executablePath>"]
```

### 场景 2：指定浏览器 + 非无头

先检测该浏览器是否正在运行且可接管：

```
ae-chrome-devtools-mcp action=detect browser=<指定>
```

- `debuggable=true`（运行中且已启用远程调试）→ 从检测结果取 `wsEndpoint` 构造 mcpArgs 接管：
  ```
  ae-chrome-devtools-mcp action=register mcpArgs=["--wsEndpoint", "<wsEndpoint>"]
  ```
  或使用 `--browserUrl`：
  ```
  ae-chrome-devtools-mcp action=register mcpArgs=["--browserUrl", "http://127.0.0.1:<port>"]
  ```
- `processRunning=true` 但 `debuggable=false`（运行中但未启用远程调试）→ 提示用户在浏览器中访问 `inspect#remote-debugging` 页面启用远程调试后重试
- 未运行 → 从检测结果取 `executablePath` 新启动：
  ```
  ae-chrome-devtools-mcp action=register mcpArgs=["--isolated", "--executablePath", "<executablePath>"]
  ```

### 场景 3：未指定浏览器 + 无头

检测当前环境已安装的浏览器：

```
ae-chrome-devtools-mcp action=detect
```

- 仅一个已安装 → 从检测结果取 `executablePath`，构造 mcpArgs：
  ```
  ae-chrome-devtools-mcp action=register mcpArgs=["--isolated", "--headless", "--executablePath", "<executablePath>"]
  ```
- 多个已安装 → 自动选择优先级最高的（Chrome > Edge > Chromium，即 `installedBrowsers` 列表第一个），同上构造 mcpArgs
- 无已安装 → 提示用户安装 Chrome、Edge 或 Chromium

### 场景 4：未指定浏览器 + 非无头

检测当前正在运行且可接管的浏览器：

```
ae-chrome-devtools-mcp action=detect
```

- 仅一个可调试 → 从检测结果取 `wsEndpoint` 接管：
  ```
  ae-chrome-devtools-mcp action=register mcpArgs=["--wsEndpoint", "<wsEndpoint>"]
  ```
- 多个可调试 → 向用户展示列表和端口，让用户选择一个后取其 `wsEndpoint` 接管
- 无可调试但有运行中未启用远程调试的 → 提示用户在浏览器中访问 `inspect#remote-debugging` 启用后重试
- 无运行中的但有已安装 → 选优先级最高的，从检测结果取 `executablePath` 启动新实例：
  ```
  ae-chrome-devtools-mcp action=register mcpArgs=["--isolated", "--executablePath", "<executablePath>"]
  ```

### 用户显式指定 port

用户显式提供 `port` 参数时，直接用该端口连接（跳过 detect）：

```
ae-chrome-devtools-mcp action=register mcpArgs=["--browserUrl", "http://127.0.0.1:<port>"]
```

## headless 语义推断

当用户未显式提供 `headless` 参数时，从自然语言推断：

- **推断为 `true`**：用户提及"无头"、"headless"、"不显示浏览器"、"后台运行"、"无界面"、"CI 环境"、"服务器环境"、"无人值守"、"自动化测试无界面"
- **推断为 `false`（硬约束，优先级高于 true）**：用户提及"显示浏览器"、"可视化"、"需要观察"，或任务涉及"手动登录"、"验证码"、"扫码"、"人机验证"、"需要人工干预"
- **无法推断时**：不传该参数（等同于 false），不主动询问

> 硬约束：任务涉及手动登录、验证码、扫码等需要人工干预的环节时，headless **必须**为 false，即使任务在 CI/服务器场景或用户提及了无头关键词。此规则不询问、不降级。

## 输入处理

1. 解析参数（url、task、action、browser、port、headless），按三级解析策略推断。
2. 根据 action 决定操作：
   - `action=disconnect` → 调用工具断开连接
   - `action=detect` → 调用工具检测环境，返回结果
   - `action=register` 或 MCP 未连接 → 执行注册流程
   - 未指定 action 且 MCP 已连接 → 跳过注册
3. 注册流程中构造 `mcpArgs`：
   - 用户显式提供了 `port` → `mcpArgs=["--browserUrl", "http://127.0.0.1:<port>"]`
   - 用户未提供 `port` → 按**智能连接决策流程**选择场景，调用 detect 获取 `executablePath` / `wsEndpoint`，构造对应 mcpArgs
4. 调用 `ae-chrome-devtools-mcp action=register mcpArgs=<构造的数组>` 注册 MCP
5. 注册完成后，**必须**调用 `chrome-devtools_list_pages` 验证连接可用。此步骤不可省略，list_pages 失败说明注册未生效。
6. 连接验证通过后，若提供了 url，调用 `chrome-devtools_new_page` 打开目标页面。
7. 若提供了 task，使用 `chrome-devtools_*` 工具执行任务。工具用法参考 `references/browser-tools.md`，工作流参考 `references/workflows.md`，配置选项参考 `references/configuration.md`，故障排查参考 `references/troubleshooting.md`。

## 启用远程调试的前置条件

接管已有浏览器（场景 2 和场景 4 的接管路径）需要浏览器已启用远程调试。两种途径：

**途径 A（推荐，无需重启浏览器，仅 Chrome >= M144）**：在已运行的 Chrome 地址栏访问 `chrome://inspect/#remote-debugging` 启用。

启用后可使用 `--autoConnect` 参数自动发现并连接运行中的 Chrome（从 `--channel` 参数确定的用户数据目录连接，默认 stable 通道）。Chrome 会弹出权限对话框，需点击"允许"。

> `--autoConnect` 官方仅支持 Chrome >= M144。Edge、Chromium 等其他 Chromium 内核浏览器不支持 autoConnect，请使用途径 B。

**途径 B（命令行启动，适用于所有浏览器和版本）**：关闭浏览器后以参数启动：
- Chrome：`chrome --remote-debugging-port=<端口> --user-data-dir=<路径>`
- Edge：`msedge --remote-debugging-port=<端口> --user-data-dir=<路径>`
- Chromium：`chromium --remote-debugging-port=<端口> --user-data-dir=<路径>`

> **安全要求**：出于安全原因，Chrome 要求启用远程调试端口时**必须**使用非默认的 `--user-data-dir`，确保常规浏览数据和配置文件不暴露给调试会话。调试端口开启期间，本机任何应用均可连接该端口控制浏览器，请勿在此期间浏览敏感网站。

> **浏览器启动时机**：MCP 服务器连接本身不会自动启动浏览器；浏览器在 MCP 客户端首次使用需要运行浏览器实例的工具时才自动启动。`--autoConnect` 要求用户已先启动 Chrome。

## 示例

### 打开页面并执行任务

```
/ae-chrome-devtools https://example.com 检查页面加载性能
```

检查 MCP → 未连接则按智能决策流程检测并注册 → 验证连接 → 打开页面 → 执行任务。

### 指定浏览器无头模式（场景 1）

```
/ae-chrome-devtools https://example.com browser=Edge headless=true task=检查页面加载性能
```

### 指定浏览器接管（场景 2）

```
/ae-chrome-devtools https://example.com browser=Edge task=填写登录表单
```

### 未指定浏览器无头（场景 3）

```
/ae-chrome-devtools https://example.com headless=true task=检查页面加载性能
```

### 仅检测环境

```
/ae-chrome-devtools action=detect
```

### 显式指定端口连接

```
/ae-chrome-devtools https://example.com browser=Edge port=9222 task=填写登录表单
```

## 安全边界

- 未完成 MCP 注册或连接确认前不得执行任何浏览器操作工具。
- 不在对话、日志或产物中明文记录密码、Token、Cookie、Authorization 头或私密路径。
- `evaluate_script` 不得包含敏感信息或对生产环境造成副作用的操作。
- `extraHttpHeaders` 注入请求头时不暴露真实密钥，优先由用户在外部配置。
