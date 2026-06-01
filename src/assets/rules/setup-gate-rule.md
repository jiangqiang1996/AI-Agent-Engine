# chrome-devtools MCP 动态注册门禁规则

**本规则为全局硬约束，适用于任何会话、任何角色需要执行浏览器操作的场景。**

无论通过技能、代理、命令、工具、bash 还是通过 prompt optimize 生成的新会话，只要需要使用 chrome-devtools-mcp 工具，就必须先确认 MCP 已通过 `ae-chrome-devtools-mcp` 动态注册并连接就绪；MCP 未注册或未连接时必须先完成 `ae:chrome-devtools` / `/ae-chrome-devtools` 动态注册流程。chrome-devtools MCP 支持三种注册模式：autoConnect（自动发现已运行的 Chrome，无需调试端口，需 Chrome >= M144）、connect（通过浏览器类型和调试端口连接已有浏览器实例）、isolated（启动独立浏览器）。用户可在浏览器中手动调试的同时让编码代理连接同一会话，无需在手动和自动之间切换。无例外。

## 核心规则

1. **ae:chrome-devtools 是唯一前置入口** — 在执行任何 chrome-devtools-mcp 工具前，必须先通过 `ae-chrome-devtools-mcp action=check` 确认 MCP 已注册并连接就绪；未就绪时必须实际完成 `ae:chrome-devtools` / `/ae-chrome-devtools` 动态注册流程并得到连接就绪结果。
2. **已有配置不能替代 check** — chrome-devtools MCP 已在配置中声明、用户声称已配置、或本地进程检查成功，都不能替代 `ae-chrome-devtools-mcp action=check` 的机器校验结果。
3. **MCP 注册状态可跨会话复用** — 已注册且连接的 MCP 状态在同一工作区可跨会话复用；新会话只需先检查状态，未就绪时再执行动态注册流程。
4. **未完成 MCP 校验前禁止执行** — 当前工作区 MCP 未注册或未连接就绪时，不得执行任何 chrome-devtools-mcp 工具。此禁令包括但不限于：直接工具调用、通过子代理调用、通过其他工具封装调用。
5. **MCP 注册失败时的降级路径** — 只有当 MCP 注册失败、用户拒绝启动或当前环境无法启动时，才允许记录"无法验证"并停止浏览器流程，不得继续执行浏览器操作命令。

## 豁免

- `ae:chrome-devtools` 自身不需要先执行 MCP 状态检查，它负责检查、动态注册、状态确认和连接管理。
- 安全边界中提到 chrome-devtools-mcp 但不实际调用它的描述不强制环境准备。

## 适用范围

本规则覆盖的场景包括但不限于：

| 场景类型 | 示例 |
|---------|------|
| 内置技能 | `ae:test-browser`、`ae:frontend-design` 视觉验证路径 |
| 工作流代理 | `@design-iterator`、`@figma-design-sync` |
| 命令 | `/ae-test-browser`、任何生成 chrome-devtools-mcp 工具调用的自定义命令 |
| prompt optimize | 优化后的提示词引导目标新会话使用浏览器能力 |
| 直接工具调用 | `chrome-devtools_navigate_page`、`chrome-devtools_take_snapshot`、`chrome-devtools_click`、`chrome-devtools_fill`、`chrome-devtools_take_screenshot` 等 |
| 子代理 | 任何代理在其工作流中调用 chrome-devtools-mcp 工具 |
| 未来新增 | 任何未来新增的技能、代理或工具，只要使用 chrome-devtools-mcp 工具 |

## 新增消费方时的检查项

新增任何会使用 chrome-devtools-mcp 工具的技能、代理、命令或工具时，必须：

1. 在流程开始处加入 `ae-chrome-devtools-mcp action=check` 前置检查
2. 未完成 MCP 校验时，不得继续到工具调用或 bash 执行步骤
3. MCP 注册失败时提供降级路径，不得跳过门禁直接执行
4. 如为新会话生成提示词（prompt optimize 场景），提示词中必须包含 MCP 检查和 `ae:chrome-devtools` 兜底要求

## 机器可校验的 chrome-devtools MCP 注册状态

`ae:chrome-devtools-mcp action=check` 返回当前 MCP 注册和连接状态，包括 `name`、`status`（connected / disabled / failed / needs_auth / needs_client_registration）等信息。

- 消费方通过 `ae-chrome-devtools-mcp action=check` 判断当前工作区 MCP 是否已注册且连接就绪
- MCP 未注册、注册失败或连接状态非 `connected` 时，等同于未完成 chrome-devtools MCP 动态注册
