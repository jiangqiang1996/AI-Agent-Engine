---
name: ae:chrome-devtools
description: "chrome-devtools-mcp 浏览器能力中枢：动态 MCP 注册、页面导航、元素交互、调试诊断与性能分析"
argument-hint: "[目标页面|操作目标|排查场景]"
---

# chrome-devtools-mcp 浏览器能力中枢

本技能统一承载 chrome-devtools-mcp 的动态注册、页面导航、元素交互、页面观察、调试诊断、性能分析和设备模拟。在执行任何浏览器操作前，必须先通过 `ae:chrome-devtools` 完成 MCP 动态注册；MCP 已在配置中声明或用户声称已配置都不能替代动态注册确认，注册失败或连接异常时必须停止浏览器流程并降级。MCP 服务根据使用场景动态注册，不内置到插件配置中。所有浏览器操作通过 `chrome-devtools_*` MCP 工具完成。支持连接 Chrome、Edge、Brave、Vivaldi 等 Chromium 内核浏览器。

## 适用场景

- 用户需要在浏览器中打开新页面并进行交互或验证。
- 用户需要连接已有浏览器（保留登录态、复用 Cookie 等）进行操作。
- 用户需要获取页面快照、截图或可访问性树用于分析。
- 用户需要填写表单、点击按钮、上传文件等浏览器内交互操作。
- 用户需要调试前端问题：查看控制台日志、网络请求、页面错误。
- 用户需要分析前端性能：Lighthouse 审计、Performance Trace、堆快照。
- 用户需要在不同设备视口、网络条件或地理位置下模拟测试。
- 用户需要在页面中执行自定义 JavaScript 脚本。

## 不适用场景

- 不替代 `ae:test-browser` 的完整端到端验收流程。
- 不负责视觉审美打磨、Figma 对齐或多轮 UI 设计迭代。
- 不替代领域技能的验收、视觉判断或 Figma 对齐职责。
- 不保存、展示或编造用户凭证、Cookie、Token 或认证状态。

## 动态 MCP 注册门禁

chrome-devtools-mcp 不内置到插件 MCP 配置中，而是在技能运行时动态注册。在执行任何 `chrome-devtools_*` 浏览器工具前，必须先通过 `ae-chrome-devtools-mcp action=check` 确认 MCP 已注册且已连接。未连接时不得执行浏览器操作。

### 注册方式

#### 方式一：autoConnect 自动发现（推荐，仅支持 Chrome）

自动发现并连接已运行的 Chrome 浏览器实例，无需手动指定调试端口。

前置条件（推荐途径 A，也可用途径 B）：

途径 A：在已运行的 Chrome 中启用远程调试（推荐，无需重启浏览器）：
1. Chrome >= M144 已运行
2. 在 Chrome 地址栏访问 `chrome://inspect/#remote-debugging`，启用远程调试功能
3. 页面显示调试服务地址和端口，例如 `Server running at: 127.0.0.1:9222`

途径 B：以命令行参数启动 Chrome：
1. 关闭已运行的 Chrome，然后运行 `chrome --remote-debugging-port=<端口>`（如 `chrome --remote-debugging-port=9222`）
2. 如需保留已有配置和登录态，追加 `--user-data-dir` 参数指定用户数据目录

注册步骤：
1. 调用 `ae-chrome-devtools-mcp action=register mode=autoConnect`。
2. Chrome 弹出对话框请求允许远程调试连接，点击"允许"。
3. 注册成功后，**必须**立即调用 `chrome-devtools_list_pages` 列出当前页面以验证连接可用；如果 list_pages 调用失败，说明注册未生效，需要排查或重试。

#### 方式二：连接活跃浏览器

通过用户指定的浏览器类型和调试端口连接已有浏览器实例，复用登录态和已有会话。

前置条件（推荐途径 A，也可用途径 B）：

途径 A：在已运行的浏览器中启用远程调试（推荐，无需重启浏览器）：
1. 在浏览器地址栏访问对应页面启用远程调试：
   - **Chrome**：访问 `chrome://inspect/#remote-debugging`
   - **Edge**：访问 `edge://inspect/#remote-debugging`
   - **Brave**：访问 `brave://inspect/#remote-debugging`
   - **Vivaldi**：访问 `vivaldi://inspect/#remote-debugging`
2. 页面显示调试服务地址和端口，例如 `Server running at: 127.0.0.1:54522`
3. 将该端口号告知注册步骤

途径 B：以命令行参数启动浏览器：
1. 关闭已运行的浏览器，然后以远程调试模式重新启动：
   - **Chrome**：运行 `chrome --remote-debugging-port=<端口>`（如 `chrome --remote-debugging-port=9222`）
   - **Edge**：运行 `msedge --remote-debugging-port=<端口>`（如 `msedge --remote-debugging-port=54522`）
   - **Brave**：运行 `brave --remote-debugging-port=<端口>`
   - **Vivaldi**：运行 `vivaldi --remote-debugging-port=<端口>`
2. 如需保留已有配置和登录态，追加 `--user-data-dir` 参数指定用户数据目录

注册步骤：
1. 调用 `ae-chrome-devtools-mcp action=register browser=<浏览器> port=<端口号>`（例如 `action=register browser=Edge port=54522`）。
2. 浏览器可能弹出对话框请求允许远程调试连接，点击"允许"。
3. 注册成功后，**必须**立即调用 `chrome-devtools_list_pages` 列出当前页面以验证连接可用；如果 list_pages 调用失败，说明注册未生效，需要排查或重试。

#### 方式三：独立浏览器

适用于需要干净环境或自动化测试的场景。

1. 调用 `ae-chrome-devtools-mcp action=register mode=isolated`。
2. MCP 会启动独立的新浏览器实例（专用配置文件）。
3. 注册成功后，**必须**立即调用 `chrome-devtools_list_pages` 列出当前页面以验证连接可用；如果 list_pages 调用失败，说明注册未生效，需要排查或重试。

## 输入处理

1. 识别用户目标：页面检查、交互操作、调试问题、性能分析、设备模拟或脚本执行。
2. 若目标涉及真实浏览器操作，先完成 MCP 动态注册；未连接前不得执行浏览器工具。
3. 若用户只询问概念或工具选择，可基于本技能说明回答，但仍要提示实际执行前必须完成 MCP 注册。
4. 对涉及登录、上传、下载、剪贴板、网络拦截、授权头或代理的请求，先说明敏感边界并避免要求用户暴露密钥或密码。

## 无参数默认流程

1. 调用 `ae-chrome-devtools-mcp action=check` 检查 MCP 连接状态。
2. 已连接时，展示当前可用操作和已打开页面。
3. 未连接时，提示用户选择注册方式：
   - **autoConnect**（推荐）：`ae-chrome-devtools-mcp action=register mode=autoConnect`，自动发现已运行的 Chrome（需 Chrome >= M144）
   - **connect**：`ae-chrome-devtools-mcp action=register browser=<浏览器> port=<端口>`，需先以 `--remote-debugging-port` 启动浏览器
   - **isolated**：`ae-chrome-devtools-mcp action=register mode=isolated`，启动独立浏览器
4. 注册完成后，**必须**执行 `chrome-devtools_list_pages` 列出当前页面以验证连接可用；此步骤不可省略，list_pages 失败则说明注册未生效。
5. 根据用户目标执行后续操作。

## 页面管理

- `chrome-devtools_new_page`：打开新标签页并导航到指定 URL。
- `chrome-devtools_navigate_page`：在当前页面导航（url / back / forward / reload）。
- `chrome-devtools_list_pages`：列出所有已打开的页面。
- `chrome-devtools_select_page`：选择指定页面作为后续操作的上下文。
- `chrome-devtools_close_page`：关闭指定页面。
- `chrome-devtools_resize_page`：调整页面窗口尺寸。

## 页面观察

### 快照（优先使用）

- `chrome-devtools_take_snapshot`：获取基于可访问性树的文本快照，每个元素带有唯一 `uid` 标识。
- 优先使用快照而非截图来定位元素；快照返回的 `uid` 是后续交互操作的唯一引用方式。
- 快照比截图更高效，应作为页面分析的默认方式。

### 截图

- `chrome-devtools_take_screenshot`：截取页面或指定元素的截图，支持 png / jpeg / webp 格式。
- 用于视觉验证、问题取证或需要人工判断的场景。

### 堆快照

- `chrome-devtools_take_heapsnapshot`：捕获 JavaScript 堆快照，用于内存分析和内存泄漏排查。

## 元素交互

所有交互操作通过快照中的 `uid` 定位目标元素。执行交互前应先调用 `chrome-devtools_take_snapshot` 获取最新快照。

### 基本交互

- `chrome-devtools_click`：点击元素，支持双击。
- `chrome-devtools_fill`：向 input、textarea 填入文本，或从 select 选择选项。
- `chrome-devtools_fill_form`：一次性填写多个表单元素，优先于多次单独 `fill` 调用。
- `chrome-devtools_type_text`：在已聚焦的输入框中键入文本。
- `chrome-devtools_press_key`：按下按键或组合键，如 `Enter`、`Tab`、`Control+a`。

### 高级交互

- `chrome-devtools_hover`：悬停在元素上。
- `chrome-devtools_drag`：将元素拖拽到另一个元素上。
- `chrome-devtools_upload_file`：通过文件输入元素上传文件。
- `chrome-devtools_handle_dialog`：处理浏览器弹窗（accept / dismiss）。
- `chrome-devtools_wait_for`：等待指定文本出现在页面上。

## JavaScript 执行

- `chrome-devtools_evaluate_script`：在当前页面中执行 JavaScript 函数。
- 支持传入元素 uid 作为参数。
- 返回值必须可 JSON 序列化。
- 可用于读取页面状态、执行自定义逻辑或提取数据。

## 调试诊断

### 控制台

- `chrome-devtools_list_console_messages`：列出页面控制台消息，可按类型过滤（log / error / warn 等）。
- `chrome-devtools_get_console_message`：获取指定控制台消息的详情。

### 网络

- `chrome-devtools_list_network_requests`：列出页面网络请求，可按资源类型过滤。
- `chrome-devtools_get_network_request`：获取指定网络请求的详情，可保存请求体或响应体到文件。

## 性能分析

### Lighthouse 审计

- `chrome-devtools_lighthouse_audit`：运行 Lighthouse 审计，获取无障碍、SEO、最佳实践等评分和报告。
- 支持 desktop / mobile 设备模拟和 navigation / snapshot 模式。

### Performance Trace

- `chrome-devtools_performance_start_trace`：开始录制性能追踪，支持自动重载页面和自动停止。
- `chrome-devtools_performance_stop_trace`：停止性能追踪录制，保存原始追踪数据。
- `chrome-devtools_performance_analyze_insight`：分析性能洞察详情，如 LCP 分解、文档延迟等。

## 设备模拟

- `chrome-devtools_emulate`：模拟设备特征，包括：
  - `viewport`：设置视口尺寸和像素比（如 `375x812x3,mobile,touch`）。
  - `colorScheme`：模拟深色或浅色模式。
  - `networkConditions`：限制网络条件（Offline / Slow 3G / Fast 3G / Slow 4G / Fast 4G）。
  - `geolocation`：模拟地理位置。
  - `userAgent`：模拟用户代理字符串。
  - `cpuThrottlingRate`：CPU 降速倍率。
  - `extraHttpHeaders`：为每个请求添加额外 HTTP 头。

## 推荐工作流

### autoConnect 自动发现浏览器进行页面检查

1. `ae-chrome-devtools-mcp action=register mode=autoConnect` 自动发现并连接活跃浏览器。
2. Chrome 弹出对话框时点击"允许"。
3. **必须** `chrome-devtools_list_pages` 列出已打开页面，验证连接可用（失败则排查或重试）。
4. `chrome-devtools_select_page` 选择目标页面，或 `chrome-devtools_new_page` 打开新页面。
5. `chrome-devtools_take_snapshot` 获取页面快照和元素 uid。
6. 根据需要使用 `evaluate_script` 读取页面标题或 URL。
7. 必要时 `chrome-devtools_take_screenshot` 保存视觉证据。

### 连接活跃浏览器进行页面检查

1. `ae-chrome-devtools-mcp action=register browser=<浏览器> port=<端口>` 注册并连接活跃浏览器。
2. **必须** `chrome-devtools_list_pages` 列出已打开页面，验证连接可用（失败则排查或重试）。
3. `chrome-devtools_select_page` 选择目标页面，或 `chrome-devtools_new_page` 打开新页面。
4. `chrome-devtools_take_snapshot` 获取页面快照和元素 uid。
5. 根据需要使用 `evaluate_script` 读取页面标题或 URL。
6. 必要时 `chrome-devtools_take_screenshot` 保存视觉证据。

### 独立浏览器进行自动化测试

1. `ae-chrome-devtools-mcp action=register mode=isolated` 启动独立浏览器。
2. **必须** `chrome-devtools_list_pages` 列出已打开页面，验证连接可用（失败则排查或重试）。
3. `chrome-devtools_new_page` 打开目标页面。
4. `chrome-devtools_take_snapshot` 获取页面快照和元素 uid。
5. 执行交互和验证操作。
6. 必要时 `chrome-devtools_take_screenshot` 保存视觉证据。

### 表单填写与交互

1. 打开页面并获取快照。
2. 使用 `fill_form` 一次性填写多个表单字段（优先于单独 `fill`）。
3. 使用 `click` 提交表单或触发操作。
4. 每个关键动作后重新获取快照确认状态变化。
5. 出现异步加载时使用 `wait_for` 等待，不要盲目连续操作。

### 前端问题排查

1. `chrome-devtools_list_console_messages` 清理并查看控制台消息。
2. 复现问题。
3. 读取 `list_console_messages`（过滤 error / warn）、`list_network_requests` 查看失败请求。
4. 用 `take_screenshot` 保存视觉证据，`evaluate_script` 提取运行时状态。
5. 需要深入分析时使用 `performance_start_trace` / `performance_stop_trace` 采集性能数据。

### 性能审计

1. 导航到目标页面。
2. `chrome-devtools_lighthouse_audit` 运行 Lighthouse 审计获取评分。
3. 发现性能问题时 `performance_start_trace` 开始追踪。
4. 操作页面复现性能场景。
5. `performance_stop_trace` 停止追踪。
6. `performance_analyze_insight` 分析具体性能洞察。

### 响应式与设备测试

1. `chrome-devtools_emulate` 设置目标设备视口和特性。
2. 打开页面或刷新当前页面。
3. `chrome-devtools_take_screenshot` 截取当前视口截图。
4. 如需测试弱网，在 emulate 中设置 `networkConditions`。

### 内存泄漏排查

1. 导航到目标页面。
2. `chrome-devtools_take_heapsnapshot` 捕获初始堆快照。
3. 执行可能触发内存泄漏的操作。
4. 再次捕获堆快照。
5. 比较两次快照分析内存增长。

## 输出要求

回答或执行后必须说明：

- MCP 动态注册状态（使用的注册方式、是否已连接）；若未执行浏览器操作，说明原因。
- 使用的关键工具名称和建议的操作序列。
- 观察到的页面状态、元素 uid、截图/日志/网络证据路径。
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
- 复杂流程：按推荐工作流逐步执行，并记录关键工具调用和结果。
