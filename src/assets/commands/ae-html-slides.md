---
description: 生成或更新 HTML 幻灯片，统一调用 ae:web-forge 实现视觉设计并附加幻灯片标准约束
model: $deep
subtask: false
---

使用 `ae:web-forge` 技能处理这次请求，并沿用参数：`$ARGUMENTS`。

在调用 `ae:web-forge` 前，必须将以下幻灯片 HTML 标准格式约束作为硬性要求传递给 `ae:web-forge`，确保产出的 HTML 满足幻灯片演示场景。

## 幻灯片 HTML 标准约束

### 文件结构

- 单一自包含 HTML 文件，所有 CSS 和 JavaScript 内联
- `<section class="slide">` 表示一张幻灯片，每张幻灯片独占一屏
- 第一张幻灯片为封面，最后一张为结束页（可选）
- 不得依赖外部图片以外的本地资源

### 交互要求（两者必须同时实现）

1. **键盘 + 全屏模式**
   - 支持方向键翻页：`ArrowRight` / `ArrowDown` / `PageDown` 下一张，`ArrowLeft` / `ArrowUp` / `PageUp` 上一张
   - 支持 `Home` 跳到第一张，`End` 跳到最后一张
   - 支持 `F` 键切换全屏（Fullscreen API）
   - 支持 `Esc` 退出全屏
   - 支持空格键下一张

2. **scroll-snap 滚动模式**
   - 容器使用 `scroll-snap-type: y mandatory`
   - 每张幻灯片使用 `scroll-snap-align: start` 且 `min-height: 100dvh`
   - 滚动翻页后同步更新当前页码指示器
   - 键盘翻页时通过 `scrollIntoView` 跳转到目标幻灯片

### 视觉规范

- 每张幻灯片内容垂直水平居中
- 字号适配投影场景：正文不小于 `1.5rem`，标题不小于 `2.5rem`
- 背景与文字对比度满足 WCAG AA
- 页码指示器固定在右下角，不遮挡内容
- 支持 `prefers-reduced-motion` 降级

### 滚动条禁令（硬约束）

**适用范围：** 所有模式、所有视口尺寸、所有交互状态下，浏览器不得出现横向或纵向滚动条。包括但不限于：

- 全屏模式与非全屏窗口模式
- 桌面端键盘翻页模式与移动端 scroll-snap 翻页模式
- 窗口缩放、调整大小、旋转屏幕过程
- 内容溢出、字体加载延迟、图片加载完成等任何场景

**CSS 硬约束（必须全部满足）：**

- `html, body` 必须 `overflow: hidden`，禁止整页滚动
- 幻灯片容器（如 `.slide-container`）必须 `overflow-y: auto` 配合 `scroll-snap-type: y mandatory` 实现移动端翻页，并通过 `scrollbar-width: none` 和 `::-webkit-scrollbar { display: none }` 隐藏滚动条
- 每张 `.slide` 必须 `overflow: hidden` 且 `box-sizing: border-box`
- 视口尺寸单位必须使用 `100dvh`/`100dvw`，禁止使用 `100vh`/`100vw`（避免移动端地址栏导致溢出）
- 全局 `*` 选择器必须设置 `box-sizing: border-box`，确保 padding/border 不撑破尺寸
- 禁止使用 `min-width`/`min-height` 超过视口尺寸的固定值
- 禁止使用 `overflow: scroll`、`overflow-x: auto` 等允许横向滚动的值；`.slide-container` 的 `overflow-y: auto` 是唯一允许的纵向滚动例外，仅用于 scroll-snap 翻页

**容器约束：**

- 每张 `.slide` 必须 `width: 100dvw`、`height: 100dvh`，精确填满视口
- `.slide` 内部必须使用 flexbox 或 grid 居中内容，并留出安全边距（建议 `padding: 5vw 5dvh`）
- 内容容器必须 `max-width: 100%`、`max-height: 100%`，禁止溢出父容器
- 图片、视频、iframe 等媒体元素必须 `max-width: 100%`、`max-height: 100%` 且 `object-fit: contain`

**内容溢出处理策略（瀑布式顺序执行，前者无法解决才进入后者）：**

1. 缩减字号（但不低于正文 `1.5rem`、标题 `2.5rem` 的可读性下限）
2. 精简内容（删除次要要点、缩短文案、合并相似条目）
3. 拆分为多张幻灯片（在策略 1+2 应用后仍超过视口 80% 时强制拆分）
4. 使用 `text-overflow: ellipsis` 或 `overflow: hidden` 截断次要内容

**严禁：**

- 依赖滚动展示溢出内容
- 使用 `position: absolute` 让内容脱离容器并溢出视口
- 使用大尺寸 `box-shadow` 或 `transform: scale()` 导致元素溢出视口

**验证要求（交付前必须全部通过）：**

- 在以下视口尺寸验证无滚动条：`1920x1080`、`1366x768`、`768x1024`、`375x812`
- 验证全屏模式与非全屏窗口模式均无滚动条
- 验证窗口缩放过程不出现滚动条
- 验证内容最长/最多的幻灯片不溢出（识别方法：遍历所有 `.slide` 元素，比较 `scrollHeight` 与 `clientHeight`，取差值最大者作为最可能溢出的幻灯片重点验证）
- 验证字体加载前后均不出现滚动条
- 滚动条检测方法：通过浏览器 DevTools 执行 `document.documentElement.scrollWidth > document.documentElement.clientWidth || document.documentElement.scrollHeight > document.documentElement.clientHeight`，返回 `true` 表示存在溢出
- `.slide-container` 的 `overflow-y: auto` 产生的纵向滚动位置是 scroll-snap 翻页的正常行为，不计入溢出失败；仅需确保 `html/body` 无溢出且无横向滚动条
- 出现任何非预期滚动条视为交付失败，必须修复后重新验证

### 内容约束

#### 内容顺序

幻灯片内容应遵循合理的逻辑顺序，不得随意排列：

1. **封面页**：标题、副标题、演讲者信息、日期
2. **目录/概览页**（可选，幻灯片总数超过 5 张时建议添加）：列出主要章节或议题
3. **主体内容**：按逻辑分章节，每章节聚焦一个主题
   - 章节之间有明确的过渡或分隔
   - 内容由浅入深、由背景到细节、由问题到方案
   - 概念引入在前，展开说明在后，结论总结最后
4. **总结/结论页**：回顾要点，强调核心信息
5. **结束页**（可选）：致谢、Q&A、联系方式

#### 单张幻灯片内容密度

- 每张幻灯片聚焦一个明确主题，不得在同张幻灯片混合多个不相关主题
- 正文要点不超过 5-7 个，每个要点不超过 1-2 行
- 避免大段文字堆砌，优先使用关键词、短句和结构化元素
- 数据或引用需标注来源，不得堆砌无上下文的数字

#### 内容层次

- 每张幻灯片必须有明确的标题（`<h1>` 或 `<h2>`）
- 标题与正文有清晰的视觉层次区分
- 使用列表、引用、表格等结构化元素组织内容，而非纯段落
- 同一章节内的幻灯片标题保持风格一致

#### 内容递进逻辑

- 相邻幻灯片之间有逻辑衔接，不得出现内容跳跃
- 避免前后矛盾或重复陈述
- 复杂概念先给出定义或背景，再展开细节
- 图表或示例应在相关说明之后或同屏呈现

### 兼容性

- 必须在 Chrome/Edge 最新两个大版本中正常工作
- 不依赖实验性 API（Fullscreen API 除外）
- 移动端通过 scroll-snap 翻页，不需要键盘

## 执行要求

1. 如果 `$ARGUMENTS` 包含现有 HTML 文件路径，使用 `ae:web-forge` 处理，将现有 HTML 文件路径和上述约束一起传递，由 `ae:web-forge` 根据自动推断规则选择合适的子代理，在保留内容结构的前提下应用上述约束
2. 如果 `$ARGUMENTS` 是主题或需求描述，使用 `ae:web-forge` 的 `--design` 参数强制调度 `@ui-architect`，由 `@ui-architect` 根据主题自行设计视觉风格，但必须满足上述标准约束
3. 产出文件默认保存到 `ae/documents/html/<主题>.html`，除非 `$ARGUMENTS` 显式指定输出路径
4. 不得绕过 `ae:web-forge` 自行实现 HTML 生成逻辑
