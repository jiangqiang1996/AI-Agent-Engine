# 幻灯片 HTML 标准约束

以下约束作为硬性要求传递给 `ae:web-forge`。

## 文件结构（公共样式/脚本共享 + iframe 整合架构）

- 公共样式文件 `common.css`：所有子页面与主入口通过 `<link rel="stylesheet" href="common.css">` 引入
  - 内容包括：全局 reset、`box-sizing: border-box`、CSS 自定义属性（主题色、字号、间距 token）、幻灯片居中布局、滚动条隐藏、翻页容器 scroll-snap 基础、页码指示器、可复用的排版类（标题/正文/列表/卡片/表格等）
  - 页面级差异通过 `slide-NN.html` 根容器或 `<body>` 上的 `class`（如 `<body class="slide slide-03 dark">`）配合 `common.css` 中的选择器隔离，不在 HTML 内重复声明重置样式
- 公共脚本文件 `common.js`：所有子页面与主入口通过 `<script src="common.js"></script>` 引入
  - 内容包括：可复用工具函数（视口适配、字号自适应下限、`prefers-reduced-motion` 降级、字体加载状态广播）等；**不含翻页逻辑**（翻页由 `index.html` 内联脚本负责）
  - 子页面通过 `class` 或 `data-slide` 标识自身，公共脚本按需为其挂载视图适配逻辑
- 每张幻灯片导出为一个独立的 HTML 文件：`slide-01.html`、`slide-02.html`、...、`slide-NN.html`
  - 子页面只内联自身**特有**的少量样式/脚本（如该页独有的布局微调、动画时序），其余通过 `common.css` / `common.js` 引入
  - 子页面单独打开时应正确渲染该页全部内容，**不需要也不应实现翻页控制**
- 额外生成一个主入口 HTML 文件 `index.html`，通过 `<iframe>` 整合并播放所有子页面：
  - 主入口文件名固定为 `index.html`，与 `slide-NN.html`、`common.css`、`common.js` 同目录
  - 主入口同样引入 `common.css`（用于全局 reset、滚动容器、页码指示器等基础样式）
  - 主入口在 DOM 中按顺序排列每张幻灯片对应的 iframe 容器；同一时刻只显示当前页对应的 iframe，其余隐藏
  - 主入口负责整体翻页、页码指示器、全屏切换；翻页逻辑内联在 `index.html` 的 `<script>` 中，不放入 `common.js`
- 子页面与主入口可以共享同一份网络字体或网络资源；公共本地资源仅限 `common.css` 和 `common.js`，子页面之间不得相互引用本地脚本文件
- 图片路径来源于大纲；渲染为 `<img>` 元素，相对路径以主入口所在目录为基准

## 主入口交互要求

- 容器整体使用 `scroll-snap-type: y mandatory` 实现移动端顺滑翻页；每张 iframe 容器使用 `scroll-snap-align: start` 且 `height: 100dvh`
- 桌面端键盘翻页：
  - `ArrowRight` / `ArrowDown` / `PageDown` / `Space`：下一张
  - `ArrowLeft` / `ArrowUp` / `PageUp`：上一张
  - `Home`：跳到第一张，`End`：跳到最后一张
  - `F`：切换全屏（Fullscreen API），`Esc`：退出全屏
- 翻页时通过切换 iframe 容器的显示状态实现，必要时配合 `scrollIntoView` 跳转
- 翻页后同步更新右下角固定页码指示器（`当前 / 总数`），不遮挡内容
- 主入口支持 `prefers-reduced-motion` 降级

## 视觉规范

- 每张幻灯片内容垂直水平居中
- 字号适配投影场景：正文不小于 `1.5rem`，标题不小于 `2.5rem`
- 背景与文字对比度满足 WCAG AA
- 主入口页码指示器固定在右下角

## 滚动条禁令（硬约束）

**适用范围：** 主入口与所有子页面，所有视口尺寸、所有交互状态下，禁止出现任何可见的横向滚动条和纵向滚动条。

**核心原则：** 主入口的翻页是通过 `scroll-snap` 实现的受控滚动，必须隐藏滚动条外观但保留滚动功能；子页面完全禁止任何滚动行为，内容必须适配视口。

### 子页面（slide-NN.html）滚动禁止

子页面不得出现任何滚动行为或滚动条：

- `html, body` 必须设置 `overflow: hidden`（横向和纵向均禁止）
- 视口尺寸单位必须使用 `100dvh`/`100dvw`，禁止 `100vh`/`100vw`
- 全局 `*` 选择器必须设置 `box-sizing: border-box`
- 禁止 `overflow: scroll`、`overflow: auto`、`overflow-x: auto`、`overflow-y: auto` 等任何允许滚动的值
- 内容溢出时按下方"内容溢出处理策略"处理，绝不依赖滚动条
- 根容器必须 `width: 100dvw`、`height: 100dvh`、`overflow: hidden`
- 内容容器使用 flexbox 或 grid 居中，留出安全边距（建议 `padding: 5vw 5dvh`）
- 内容容器必须 `max-width: 100%`、`max-height: 100%`
- 图片、视频等媒体元素必须 `max-width: 100%`、`max-height: 100%` 且 `object-fit: contain`

### 主入口（index.html）滚动条隐藏

主入口通过 `scroll-snap` 实现翻页，必须隐藏滚动条外观：

- 翻页滚动容器使用 `overflow-y: auto` + `scroll-snap-type: y mandatory`（保留翻页滚动功能）
- `overflow-x: hidden`（禁止横向滚动）
- 必须隐藏滚动条外观，确保视觉上不出现滚动条：
  ```css
  .scroll-container {
    scrollbar-width: none;           /* Firefox */
    -ms-overflow-style: none;        /* IE/Edge */
  }
  .scroll-container::-webkit-scrollbar {
    display: none;                    /* Chrome/Safari */
  }
  ```
- 每个 iframe 容器使用 `scroll-snap-align: start` 且 `height: 100dvh`、`width: 100dvw`、`overflow: hidden`
- 视口尺寸单位必须使用 `100dvh`/`100dvw`，禁止 `100vh`/`100vw`
- 全局 `*` 选择器必须设置 `box-sizing: border-box`
- 禁止使用 `min-width`/`min-height` 超过视口尺寸的固定值

### 通用约束

- 所有 iframe 元素必须 `width: 100%`、`height: 100%`、`border: none`、`display: block`
- 禁止任何元素使用超出视口的固定宽度或高度

### 内容溢出处理策略（瀑布式顺序执行）

当子页面内容超出视口时，按以下顺序处理，绝不依赖滚动条：

1. 缩减字号（但不低于正文 `1.5rem`、标题 `2.5rem` 的可读性下限）
2. 紧凑布局（合并同列、压缩间距、调整图片尺寸）
3. 如仍溢出，提示用户回到 `ae:slides-outline` 在大纲中调整内容

**禁止依赖滚动条展示溢出内容。**

### 验证要求

- 在 `1920x1080`、`1366x768`、`768x1024`、`375x812` 视口验证主入口与所有子页面均无可见滚动条
- 全屏模式与非全屏窗口模式均无可见滚动条
- 内容最多的子页面不溢出、不出现滚动条
- 主入口翻页功能正常工作（键盘 + scroll-snap），且滚动条不可见
- 公共资源 `common.css` / `common.js` 被所有子页面与主入口正确引用（无 404、无重复内联）
- 验证脚本：`document.documentElement.scrollWidth > document.documentElement.clientWidth || document.documentElement.scrollHeight > document.documentElement.clientHeight` 对子页面返回 `false`

## 内容纪律（硬约束）

- 每张子页面的内容（文字、列表项、表格单元格文本、图片路径）必须与确认后大纲中对应页完全一致
- **禁止镀金**：不允许新增、扩展、改写或虚构大纲中没有的内容；不允许删除或浓缩大纲中已有的文字
- 仅允许的"内容变形"：将大纲中以纯文本形式给出的图片路径（URL 或相对路径）渲染为 `<img>` 元素；为列表/表格/段落进行 HTML 结构化渲染；将布局提示词转化为 CSS 布局修饰类；将 Mermaid 代码块渲染为 SVG/Canvas 图形；将 ASCII 线框图复刻为 HTML/CSS 边框布局
- 视觉风格由 `ae:web-forge` 及其子代理自由设计，但内容真源不得偏离

## 布局提示词约束（硬约束）

大纲每页可能包含布局提示词，用于指导 HTML 布局结构。提示词仅影响 CSS 布局与 HTML 结构，不增删改写内容本身。

### 提示词识别与剥离

- 识别以下形式的布局提示词并将其从内容文本中剥离：
  - `布局:xxx` 或 `layout:xxx`（如 `布局:左右分栏`、`layout:grid-3`）
  - `[xxx]` 方括号标记（如 `[分屏]`、`[卡片网格]`、`[时间线]`）
  - 行首或标题行末尾的布局注释（如 `# 标题 — 左右分栏` 中的 `— 左右分栏` 部分）
- 剥离后的纯文本仍作为内容真源；剥离出的布局意图转化为 `.slide-root--variant` 修饰类

### 提示词到修饰类映射

常见布局提示词及其对应的修饰类（`ae:web-forge` 子代理可扩展，但不得创建与已有类冲突的变体）：

| 提示词示例 | 修饰类 | 布局含义 |
|---|---|---|
| `左右分栏` / `分屏` / `split` | `.slide-root--split` | 左右两栏 flex/grid 布局 |
| `卡片网格` / `grid-3` / `grid-4` | `.slide-root--grid` | 多卡片 CSS Grid 网格 |
| `时间线` / `timeline` | `.slide-root--timeline` | 垂直/水平时间线步骤布局 |
| `全屏居中` / `cover` / `封面` | `.slide-root--cover` | 大标题居中封面布局 |
| `对比` / `versus` / `对比左右` | `.slide-root--versus` | 左右对比布局 |
| `引用` / `quote` / `名言` | `.slide-root--quote` | 大字引用居中布局 |
| `流程` / `flow` / `pipeline` | `.slide-root--flow` | 横向流程箭头布局 |

### 无布局提示词时的自动推断

- 大纲中未包含任何布局提示词的页面，`ae:web-forge` 子代理必须根据内容特征自动选择最适配的布局变体
- 自动推断规则（优先序）：
  1. 纯标题 + 短正文 → `.slide-root--cover`（默认居中）
  2. 多项并列内容（3+ 项）→ `.slide-root--grid`（卡片网格）
  3. 步骤/阶段/流程 → `.slide-root--timeline` 或 `.slide-root--flow`
  4. 两组对比内容 → `.slide-root--versus`
  5. 长引用/名言 → `.slide-root--quote`
  6. 其他 → 默认 `.slide-root`（flex 居中）

## Mermaid 与 ASCII 线框图复刻约束（硬约束）

大纲中包含 Mermaid 代码块或 ASCII 线框图时，必须将其复刻为 HTML 内可渲染的图形，不得以纯文本 `<pre>` 录入替代。

### Mermaid 图复刻

- **渲染方式**：在子页面中引入 `mermaid.js` CDN（`https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js`），使用 `mermaid.render()` 将 Mermaid 代码块渲染为内嵌 SVG
- **容器**：SVG 渲染结果必须放在 `<div class="diagram">` 容器内，容器样式：
  ```css
  .diagram {
    width: 100%;
    max-width: 100%;
    max-height: 70dvh; /* 留出标题与页码空间 */
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .diagram svg {
    max-width: 100%;
    max-height: 100%;
  }
  ```
- **备选方式**：对于简单流程图、架构图等，可使用 HTML `<canvas>` + JS 手绘方式复刻，但必须保证节点名称、连线关系与大纲 Mermaid 代码完全一致
- **文本保真**：Mermaid 图中的节点标签（`node["标签文本"]`）、边标签（`-->|标签|`）必须与大纲中完全一致，不得简化、改写或虚构
- **字号下限**：Mermaid 渲染的 SVG 中节点文字字号不得低于 `1.5rem`；若 `mermaid.js` 默认字号过小，需通过 `mermaid.initialize({ themeVariables: { fontSize: '24px' } })` 或 CSS 覆盖调整
- **滚动条禁令**：Mermaid SVG 尺寸必须适配子页面视口，不得因图形过大导致滚动条出现；超出时按"内容溢出处理策略"缩放

### ASCII 线框图复刻

- **复刻方式**：将 ASCII 线框图转化为 HTML/CSS 边框布局，使用以下统一 flat 类名：
  - `.wireframe-box` — 线框中的矩形区域（`border: 1px solid` + 内部标注文本）
  - `.wireframe-row` — 线框中的水平行（`display: flex` + 水平排列子区域）
  - `.wireframe-col` — 线框中的垂直列（`display: flex; flex-direction: column` + 垂直排列子区域）
  - `.wireframe-label` — 线框中的标注文本（字号不低于 `1.5rem`）
  - `.wireframe-arrow` — 线框中的连接箭头（CSS border triangle 或 SVG inline arrow）
- **空间关系保真**：复刻后的 HTML/CSS 布局必须保留原始线框的空间关系——哪些区域并列、哪些区域嵌套、哪些区域通过箭头连接
- **标注文本保真**：线框中的所有标注文本（区域名称、按钮文字、数据标签）必须与大纲中 ASCII 图完全一致
- **禁止 `<pre>` 录入**：ASCII 线框图不得以 `<pre>` 或 `<code>` 标签原样录入——纯文本录入不符合幻灯片字号规范与视觉要求
- **字号下限**：所有 `.wireframe-label` 字号不得低于 `1.5rem`

### 图形类名统一

- 图形相关类名必须使用以下统一 flat 类名，禁止 BEM 变体：
  - `.diagram` — Mermaid/Canvas 图形容器
  - `.wireframe-box` / `.wireframe-row` / `.wireframe-col` / `.wireframe-label` / `.wireframe-arrow` — ASCII 线框复刻组件

以下约束确保多文件产出在结构、类名和数量上完全一致，防止本次会话暴露的痛点复发：

### iframe 数量与大纲页数对齐

- `index.html` 中 `.deck__frame` 的数量必须等于大纲的总页数
- 每个大纲页必须对应一个 `slide-NN.html` 文件，序号从 `01` 连续递增
- 禁止出现"iframe 数量少于文件数量"或"文件数量少于大纲页数"的不一致

### 页码必须存在且位置统一

- 每个子页面必须包含 `<span class="slide-number">` 元素，不得缺失
- 页码必须放在 `<div class="slide-root">` 内的顶层（绝对定位），不得放在 `.slide-header` 或 `.slide-content` 等嵌套容器内
- 页码位置统一为 `position: absolute; top: 1.5rem; left: 3rem; z-index: 10`
- 页码文本格式统一为 `N / TOTAL`，其中 N 为当前页序号，TOTAL 为总页数

### 类名统一（禁止 BEM 或其他变体）

- 子页面根容器统一使用 `.slide-root`（不得用 `.slide` 或 `.slide__wrapper`）
- 内容容器统一使用 `.slide-content`（不得用 `.slide__content`）
- 标题区统一使用 `.slide-header`（不得用 `.slide__header`）
- 标题排版类统一使用 `.slide-title`（不得用 `.slide__title` 或 `h1` 无类名裸写）
- 正文排版类统一使用 `.slide-text`（不得用 `.slide__text`）
- 卡片组件统一使用 `.card` / `.card-header` / `.card-title`
- 图形容器统一使用 `.diagram`（不得用 `.slide__diagram`）
- 线框组件统一使用 `.wireframe-box` / `.wireframe-row` / `.wireframe-col` / `.wireframe-label` / `.wireframe-arrow`（不得用 `.wf-box` 或 `.wireframe__box` 等 BEM 变体）
- 页面差异通过 `.slide-root--variant` 修饰类表达（如 `.slide-root--cover`），不得创建独立的 `.slide--xxx` 类

### inline style 限制

- 子页面通过 `<style>` 内的 class 选择器表达页面差异，禁止大量 inline `style` 属性
- 个别微调允许最多 3 处 inline style，超出必须提取为 `<style>` 中的 class
- `common.css` 中已有定义的样式不得用 inline style 重复声明

### common.css 与 common.js 引用完整性

- 所有子页面和主入口必须通过 `<link rel="stylesheet" href="common.css">` 和 `<script src="common.js"></script>` 引入公共资源
- 禁止把 `common.css` 中已有定义的样式内联复制到子页面 `<style>` 中
- `common.css` 中必须包含模板骨架中定义的所有类（`.slide-root`/`.slide-number`/`.slide-content`/`.slide-header`/`.slide-title`/`.slide-text`/`.card`/`.card-header`/`.card-title`），不得遗漏

## 兼容性

- 必须在 Chrome/Edge 最新两个大版本中正常工作
- 不依赖实验性 API（Fullscreen API 除外）
- 移动端通过主入口 scroll-snap 翻页，不需要键盘
