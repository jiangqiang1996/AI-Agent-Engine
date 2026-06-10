# 推荐工作流

本文档提供常见浏览器任务的操作序列参考。使用前必须先通过 `ae:chrome-devtools` 技能完成 MCP 注册确认；已有配置或进程检查成功不能替代 MCP 注册确认。未完成 MCP 注册确认前不得执行任何 chrome-devtools 工具；MCP 注册失败时停止浏览器流程并记录无法验证。

## 打开页面并检查

1. `chrome-devtools_new_page` 或 `chrome-devtools_navigate_page` 打开目标 URL。
2. `chrome-devtools_take_snapshot` 获取页面快照和元素 uid。
3. 根据需要使用 `chrome-devtools_evaluate_script` 读取页面标题或 URL。
4. 必要时 `chrome-devtools_take_screenshot` 保存视觉证据。

## 表单填写与交互

1. 打开页面并获取快照。
2. 使用 `chrome-devtools_fill_form` 一次性填写多个表单字段（优先于单独 `chrome-devtools_fill`）。
3. 使用 `chrome-devtools_click` 提交表单或触发操作。
4. 每个关键动作后重新获取快照确认状态变化。
5. 出现异步加载时使用 `chrome-devtools_wait_for` 等待，不要盲目连续操作。

## 前端问题排查

1. `chrome-devtools_list_console_messages` 查看控制台消息。
2. 复现问题。
3. 读取 `chrome-devtools_list_console_messages`（过滤 error / warn）、`chrome-devtools_list_network_requests` 查看失败请求。
4. 用 `chrome-devtools_take_screenshot` 保存视觉证据，`chrome-devtools_evaluate_script` 提取运行时状态。
5. 需要深入分析时使用 `chrome-devtools_performance_start_trace` / `chrome-devtools_performance_stop_trace` 采集性能数据。

## 性能审计

1. 导航到目标页面。
2. `chrome-devtools_lighthouse_audit` 运行 Lighthouse 审计获取评分。
3. 发现性能问题时 `chrome-devtools_performance_start_trace` 开始追踪。
4. 操作页面复现性能场景。
5. `chrome-devtools_performance_stop_trace` 停止追踪。
6. `chrome-devtools_performance_analyze_insight` 分析具体性能洞察。

## 响应式与设备测试

1. `chrome-devtools_emulate` 设置目标设备视口和特性。
2. 打开页面或刷新当前页面。
3. `chrome-devtools_take_screenshot` 截取当前视口截图。
4. 如需测试弱网，在 emulate 中设置 `networkConditions`。

## 内存泄漏排查

1. 导航到目标页面。
2. `chrome-devtools_take_heapsnapshot` 捕获初始堆快照。
3. 执行可能触发内存泄漏的操作。
4. 再次捕获堆快照。
5. 比较两次快照分析内存增长。
