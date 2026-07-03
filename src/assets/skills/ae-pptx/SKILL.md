---
name: ae:pptx
description: "所有涉及 .pptx 文件的读取、创建、编辑、分析、格式转换和视觉验证操作都必须使用本技能。包括：创建演示文稿、编辑现有 PPTX、分析幻灯片结构、追加幻灯片、更新单张幻灯片、将 PPTX 转为 Markdown 阅读、将 PPTX 转为图片进行视觉验证。禁止使用 Read 或 bash 直接读取 .pptx 文件内容，必须通过本技能的 to-markdown 或 analyze 操作。创建或修改 PPTX 后必须通过 to-image 操作进行视觉验证。"
argument-hint: "[创建|编辑|分析|追加|更新] [文件路径] [任务描述]"
---

# ae:pptx — PowerPoint 演示文稿处理

创建、编辑、分析、追加、更新 `.pptx` 文件。通过内置 `ae-pptx` 工具实现，无需安装额外依赖。底层使用 pptxgenjs，全面覆盖其 API 能力。

## to-markdown 操作

本技能的 `to-markdown` 操作可将 PPTX 转为 Markdown 供 LLM 阅读。支持 `outputMode` 参数控制输出方式：
- `file`（默认）：写入 `ae/markdown/` 目录
- `inline`：直接返回 Markdown 内容，不写文件

| 场景 | 用本技能 to-markdown | 用本技能其他操作 |
|------|---------------------|-----------------|
| 只读提取幻灯片文本 | 优先用 to-markdown | 不适用 |
| 只读理解幻灯片视觉内容 | 不适用 | to-image 转 PNG + ae:image 识别 |
| 创建新演示文稿 | 不适用 | 输出 .pptx |
| 编辑现有演示文稿 | 不适用 | 输出 .pptx |
| 分析幻灯片结构 | 不适用 | 返回文本和结构信息 |
| 追加新幻灯片 | 不适用 | append-slides 输出 .pptx |
| 更新单张幻灯片 | 不适用 | update-slide 输出 .pptx |
| 视觉验证 | 不适用 | to-image 输出 PNG 图片 |

**原则：只需读取内容时用 `to-markdown` 操作；需要创建或修改 .pptx 文件时用其他操作。创建或修改后必须用 `to-image` 视觉验证。**

## 读取内容的两种路径

- **文本提取**：`to-markdown` 将 PPTX 转为 Markdown，适合提取文字内容、标题层级和表格结构
- **视觉理解**：`to-image` 将 PPTX 转为 PNG 图片，再用 `ae:image` 技能识别图片内容，适合理解布局、样式、图表和整体视觉效果

当模型不支持 vision 时，必须走"to-image → ae:image"路径来理解文档视觉内容，禁止尝试直接读取 .pptx 文件。

## 样式参数精简规则

修改已有 PPTX 时，只传入必须修改的元素和参数，不要传入与原内容一致的样式参数。

### 原则

1. **update-slide 只改需要改的元素**：替换目标幻灯片时，先分析原幻灯片结构，只在差异处做修改，不需要改的元素保持原样或合并传入
2. **默认值信任**：未指定的样式字段使用 pptxgenjs 默认值或原幻灯片主题样式，不要为了"完整"而传入与默认值相同的参数
3. **edit 只做文本替换**：`edit` 操作遍历所有幻灯片 XML 执行文本替换，无需附带样式描述
4. **逐页修改并逐页验证**：修改多张幻灯片时，每次只调用一次 update-slide 改一张，改完 to-image 验证后再改下一张

## 文档架构师协作（硬约束）

**创建新演示文稿、大规模修改已有演示文稿、追加幻灯片或逐页编辑时，必须先调度 `@doc-architect` 代理制定风格规格书，再按规格书执行。** 跳过此步骤直接生成是违规行为。

### 硬约束规则

1. **create 前**：必须先调度 `@doc-architect` 制定全局风格规格书
2. **append-slides 前**：已有全局规格书且追加幻灯片风格一致时，引用规格书即可，无需重新调度；无规格书或追加幻灯片有新风格需求时需先调度
3. **update-slide 前**：已有全局规格书时，引用规格书确认该页风格不偏离即可，无需重新调度 `@doc-architect`；无规格书时需先调度制定
4. **用户设计约束优先**：如果用户在提示词中声明了设计约束（配色、字体、布局、风格等），`@doc-architect` 必须在用户的设计约束下进行设计，禁止违背用户的设计
5. **风格统一**：`@doc-architect` 必须确保全文档风格统一，逐页编辑时不得破坏已有风格

### 何时可跳过 @doc-architect

| 场景 | 原因 |
|------|------|
| 小范围文本替换（1-2 张幻灯片） | 不涉及风格变更，直接用 edit |
| 追加风格一致的幻灯片（已有规格书） | 沿用已有规格书，无需重新调度 |

### 协作流程

1. 调度 `@doc-architect`，传入文档类型（PPTX）、目标受众、用户设计约束（如有）和风格偏好
2. `@doc-architect` 在用户设计约束下输出风格规格书
3. 按规格书的风格参数执行 create/append-slides/update-slide
4. 生成后用 to-image 视觉验证风格一致性

## 风格统一规则（硬约束）

创建或修改演示文稿时，必须保持全文档风格统一。

### 字体一致性

- 全文档使用统一的标题字体和正文字体（通过 `presentationMeta.headFontFace` 和 `bodyFontFace` 设定）
- 不得在不同幻灯片中使用不同字体族，除非有明确的语义区分需求（如代码块用等宽字体）

### 配色一致性

- 全文档使用统一的主题配色方案：主色、强调色、背景色、文字色
- 标题、正文、强调元素的配色在整个演示文稿中保持一致
- 不得在某张幻灯片突然切换配色风格

### 页眉页脚一致性

- 母版定义的页眉页脚适用于所有使用该母版的幻灯片
- 不要只在部分幻灯片添加页码或页脚，要统一处理
- 如需首页无页码，使用母版的 `first` 属性区分首页和后续页

### 布局一致性

- 同类幻灯片使用相同布局（内容页统一布局、章节页统一布局）
- 元素位置和尺寸在全文档同类幻灯片中保持一致（如标题始终在 y:0.5, h:1.2 位置）

## 核心工作流：两阶段预览确认

所有创建和编辑操作必须遵循两阶段流程：

### 阶段一：内容大纲确认（必须）

在调用 `ae-pptx` 工具前，先向用户展示即将生成的内容大纲，等待用户确认后再执行。

**大纲只包含内容，不包含布局或设计描述。** 布局、配色、字体等设计决策由 `@doc-architect` 负责，大纲确认阶段不应出现这些信息。

- **create**：展示幻灯片内容大纲
  - 页码 | 页面标题 | 核心内容要点（文字、数据、表格结构等）
  - 不包含：背景色、字体、字号、坐标位置、布局类型等设计信息
- **edit**：展示替换对照表
  - 序号 | 查找文本 | 替换文本
- **append-slides**：展示追加的幻灯片内容大纲
  - 页码 | 页面标题 | 核心内容要点
- **update-slide**：展示目标幻灯片的新内容要点
  - 幻灯片索引 | 新内容要点

### 阶段二：执行生成

用户确认内容大纲后，先调度 `@doc-architect` 制定风格规格书（如尚未制定），再按规格书调用 `ae-pptx` 工具执行操作。

## 调用纪律（硬约束）

预览确认后只调用一次工具，禁止无理由反复生成。

| 场景 | 允许操作 |
|------|----------|
| 预览确认后首次生成 | 调用一次 create |
| 生成后发现小差异 | 调用 edit 更新现有文件 |
| 生成后发现大差异（结构变化） | 重新调用 create 生成 |
| 需要追加更多幻灯片 | 调用 append-slides |
| 需要修改单张幻灯片 | 调用 update-slide |
| 工具返回错误 | 分析原因，修正参数后重试一次 |
| 无理由反复调用 | 禁止 |

**文件已生成后优先编辑而非重新生成**：发现差异时首选 `edit` 操作更新现有文件；仅当内容结构性变化无法通过编辑完成时才重新 `create`。

## 可用操作

### create — 创建演示文稿

参数：`title`（可选标题）、`slides`（幻灯片数组，必填）、`masters`（母版数组）、`sections`（章节数组）、`layouts`（自定义布局）、`layout`（内置布局名）、`presentationMeta`（元数据）

#### 元素化绘制（推荐模式）

每张幻灯片通过 `elements` 数组自由组合以下元素：

**text — 文本元素**

富文本支持多运行（`textRuns`），每个运行可独立设置样式：

| 属性 | 说明 |
|------|------|
| text / textRuns | 纯文本或富文本运行数组（二选一） |
| fontSize | 字号 |
| bold / italic | 粗体 / 斜体 |
| color | 颜色 HEX 值（如 FF0000） |
| fontFace | 字体名称 |
| align | 对齐：left / center / right / justify |
| valign | 垂直对齐：top / middle / bottom |
| bullet | 项目符号（true 或配置对象） |
| lineSpacing / lineSpacingMultiple | 行间距 |
| fill / line / shadow | 文本框填充、边框、阴影 |
| rotate | 旋转角度 |
| hyperlink | 超链接（URL 或跳转页码） |
| fit | 文本适应：none / shrink / resize |
| isTextBox | 是否为文本框 |
| indentLevel | 缩进级别 |
| charSpacing | 字符间距 |
| paraSpaceAfter / paraSpaceBefore | 段后 / 段前间距 |
| wrap | 是否自动换行 |
| rtlMode | 是否从右到左 |

文本运行额外支持：`underline`（样式+颜色）、`strike`（删除线）、`subscript`/`superscript`（上下标）、`highlight`（高亮）、`breakLine`（运行后换行）、`lang`（语言）

**image — 图片元素**

| 属性 | 说明 |
|------|------|
| imagePath / imageData | 本地路径或 Base64 数据 |
| altText | 替代文本 |
| rounding | 圆角裁剪 |
| transparency | 透明度 0-100 |
| flipH / flipV | 水平 / 垂直翻转 |
| rotate | 旋转角度 |
| sizing | 尺寸适配：contain / cover / crop |
| hyperlink | 超链接 |
| shadow | 阴影 |

**shape — 形状元素**

| 属性 | 说明 |
|------|------|
| shape | 形状名称（见下表） |
| fill | 填充（颜色、透明度、类型） |
| line | 线条（颜色、宽度、虚线类型、箭头） |
| shadow | 阴影 |
| rotate | 旋转角度 |
| flipH / flipV | 翻转 |
| rectRadius | 圆角半径（roundRect 使用） |
| points | 自定义形状顶点 |
| hyperlink | 超链接 |

常用形状名称：`rect`、`roundRect`、`ellipse`、`triangle`、`rtTriangle`、`diamond`、`trapezoid`、`parallelogram`、`pentagon`、`hexagon`、`heptagon`、`octagon`、`decagon`、`dodecagon`、`pie`、`chord`、`teardrop`、`frame`、`line`、`lineInv`、`chevron`、`pentagon`、`arrow`、`circularArrow`、`curvedRightArrow`、`bentArrow`、`star4`、`star5`、`star6`、`star8`、`heart`、`lightning`、`cloud`、`smiley`、`noSmoking`

**table — 表格元素**

| 属性 | 说明 |
|------|------|
| rows | 二维数组，每个单元格支持文本、合并、边框、填充、对齐 |
| colW / rowH | 列宽 / 行高 |
| autoPage | 自动分页 |
| autoPageRepeatHeader | 重复表头 |
| autoPageHeaderRows | 表头行数 |
| fill | 表格填充 |
| margin | 单元格内边距 |

单元格支持：`rowspan`/`colspan`（合并）、`border`（单边或四边）、`fill`、`bold`/`italic`/`fontSize`/`color`、`align`/`valign`、`hyperlink`、`margin`

**chart — 图表元素**

| 属性 | 说明 |
|------|------|
| chartType | 图表类型 |
| chartData | 图表数据数组 |
| chartOptions | 图表选项（标题、图例、轴等） |

支持类型：`bar`、`bar3d`、`line`、`pie`、`doughnut`、`area`、`scatter`、`radar`、`bubble`

**media — 媒体元素**

| 属性 | 说明 |
|------|------|
| mediaType | audio / video / online |
| mediaPath | 媒体文件路径 |
| mediaLink | 在线媒体链接 |
| mediaCover | 封面图片路径 |

#### 幻灯片级属性

| 属性 | 说明 |
|------|------|
| background | 背景（纯色或图片） |
| notes | 演讲者备注 |
| hidden | 隐藏幻灯片 |
| slideNumber | 显示页码 |
| masterName | 使用的母版名称 |
| sectionTitle | 所属章节标题 |

#### 兼容模式

不使用 `elements` 时，可用 `title`/`body`/`layout` 快速生成：

- `title`：标题居中大号 + 副标题居中
- `section`：标题左对齐中号
- `content`：标题顶部 + 正文区域（默认）
- `blank`：空白幻灯片

#### 演示文稿级配置

**母版（masters）**

定义可复用的幻灯片母版，包含背景、边距、页码和对象（文本、图片、矩形、线条、图表、占位符）。

**章节（sections）**

将幻灯片分组到不同章节，支持标题和顺序。

**自定义布局（layouts）**

定义自定义页面尺寸（名称、宽度、高度英寸）。内置布局：`LAYOUT_WIDE`（16:9，13.33×7.5）、`LAYOUT_4x3`（10×7.5）、`LAYOUT_A4`

**元数据（presentationMeta）**

作者、公司、主题、修订号、标题、RTL 模式、标题字体、正文字体

### edit — 编辑演示文稿

参数：`file`（文件路径，必填）、`replacements`（查找替换列表，必填）

遍历所有幻灯片 XML 执行文本替换，保留原有格式和主题。

### analyze — 分析演示文稿

参数：`file`（文件路径，必填）

返回幻灯片数量和每页文本内容（截取前 8000 字符）。

### append-slides — 追加幻灯片

参数：`file`（已有 PPTX 文件路径，必填）、`slides`（新幻灯片数组，必填）

向已有 PPTX 文件末尾追加新幻灯片。新幻灯片的结构与 create 的 slides 参数完全相同，支持所有元素类型（text、image、shape、table、chart、media）和幻灯片级属性（background、notes 等）。

底层通过 AdmZip 打开已有 PPTX 的 ZIP 结构，用 pptxgenjs 生成仅包含新幻灯片的临时 PPTX，然后将临时 PPTX 中的幻灯片 XML 及关联资源（图片、关系文件）合并到已有 PPTX 中，自动处理幻灯片编号和内容类型引用。

返回追加的幻灯片数量、新文件路径和总幻灯片数。

### update-slide — 更新单张幻灯片

参数：`file`（已有 PPTX 文件路径，必填）、`slideIndex`（目标幻灯片索引，0-based，必填）、`elements`（新元素数组，必填）

替换已有 PPTX 中指定幻灯片的内容。通过 AdmZip 打开已有 PPTX ZIP 结构，用 pptxgenjs 生成仅包含替换内容的临时单页 PPTX，然后将临时 PPTX 中幻灯片的 XML 及关联资源替换到目标幻灯片位置，保持幻灯片编号不变。

**注意：update-slide 会完全替换目标幻灯片的所有元素，原有幻灯片内容将丢失。** 如需叠加内容，应先分析原有幻灯片，将原有元素与新元素合并后一起传入。

返回更新的幻灯片索引和新文件路径。

### 增量调用策略

| 场景 | 策略 |
|------|------|
| 大型演示文稿（>10 张幻灯片） | 先用 create 创建初始幻灯片（3-5 张），再用 append-slides 分批追加后续幻灯片 |
| 需修改单张幻灯片内容 | 使用 update-slide 局部替换，而非重新 create 整个演示文稿 |
| 需修改多张幻灯片 | 每次调用 update-slide 只修改一张幻灯片，逐页修改并逐页验证 |
| 多次追加幻灯片 | append-slides 可多次调用，每次追加一批幻灯片 |
| 超过 50 张幻灯片 | 硬性上限：单次最多 50 张，超过时 Zod 校验会拒绝，必须分批操作 |

**原则：对于大型或需要局部修改的演示文稿，优先使用增量操作（append-slides/update-slide）而非重新创建整个文档。修改多张幻灯片时，每次只改一张，改完验证后再改下一张。**

## 坐标与尺寸单位

- 默认单位为英寸（如 `x: 1, y: 0.5, w: 10, h: 3`）
- 支持百分比字符串（如 `x: '10%'`）
- 16:9 布局页面尺寸为 13.33 × 7.5 英寸

## 输出路径与原地修改

- **create** 操作：生成文件自动写入 `ae/documents/pptx/` 子目录，文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.pptx`。如需自定义路径，传入 `outputPath` 参数
- **edit/append-slides/update-slide** 操作：不指定 `outputPath` 时原地修改原文件（修改前自动备份为同目录 `.bak` 文件，修改成功后删除备份；修改失败则自动从备份恢复原文件）。指定 `outputPath` 时生成新文件，不修改原文件

## 视觉验证（硬约束）

**创建或修改 PPTX 后必须进行视觉验证。** 这是不可跳过的交付步骤。

### 标准验证流程

1. 先通过 `ae:libreoffice` 技能确认 LibreOffice 就绪（check 操作）
2. 调用 `ae-pptx` 工具 `operation=to-image`，传入刚生成/修改的 PPTX 文件路径
3. 调用 `ae:image` 技能识别每张 PNG 图片的视觉内容（模型支持 vision 时可直接用 Read 工具读取图片）
4. 对照风格规格书和内容大纲，检查每张幻灯片的布局、配色、字体、内容是否符合预期
5. 发现问题时使用 edit/update-slide 修正，修正后再次 to-image + ae:image 验证
6. 所有幻灯片验证通过后才算交付完成

### 必须验证全部幻灯片

- create / edit / append-slides 后：必须验证全部幻灯片
- update-slide 增量修改后：只需验证修改页及其前后相邻页（如修改第 5 页，验证第 4-6 页）
- 大型演示文稿可分批验证（每次 3-5 张），但全量创建/编辑时所有幻灯片都必须覆盖

### to-image 操作

参数：
- `operation`：`to-image`
- `file`：PPTX 文件路径（必填）
- `pages`：指定幻灯片页码列表（1-based），如 `[1, 3, 5]` 只验证第1、3、5张幻灯片；省略则转换所有幻灯片

输出：每张幻灯片对应一张 PNG 图片，写入 `ae/documents/pptx/` 目录。

### 何时必须验证

- create 创建新演示文稿后
- edit 编辑现有演示文稿后
- append-slides 追加幻灯片后
- update-slide 更新单张幻灯片后

### 何时可不验证

- analyze（只读分析）
- to-markdown（只读读取）
- 未对文件做任何修改的纯查看场景

## 边界

- 仅处理当前工作区内本地文件
- 所有操作通过内置 `ae-pptx` 工具完成，无需额外安装依赖
- 浏览器操作统一通过 `ae:chrome-devtools` 技能完成
