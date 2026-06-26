---
name: ae:slides-forge
description: 传入确认后的幻灯片大纲文件，协调 ae:web-forge 生成多文件 HTML 幻灯片；内容必须完全符合大纲，禁止镀金
---

# HTML 幻灯片生成

## 角色

幻灯片 HTML 生成协调者：接收用户确认后的幻灯片大纲文件，协调 `ae:web-forge` 完成视觉设计与多文件 HTML 生成。大纲是内容真源，本技能不扩展、不补充、不虚构内容。

## 适用场景

- 用户已完成大纲确认（通过 `ae:slides-outline`），需要基于大纲生成 HTML 幻灯片
- 用户已有确认后的大纲文件，直接传入生成

## 不适用场景

- 策划或修改大纲内容（使用 `ae:slides-outline`）
- 生成 PPTX 格式幻灯片（使用 `ae:pptx` 或 `ae:html-to-pptx`）
- 纯网页开发不涉及演示场景（使用 `ae:web-forge`）
- 只需要将现有 HTML 打包为单文件（使用 `ae:html-bundle`）

## 输入处理

`$ARGUMENTS` 解析规则：

| 参数 | 必填 | 说明 |
|------|------|------|
| 大纲文件路径 | 是 | 指向已确认大纲文件的路径（`.md` 文件，位于 `ae/slides/` 目录） |
| 现有 HTML 文件路径 | 否 | 传入时由 `ae:web-forge` 在保留内容结构的前提下应用多文件架构约束 |
| `--design` | 否 | 强制调度 `@ui-architect`，从零设计视觉风格 |
| `--match` | 否 | 传入现有 HTML 时由 `ae:web-forge` 自动推断子代理 |

- 若 `$ARGUMENTS` 中未包含大纲文件路径，提示用户先使用 `ae:slides-outline` 完成大纲确认
- 大纲文件以文件中的实际内容为准，不得使用会话上下文中的大纲副本（用户可能直接编辑了文件）

## 执行流程

1. 解析 `$ARGUMENTS`，提取大纲文件路径和其他参数（详见"输入处理"）
2. 读取大纲文件，以文件实际内容为准
3. 解析大纲中的布局提示词与图形内容，提取后附加到传递给 `ae:web-forge` 的强制指示中：
   - **布局提示词解析**：大纲每页标题或正文可能包含布局提示词（如 `布局:左右分栏`、`layout:grid-3`、`[分屏]`、`[卡片网格]` 等），解析时按以下规则处理：
     - 识别并提取布局提示词，将其从内容文本中剥离后转化为 `.slide-root--variant` 修饰类指令（如 `布局:左右分栏` → `.slide-root--split`）
     - 大纲中未包含任何布局提示词的页面，由 `ae:web-forge` 子代理根据内容特征自动选择最适配的布局变体（如纯标题正文 → 默认居中，多卡片 → `.slide-root--grid`，流程步骤 → `.slide-root--timeline`）
     - 布局提示词不得影响内容真源——提示词仅决定 HTML 结构与 CSS 布局，不增删改写内容本身
   - **Mermaid / ASCII 图复刻**：大纲中包含 Mermaid 代码块（` ```mermaid ``` `）或 ASCII 线框图时，必须将其复刻为 HTML 内可交互或可渲染的图形：
     - Mermaid 图：在子页面 `<script>` 中引入 `mermaid.js` CDN（`https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js`），调用 `mermaid.render()` 将代码块渲染为 SVG 内嵌到 `.diagram` 容器中；或使用 HTML `<canvas>` + JS 手绘方式复刻关键结构（适用于流程图、架构图等）
     - ASCII 线框图：将其复刻为 HTML/CSS 边框布局（使用 `.wireframe-box`/`.wireframe-row`/`.wireframe-col` 等 flat 类名 + `border`/`background` 实现），保留原始线框的空间关系与标注文本；不得以纯文本 `<pre>` 录入替代（`<pre>` 不符合幻灯片字号与视觉规范）
     - 图形复刻时必须保持大纲中的标注文本、节点名称、连线关系完全一致，禁止虚构或简化
     - 所有图形元素必须遵守幻灯片滚动条禁令与字号下限——SVG/Canvas 尺寸必须 `max-width: 100%; max-height: 100%`，字号不低于 `1.5rem`
   - 以下原有强制指示继续生效：
   - **内容真源纪律**：大纲即为每页最终内容真源。不允许扩展、补充、虚构、改写或缩减内容；仅允许"将大纲中以纯文本形式给出的图片路径渲染为 `<img>` 元素"、"为列表/表格/段落进行 HTML 结构化渲染"、"将布局提示词转化为 CSS 布局类"、"将 Mermaid/ASCII 图复刻为 HTML 图形"等纯结构化处理
   - **生成范围**：每张幻灯片导出为独立 HTML（`slide-NN.html`），提取公共样式 `common.css` 和公共脚本 `common.js` 共享引入，额外生成主入口 `index.html` 通过 iframe 整合并播放
   - **标准约束**：所有 HTML 生成必须遵循 `references/html-constraints.md` 中的硬性约束和 `references/templates.md` 中的参考模板骨架
   - **类名统一**：子页面必须使用统一 flat 类名（`.slide-root`/`.slide-number`/`.slide-content`/`.slide-header`/`.slide-title`/`.slide-text`/`.card`/`.diagram`/`.wireframe-box`/`.wireframe-row`/`.wireframe-col`），禁止 BEM 变体；页面差异通过 `.slide-root--variant` 修饰类隔离
   - **页码位置**：每个子页面必须包含 `<span class="slide-number">` 且放在 `.slide-root` 内的顶层绝对定位，不得放在 `.slide-header` 或 `.slide-content` 中
   - **布局居中**：`.slide-root` 使用 flex 居中（`display: flex; align-items: center; justify-content: center`），每页内容必须充分填充居中区域，不得出现中间空旷
 4. 传递策略：
   - 大纲文件 / 主题或需求描述：使用 `--design` 参数强制调度 `@ui-architect`
   - 现有 HTML 文件路径：将路径 + 大纲 + 原始需求 + 约束传递给 `ae:web-forge`，由其自动推断子代理
5. 产出文件默认保存到 `ae/documents/html/<主题>/` 目录下：
   - `common.css`（所有子页面共享）
   - `common.js`（所有子页面共享，不含翻页逻辑）
   - `slide-NN.html`（每页独立 HTML）
   - `index.html`（主入口，翻页逻辑内联在此）
 6. 不得绕过 `ae:web-forge` 自行实现 HTML 生成逻辑
 7. **一致性校验（硬约束）：** `ae:web-forge` 完成产出后，必须执行以下一致性校验，校验失败不得声明交付完成：
    - iframe 数量：`index.html` 中 `.deck__frame` 数量必须等于大纲总页数
    - 页码完整性：每个 `slide-NN.html` 必须包含 `<span class="slide-number">`，不得缺失
    - 页码位置：`.slide-number` 必须在 `.slide-root` 内的顶层绝对定位，不得放在 `.slide-header` 或 `.slide-content` 中
    - 类名统一：子页面不得出现 `.slide__xxx`（BEM）或 `.slide`（旧根容器）等偏离模板的类名
    - common.css 完整性：`common.css` 必须包含模板骨架定义的所有类（`.slide-root`/`.slide-number`/`.slide-content`/`.slide-header`/`.slide-title`/`.slide-text`/`.card` 等）
    - inline style 限制：每个子页面 inline `style` 属性不超过 3 处
    - 当产出文件超过 10 页时，一致性校验应优先使用批量脚本（见"批量脚本指导"）而非逐页手工检查
 8. **批量脚本指导：** 当大纲页数 ≥ 10 时，`ae:web-forge` 完成产出后应使用脚本批量执行一致性校验和修复，避免逐页手工操作导致遗漏：
    - iframe 数量修复：用脚本读取大纲页数，再读取 `index.html` 中的 iframe 数量，不一致时自动补充或删除
    - slide-number 补充：用脚本扫描所有 `slide-NN.html`，缺少 `<span class="slide-number">` 的页面自动在 `.slide-root` 开头插入
    - slide-number 位置修正：用脚本将误放在 `.slide-header` 内的 `.slide-number` 移动到 `.slide-root` 内的顶层绝对定位
    - 类名替换：用脚本批量将 `.slide__xxx` 替换为对应的 flat 类名（`.slide-content`/`.slide-header`/`.slide-title`/`.slide-text`），将 `<body class="slide">` 替换为 `<body>` 内嵌 `<div class="slide-root">` 结构
    - PowerShell 脚本注意事项：字符串中的换行需用 `[char]10` 而非 `"\n"`；变量名中的数字需用 `${n}` 格式；文件编码注意 CRLF/LF 兼容
 9. **验收完成门禁（硬约束）：** `ae:web-forge` 必须完成其执行阶段 3（@browser-inspector 浏览器验收）后，本技能方可视为交付完成。若 `ae:web-forge` 报告"验收阻断"，本技能不得声明任务完成或交付产出文件

## 边界

- 不绕过 `ae:web-forge` 自行实现 HTML 生成逻辑
- 不生成 PPTX、PDF 等非 HTML 格式的幻灯片
- 不策划或修改大纲内容（使用 `ae:slides-outline`）
- 内容必须以确认后大纲为准，不得扩展、改写或缩减

## 输出要求

- 产出为公共样式 `common.css` + 公共脚本 `common.js` + 每页一个独立 HTML + 一个主入口 `index.html`
- 文件默认保存到 `ae/documents/html/<主题>/` 目录下
- 交付时提供：确认后的大纲摘要 + `index.html` 路径 + 公共资源路径 + 各子页面文件清单 + `ae:web-forge` 执行结果

## 验证方式

- 每张子页面是否与确认后大纲逐页内容一致（不镀金、不缩减）
- 公共资源是否真实拆分为独立文件并通过 `<link>`/`<script src>` 引入
- 主入口 `index.html` 是否通过 iframe 整合所有子页面，iframe 数量是否等于大纲总页数
- 翻页逻辑是否内联在主入口而非 `common.js`
- 产出 HTML 是否满足 `references/html-constraints.md` 中的硬性约束
- 产出文件结构与 `references/templates.md` 中的骨架是否对齐
- 主入口是否在所有指定视口尺寸下无滚动条、键盘翻页工作正常
- `ae:web-forge` 是否完成浏览器验收阶段
- **一致性校验：** 每个子页面是否包含 `<span class="slide-number">` 且位于 `.slide-root` 内顶层绝对定位
- **类名统一：** 子页面是否使用统一 flat 类名（`.slide-root`/`.slide-number`/`.slide-content`/`.slide-header`/`.slide-title`/`.slide-text`/`.card`），无 BEM 变体
- **布局居中：** 每页内容是否充分填充居中区域，中间无空旷
- **inline style：** 每个子页面 inline `style` 属性是否不超过 3 处
- **布局提示词：** 大纲中的布局提示词是否已正确转化为 `.slide-root--variant` 修饰类，无布局提示词的页面是否已自动分配适配布局
- **Mermaid/ASCII 图：** 大纲中的 Mermaid 代码块是否渲染为 SVG/Canvas 图形而非纯文本 `<pre>`；ASCII 线框图是否复刻为 HTML/CSS 边框布局而非纯 `<pre>` 录入；图形中的标注文本、节点名称、连线关系是否与大纲完全一致

## 参考资料

- `references/html-constraints.md`：多文件 HTML 幻灯片的硬性约束（文件结构、交互、视觉、滚动条禁令、内容纪律、一致性硬约束、兼容性）
- `references/templates.md`：参考模板骨架（目录结构、common.css、common.js、index.html、slide-NN.html、类名规范、页码位置、inline style 限制）
