---
name: ae:html-slides
description: 先收集并确认幻灯片内容大纲，再调用 ae:web-forge 生成 HTML 幻灯片
argument-hint: "[主题|需求描述|现有 HTML 文件路径]"
---

# HTML 幻灯片策划与生成

## 角色

幻灯片内容策划者与生成协调者：先根据用户需求梳理结构化内容大纲，经用户确认后，协调 `ae:web-forge` 完成视觉设计与 HTML 生成。

## 适用场景

- 用户要求生成演示文稿风格的 HTML 幻灯片
- 用户要求更新或优化现有 HTML 幻灯片文件
- 用户要求将主题或需求描述转化为幻灯片格式

## 不适用场景

- 生成 PPTX 格式幻灯片（使用 `ae:pptx` 或 `ae:html-to-pptx`）
- 纯网页开发不涉及演示场景（使用 `ae:web-forge` 直接处理）
- 只需要将现有 HTML 打包为单文件（使用 `ae:html-bundle`）

## 执行流程

### 第一阶段：收集内容大纲（必须先完成，不得跳过）

1. 分析 `$ARGUMENTS`：
   - 如果是现有 HTML 文件路径：读取文件内容，提取现有幻灯片结构，整理为大纲
   - 如果是主题或需求描述：根据主题梳理幻灯片内容大纲
2. 大纲必须包含：
   - **封面页**：标题、副标题（如有）、演讲者信息（如有）
   - **目录页**（可选，幻灯片总数超过 5 张时建议添加）
   - **主体内容页**：按逻辑分章节，每页聚焦一个主题
     - 列出每页的标题和核心要点（不超过 5-7 个）
     - 标注需要图表、数据或示例的页面
   - **总结页**：回顾要点
   - **结束页**（可选）：致谢、Q&A
3. 大纲格式：
   - 每张幻灯片用编号标注（Slide 1、Slide 2...）
   - 每张幻灯片列出标题 + 核心内容摘要（2-5 行）
   - 总计页数明确标注
4. 使用 `question` 工具向用户展示大纲并请求确认
5. 如果用户要求修改大纲，调整后再次展示并确认
6. 不得跳过确认直接进入第二阶段

### 第二阶段：调用 ae:web-forge 生成（仅在大纲确认后执行）

1. 将用户已确认的完整内容大纲和以下幻灯片标准约束一起传递给 `ae:web-forge`
2. 传递策略：
   - 现有 HTML 文件路径：将文件路径 + 确认后的大纲 + 约束传递给 `ae:web-forge`，由其自动推断选择子代理，在保留内容结构的前提下应用约束
   - 主题或需求描述：使用 `ae:web-forge` 的 `--design` 参数强制调度 `@ui-architect`，由其根据主题设计视觉风格，但必须满足标准约束；传递确认后的大纲作为内容指引
3. 产出文件默认保存到 `ae/documents/html/<主题>.html`，除非 `$ARGUMENTS` 显式指定输出路径
4. 不得绕过 `ae:web-forge` 自行实现 HTML 生成逻辑

## 幻灯片 HTML 标准约束

以下约束作为硬性要求传递给 `ae:web-forge`，确保产出的 HTML 满足幻灯片演示场景。

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

**适用范围：** 所有模式、所有视口尺寸、所有交互状态下，浏览器不得出现横向或纵向滚动条。

**CSS 硬约束（必须全部满足）：**

- `html, body` 必须 `overflow: hidden`，禁止整页滚动
- 幻灯片容器（如 `.slide-container`）必须 `overflow-y: auto` 配合 `scroll-snap-type: y mandatory` 实现移动端翻页，并通过 `scrollbar-width: none` 和 `::-webkit-scrollbar { display: none }` 隐藏滚动条
- 每张 `.slide` 必须 `overflow: hidden` 且 `box-sizing: border-box`
- 视口尺寸单位必须使用 `100dvh`/`100dvw`，禁止使用 `100vh`/`100vw`
- 全局 `*` 选择器必须设置 `box-sizing: border-box`
- 禁止使用 `min-width`/`min-height` 超过视口尺寸的固定值
- 禁止使用 `overflow: scroll`、`overflow-x: auto` 等允许横向滚动的值；`.slide-container` 的 `overflow-y: auto` 是唯一允许的纵向滚动例外

**容器约束：**

- 每张 `.slide` 必须 `width: 100dvw`、`height: 100dvh`，精确填满视口
- `.slide` 内部必须使用 flexbox 或 grid 居中内容，并留出安全边距（建议 `padding: 5vw 5dvh`）
- 内容容器必须 `max-width: 100%`、`max-height: 100%`，禁止溢出父容器
- 图片、视频、iframe 等媒体元素必须 `max-width: 100%`、`max-height: 100%` 且 `object-fit: contain`

**内容溢出处理策略（瀑布式顺序执行）：**

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
- 验证内容最长/最多的幻灯片不溢出（遍历所有 `.slide` 元素，比较 `scrollHeight` 与 `clientHeight`，取差值最大者重点验证）
- 验证字体加载前后均不出现滚动条
- 滚动条检测：`document.documentElement.scrollWidth > document.documentElement.clientWidth || document.documentElement.scrollHeight > document.documentElement.clientHeight` 返回 `true` 表示存在溢出
- `.slide-container` 的 `overflow-y: auto` 产生的纵向滚动位置是 scroll-snap 翻页的正常行为，不计入溢出失败
- 出现任何非预期滚动条视为交付失败，必须修复后重新验证

### 内容约束

#### 内容顺序

1. **封面页**：标题、副标题、演讲者信息、日期
2. **目录/概览页**（可选，超过 5 张时建议添加）
3. **主体内容**：按逻辑分章节，每章节聚焦一个主题
   - 章节之间有明确的过渡或分隔
   - 内容由浅入深、由背景到细节、由问题到方案
4. **总结/结论页**：回顾要点，强调核心信息
5. **结束页**（可选）：致谢、Q&A、联系方式

#### 单张幻灯片内容密度

- 每张幻灯片聚焦一个明确主题
- 正文要点不超过 5-7 个，每个要点不超过 1-2 行
- 避免大段文字堆砌，优先使用关键词、短句和结构化元素
- 数据或引用需标注来源

#### 内容层次

- 每张幻灯片必须有明确的标题（`<h1>` 或 `<h2>`）
- 标题与正文有清晰的视觉层次区分
- 使用列表、引用、表格等结构化元素组织内容
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

## 边界

- 不绕过 `ae:web-forge` 自行实现 HTML 生成逻辑
- 不生成 PPTX、PDF 等非 HTML 格式的幻灯片
- 大纲确认前不得进入生成阶段
- 如用户要求修改大纲，调整后必须再次确认

## 输出要求

- 产出为单一自包含 HTML 文件
- 文件默认保存到 `ae/documents/html/<主题>.html`
- 交付时提供：确认后的大纲摘要 + 产出文件路径 + `ae:web-forge` 执行结果

## 验证方式

- 大纲是否经用户确认
- 产出 HTML 是否满足幻灯片标准约束
- 产出 HTML 是否在指定视口尺寸下无滚动条
- 内容是否与确认后的大纲一致
