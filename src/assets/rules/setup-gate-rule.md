# chrome-devtools MCP 动态注册门禁规则

**本规则为全局硬约束，适用于任何会话、任何角色需要执行浏览器操作的场景。无例外。**

无论通过技能、代理、命令、工具、bash 还是通过 prompt optimize 生成的新会话，只要需要使用 chrome-devtools-mcp 工具，就必须先通过 `ae:chrome-devtools` 技能完成浏览器 MCP 动态注册并确认连接就绪；`ae:chrome-devtools` 是浏览器 MCP 的唯一管理入口，上层技能和代理不应直接调用 `ae-chrome-devtools-mcp` 工具。chrome-devtools MCP 支持三种注册模式：autoConnect（自动发现已运行的 Chrome，无需调试端口，需 Chrome >= M144）、connect（通过浏览器类型和调试端口连接已有浏览器实例）、isolated（启动独立浏览器）。

## 核心规则

1. **ae:chrome-devtools 是唯一管理入口** — 执行任何 chrome-devtools-mcp 工具前，必须先通过 `ae:chrome-devtools` 技能完成注册并确认连接就绪；上层不应直接调用 `ae-chrome-devtools-mcp` 进行注册/检查/断开
2. **已有配置不能替代注册确认** — MCP 已在配置中声明、用户声称已配置、或本地进程检查成功，都不能替代通过 `ae:chrome-devtools` 技能完成的注册确认结果
3. **MCP 注册状态可跨会话复用** — 已注册且连接的 MCP 状态在同一工作区可跨会话复用；新会话先检查，未就绪再注册
4. **未完成注册确认前禁止执行** — MCP 未注册或未连接就绪时，不得执行任何 chrome-devtools-mcp 工具（含直接调用/子代理/封装调用）
5. **注册失败时的降级路径** — 只有当注册失败、用户拒绝启动或环境无法启动时，才允许记录"无法验证"并停止浏览器流程，不得跳过门禁

## 豁免

- `ae:chrome-devtools` 自身可以直接调用 `ae-chrome-devtools-mcp` 工具，它负责检查、动态注册、状态确认和连接管理
- 安全边界中提到 chrome-devtools-mcp 但不实际调用它的描述不强制环境准备

## 适用范围

本规则覆盖所有需要 chrome-devtools-mcp 工具的场景，包括但不限于：内置技能（`ae:web-forge` 等）、工作流代理（`@ui-architect`/`@ui-matcher`/`@logic-weaver`/`@browser-inspector`）、命令（`/ae-web-forge` 等）、prompt optimize、直接工具调用（`chrome-devtools_navigate_page`/`take_snapshot`/`click`/`fill`/`take_screenshot` 等）、子代理、以及未来新增的任何使用 chrome-devtools-mcp 工具的技能/代理/命令/工具。

## 新增消费方检查项

新增任何会使用 chrome-devtools-mcp 工具的技能、代理、命令或工具时，必须：

1. 在流程开始处通过 `ae:chrome-devtools` 技能完成注册并确认就绪
2. 不得直接调用 `ae-chrome-devtools-mcp` 注册/检查/断开
3. 未确认时不得继续执行；失败时提供降级路径，不得跳过门禁
4. prompt optimize 场景：提示词须包含通过 `ae:chrome-devtools` 完成注册的要求

## 机器可校验状态

`ae:chrome-devtools` 技能内部调用 `ae-chrome-devtools-mcp action=check` 获取当前 MCP 注册和连接状态（`name`、`status`：connected/disabled/failed/needs_auth/needs_client_registration）。MCP 未注册、注册失败或连接状态非 `connected` 时，等同于未完成浏览器 MCP 动态注册。
