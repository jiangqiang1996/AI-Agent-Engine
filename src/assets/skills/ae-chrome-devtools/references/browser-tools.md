# 浏览器工具参考

本文档列出所有 `chrome-devtools_*` MCP 工具及其参数。使用前必须先通过 `ae:chrome-devtools` 技能完成 MCP 注册确认；已有配置或进程检查成功不能替代 MCP 注册确认。未完成 MCP 注册确认前不得执行任何工具；MCP 注册失败时停止浏览器流程并记录无法验证。

> 工具列表与参数对齐 [chrome-devtools-mcp 官方 tool-reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)。标注「实验性」的工具需要对应启动参数开启，详见 [configuration.md](./configuration.md)。

## 输入自动化（10 个工具）

所有交互操作通过快照中的 `uid` 定位目标元素。执行交互前应先调用 `chrome-devtools_take_snapshot` 获取最新快照。多数交互工具支持 `includeSnapshot` 参数，设为 `true` 时响应中会附带操作后的最新快照，省去单独调用快照的往返。

### `click`

点击元素，支持双击。

- **uid**（string，必填）：页面快照中的元素 uid
- **dblClick**（boolean，可选）：是否双击，默认 false
- **includeSnapshot**（boolean，可选）：响应是否附带快照，默认 false

### `drag`

将一个元素拖拽到另一个元素上。

- **from_uid**（string，必填）：被拖拽元素的 uid
- **to_uid**（string，必填）：拖拽目标元素的 uid
- **includeSnapshot**（boolean，可选）：响应是否附带快照，默认 false

### `fill`

向 input、textarea 填入文本，或从 select 选择选项；checkbox 传 "true"/"false"，radio 传 "true"。

- **uid**（string，必填）：目标元素 uid
- **value**（string，必填）：要填入的值
- **includeSnapshot**（boolean，可选）：响应是否附带快照，默认 false

### `fill_form`

一次性填写多个表单元素（input、select、checkbox、radio）。表单场景下始终优先使用此工具而非多次单独 `fill` 或 `click`，速度更快、更可靠、减少轮次。

- **elements**（array，必填）：快照中要填写的表单元素列表
- **includeSnapshot**（boolean，可选）：响应是否附带快照，默认 false

### `handle_dialog`

处理浏览器弹窗（alert / confirm / prompt）。

- **action**（enum：accept / dismiss，必填）：接受或拒绝
- **promptText**（string，可选）：prompt 弹窗中输入的文本

### `hover`

悬停在元素上。

- **uid**（string，必填）：目标元素 uid
- **includeSnapshot**（boolean，可选）：响应是否附带快照，默认 false

### `press_key`

按下按键或组合键。适用于 `fill` 无法覆盖的场景，如快捷键、导航键、特殊组合。

- **key**（string，必填）：按键或组合，如 `Enter`、`Control+A`、`Control+Shift+R`。修饰键：Control、Shift、Alt、Meta
- **includeSnapshot**（boolean，可选）：响应是否附带快照，默认 false

### `type_text`

在已聚焦的输入框中键入文本。

- **text**（string，必填）：要键入的文本
- **submitKey**（string，可选）：键入后按下的键，如 `Enter`、`Tab`、`Escape`

### `upload_file`

通过文件输入元素上传文件。

- **filePath**（string，必填）：本地文件路径
- **uid**（string，必填）：文件输入元素或会触发文件选择器的元素 uid
- **includeSnapshot**（boolean，可选）：响应是否附带快照，默认 false

### `click_at`（实验性）

在指定坐标点击。需要启动参数 `--experimentalVision=true`，通常配合计算机使用类模型根据截图生成坐标使用。

- **x**（number，必填）：x 坐标
- **y**（number，必填）：y 坐标
- **dblClick**（boolean，可选）：是否双击，默认 false
- **includeSnapshot**（boolean，可选）：响应是否附带快照，默认 false

## 导航自动化（6 个工具）

### `close_page`

通过 pageId 关闭页面。最后一个打开的页面无法关闭。

- **pageId**（number，必填）：目标页面 ID，可通过 `list_pages` 获取

### `list_pages`

列出浏览器中所有已打开的页面。无参数。注册后验证连接可用性时必须调用此工具。

### `navigate_page`

在当前页面导航（url / back / forward / reload）。

- **type**（enum：url / back / forward / reload，可选）：导航方式，默认 url
- **url**（string，可选）：目标 URL（仅 type=url 时有效）
- **ignoreCache**（boolean，可选）：reload 时是否忽略缓存
- **initScript**（string，可选）：在下次导航的任何其他脚本之前执行的 JS 脚本
- **timeout**（integer，可选）：最大等待时间（毫秒），0 表示使用默认值
- **handleBeforeUnload**（enum：accept / decline，可选）：处理 beforeunload 弹窗，默认 accept

### `new_page`

打开新标签页并加载 URL。

- **url**（string，必填）：要加载的 URL
- **background**（boolean，可选）：是否在后台打开而不置顶，默认 false
- **isolatedContext**（string，可选）：指定后页面在隔离的浏览器上下文中创建，同名上下文共享 cookie 和存储
- **timeout**（integer，可选）：最大等待时间（毫秒），0 表示默认值

### `select_page`

选择页面作为后续工具调用的上下文。

- **pageId**（number，必填）：目标页面 ID，可通过 `list_pages` 获取
- **bringToFront**（boolean，可选）：是否聚焦并置顶该页面

### `wait_for`

等待指定文本出现在页面上。

- **text**（array，必填）：非空文本列表，任一出现即返回
- **timeout**（integer，可选）：最大等待时间（毫秒），0 表示默认值

## 模拟（2 个工具）

### `emulate`

模拟设备特征。

- **viewport**（string，可选）：视口尺寸 `<width>x<height>x<devicePixelRatio>[,mobile][,touch][,landscape]`，如 `375x812x3,mobile,touch`
- **colorScheme**（enum：dark / light / auto，可选）：模拟深色或浅色模式，auto 重置
- **networkConditions**（enum：Offline / Slow 3G / Fast 3G / Slow 4G / Fast 4G，可选）：限制网络条件
- **geolocation**（string，可选）：地理位置 `<latitude>,<longitude>`，纬度 -90~90，经度 -180~180
- **userAgent**（string，可选）：模拟 UA 字符串，空字符串清除
- **cpuThrottlingRate**（number，可选）：CPU 降速倍率，1 或省略表示不限制
- **extraHttpHeaders**（string，可选）：额外 HTTP 头 JSON 字符串，如 `{"X-Custom":"value"}`，空字符串清除

### `resize_page`

调整页面窗口尺寸。

- **width**（number，必填）：页面宽度
- **height**（number，必填）：页面高度

## 性能（3 个工具）

### `performance_start_trace`

开始性能追踪，用于发现前端性能问题、Core Web Vitals（LCP / INP / CLS）和页面加载速度。

- **reload**（boolean，可选）：追踪开始后是否自动重载当前页面。设为 true 前应先用 `navigate_page` 导航到目标 URL
- **autoStop**（boolean，可选）：是否自动停止录制
- **filePath**（string，可选）：保存原始追踪数据的文件路径，如 `trace.json.gz`（压缩）或 `trace.json`

### `performance_stop_trace`

停止当前性能追踪录制。

- **filePath**（string，可选）：保存原始追踪数据的文件路径

### `performance_analyze_insight`

分析追踪结果中某个具体性能洞察的详情，如 LCP 分解、文档延迟等。

- **insightName**（string，必填）：洞察名称，如 `DocumentLatency`、`LCPBreakdown`
- **insightSetId**（string，必填）：洞察集合 ID，使用追踪结果中「Available insight sets」列表提供的 ID

## 网络（2 个工具）

### `list_network_requests`

列出当前页面自上次导航以来的所有网络请求。

- **resourceTypes**（array，可选）：按资源类型过滤，省略或空表示返回全部
- **includePreservedRequests**（boolean，可选）：设为 true 返回最近 3 次导航中保留的请求
- **pageIdx**（integer，可选）：分页页码（0-based），省略返回第一页
- **pageSize**（integer，可选）：每页最大数量，省略返回全部

> 官方文档未提及 `resourceTypes` 的可选值枚举；常见值参考 Chrome DevTools 的资源类型分类（如 `document`、`stylesheet`、`image`、`script`、`xhr`、`fetch` 等）。

### `get_network_request`

按 reqid 获取网络请求详情，省略 reqid 则返回 DevTools 网络面板中当前选中的请求。

- **reqid**（number，可选）：网络请求 ID，省略返回当前选中请求
- **requestFilePath**（string，可选）：保存请求体的 `.network-request` 文件路径，省略则内联返回
- **responseFilePath**（string，可选）：保存响应体的 `.network-response` 文件路径，省略则内联返回

## 调试（8 个工具）

### `evaluate_script`

在当前页面执行 JavaScript 函数，返回值必须可 JSON 序列化。

- **function**（string，必填）：JS 函数声明，如 `() => document.title` 或 `(el) => el.innerText`
- **args**（array，可选）：传入函数的参数列表，可传元素 uid
- **dialogAction**（string，可选）：执行期间处理弹窗，accept / dismiss / 字符串（prompt 响应），默认 accept
- **filePath**（string，可选）：保存脚本输出的文件路径，省略则内联返回

### `get_console_message`

按 msgid 获取控制台消息详情。

- **msgid**（number，必填）：消息 ID，通过 `list_console_messages` 获取

### `lighthouse_audit`

运行 Lighthouse 审计，获取无障碍、SEO、最佳实践和智能浏览（agentic browsing）评分。**不含性能审计**，性能审计使用 `performance_start_trace`。

- **device**（enum：desktop / mobile，可选）：模拟设备
- **mode**（enum：navigation / snapshot，可选）：navigation 重载并审计，snapshot 分析当前状态
- **outputDirPath**（string，可选）：报告输出目录，省略使用临时文件

### `list_console_messages`

列出当前页面自上次导航以来的所有控制台消息。

- **types**（array，可选）：按类型过滤（log / error / warn 等），省略或空返回全部
- **includePreservedMessages**（boolean，可选）：设为 true 返回最近 3 次导航中保留的消息
- **serviceWorkerId**（string，可选）：按 service worker ID 过滤
- **pageIdx**（integer，可选）：分页页码（0-based）
- **pageSize**（integer，可选）：每页最大数量

### `take_screenshot`

截取页面或指定元素的截图。

- **uid**（string，可选）：元素 uid，省略则截整页
- **format**（enum：png / jpeg / webp，可选）：图片格式，默认 png
- **quality**（number，可选）：jpeg / webp 压缩质量（0-100），png 忽略此参数
- **fullPage**（boolean，可选）：true 截取完整页面而非可视区域，与 uid 不兼容
- **filePath**（string，可选）：保存路径，省略则作为附件返回

### `take_snapshot`

获取基于可访问性树（a11y tree）的文本快照，每个元素带唯一 `uid`。**优先使用快照而非截图**定位元素，快照返回的 `uid` 是后续交互操作的唯一引用方式。快照比截图更高效，应作为页面分析的默认方式。

- **filePath**（string，可选）：保存路径，省略则作为响应返回
- **verbose**（boolean，可选）：是否包含完整 a11y 树的所有可用信息，默认 false

### `screencast_start`（实验性）

开始录制页面视频。需要启动参数 `--experimentalScreencast=true`，且环境中需有 ffmpeg。

- **filePath**（string，可选）：输出文件路径，支持 .webm / .mp4，省略则自动生成唯一路径

### `screencast_stop`（实验性）

停止当前录屏。需要启动参数 `--experimentalScreencast=true`。无参数。

## 内存（11 个工具）

> 除 `take_heapsnapshot` 外，其余内存工具需要启动参数 `--memoryDebugging=true`。详见 [configuration.md](./configuration.md)。

### `take_heapsnapshot`

捕获当前页面的 JavaScript 堆快照，用于分析内存分布和排查内存泄漏。

- **filePath**（string，必填）：保存 `.heapsnapshot` 文件的路径

### `close_heapsnapshot`（实验性）

关闭已加载的堆快照以释放内存。

- **filePath**（string，必填）：要关闭的 `.heapsnapshot` 文件路径

### `compare_heapsnapshots`（实验性）

加载两个堆快照并返回比较结果。提供 classIndex 时返回该类的详细差异，否则返回摘要差异。

- **baseFilePath**（string，必填）：基线快照路径（较早的快照）
- **currentFilePath**（string，必填）：当前快照路径（较晚的快照）
- **classIndex**（number，可选）：摘要列表中类的 0-based 索引，用于返回单个对象的详细差异

### `get_heapsnapshot_class_nodes`（实验性）

加载堆快照并返回指定类的实例及其 ID。

- **filePath**（string，必填）：堆快照文件路径
- **id**（number，必填）：类 ID，从 details 获取
- **filterName**（enum：objectsRetainedByDetachedDomNodes / objectsRetainedByConsole / objectsRetainedByEventHandlers / objectsRetainedByContexts，可选）：过滤选项
- **pageIdx** / **pageSize**（number，可选）：分页

### `get_heapsnapshot_details`（实验性）

加载堆快照并返回所有可用信息，包括统计、静态数据和聚合节点信息，支持分页。

- **filePath**（string，必填）：堆快照文件路径
- **filterName**（enum，可选）：同上
- **pageIdx** / **pageSize**（number，可选）：聚合数据分页

### `get_heapsnapshot_dominators`（实验性）

加载堆快照并返回指定节点的支配者链（dominator chain），用于识别哪些对象在阻止目标节点被回收。

- **filePath**（string，必填）：堆快照文件路径
- **nodeId**（number，必填）：节点 ID

### `get_heapsnapshot_duplicate_strings`（实验性）

加载堆快照并返回按值分组的重复字符串。

- **filePath**（string，必填）：堆快照文件路径
- **pageIdx** / **pageSize**（number，可选）：分页

### `get_heapsnapshot_edges`（实验性）

加载堆快照并返回指定节点的出边（引用关系）。

- **filePath**（string，必填）：堆快照文件路径
- **nodeId**（number，必填）：节点 ID
- **pageIdx** / **pageSize**（number，可选）：分页

### `get_heapsnapshot_retainers`（实验性）

加载堆快照并返回指定节点的保留者（retainers）。

- **filePath**（string，必填）：堆快照文件路径
- **nodeId**（number，必填）：节点 ID
- **pageIdx** / **pageSize**（number，可选）：分页

### `get_heapsnapshot_retaining_paths`（实验性）

加载堆快照并返回指定节点的保留路径，用于理解为何节点未被垃圾回收。

- **filePath**（string，必填）：堆快照文件路径
- **nodeId**（number，必填）：节点 ID
- **maxDepth**（number，可选）：最大搜索深度
- **maxNodes**（number，可选）：最大返回节点数
- **maxSiblings**（number，可选）：最大返回兄弟节点数

### `get_heapsnapshot_summary`（实验性）

加载堆快照并返回摘要统计。

- **filePath**（string，必填）：堆快照文件路径

## 扩展（5 个工具，实验性）

> 需要启动参数 `--categoryExtensions=true`。注意：此功能当前仅支持 pipe 连接，autoConnect / browserUrl / wsEndpoint 不支持，详见 [configuration.md](./configuration.md)。

### `install_extension`

从指定路径安装 Chrome 扩展。

- **path**（string，必填）：未打包扩展文件夹的绝对路径

### `list_extensions`

列出浏览器中所有已安装的 Chrome 扩展，包括名称、ID、版本和启用状态。无参数。

### `reload_extension`

按 ID 重载未打包的 Chrome 扩展。

- **id**（string，必填）：扩展 ID

### `trigger_extension_action`

按 ID 触发扩展的默认 action。

- **id**（string，必填）：扩展 ID

### `uninstall_extension`

按 ID 卸载 Chrome 扩展。

- **id**（string，必填）：扩展 ID

## 第三方开发工具（2 个工具，实验性）

> 需要启动参数 `--categoryExperimentalThirdParty=true`。

### `execute_3p_developer_tool`

执行页面暴露的第三方开发工具。

- **toolName**（string，必填）：工具名称
- **params**（string，可选）：JSON 字符串形式的参数

### `list_3p_developer_tools`

列出页面暴露的所有第三方开发工具。无参数。

## WebMCP（2 个工具，实验性）

> 需要启动参数 `--categoryExperimentalWebmcp=true`，且需 Chrome 149+ 并启用 `--enable-features=WebMCP,DevToolsWebMCPSupport`。

### `execute_webmcp_tool`

执行页面暴露的 WebMCP 工具。

- **toolName**（string，必填）：WebMCP 工具名称
- **input**（string，可选）：JSON 字符串形式的输入参数

### `list_webmcp_tools`

列出页面暴露的所有 WebMCP 工具。无参数。
