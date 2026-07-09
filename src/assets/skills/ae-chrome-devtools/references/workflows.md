# 推荐工作流

本文档提供常见浏览器任务的操作序列参考。使用前必须先通过 `ae:chrome-devtools` 技能完成 MCP 注册确认；已有配置或进程检查成功不能替代 MCP 注册确认。未完成 MCP 注册确认前不得执行任何 chrome-devtools 工具；MCP 注册失败时停止浏览器流程并记录无法验证。

## 打开页面并检查

1. `chrome-devtools_new_page` 或 `chrome-devtools_navigate_page` 打开目标 URL。
2. `chrome-devtools_take_snapshot` 获取页面快照和元素 uid。
3. 根据需要使用 `chrome-devtools_evaluate_script` 读取页面标题或 URL。
4. 必要时 `chrome-devtools_take_screenshot` 保存视觉证据。

## 表单填写与交互

1. 打开页面并获取快照。
2. 使用 `chrome-devtools_fill_form` 一次性填写多个表单字段（优先于多次单独 `fill`）。
3. 使用 `chrome-devtools_click` 提交表单或触发操作。多数交互工具支持 `includeSnapshot=true`，可在响应中直接获取操作后的最新快照，省去单独调用快照的往返。
4. 每个关键动作后重新获取快照确认状态变化。
5. 出现异步加载时使用 `chrome-devtools_wait_for` 等待，不要盲目连续操作。

## 前端问题排查

1. `chrome-devtools_list_console_messages` 查看控制台消息（可按 type 过滤 error / warn）。
2. 复现问题。
3. 读取 `chrome-devtools_list_console_messages`（过滤 error / warn）、`chrome-devtools_list_network_requests` 查看失败请求。
4. 用 `chrome-devtools_take_screenshot` 保存视觉证据，`chrome-devtools_evaluate_script` 提取运行时状态。
5. 需要深入分析时使用 `chrome-devtools_performance_start_trace` / `chrome-devtools_performance_stop_trace` 采集性能数据。

## 性能审计

1. 导航到目标页面。
2. `chrome-devtools_lighthouse_audit` 运行 Lighthouse 审计获取无障碍、SEO、最佳实践评分（不含性能）。
3. 发现性能问题时 `chrome-devtools_performance_start_trace` 开始追踪（可设 `reload=true` 自动重载，`autoStop=true` 自动停止）。
4. 操作页面复现性能场景。
5. `chrome-devtools_performance_stop_trace` 停止追踪，保存原始追踪数据。
6. `chrome-devtools_performance_analyze_insight` 分析具体性能洞察详情（如 `LCPBreakdown`、`DocumentLatency`），需使用追踪结果中提供的 `insightSetId`。

## 响应式与设备测试

1. `chrome-devtools_emulate` 设置目标设备视口和特性（如 `viewport=375x812x3,mobile,touch`）。
2. 打开页面或刷新当前页面。
3. `chrome-devtools_take_screenshot` 截取当前视口截图。
4. 如需测试弱网，在 emulate 中设置 `networkConditions`。
5. 如需测试 CPU 性能瓶颈，设置 `cpuThrottlingRate`（如 4 表示 4 倍降速）。
6. 如需测试深色模式，设置 `colorScheme=dark`。
7. 如需模拟地理位置，设置 `geolocation=<lat>,<lng>`。

## 内存泄漏排查

### 基础流程

1. 导航到目标页面。
2. `chrome-devtools_take_heapsnapshot` 捕获初始堆快照（必填 `filePath` 参数保存到文件）。
3. 执行可能触发内存泄漏的操作。
4. 再次捕获堆快照（不同文件路径）。
5. 比较两次快照分析内存增长。

### 深度内存分析（需 `--memoryDebugging=true`）

1. 按基础流程捕获两个堆快照。
2. `chrome-devtools_compare_heapsnapshots` 比较两个快照，获取摘要差异。发现增长异常的类时记录其 `classIndex`。
3. 带 `classIndex` 再次调用 `compare_heapsnapshots`，获取该类下各对象的详细差异，记录可疑对象的 `nodeId`。
4. `chrome-devtools_get_heapsnapshot_retainers` 查看该节点的保留者（谁在引用它）。
5. `chrome-devtools_get_heapsnapshot_retaining_paths` 查看完整保留路径，理解为何节点未被垃圾回收。
6. `chrome-devtools_get_heapsnapshot_dominators` 查看支配者链，找到阻止回收的根对象。
7. `chrome-devtools_get_heapsnapshot_edges` 查看节点的出边引用关系。
8. `chrome-devtools_get_heapsnapshot_duplicate_strings` 检查重复字符串占用。
9. 分析完成后 `chrome-devtools_close_heapsnapshot` 关闭快照释放内存。
10. 可用 `chrome-devtools_get_heapsnapshot_details` 获取完整统计和聚合信息，`chrome-devtools_get_heapsnapshot_summary` 获取摘要统计。

## 录屏（需 `--experimentalScreencast=true`）

1. 导航到目标页面。
2. `chrome-devtools_screencast_start` 开始录制（可指定 `filePath` 为 .webm 或 .mp4）。
3. 执行需要录制的操作序列（点击、导航、交互等）。
4. `chrome-devtools_screencast_stop` 停止录制。
5. 录屏文件可用于问题复现的证据或回归测试的视觉对照。

> 录屏功能需要 ffmpeg 安装并在 MCP 服务器 PATH 中可用。详见 [configuration.md](./configuration.md)。

## 扩展管理（需 `--categoryExtensions=true`）

1. `chrome-devtools_list_extensions` 查看当前已安装的扩展列表。
2. `chrome-devtools_install_extension` 从本地路径安装未打包的扩展。
3. 开发中扩展修改后使用 `chrome-devtools_reload_extension` 热重载。
4. `chrome-devtools_trigger_extension_action` 触发扩展的默认 action 进行测试。
5. 不再需要时 `chrome-devtools_uninstall_extension` 卸载。

> 扩展功能当前仅支持 pipe 连接模式，autoConnect / browserUrl / wsEndpoint 不兼容。详见 [configuration.md](./configuration.md)。

## 多页面与隔离上下文

1. `chrome-devtools_new_page` 打开多个页面（可设 `background=true` 在后台打开）。
2. `chrome-devtools_list_pages` 列出所有页面及其 `pageId`。
3. `chrome-devtools_select_page` 切换操作上下文到指定页面（可设 `bringToFront=true` 置顶）。
4. 需要页面间完全隔离（cookie / storage 不共享）时，`new_page` 设置 `isolatedContext` 参数为上下文名称；同名上下文内的页面共享 cookie 和存储。
5. 完成后 `chrome-devtools_close_page` 关闭不再需要的页面（最后一个页面无法关闭）。

## 并发会话（需 `--experimentalPageIdRouting=true`）

当多个 agent 或子代理共享同一个 MCP 服务器实例时：

1. MCP 服务器需以 `--experimentalPageIdRouting` 启动，使页面级工具暴露 `pageId` 并按页面 ID 路由请求。
2. 每个 agent 通过 `chrome-devtools_select_page` 选择自己的页面上下文。
3. 页面级工具调用会自动路由到 agent 选定的页面，互不干扰。
4. 如需每个会话使用独立临时 Chrome 配置文件，额外加 `--isolated` 避免共享默认用户数据目录。

> 此配置需在 opencode.json 的 MCP 配置中静态设置，不能通过 `ae-chrome-devtools-mcp` 工具动态注册时添加。详见 [configuration.md](./configuration.md)。
