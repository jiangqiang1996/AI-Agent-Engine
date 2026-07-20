---
name: ae:playwright
description: "@playwright/mcp 浏览器能力中枢：启动或接管浏览器，打开 URL，执行指定任务。ae:playwright 是 ae-playwright-mcp 工具的唯一管理入口，上层技能和代理不应直接调用 ae-playwright-mcp。"
argument-hint: "[url] [action] [mode] [browser] [port] [headless] [task=任务描述]"
---

# @playwright/mcp 浏览器能力中枢

本技能负责根据用户参数和当前环境，决策浏览器 MCP 的注册方式，并在注册完成后打开 URL、执行浏览器任务。`ae-playwright-mcp` 工具是本技能调用的底层工具，本技能是其唯一管理入口。

> @playwright/mcp 支持 Chromium、Firefox、WebKit 三大浏览器内核。本技能涉及的"浏览器"均指该工具支持的浏览器，`detect` 可检测 Chrome、Edge、Chromium、Firefox、WebKit 五种。

## 唯一管理入口

`ae:playwright` 是 `ae-playwright-mcp` 工具的**唯一管理入口**。上层技能和代理不得直接调用 `ae-playwright-mcp`，必须通过本技能完成浏览器 MCP 的注册、检查和断开。

## 参数说明

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | 否 | 目标页面 URL。注册并验证连接后自动打开。 |
| `task` | 否 | 浏览器中执行的任务描述。 |
| `action` | 否 | MCP 操作：`check` / `register` / `disconnect` / `detect`。默认自动推断（未连接则注册）。`detect` 需显式指定。 |
| `mode` | 否 | 注册模式：`isolated` / `cdpEndpoint` / `extension` / `config`。未指定时由**默认值推断**计算。`cdpEndpoint` 通过 CDP 端点连接已有 Chromium 实例；`extension` 通过 Playwright 浏览器扩展连接已运行的 Edge/Chrome。 |
| `browser` | 否 | 浏览器类型：`Chrome` / `Edge` / `Chromium` / `Firefox` / `WebKit`。未指定时由**默认值推断**计算。 |
| `port` | 否 | 远程调试端口号（1-65535）。接管已有浏览器时由 detect 自动获取，用户也可显式指定。 |
| `headless` | 否 | 是否无头模式：`true` / `false`。未指定时由**默认值推断**计算。 |
| `configPath` | 否 | JSON 配置文件路径，仅 `mode=config` 时使用。 |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：

   | 值模式 | 推断为 |
   |--------|--------|
   | http:// 或 https:// 开头 | url |
   | register / disconnect / detect / check | action |
    | isolated / cdpEndpoint / extension / config | mode |
    | Chrome / Edge / Chromium / Firefox / WebKit | browser |
    | 独立纯数字 1-65535 | port |
    | true / false（且上下文提及无头/headless） | headless |

3. 顺序兜底：值特征有交集时，按 `url → action → mode → browser → port → headless → task` 顺序匹配

**内部调用约定**：本技能被其他技能自动调用时，参数必须使用显式命名格式，不依赖值特征推断。

## 注册模式

| 模式 | 适用场景 | 对应 CLI 参数 |
|------|----------|--------------|
| `isolated` | 启动独立浏览器实例，使用临时用户数据目录，关闭后自动清理 | `--isolated` |
| `cdpEndpoint` | 通过 CDP 端点连接运行中的 Chromium 内核浏览器，需提供 `port` | `--cdp-endpoint http://127.0.0.1:<port>` |
| `extension` | 通过 Playwright 浏览器扩展连接已运行的 Edge/Chrome（需安装扩展，不需要 port，扩展自动发现） | `--extension` |
| `config` | 使用 JSON 配置文件，适合复杂配置场景 | `--config <path>` |

用户显式指定 `mode` 时，按对应注册模式直接注册，跳过默认值推断：
- `mode=isolated` → 启动独立浏览器；`browser` 指定时用该浏览器，未指定时取优先级最高的已安装浏览器；`headless=true` 时无头启动
- `mode=cdpEndpoint` + `port` → 通过 CDP 连接运行中的 Chromium 内核浏览器；未提供 `port` 时由 detect 获取
- `mode=extension` → 通过 Playwright 扩展连接已运行的 Edge/Chrome
- `mode=config` + `configPath` → 使用 JSON 配置文件启动

## 默认值推断

当 `mode`、`browser`、`headless` 未显式指定时，按以下四个场景动态计算默认值。场景中的"浏览器"均指 @playwright/mcp 支持的浏览器（Chrome、Edge、Chromium、Firefox、WebKit）。

### 场景 1：指定浏览器 + 无头模式

条件：`browser` 已指定，`headless=true`。

决策：直接使用该浏览器进入无头模式，注册模式为 `isolated`。

流程：
1. 调用 `ae-playwright-mcp action=detect browser=<指定>` 获取 `executablePath`
2. 注册 MCP，传入参数：`--isolated`、`--browser <内核名>`、`--headless`、`--executable-path <路径>`

### 场景 2：指定浏览器 + 非无头模式

条件：`browser` 已指定，`headless` 未指定或为 `false`。

决策：分析该浏览器是否正在运行。Chromium 内核浏览器正在运行且可调试则通过 CDP 接管，否则新启动浏览器。Firefox/WebKit 不支持 CDP，始终新启动。

流程：
1. 调用 `ae-playwright-mcp action=detect browser=<指定>` 检测运行状态
2. 根据检测结果：
   - Chromium 内核（Chrome/Edge/Chromium）且正在运行且可调试 → 接管该浏览器，注册模式为 `cdpEndpoint`
   - Chromium 内核且正在运行但未启用远程调试 → 提示用户在浏览器中启用远程调试后重试
   - Firefox/WebKit 或未运行 → 新启动该浏览器，注册模式为 `isolated`

### 场景 3：未指定浏览器 + 无头模式

条件：`browser` 未指定，`headless=true`。

决策：分析当前环境安装了哪些支持的浏览器。只有一个则直接使用，有多个则自动选择一个。注册模式为 `isolated`。

流程：
1. 调用 `ae-playwright-mcp action=detect` 检测已安装浏览器
2. 根据检测结果：
   - 仅一个已安装 → 使用该浏览器，注册模式为 `isolated`、`--headless`
   - 多个已安装 → 自动选择优先级最高的（Chrome > Edge > Chromium > Firefox > WebKit），同上
   - 无已安装 → 提示用户安装 Chrome、Firefox 或 WebKit

### 场景 4：未指定浏览器 + 非无头模式

条件：`browser` 未指定，`headless` 未指定或为 `false`。

决策：分析当前是否有正在运行的支持的浏览器。有且只有一个则直接接管，有多个则让用户选择一个。

流程：
1. 调用 `ae-playwright-mcp action=detect` 检测正在运行的浏览器
2. 根据检测结果：
   - 仅一个正在运行且可调试 → 接管该浏览器，注册模式为 `cdpEndpoint`
   - 多个正在运行且可调试 → 向用户展示列表和端口，让用户选择一个后接管，注册模式为 `cdpEndpoint`
   - 有运行中但未启用远程调试的 → 提示用户启用后重试
   - 无运行中的 → 选优先级最高的已安装浏览器新启动，注册模式为 `isolated`

### 用户显式指定 port

用户显式提供 `port` 参数但未指定 `mode` 时，直接用该端口连接（跳过 detect），注册模式为 `cdpEndpoint`。

## headless 语义推断

当用户未显式提供 `headless` 参数时，从自然语言推断：

- **推断为 `true`**：用户提及"无头"、"headless"、"不显示浏览器"、"后台运行"、"无界面"、"CI 环境"、"服务器环境"、"无人值守"、"自动化测试无界面"
- **推断为 `false`（硬约束，优先级高于 true）**：用户提及"显示浏览器"、"可视化"、"需要观察"，或任务涉及"手动登录"、"验证码"、"扫码"、"人机验证"、"需要人工干预"
- **无法推断时**：不传该参数（Playwright MCP 默认 headed），不主动询问

> 硬约束：任务涉及手动登录、验证码、扫码等需要人工干预的环节时，headless **必须**为 false，即使任务在 CI/服务器场景或用户提及了无头关键词。此规则不询问、不降级。此约束仅对 `isolated` 模式生效；`cdpEndpoint` / `extension` 连接已有浏览器时不受 headless 影响。

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

1. 解析参数（url、task、action、mode、browser、port、headless），按三级解析策略推断。
2. 根据 action 决定操作：
   - `action=disconnect` → 调用工具断开连接
   - `action=detect` → 调用工具检测环境，返回结果
   - `action=register` → 执行注册流程（须遵守注册前检查约束）
   - 未指定 action 时 → 先检查 MCP 状态，已连接则跳过注册，未连接则执行注册流程
3. 注册流程（遵守注册前检查约束）：
   - 调用 `ae-playwright-mcp action=check` 检查 MCP 是否已注册且已连接
   - **已注册且已连接** → 调用 `ae-playwright-mcp action=disconnect` 先注销，再重新注册
   - **未注册或未连接** → 直接注册
   - 确定注册模式（按显式 mode > 显式 port > 默认值推断的优先级），必要时 detect 获取环境信息
   - 调用 `ae-playwright-mcp action=register` 注册 MCP
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

- **已注册且已连接**（`status=connected`）→ **必须**先调用 `action=disconnect` 注销，再调用 `action=register` 重新注册。不得在已连接状态下直接重复注册。
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

## 启用远程调试的前置条件

接管已有浏览器（场景 2 和场景 4 的接管路径）需要浏览器已启用远程调试。途径：

**途径 A（推荐，无需重启浏览器，仅 Chrome >= M144）**：在已运行的 Chrome 地址栏访问 `chrome://inspect/#remote-debugging` 启用。

启用后通过 `mode=cdpEndpoint` 注册，自动发现并连接运行中的 Chrome。Chrome 会弹出权限对话框，需点击"允许"。

> `cdpEndpoint` 仅支持 Chromium 内核浏览器（Chrome、Edge、Chromium）。Firefox 和 WebKit 不支持 CDP，需使用 `mode=isolated` 启动独立实例。

**途径 B（命令行启动，适用于所有浏览器和版本）**：关闭浏览器后以参数启动：
- Chrome：`chrome --remote-debugging-port=<端口> --user-data-dir=<路径>`
- Edge：`msedge --remote-debugging-port=<端口> --user-data-dir=<路径>`

> **安全要求**：Chrome 要求启用远程调试端口时**必须**使用非默认的 `--user-data-dir`，确保常规浏览数据和配置文件不暴露给调试会话。调试端口开启期间，本机任何应用均可连接该端口控制浏览器，请勿在此期间浏览敏感网站。

> **浏览器启动时机**：MCP 服务器连接本身不会自动启动浏览器；浏览器在 MCP 客户端首次使用需要运行浏览器实例的工具时才自动启动。

## 示例

### 打开页面并执行任务

```
/ae-playwright https://example.com 检查页面加载性能
```

检查 MCP → 未连接则按默认值推断检测并注册 → 验证连接 → 打开页面 → 执行任务。

### 指定浏览器无头模式（场景 1）

```
/ae-playwright https://example.com browser=Firefox headless=true task=检查页面加载性能
```

### 指定浏览器接管（场景 2）

```
/ae-playwright https://example.com browser=Edge task=填写登录表单
```

### 未指定浏览器无头（场景 3）

```
/ae-playwright https://example.com headless=true task=检查页面加载性能
```

### 仅检测环境

```
/ae-playwright action=detect
```

### 显式指定端口连接

```
/ae-playwright https://example.com browser=Edge port=9222 task=填写登录表单
```

### 显式指定注册模式

```
/ae-playwright https://example.com mode=cdpEndpoint port=9222 task=填写登录表单
```

```
/ae-playwright https://example.com mode=isolated browser=Firefox headless=true task=检查页面加载性能
```

## 安全边界

- 未完成 MCP 注册或连接确认前不得执行任何浏览器操作工具。
- 不在对话、日志或产物中明文记录密码、Token、Cookie、Authorization 头或私密路径。
- `browser_evaluate` 不得包含敏感信息或对生产环境造成副作用的操作。
- `browser_run_code_unsafe` 是 RCE 等价操作，仅在可信场景下使用，不得执行来源不明的代码。
