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
- 仅允许的"内容变形"：将大纲中以纯文本形式给出的图片路径（URL 或相对路径）渲染为 `<img>` 元素；以及为列表/表格/段落进行 HTML 结构化渲染
- 视觉风格由 `ae:web-forge` 及其子代理自由设计，但内容真源不得偏离

## 兼容性

- 必须在 Chrome/Edge 最新两个大版本中正常工作
- 不依赖实验性 API（Fullscreen API 除外）
- 移动端通过主入口 scroll-snap 翻页，不需要键盘
