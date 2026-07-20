# 浏览器工具参考

本文档列出 `@playwright/mcp` v0.0.78 的全部 78 个 `browser_*` MCP 工具及其参数。使用前必须先通过 `ae:playwright` 技能完成 MCP 注册确认；已有配置或进程检查成功不能替代 MCP 注册确认。未完成 MCP 注册确认前不得执行任何工具；MCP 注册失败时停止浏览器流程并记录无法验证。

> 工具列表与参数对齐 [@playwright/mcp 官方 README](https://github.com/microsoft/playwright-mcp#tools)。

## 元素引用

所有交互操作通过 `browser_snapshot` 快照中的 `ref` 定位目标元素。执行交互前应先调用 `browser_snapshot` 获取最新快照。交互工具的 `target` 参数传入快照中元素的 `ref` 值，也可传入唯一的 CSS 选择器。`element` 参数是可选的人类可读描述，用于权限展示。

## 导航

### `browser_navigate`

导航到指定 URL。

- **url**（string，必填）：目标 URL

### `browser_navigate_back`

返回上一页。无参数。

### `browser_navigate_forward`

前进到下一页。无参数。

### `browser_reload`

重新加载当前页面。无参数。

## 快照与截图

### `browser_snapshot`

捕获页面的无障碍快照。**优先使用快照而非截图**定位元素，快照返回的 `ref` 是后续交互操作的唯一引用方式。

- **target**（string，可选）：元素 ref 或选择器，仅快照该元素的子树
- **filename**（string，可选）：保存到 Markdown 文件而非返回响应
- **depth**（number，可选）：限制快照树深度
- **boxes**（boolean，可选）：包含每个元素的边界框 `[box=x,y,width,height]`，坐标为视口相对 CSS 像素

### `browser_take_screenshot`

截取页面或指定元素的截图。**不能基于截图执行操作**，操作请使用 `browser_snapshot`。

- **target**（string，可选）：元素 ref 或选择器，省略则截整页
- **element**（string，可选）：人类可读描述
- **type**（string，必填）：图片格式，传 `png` 或 `jpeg`（playwright-mcp schema 标注为必填）
- **filename**（string，可选）：保存路径，默认 `page-{timestamp}.{png|jpeg}`
- **fullPage**（boolean，可选）：true 截取完整可滚动页面而非可视区域，与 target 不兼容
- **scale**（string，必填）：传 `css`（CSS 像素，较小）或 `device`（设备像素，较大）（playwright-mcp schema 标注为必填）

### `browser_find`

在页面快照中搜索文本或正则表达式，返回匹配的快照节点及上下文。比获取完整快照更高效。**`text` 和 `regex` 至少传入一个，不可同时传入。**

- **text**（string，可选）：纯文本搜索（不区分大小写）
- **regex**（string，可选）：正则表达式搜索，如 `/error/i`

## 交互

### `browser_click`

点击元素。

- **target**（string，必填）：元素 ref 或选择器
- **element**（string，可选）：人类可读描述
- **doubleClick**（boolean，可选）：是否双击
- **button**（string，可选）：按钮，默认 `left`
- **modifiers**（array，可选）：修饰键

### `browser_hover`

悬停在元素上。

- **target**（string，必填）：元素 ref 或选择器
- **element**（string，可选）：人类可读描述

### `browser_type`

在可编辑元素中输入文本。

- **target**（string，必填）：元素 ref 或选择器
- **text**（string，必填）：要输入的文本
- **element**（string，可选）：人类可读描述
- **submit**（boolean，可选）：输入后按 Enter 提交
- **slowly**（boolean，可选）：逐字符输入，触发 key handler

### `browser_press_sequentially`

在键盘上逐字符输入文本。

- **text**（string，必填）：要输入的文本
- **submit**（boolean，可选）：输入后按 Enter 提交

### `browser_press_key`

按下按键。

- **key**（string，必填）：按键名，如 `ArrowLeft`、`a`、`Enter`

### `browser_keydown`

按下按键（不释放）。用于精细控制按键状态。

- **key**（string，必填）：按键名

### `browser_keyup`

释放按键。

- **key**（string，必填）：按键名

### `browser_fill_form`

一次性填写多个表单字段。

- **fields**（array，必填）：要填写的字段列表

### `browser_select_option`

在下拉选择框中选择选项。

- **target**（string，必填）：元素 ref 或选择器
- **values**（array，必填）：要选择的值列表
- **element**（string，可选）：人类可读描述

### `browser_check`

勾选复选框或单选按钮。

- **target**（string，必填）：元素 ref 或选择器
- **element**（string，可选）：人类可读描述

### `browser_uncheck`

取消勾选复选框或单选按钮。

- **target**（string，必填）：元素 ref 或选择器
- **element**（string，可选）：人类可读描述

### `browser_drag`

在两个元素之间拖拽。

- **startTarget**（string，必填）：源元素 ref 或选择器
- **endTarget**（string，必填）：目标元素 ref 或选择器
- **startElement** / **endElement**（string，可选）：人类可读描述

### `browser_drop`

将文件或数据拖放到元素上。**`paths` 和 `data` 至少传入一个。**

- **target**（string，必填）：元素 ref 或选择器
- **element**（string，可选）：人类可读描述
- **paths**（array，可选）：文件绝对路径列表
- **data**（object，可选）：MIME 类型到字符串值的映射

### `browser_file_upload`

上传文件。

- **paths**（array，可选）：文件绝对路径列表，省略则取消文件选择器

### `browser_handle_dialog`

处理浏览器弹窗（alert / confirm / prompt）。

- **accept**（boolean，必填）：是否接受
- **promptText**（string，可选）：prompt 弹窗的输入文本

### `browser_wait_for`

等待文本出现/消失或指定时间。**`time`、`text`、`textGone` 至少传入一个。**

- **time**（number，可选）：等待时间（秒）
- **text**（string，可选）：等待出现的文本
- **textGone**（string，可选）：等待消失的文本

## 标签页管理

### `browser_tabs`

管理浏览器标签页：列出、新建、关闭、选择。

- **action**（string，必填）：操作类型
  - `list` — 列出所有标签页
  - `new` — 打开新标签页（需 `url`）
  - `close` — 关闭标签页（`index` 省略则关闭当前）
  - `select` — 切换到指定标签页
- **index**（number，可选）：标签页索引，用于 `close` / `select`
- **url**（string，可选）：新标签页的 URL，用于 `new`

## 窗口控制

### `browser_resize`

调整浏览器窗口尺寸。

- **width**（number，必填）：宽度
- **height**（number，必填）：高度

### `browser_close`

关闭浏览器页面。无参数。

## 控制台与网络

### `browser_console_messages`

返回控制台消息。

- **level**（string，必填）：消息级别，传 `error`、`warning`、`info` 或 `debug`（playwright-mcp schema 标注为必填）
- **all**（boolean，可选）：返回会话开始以来的所有消息，而非仅上次导航后的
- **filename**（string，可选）：保存到文件

### `browser_console_clear`

清除所有控制台消息。无参数。

### `browser_network_requests`

返回网络请求编号列表。

- **static**（boolean，必填）：是否包含静态资源（playwright-mcp schema 标注为必填，通常传 `false`）
- **filter**（string，可选）：URL 正则过滤
- **filename**（string，可选）：保存到文件

### `browser_network_request`

返回单个网络请求的完整详情。

- **index**（integer，必填）：1-based 请求编号
- **part**（string，可选）：仅返回请求的某部分
- **filename**（string，可选）：保存到文件

### `browser_network_clear`

清除所有网络请求记录。无参数。

## 代码执行

### `browser_evaluate`

在页面或元素上执行 JavaScript 表达式，返回值必须可 JSON 序列化。

- **function**（string，必填）：JS 函数声明，如 `() => document.title` 或 `(element) => element.innerText`
- **target**（string，可选）：元素 ref 或选择器
- **element**（string，可选）：人类可读描述
- **filename**（string，可选）：保存结果到文件

### `browser_run_code_unsafe`

执行 Playwright 代码片段。**不安全**：在 Playwright 服务器进程中执行任意 JavaScript，RCE 等价。

- **code**（string，可选）：JS 函数，如 `async (page) => { await page.getByRole('button').click(); return await page.title(); }`
- **filename**（string，可选）：从文件加载代码

## 能力工具（需 --caps 启用）

### vision 能力（--caps=vision）

坐标交互工具，通常配合视觉模型使用：

- `browser_mouse_click_xy` — 在坐标 点击
  - **x**（number，必填）、**y**（number，必填）
  - **button**（string，可选，默认 `left`）
  - **clickCount**（number，可选，默认 1）
  - **delay**（number，可选，默认 0，按下到释放间隔毫秒）
- `browser_mouse_move_xy` — 移动鼠标到坐标
  - **x**（number，必填）、**y**（number，必填）
- `browser_mouse_drag_xy` — 从坐标拖拽到坐标
  - **startX** / **startY** / **endX** / **endY**（number，必填）
- `browser_mouse_down` — 按下鼠标
  - **button**（string，可选，默认 `left`）
- `browser_mouse_up` — 释放鼠标
  - **button**（string，可选，默认 `left`）
- `browser_mouse_wheel` — 滚动鼠标滚轮
  - **deltaX**（number，必填）、**deltaY**（number，必填）

### pdf 能力（--caps=pdf）

- `browser_pdf_save` — 将当前页面保存为 PDF
  - **filename**（string，可选）：保存路径，默认 `page-{timestamp}.pdf`

### devtools 能力（--caps=devtools）

开发者工具能力：

- `browser_start_tracing` — 开始性能追踪。无参数
- `browser_stop_tracing` — 停止性能追踪。无参数
- `browser_start_video` — 开始视频录制
  - **filename**（string，可选）：保存路径
  - **size**（object，可选）：视频尺寸
- `browser_stop_video` — 停止视频录制。无参数
- `browser_video_chapter` — 添加视频章节标记
  - **title**（string，必填）：章节标题
  - **description**（string，可选）：章节描述
  - **duration**（number，可选）：章节卡片显示时长（毫秒）
- `browser_video_show_actions` — 显示操作录制叠加层
  - **duration**（number，可选）：每个操作标注停留时长（毫秒），默认 500
  - **position**（string，可选）：标注位置，默认 `top-right`
  - **cursor**（string，可选）：光标装饰，`pointer`（默认）或 `none`
- `browser_video_hide_actions` — 隐藏操作录制叠加层。无参数
- `browser_highlight` — 高亮元素
  - **target**（string，必填）：元素 ref 或选择器
  - **element**（string，可选）：人类可读描述
  - **style**（string，可选）：额外内联 CSS，如 `outline: 2px dashed red`
- `browser_hide_highlight` — 取消高亮
  - **target**（string，可选）：元素 ref 或选择器
  - **element**（string，可选）：人类可读描述
- `browser_annotate` — 打开 Playwright Dashboard 标注模式。无参数
- `browser_resume` — 恢复暂停的脚本执行
  - **step**（boolean，可选）：true 时执行下一步前再次暂停
  - **location**（string，可选）：在指定 `<file>:<line>` 暂停

### network 能力（--caps=network）

网络控制能力：

- `browser_network_state_set` — 设置网络状态
  - **state**（string，必填）：`offline` 或 `online`
- `browser_route` — 模拟匹配 URL 模式的网络请求
  - **pattern**（string，必填）：URL 模式，如 `**/api/users`
  - **status**（number，可选）：HTTP 状态码，默认 200
  - **body**（string，可选）：响应体
  - **contentType**（string，可选）：Content-Type 头
  - **headers**（array，可选）：`Name: Value` 格式的头
  - **removeHeaders**（string，可选）：逗号分隔的要移除的请求头名
- `browser_route_list` — 列出所有活跃的网络路由。无参数
- `browser_unroute` — 移除网络路由
  - **pattern**（string，可选）：URL 模式，省略则移除全部

### storage 能力（--caps=storage）

存储管理能力：

**Cookie 系列：**
- `browser_cookie_list` — 列出所有 cookie
  - **domain**（string，可选）、**path**（string，可选）
- `browser_cookie_get` — 获取指定 cookie
  - **name**（string，必填）
- `browser_cookie_set` — 设置 cookie
  - **name**（string，必填）、**value**（string，必填）
  - **domain** / **path**（string，可选）
  - **expires**（number，可选）：Unix 时间戳
  - **httpOnly** / **secure**（boolean，可选）
  - **sameSite**（string，可选）
- `browser_cookie_delete` — 删除指定 cookie
  - **name**（string，必填）
- `browser_cookie_clear` — 清除所有 cookie。无参数

**localStorage 系列：**
- `browser_localstorage_list` — 列出所有 localStorage。无参数
- `browser_localstorage_get` — 获取 localStorage 项
  - **key**（string，必填）
- `browser_localstorage_set` — 设置 localStorage 项
  - **key**（string，必填）、**value**（string，必填）
- `browser_localstorage_delete` — 删除 localStorage 项
  - **key**（string，必填）
- `browser_localstorage_clear` — 清除所有 localStorage。无参数

**sessionStorage 系列：**
- `browser_sessionstorage_list` — 列出所有 sessionStorage。无参数
- `browser_sessionstorage_get` — 获取 sessionStorage 项
  - **key**（string，必填）
- `browser_sessionstorage_set` — 设置 sessionStorage 项
  - **key**（string，必填）、**value**（string，必填）
- `browser_sessionstorage_delete` — 删除 sessionStorage 项
  - **key**（string，必填）
- `browser_sessionstorage_clear` — 清除所有 sessionStorage。无参数

**存储状态：**
- `browser_storage_state` — 保存存储状态到文件
  - **filename**（string，可选）：默认 `storage-state-{timestamp}.json`
- `browser_set_storage_state` — 从文件恢复存储状态（清除现有 cookie 和 localStorage 后恢复）
  - **filename**（string，必填）：存储状态文件路径

### config 能力（--caps=config）

- `browser_get_config` — 获取合并 CLI 选项、环境变量和配置文件后的最终配置。无参数

### testing 能力（--caps=testing）

测试断言能力，用于验证页面状态：

- `browser_verify_element_visible` — 验证元素可见
  - **role**（string，必填）：元素角色，来自快照如 `- {ROLE} "Accessible Name":`
  - **accessibleName**（string，必填）：无障碍名称，来自快照如 `- role "{ACCESSIBLE_NAME}"`
- `browser_verify_text_visible` — 验证文本可见
  - **text**（string，必填）：文本，来自快照如 `- role "Accessible Name": {TEXT}` 或 `- text: {TEXT}`
- `browser_verify_list_visible` — 验证列表可见
  - **element**（string，必填）：列表描述
  - **target**（string，必填）：列表元素 ref 或选择器
  - **items**（array，必填）：要验证的列表项
- `browser_verify_value` — 验证元素值
  - **type**（string，必填）：元素类型
  - **element**（string，必填）：元素描述
  - **target**（string，必填）：元素 ref 或选择器
  - **value**（string，必填）：期望值，复选框用 `true` / `false`
- `browser_generate_locator` — 为元素生成测试用定位器
  - **target**（string，必填）：元素 ref 或选择器
  - **element**（string，可选）：人类可读描述
