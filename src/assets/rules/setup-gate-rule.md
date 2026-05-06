# agent-browser setup 前置门禁规则

**本规则为全局硬约束，适用于任何会话中任何角色执行任何浏览器操作的场景。**

无论通过技能、代理、命令、工具、bash、MCP 还是通过 prompt optimize 生成的新会话，只要意图执行 `agent-browser` 命令，就必须先完成 `ae:setup` / `/ae-setup`。无例外。

## 核心规则

1. **ae:setup 是唯一前置入口** — 在当前会话执行任何 `agent-browser` 命令前，必须先实际完成 `ae:setup` / `/ae-setup` 并得到环境就绪结果。
2. **已有安装不能替代 setup** — `agent-browser` 已安装、`command -v` / `Get-Command` / `where` 检查成功、用户声称已安装或本地 CLI 可用性检查成功，都不能替代本轮 setup。
3. **setup 不可跨会话迁移** — 源会话已执行过 setup 不能替代目标新会话的 setup；每个新会话必须自行完成 setup。
4. **未完成 setup 前禁止执行** — 当前会话未实际完成 setup 时，不得执行任何 `agent-browser` 命令。此禁令包括但不限于：直接 bash 调用、通过工具封装调用、通过 MCP 服务器调用、通过子代理调用。
5. **setup 失败时的降级路径** — 只有当 `ae:setup` 安装失败、用户拒绝安装或当前环境无法安装时，才允许记录"无法验证"并停止浏览器流程，不得继续执行 `agent-browser` 命令。

## 豁免

- `ae:setup` 自身不需要先执行自己，它负责检查、安装、复检。
- 安全边界中提到 `agent-browser` 但不实际调用它的描述不强制 setup。

## 适用范围

本规则覆盖的场景包括但不限于：

| 场景类型 | 示例 |
|---------|------|
| 内置技能 | `ae:test-browser`、`ae:frontend-design` 视觉验证路径 |
| 工作流代理 | `@design-iterator`、`@figma-design-sync` |
| 命令 | `/ae-test-browser`、任何生成 `agent-browser` 命令的自定义命令 |
| prompt optimize | 优化后提示词引导目标新会话使用浏览器能力 |
| 直接 bash | `agent-browser open/snapshot/click/fill/type/press/wait/screenshot` |
| 子代理 | 任何代理在其工作流中调用 `agent-browser` |
| 未来新增 | 任何未来新增的技能、代理或工具，只要执行 `agent-browser` 命令 |

## 新增消费方时的检查项

新增任何会执行 `agent-browser` 的技能、代理、命令或工具时，必须：

1. 在流程开始处加入 setup 前置检查
2. 未完成 setup 时，不得继续到可复制命令区或 bash 执行区
3. setup 失败时提供降级路径，不得跳过 setup 直接执行
4. 如为新会话生成提示词（prompt optimize 场景），提示词中必须包含 setup 要求

## 机器可校验的 setup 完成证明

`ae:setup` 完成时会写入 `.opencode/ae/setup-proof.json`，包含 `sessionId`、`completedAt`、`version` 字段。

- 消费方可读取该文件，比对 `sessionId` 与当前会话是否一致来判断 setup 是否已在当前会话完成
- 该证明文件绑定会话 ID，天然防止跨会话迁移
- 证明文件缺失或会话 ID 不匹配时，等同于未完成 setup
