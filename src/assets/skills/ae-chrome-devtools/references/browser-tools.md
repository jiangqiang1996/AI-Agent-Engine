# 浏览器工具参考

本文档列出所有 `chrome-devtools_*` MCP 工具及其用法。未完成浏览器 MCP 注册前不得执行任何工具。

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
