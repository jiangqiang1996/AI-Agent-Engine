# 推荐工作流

本文档提供常见浏览器任务的操作序列参考。使用前必须先通过 `ae:playwright` 技能完成 MCP 注册确认；已有配置或进程检查成功不能替代 MCP 注册确认。未完成 MCP 注册确认前不得执行任何浏览器工具；MCP 注册失败时停止浏览器流程并记录无法验证。

## 打开页面并检查

1. `browser_tabs action=new url=<URL>` 打开新标签页，或 `browser_navigate url=<URL>` 在当前标签页导航。
2. `browser_snapshot` 获取页面快照和元素 ref。
3. 根据需要使用 `browser_evaluate function="() => document.title"` 读取页面标题或 URL。
4. 必要时 `browser_take_screenshot filename=ae/screenshot/out.png` 保存视觉证据。

## 表单填写与交互

1. 打开页面并获取快照。
2. 使用 `browser_fill_form fields=[...]` 一次性填写多个表单字段（优先于多次单独 `browser_type`）。
3. 使用 `browser_click target=<ref>` 提交表单或触发操作。
4. 每个关键动作后重新获取快照确认状态变化。
5. 出现异步加载时使用 `browser_wait_for text="目标文本"` 等待，不要盲目连续操作。

## 前端问题排查

1. `browser_console_messages level=error` 查看控制台错误消息。
2. 复现问题。
3. 读取 `browser_console_messages`（过滤 error / warning）、`browser_network_requests` 查看失败请求。
4. 用 `browser_take_screenshot` 保存视觉证据，`browser_evaluate` 提取运行时状态。
5. 需要深入分析时使用 `browser_start_tracing` / `browser_stop_tracing` 采集性能数据（需 `--caps=devtools`）。

## 响应式与设备测试

1. 启动时通过 `--device "iPhone 15"` 或 `--viewport-size 1280x720` 设置目标设备视口。
2. 打开页面或刷新当前页面。
3. `browser_take_screenshot` 截取当前视口截图。
4. 如需测试移动端，启动时使用 `--mobile` 参数。
5. 如需调整窗口尺寸，使用 `browser_resize width=375 height=812`。

## 多标签页管理

1. `browser_tabs action=new url=<URL>` 打开新标签页。
2. `browser_tabs action=list` 列出所有标签页及其索引。
3. `browser_tabs action=select index=<索引>` 切换操作上下文到指定标签页。
4. 完成后 `browser_tabs action=close index=<索引>` 关闭不再需要的标签页。

## 元素搜索

1. `browser_find text="登录"` 在页面快照中搜索文本，返回匹配节点及上下文。
2. `browser_find regex="/error/i"` 使用正则表达式搜索。
3. 比 `browser_snapshot` 获取完整快照更高效，适合只需定位元素的场景。

## 代码生成

@playwright/mcp 默认启用 TypeScript 代码生成（`--codegen typescript`）。操作浏览器时，MCP 会自动生成对应的 Playwright 代码，可用于后续编写自动化测试脚本。如需禁用，启动时传入 `--codegen none`。

## 存储状态管理（需 --caps=storage）

1. 登录后调用 `browser_storage_state filename=auth.json` 保存当前存储状态。
2. 下次启动时通过 `--storage-state auth.json` 恢复登录态，无需重新登录。
3. 可使用 `browser_cookie_list` / `browser_localstorage_list` 等工具检查具体存储内容。

## 网络模拟（需 --caps=network）

1. `browser_route pattern="**/api/users" status=200 body="[]"` 模拟 API 响应。
2. `browser_route_list` 查看所有活跃的路由规则。
3. `browser_unroute pattern="**/api/users"` 移除特定路由。
4. `browser_network_state_set state=offline` 模拟离线环境。
