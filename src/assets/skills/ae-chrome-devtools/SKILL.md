---
name: ae:chrome-devtools
description: "chrome-devtools-mcp 浏览器能力中枢：启动或接管浏览器，打开 URL，执行指定任务。ae:chrome-devtools 是 ae-chrome-devtools-mcp 工具的唯一管理入口，上层技能和代理不应直接调用 ae-chrome-devtools-mcp。"
argument-hint: "[url] [action] [mode] [browser] [port] [task=任务描述]"
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

- 不替代 `ae:test-browser` 的完整端到端验收流程。
- 不负责视觉审美打磨、Figma 对齐或多轮 UI 设计迭代。
- 不替代领域技能的验收、视觉判断或 Figma 对齐职责。
- 不保存、展示或编造用户凭证、Cookie、Token 或认证状态。

## 参数说明

通过 `/ae-chrome-devtools` 命令调用时，支持以下参数：

| 参数 | 必填 | 说明 |
|------|------|------|
| `url` | 否 | 目标页面 URL。传入后，MCP 注册完成并验证连接可用时自动打开该页面。 |
| `task` | 否 | 要在浏览器中执行的任务描述。未提供时根据 url 或用户意图推断。 |
| `action` | 否 | MCP 操作：`register` / `disconnect`。默认自动推断（未连接则注册）。 |
| `mode` | 否 | 注册模式（仅 action=register 时有效）：`autoConnect` / `connect` / `isolated`。默认 `autoConnect`。 |
| `browser` | 否 | 浏览器类型：`Chrome` / `Edge` / `Brave` / `Vivaldi`。mode=connect 时必填。 |
| `port` | 否 | 远程调试端口号（1-65535）。mode=connect 时必填。 |

参数解析规则（三级策略）：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定，优先级最高
2. 值特征推断：按值的模式自动匹配参数类型（仅在参数意图上下文中生效）

   | 值模式 | 推断为 |
   |--------|--------|
   | http:// 或 https:// 开头 | url |
   | register / disconnect | action |
   | autoConnect / connect / isolated | mode |
   | Chrome / Edge / Brave / Vivaldi | browser |
   | 独立纯数字 1-65535 | port |

   ❌ 否定示例：`检查 connect 模块的性能` 中的 connect 不推断为 action

3. 顺序兜底：值特征有交集时，按 `url → action → mode → browser → port → task` 顺序匹配

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `action=register mode=autoConnect`），不依赖值特征推断。

## 输入处理

1. 解析用户输入中的参数（url、task、action、mode、browser、port），按三级解析策略推断。
2. 根据 action 参数或自动推断决定 MCP 操作：
   - 若 `action=disconnect`：调用 `ae-chrome-devtools-mcp action=disconnect` 断开连接。
   - 若 `action=register` 或 MCP 未连接：执行 MCP 注册流程，使用 mode、browser、port 透传参数。
   - 若未指定 action 且 MCP 已连接：跳过注册，直接进入后续操作。
3. MCP 注册流程中，若提供了 mode，使用指定模式；否则默认 `autoConnect`。
4. MCP 注册完成并验证连接可用后，若提供了 url，自动调用 `chrome-devtools_new_page` 打开目标页面。
5. 若提供了 task 或用户意图中包含浏览器任务，使用 `chrome-devtools_*` 工具执行任务。需要查阅工具用法时参考 `references/browser-tools.md`。
6. 若用户只询问概念或工具选择，可基于本技能说明回答，但仍要提示实际执行前必须完成 MCP 注册。
7. 对涉及登录、上传、下载、剪贴板、网络拦截、授权头或代理的请求，先说明敏感边界并避免要求用户暴露密钥或密码。

## 无参数默认流程

1. 调用 `ae-chrome-devtools-mcp action=check` 检查 MCP 连接状态。
2. 已连接时，展示当前可用操作和已打开页面。
3. 未连接时，提示用户选择注册方式：
   - **autoConnect**（推荐）：自动发现已运行的浏览器
   - **connect**：指定浏览器+端口连接
   - **isolated**：启动独立浏览器
4. 注册完成后，**必须**执行 `chrome-devtools_list_pages` 列出当前页面以验证连接可用；此步骤不可省略，list_pages 失败则说明注册未生效。
5. 根据用户目标执行后续操作。

## 带参数示例

### 打开页面并执行任务（简写）

```
/ae-chrome-devtools https://example.com 检查页面加载性能
```

流程：自动检查 MCP → 未连接则默认 autoConnect 注册 → 验证连接 → 打开 `https://example.com` → 执行性能检查任务。

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

### 不指定 URL，仅执行调试任务

```
/ae-chrome-devtools task=排查当前页面的控制台错误
```

流程：检查 MCP → 未连接则注册 → 选择已有页面 → 查看控制台消息排查错误。

## 注册方式

### autoConnect 自动发现（推荐）

自动发现并连接已运行的浏览器实例，无需手动指定调试端口。支持 Chrome、Edge、Brave、Vivaldi 等 Chromium 系浏览器。

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

适用于需要干净环境或自动化测试的场景。

1. 使用 `ae:chrome-devtools action=register mode=isolated`（默认启动 Chrome）或 `ae:chrome-devtools action=register mode=isolated browser=Edge`（启动指定浏览器）。
2. MCP 会启动独立的新浏览器实例（专用配置文件）。
3. 注册成功后，**必须**立即调用 `chrome-devtools_list_pages` 列出当前页面以验证连接可用。

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
