---
name: ae:chrome-devtools
description: "chrome-devtools-mcp 浏览器能力中枢：启动或接管浏览器，打开 URL，执行指定任务。ae:chrome-devtools 是 ae-chrome-devtools-mcp 工具的唯一管理入口，上层技能和代理不应直接调用 ae-chrome-devtools-mcp。"
argument-hint: "[url] [action] [mode] [browser] [port] [headless] [task=任务描述]"
---

# chrome-devtools-mcp 浏览器能力中枢

本技能负责启动新浏览器或接管已有浏览器、打开目标 URL、执行用户指定的浏览器任务。核心流程：**注册浏览器 → 验证连接 → 打开 URL → 执行任务**。

## 唯一管理入口

`ae:chrome-devtools` 是 `ae-chrome-devtools-mcp` 工具的**唯一管理入口**。上层技能和代理不得直接调用 `ae-chrome-devtools-mcp`，必须通过 `ae:chrome-devtools` 技能完成浏览器 MCP 的注册、检查和断开。`ae:chrome-devtools` 自身负责直接调用 `ae-chrome-devtools-mcp` 管理连接生命周期。

上层技能和代理需要浏览器能力时，应：
- 在流程开始处声明"需要浏览器能力，先使用 `ae:chrome-devtools` 技能完成浏览器注册"
- 等待 `ae:chrome-devtools` 完成注册并确认 MCP 连接就绪后，再使用 `chrome-devtools_*` 工具执行业务操作

## 适用场景

- 启动新浏览器实例或接管已有浏览器，打开指定 URL 并执行任务。
- 在浏览器中执行交互操作：填写表单、点击按钮、上传文件等。
- 调试前端问题：查看控制台日志、网络请求、页面错误。
- 分析前端性能：Lighthouse 审计、Performance Trace、堆快照。
- 在不同设备视口、网络条件或地理位置下模拟测试。
- 在页面中执行自定义 JavaScript 脚本。

## 不适用场景

- 不替代 `ae:web-forge` 的完整端到端验收流程。
- 不负责视觉审美打磨、Figma 对齐或多轮 UI 设计迭代。
- 不替代领域技能的验收、视觉判断或 Figma 对齐职责。
- 不保存、展示或编造用户凭证、Cookie、Token 或认证状态。

## 参数说明

通过 `/ae-chrome-devtools` 命令调用时，支持以下参数：

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | 否 | 目标页面 URL。传入后，MCP 注册完成并验证连接可用时自动打开该页面。 |
| `task` | 否 | 要在浏览器中执行的任务描述。未提供时根据 url 或用户意图推断。 |
| `action` | 否 | MCP 操作：`check` / `register` / `disconnect` / `detect`。默认自动推断（未连接则注册）。`detect` 不参与自动推断，需显式指定。 |
| `mode` | 否 | 注册模式（仅 action=register 时有效）：`connect`（默认）/ `autoConnect` / `isolated`。未显式指定时默认 `connect`，由 ae:chrome-devtools 技能按智能连接决策流程覆盖为最优模式。 |
| `browser` | 否 | 浏览器类型：`Chrome` / `Edge` / `Brave` / `Vivaldi`。mode=connect 时必填。 |
| `port` | 否 | 远程调试端口号（1-65535）。mode=connect 时必填。 |
| `headless` | 否 | 是否无头模式（不显示浏览器窗口）。仅 mode=isolated 时生效。值：`true` / `false`。默认 `false`。 |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型（仅在参数意图上下文中生效）

   | 值模式 | 推断为 |
   |--------|--------|
   | http:// 或 https:// 开头 | url |
   | register / disconnect / detect / check | action |
   | autoConnect / connect / isolated | mode |
   | Chrome / Edge / Brave / Vivaldi | browser |
   | 独立纯数字 1-65535 | port |
   | true / false（且上下文提及无头/headless） | headless |

   否定示例：`检查 connect 模块的性能` 中的 connect 不推断为 action

3. 顺序兜底：值特征有交集时，按 `url → action → mode → browser → port → headless → task` 顺序匹配

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `action=register mode=autoConnect`），不依赖值特征推断。

## 输入处理

1. 解析用户输入中的参数（url、task、action、mode、browser、port、headless），按三级解析策略推断。
2. 根据 action 参数或自动推断决定 MCP 操作：
   - 若 `action=disconnect`：调用 `ae-chrome-devtools-mcp action=disconnect` 断开连接。
   - 若 `action=detect`：调用 `ae-chrome-devtools-mcp action=detect` 检测浏览器环境，返回检测结果和建议。
   - 若 `action=register` 或 MCP 未连接：执行 MCP 注册流程。
   - 若未指定 action 且 MCP 已连接：跳过注册，直接进入后续操作。
3. MCP 注册流程中：
   - 若用户显式提供了 `mode`，使用指定模式，透传 browser、port、headless 参数。
   - 若用户未提供 `mode`，按**智能连接决策流程**（见下方章节）自动选择注册模式。
4. MCP 注册完成并验证连接可用后，若提供了 url，自动调用 `chrome-devtools_new_page` 打开目标页面。
5. 若提供了 task 或用户意图中包含浏览器任务，使用 `chrome-devtools_*` 工具执行任务。需要查阅工具用法时参考 `references/browser-tools.md`。
6. 若用户只询问概念或工具选择，可基于本技能说明回答，但仍要提示实际执行前必须完成 MCP 注册。
7. 对涉及登录、上传、下载、剪贴板、网络拦截、授权头或代理的请求，先说明敏感边界并避免要求用户暴露密钥或密码。

### headless 语义推断

headless 仅在 `mode=isolated` 下生效。当用户未显式提供该参数时，按以下规则从自然语言推断：

**headless 推断关键词：**
- 推断为 `true`：用户提及"无头"、"headless"、"不显示浏览器"、"不弹窗"、"后台运行"、"后台执行"、"无界面"、"无UI"、"静默运行"、"CI 环境"、"服务器环境"、"无人值守"、"自动化测试无界面"
- 推断为 `false`（硬约束，优先级高于 true 推断）：用户提及"显示浏览器"、"弹出浏览器"、"有界面"、"看浏览器"、"可视化"、"需要观察"，或任务涉及"手动登录"、"需要登录"、"验证码"、"扫码"、"扫码登录"、"人机验证"、"滑块验证"、"图形验证码"、"短信验证码"、"需要人工干预"、"需要人工操作"、"需要用户确认"
- 无法推断时：若上下文明确为 isolated 模式且任务为自动化测试/CI/服务器场景，默认 `true`；否则不传该参数（等同于 false）

**推断不确定时的澄清原则：**
- 仅当 headless 的意图无法从上下文自信推断，且该参数对任务执行有实质影响时，向用户提出**一个**澄清问题
- 若任务明显不需要无头模式（如调试、截图验收、交互验证），不询问 headless，直接使用默认（false）
- 若任务明显在 CI/服务器/自动化测试场景，不询问 headless，直接推断为 true
- **硬约束覆盖**：任务涉及手动登录、验证码识别、扫码、人机验证等需要人工干预的环节时，headless **必须**为 false，即使任务在 CI/服务器/自动化测试场景或用户提及了无头关键词，也以人工干预需求为准；此规则不询问、不降级

## 智能连接决策流程

当用户未显式指定 `mode` 参数时，根据 `browser` 和 `headless` 两个参数的组合，自动选择最优连接方式。此流程是 `ae:chrome-devtools` 的默认行为，用户显式指定 `mode` 时跳过智能决策，直接使用指定模式。

### 决策矩阵

| 场景 | browser | headless | 决策 |
|------|---------|----------|------|
| 1 | 指定 | true | 直接使用 isolated 模式启动该浏览器 + headless |
| 2 | 指定 | 未指定或 false | 检测该浏览器是否可接管 → 是则接管，否则 isolated 启动 |
| 3 | 未指定 | true | 检测已安装浏览器 → 仅一个则直接用，多个则自动选优先级最高的，isolated + headless |
| 4 | 未指定 | 未指定或 false | 检测可接管的浏览器 → 仅一个则接管，多个则让用户选 |

### 场景 1：指定浏览器 + 无头模式

用户指定了 `browser` 且 `headless=true`，直接启动独立浏览器：

1. 调用 `ae-chrome-devtools-mcp action=register mode=isolated browser=<指定> headless=true`
2. 验证连接 → 打开 URL → 执行任务

### 场景 2：指定浏览器 + 非无头模式

用户指定了 `browser`，`headless` 未指定或为 `false`，优先接管可调试的浏览器：

1. 调用 `ae-chrome-devtools-mcp action=detect browser=<指定>`
2. 检测结果中该浏览器 `debuggable=true`（运行中且启用远程调试）：
   - 有 port → 调用 `action=register mode=connect browser=<指定> port=<检测到的端口>`
   - 接管已有浏览器，复用登录态和会话
3. 检测结果中该浏览器 `debuggable=false`：
   - 若 `processRunning=true`（运行中但未启用远程调试）：提示用户在浏览器中访问 inspect#remote-debugging 页面启用远程调试后重试，或使用 isolated 模式启动新实例
   - 若 `processRunning=false`（未运行）：调用 `action=register mode=isolated browser=<指定>` 启动新的浏览器实例
4. 验证连接 → 打开 URL → 执行任务

### 场景 3：未指定浏览器 + 无头模式

用户未指定 `browser`，但 `headless=true`，检测已安装的浏览器：

1. 调用 `ae-chrome-devtools-mcp action=detect`
2. 仅检测到一个已安装浏览器（`installed=true`）：
   - 直接使用该浏览器：`action=register mode=isolated browser=<检测到的> headless=true`
3. 检测到多个已安装浏览器：
   - 自动选择优先级最高的（Chrome > Edge > Brave > Vivaldi，即 detect 返回结果中 installedBrowsers 的第一个）
   - 调用 `action=register mode=isolated browser=<选中> headless=true`
4. 未检测到已安装浏览器：
   - 提示用户安装 Chromium 内核浏览器
5. 验证连接 → 打开 URL → 执行任务

### 场景 4：未指定浏览器 + 非无头模式

用户未指定 `browser`，`headless` 未指定或为 `false`，优先接管可调试的浏览器：

1. 调用 `ae-chrome-devtools-mcp action=detect`
2. 仅检测到一个可调试浏览器（`debuggable=true`）：
   - 有 port → 调用 `action=register mode=connect browser=<检测到的> port=<端口>` 接管
   - connect 模式需要明确的端口参数，适用于已知端口的场景
3. 检测到多个可调试浏览器：
   - 向用户展示检测到的浏览器列表和端口
   - 让用户选择一个，然后按 `mode=connect` 注册
4. 未检测到可调试浏览器但有运行中但未启用远程调试的浏览器：
   - 提示用户在浏览器中访问 inspect#remote-debugging 页面启用远程调试后重试
   - 或使用 `action=register mode=isolated browser=<运行中的浏览器>` 启动独立实例
5. 未检测到运行中的浏览器但有已安装浏览器：
   - 按 installed 列表选择优先级最高的浏览器（Chrome > Edge > Brave > Vivaldi）
   - 调用 `action=register mode=isolated browser=<选中>`（非无头）
6. 验证连接 → 打开 URL → 执行任务

### detect action 用法

`detect` action 用于智能决策流程的环境检测阶段，是纯只读操作（不注册 MCP、不连接浏览器）。返回当前系统中：

- 已安装的 Chromium 内核浏览器（通过可执行文件路径检测）
- 运行中的浏览器进程（通过进程列表检测）
- 可接管的浏览器（运行中且启用了远程调试，通过 DevToolsActivePort 文件 + 端口可达性验证）
- 每个浏览器的检测结果和建议的连接方式

调用方式：
- 检测全部浏览器：`ae-chrome-devtools-mcp action=detect`
- 检测指定浏览器：`ae-chrome-devtools-mcp action=detect browser=Edge`

检测结果用于决策矩阵中判断使用哪种注册模式。

## 无参数默认流程

1. 调用 `ae-chrome-devtools-mcp action=check` 检查 MCP 连接状态。
2. 已连接时，展示当前可用操作和已打开页面。
3. 未连接时，按**智能连接决策流程**场景 4 处理：
   - 调用 `ae-chrome-devtools-mcp action=detect` 检测浏览器环境
   - 根据检测结果自动选择注册方式（详见智能连接决策流程章节）
4. 注册完成后，**必须**执行 `chrome-devtools_list_pages` 列出当前页面以验证连接可用；此步骤不可省略，list_pages 失败则说明注册未生效。
5. 根据用户目标执行后续操作。

## 带参数示例

### 打开页面并执行任务（简写）

```
/ae-chrome-devtools https://example.com 检查页面加载性能
```

流程：自动检查 MCP → 未连接则按智能决策流程检测浏览器环境 → 自动选择注册方式 → 验证连接 → 打开 `https://example.com` → 执行性能检查任务。

### 指定浏览器无头模式（场景 1）

```
/ae-chrome-devtools https://example.com browser=Edge headless=true task=检查页面加载性能
```

流程：直接使用 isolated 模式启动无头 Edge → 验证连接 → 打开 `https://example.com` → 执行性能检查任务。

### 指定浏览器接管运行中实例（场景 2）

```
/ae-chrome-devtools https://example.com browser=Edge task=填写登录表单
```

流程：检测 Edge 是否可接管 → 可接管则 connect 接管 → 不可接管则 isolated 启动 → 验证连接 → 打开 `https://example.com` → 填写登录表单。

### 未指定浏览器无头模式（场景 3）

```
/ae-chrome-devtools https://example.com headless=true task=检查页面加载性能
```

流程：检测已安装浏览器 → 自动选择一个 → isolated 无头启动 → 验证连接 → 打开 `https://example.com` → 执行性能检查任务。

### 仅检测浏览器环境

```
/ae-chrome-devtools action=detect
```

流程：检测所有已安装和运行中的 Chromium 内核浏览器 → 返回检测结果和建议的连接方式。

### 指定浏览器和模式注册并执行任务（显式命名）

```
/ae-chrome-devtools https://example.com action=register mode=connect browser=Edge port=9222 task=填写登录表单
```

流程：使用 connect 模式注册 Edge（端口 9222）→ 验证连接 → 打开 `https://example.com` → 填写登录表单。

> 旧写法 `--key=value` 仍然有效（如 `--action=register --mode=connect`）。

### 仅注册不执行任务

```
/ae-chrome-devtools action=register mode=isolated browser=Chrome
```

流程：启动独立 Chrome 实例 → 验证连接可用 → 等待后续指令。

### 无头模式自动化测试

```
/ae-chrome-devtools https://example.com action=register mode=isolated headless=true task=检查页面加载性能
```

流程：启动独立无头 Chrome → 验证连接 → 打开 `https://example.com` → 执行性能检查任务。

> 无头模式下不显示浏览器窗口，适合 CI 环境、服务器或无需视觉观察的自动化任务。

### 不指定 URL，仅执行调试任务

```
/ae-chrome-devtools task=排查当前页面的控制台错误
```

流程：检查 MCP → 未连接则按智能决策流程注册 → 选择已有页面 → 查看控制台消息排查错误。

## 注册方式

### autoConnect 自动发现（推荐）

自动发现并连接已运行的浏览器实例，无需手动指定调试端口。支持 Chrome、Edge、Brave、Vivaldi 等 Chromium 系浏览器。

> autoConnect 模式需要 Chrome >= M144；非 Chrome 浏览器需对应版本支持 autoConnect 协议。版本不足时改用 connect 模式。

前置条件（推荐途径 A，也可用途径 B）：

途径 A：在已运行的浏览器中启用远程调试（推荐，无需重启浏览器）：
1. 浏览器已运行
2. 在浏览器地址栏访问对应页面启用远程调试：
   - **Chrome**：访问 `chrome://inspect/#remote-debugging`
   - **Edge**：访问 `edge://inspect/#remote-debugging`
   - **Brave**：访问 `brave://inspect/#remote-debugging`
   - **Vivaldi**：访问 `vivaldi://inspect/#remote-debugging`
3. 页面显示调试服务地址和端口，例如 `Server running at: 127.0.0.1:9222`

途径 B：以命令行参数启动浏览器：
1. 关闭已运行的浏览器，然后运行对应的启动命令：
   - **Chrome**：`chrome --remote-debugging-port=<端口>`
   - **Edge**：`msedge --remote-debugging-port=<端口>`
   - **Brave**：`brave --remote-debugging-port=<端口>`
   - **Vivaldi**：`vivaldi --remote-debugging-port=<端口>`
2. 如需保留已有配置和登录态，追加 `--user-data-dir` 参数指定用户数据目录

注册步骤：
1. 使用 `ae:chrome-devtools action=register mode=autoConnect`（自动发现 Chrome）或 `ae:chrome-devtools action=register mode=autoConnect browser=Edge`（指定其他浏览器）。
2. 浏览器弹出对话框请求允许远程调试连接，点击"允许"。
3. 注册成功后，**必须**立即调用 `chrome-devtools_list_pages` 列出当前页面以验证连接可用；如果 list_pages 调用失败，说明注册未生效，需要排查或重试。

### connect 连接活跃浏览器

通过用户指定的浏览器类型和调试端口连接已有浏览器实例，复用登录态和已有会话。

前置条件与 autoConnect 相同。

注册步骤：
1. 使用 `ae:chrome-devtools action=register mode=connect browser=<浏览器> port=<端口号>`（例如 `browser=Edge port=54522`）。
2. 浏览器可能弹出对话框请求允许远程调试连接，点击"允许"。
3. 注册成功后，**必须**立即调用 `chrome-devtools_list_pages` 列出当前页面以验证连接可用。

### isolated 独立浏览器

适用于需要干净环境或自动化测试的场景。支持 `headless`（无头模式）选项。

1. 使用 `ae:chrome-devtools action=register mode=isolated`（默认启动 Chrome）或 `ae:chrome-devtools action=register mode=isolated browser=Edge`（启动指定浏览器）。
2. 需要无头模式时追加 `headless=true`。
3. MCP 会启动独立的新浏览器实例（专用配置文件）。
4. 注册成功后，**必须**立即调用 `chrome-devtools_list_pages` 列出当前页面以验证连接可用。

> headless 仅在 isolated 模式下生效。connect 和 autoConnect 连接的是已有浏览器实例，无法控制其是否显示窗口。传入时工具会返回提示。

## 输出要求

回答或执行后必须说明：

- MCP 动态注册状态（使用的注册方式、是否已连接）；若未执行浏览器操作，说明原因。
- 执行的任务内容和使用的工具序列。
- 观察到的页面状态、关键证据（快照/截图/日志/网络）。
- 未验证项、需要用户手动完成的步骤和敏感信息处理边界。

## 安全边界

- 未完成 MCP 动态注册或连接确认前不得执行任何浏览器操作工具。
- 不在对话、日志或产物中明文记录密码、Token、Cookie、Authorization 头或私密路径细节。
- 对下载、上传、剪贴板、网络拦截、授权头、跨域导航和持久 profile 操作保持最小权限。
- `evaluate_script` 执行的脚本不得包含敏感信息或对生产环境造成副作用的操作。
- 使用 `extraHttpHeaders` 注入请求头时不要暴露真实密钥；优先由用户在外部配置。
- 需要限制导航范围时优先使用 `emulate` 的相关选项或用户确认。

## 验证方式

- 概念说明类任务：确认工具选择与 `chrome-devtools_*` 工具描述一致。
- 实际执行类任务：至少提供 `take_snapshot`、`take_screenshot`、`list_console_messages`、`list_network_requests` 或 `evaluate_script` 中一种可观察证据。
- 复杂流程：按 `references/workflows.md` 推荐工作流逐步执行，并记录关键工具调用和结果。
