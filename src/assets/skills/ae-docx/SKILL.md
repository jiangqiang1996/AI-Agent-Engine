---
name: ae:docx
description: "所有涉及 .docx 文件的读取、创建、编辑、分析、格式转换和视觉验证操作都必须使用本技能。包括：创建文档、编辑文本替换、分析段落和表格结构、修订追踪、追加内容块、更新单个块、将 DOCX 转为 Markdown 阅读、将 DOCX 转为图片进行视觉验证。禁止使用 Read 或 Bash 直接读取 .docx 文件内容，必须通过本技能的 to-markdown 或 analyze 操作。创建或修改 DOCX 后必须通过 to-image 操作进行视觉验证。"
argument-hint: "[创建|编辑|分析|修订|追加|更新块] [文件路径] [任务描述]"
---

# ae:docx — Word 文档处理

创建、编辑、分析 `.docx` 文件。通过内置 `ae-docx` 工具实现，无需安装额外依赖。

## to-markdown 操作

本技能的 `to-markdown` 操作可将 DOCX 转为 Markdown 供 LLM 阅读。支持 `outputMode` 参数控制输出方式：
- `file`（默认）：写入 `ae/markdown/` 目录
- `inline`：直接返回 Markdown 内容，不写文件

| 场景 | 用本技能 to-markdown | 用本技能其他操作 |
|------|---------------------|-----------------|
| 只读理解文档内容 | ✅ 转 Markdown 供 LLM 阅读 | ❌ |
| 只读理解文档视觉内容 | ❌ | ✅ to-image 转 PNG + ae:image 识别 |
| 创建新文档 | ❌ | ✅ 输出 .docx |
| 编辑现有文档 | ❌ | ✅ 输出 .docx |
| 修订追踪（tracked changes） | ❌ | ✅ 输出 .docx |
| 提取纯文本 | ✅ 优先用 to-markdown | 仅需结构化分析时用 analyze |

**原则：只需读取内容时用 `to-markdown` 操作；需要创建或修改 .docx 文件时用其他操作。创建或修改后必须用 `to-image` 视觉验证。需要理解文档视觉内容但模型不支持 vision 时，走"to-image → ae:image"路径。**

## 读取内容的两种路径

- **文本提取**：`to-markdown` 将 DOCX 转为 Markdown，适合提取文字内容、标题层级和表格结构
- **视觉理解**：`to-image` 将 DOCX 转为 PNG 图片，再用 `ae:image` 技能识别图片内容，适合理解排版、样式、表格布局和整体视觉效果

当模型不支持 vision 时，必须走"to-image → ae:image"路径来理解文档视觉内容，禁止尝试直接读取 .docx 文件。

## 核心工作流：两阶段预览确认

所有创建和编辑操作必须遵循两阶段流程：

### 阶段一：内容大纲确认（必须）

在调用 `ae-docx` 工具前，先向用户展示即将生成的内容大纲，等待用户确认后再执行。

**大纲只包含内容，不包含布局或设计描述。** 布局、配色、字体等设计决策由 `@doc-architect` 负责，大纲确认阶段不应出现这些信息。

- **create**：展示内容大纲
  - 标题层级（H1-H6）+ 标题文本
  - 段落摘要（每段前 20 字）
  - 表格结构（行数 × 列数 + 表头）
  - 图片列表（来源 + 尺寸）
  - 引用和代码块摘要
  - 不包含：颜色、字体、字号、间距等设计信息
- **append-blocks**：展示追加的内容大纲
  - 同 create 的大纲格式
  - 标注"追加到现有文档末尾"
- **update-block**：展示原块摘要和新块内容
  - 原块：块索引 + 类型 + 内容摘要
  - 新块：替换后的完整内容
- **track-changes**：展示变更对照表
  - 序号 | 原文 | 新文
- **edit**：展示替换对照表
  - 序号 | 查找文本 | 替换文本

### 阶段二：执行生成

用户确认内容大纲后，先调度 `@doc-architect` 制定风格规格书（如尚未制定），再按规格书调用 `ae-docx` 工具执行操作。

## 调用纪律（硬约束）

预览确认后只调用一次工具，禁止无理由反复生成。

| 场景 | 允许操作 |
|------|----------|
| 预览确认后首次生成 | 调用一次 create |
| 生成后发现小差异 | 调用 edit 或 track-changes 更新现有文件 |
| 生成后发现大差异（结构变化） | 重新调用 create 生成 |
| 需要追加内容到已有文档 | 调用 append-blocks |
| 需要修改单个内容块 | 调用 update-block |
| 工具返回错误 | 分析原因，修正参数后重试一次 |
| 无理由反复调用 | 禁止 |

**文件已生成后优先编辑而非重新生成**：发现差异时首选 `edit`、`track-changes`、`append-blocks` 或 `update-block` 操作更新现有文件；仅当内容结构性变化无法通过编辑完成时才重新 `create`。

### 增量调用策略

- **大型文档（>15个内容块）**：先 `create` 创建初始部分（前 15 个块），再 `append-blocks` 分批追加后续内容。每次追加不超过 15 个块，避免单次生成过多内容导致质量问题
- **硬性上限：单次最多 80 个内容块**。超过时 Zod 校验会拒绝，必须分批操作
- **需要修改单个块**：使用 `update-block` 替换指定索引的内容块，而非重新 `create` 整个文档
- **append-blocks 可多次调用**：每次追加一批内容块，逐步构建大型文档
- **update-block 的 blockIndex**：先用 `analyze` 操作确认文档中有多少个内容块，再确定要更新的索引

## 文档架构师协作（硬约束）

**创建新文档、大规模修改已有文档、追加内容块或逐块编辑时，必须先调度 `@doc-architect` 代理制定风格规格书，再按规格书执行。** 跳过此步骤直接生成是违规行为。

### 硬约束规则

1. **create 前**：必须先调度 `@doc-architect` 制定全局风格规格书
2. **append-blocks 前**：必须先调度 `@doc-architect` 确认追加内容的风格规格书（可引用已有规格书）
3. **update-block 前**：已有全局规格书时，引用规格书确认该块风格不偏离即可，无需重新调度 `@doc-architect`；无规格书时需先调度制定
4. **用户设计约束优先**：如果用户在提示词中声明了设计约束（配色、字体、布局、风格等），`@doc-architect` 必须在用户的设计约束下进行设计，禁止违背用户的设计
5. **风格统一**：`@doc-architect` 必须确保全文档风格统一，逐块编辑时不得破坏已有风格

### 何时可跳过 @doc-architect

| 场景 | 原因 |
|------|------|
| 小范围文本替换 | 不涉及风格变更，直接用 edit |
| 修订追踪 | 不涉及风格变更，直接用 track-changes |

### 协作流程

1. 调度 `@doc-architect`，传入文档类型（DOCX）、目标受众、用户设计约束（如有）和风格偏好
2. `@doc-architect` 在用户设计约束下输出风格规格书
3. 按规格书的风格参数执行 create/append-blocks/update-block
4. 生成后用 to-image 视觉验证风格一致性

## 风格统一规则（硬约束）

创建或修改文档时，必须保持全文档风格统一。

### 字体一致性

- 全文档使用统一的标题字体和正文字体
- 同级标题的字号和样式必须一致（如所有 H1 都是 `fontSize: 24, bold: true`）
- 不得在不同章节使用不同字体族，除非有明确的语义区分需求（如代码块用等宽字体）

### 配色一致性

- 全文档使用统一的配色方案：标题色、正文色、强调色
- 不得在某个章节突然改变文字颜色
- 表格的表头底色和边框样式在全文档中保持一致

### 颜色安全规范（硬约束）

`docx` 库的 `TextRun` 在未设置 `color` 时默认使用黑色，适用于白底文档（常见场景）。但暗色背景文档或使用底纹的表格单元格中，未设置颜色的文字可能不可见。创建时必须遵守以下规范：

1. **每个 run 显式设置 `color`**：使用 `runs` 数组时，每个 run 都应设置 `color`，不依赖默认值
2. **表格单元格专项检查**：当单元格有 `shading`（底纹）时，文字 `color` 必须与底纹色形成足够对比度
3. **暗色背景文档**：DOCX 不常用于暗色背景，但如使用深色页面底纹，所有文字必须显式设置浅色 `color`
4. **对比度预检**：创建前对照风格规格书中的背景色和文字色，预估对比度是否满足 WCAG AA（4.5:1）
5. **常见陷阱**：
   - 只在 block 级别设置 `color` 但 run 级别未设置 → run 使用默认黑色
   - 表格表头有底纹但文字未设 color → 可能与底纹色接近导致不可读
   - 使用 `highlight` 但未设 `color` → 高亮背景上的默认黑色文字可能对比度不足

### 页眉页脚一致性

- 通过 `sections` 设定页眉和页脚，确保全文档统一
- 不要只在部分页面添加页眉页脚，要统一处理
- 如需首页无页眉，使用 `sections.headers.first` 区分首页和后续页

### 段落间距一致性

- 同级标题的间距统一（如所有 H1 前后间距相同）
- 正文段落使用统一的 `spacing` 设置
- 列表项的间距统一

## 样式参数精简规则（硬约束）

编辑或修改已有文档时，只传入必须修改的参数，不要传入与原文一致的样式参数。

### 原则

1. **只传差异参数**：`edit` 和 `track-changes` 操作只做文本替换，无需传样式参数；`update-block` 只传需要修改的块及其差异字段
2. **默认值信任**：未指定的样式字段使用文档模板默认值或原文样式，不要为了"完整"而传入与默认值相同的参数
3. **create 时才设全局样式**：创建新文档时可通过 `sections` 和 `documentMeta` 设定全局样式（字体、页边距、页眉页脚）；修改已有文档时不要重建全局样式

### 典型错误

| 错误做法 | 正确做法 |
|----------|----------|
| update-block 传入所有样式字段，即使与原文一致 | 只传需要改变的字段（如只改 `text`，不传 `fontSize`/`bold` 等） |
| edit 操作附带样式描述 | edit 只做文本查找替换，无需样式参数 |
| 修改已有文档时重新设定 sections | 保留原文的节属性，不要覆盖 |

## 可用操作

### create — 创建新文档

参数：`title`（可选标题）、`blocks`（内容块数组）、`sections`（节属性数组，可选）、`documentMeta`（文档元数据，可选）

#### 内容块类型（11 种）

**1. heading — 标题**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'heading'` | 固定值 |
| `level` | `number` 1-6 | 标题级别，默认 1 |
| `text` | `string` | 标题文本 |
| `bold` / `italics` | `boolean` | 粗体/斜体 |
| `color` | `string` | 字体颜色（十六进制，如 `FF0000`） |
| `fontSize` | `number` | 字号（磅） |
| `fontFace` | `string` | 字体名称 |
| `align` | `'left' \| 'center' \| 'right' \| 'justify'` | 对齐方式 |

**2. paragraph — 段落**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'paragraph'` | 固定值 |
| `text` | `string` | 段落文本 |
| `bold` / `italics` / `strike` | `boolean` | 文本样式 |
| `underline` | `'single' \| 'double' \| 'dash' \| 'dot' \| 'wave' \| 'none'` | 下划线类型 |
| `color` / `fontFace` / `highlight` | `string` | 颜色/字体/高亮 |
| `fontSize` | `number` | 字号（磅） |
| `align` | `'left' \| 'center' \| 'right' \| 'justify'` | 对齐方式 |
| `spacing` | `{ before?, after?, line? }` | 段落间距（缇） |
| `indent` | `{ left?, right?, firstLine? }` | 段落缩进（缇） |
| `runs` | `RunStyle[]` | 富文本运行数组（同段多样式） |

**3. bullet — 项目符号列表**

与 `paragraph` 相同的字段，自动添加项目符号前缀。

**4. numbered — 编号列表**

与 `paragraph` 相同的字段，自动添加编号前缀。

**5. table — 表格**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'table'` | 固定值 |
| `rows` | `TableCell[][]` | 表格行数据 |
| `tableWidth` | `number` 0-100 | 表格宽度百分比 |
| `tableLayout` | `'fixed' \| 'autofit'` | 布局模式 |

表格单元格 `TableCell`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | 单元格文本 |
| `style` | `TableCellStyle` | 单元格样式 |

单元格样式 `TableCellStyle`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `width` | `{ size, type? }` | 单元格宽度（`type`: `pct`/`dxa`） |
| `shading` | `{ fill, type? }` | 底纹（`fill`: 十六进制颜色，`type`: `clear`/`solid`） |
| `verticalAlign` | `'top' \| 'center' \| 'bottom'` | 垂直对齐 |
| `borders` | `{ top?, bottom?, left?, right? }` | 各方向边框（`style`/`size`/`color`） |
| `margin` | `{ top?, bottom?, left?, right? }` | 单元格边距（缇） |
| `colspan` | `number` | 列合并数 |
| `rowspan` | `number` | 行合并数 |
| `bold` / `italics` | `boolean` | 文本样式 |
| `fontSize` / `color` | `number` / `string` | 字号/颜色 |
| `align` | `'left' \| 'center' \| 'right' \| 'justify'` | 水平对齐 |

**6. image — 图片**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'image'` | 固定值 |
| `imagePath` | `string` | 图片文件路径（与 `imageData` 二选一） |
| `imageData` | `string` | 图片 base64 数据（与 `imagePath` 二选一） |
| `imageWidth` | `number` | 宽度（像素，默认 200） |
| `imageHeight` | `number` | 高度（像素，默认 200） |
| `imageAlt` | `string` | 替代文本 |

**7. page-break — 分页符**

只需 `type: 'page-break'`，无需其他字段。

**8. code — 代码块**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'code'` | 固定值 |
| `text` | `string` | 代码内容 |
| `codeLanguage` | `string` | 代码语言标识（用于提示） |

代码块以等宽字体渲染，带浅灰底纹和边框。

**9. quote — 引用**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'quote'` | 固定值 |
| `text` | `string` | 引用文本 |
| `quoteStyle` | `'indent' \| 'block'` | 引用样式：`indent`=缩进引用，`block`=块引用带左边框 |
| `bold` / `italics` / `color` / `fontSize` / `fontFace` | 同段落 | 文本样式 |

**10. hr — 水平线**

只需 `type: 'hr'`，无需其他字段。渲染为水平分隔线。

**11. hyperlink — 超链接**

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | `'hyperlink'` | 固定值 |
| `hyperlink` | `HyperlinkRun` | 超链接配置 |

超链接 `HyperlinkRun`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | 链接显示文本 |
| `url` | `string` | 链接 URL |
| `bold` / `italics` | `boolean` | 文本样式 |
| `color` | `string` | 字体颜色 |
| `underline` | `'single' \| 'double' \| 'none'` | 下划线类型 |

#### 富文本运行 RunStyle

当段落或列表项需要同段内多种样式时，使用 `runs` 数组替代 `text`：

| 字段 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | 文本片段 |
| `bold` / `italics` / `strike` | `boolean` | 文本样式 |
| `underline` | `'single' \| 'double' \| 'dash' \| 'dot' \| 'wave' \| 'none'` | 下划线 |
| `doubleStrike` / `subscript` / `superscript` | `boolean` | 双删除线/下标/上标 |
| `color` / `fontFace` / `highlight` | `string` | 颜色/字体/高亮 |
| `fontSize` | `number` | 字号（磅） |
| `breakAfter` | `boolean` | 运行后换行 |

#### 节属性 SectionProps

用于控制文档节的页面设置。传入 `sections` 数组时，第一个节包含所有内容块，后续节为空节（用于不同页面设置的分隔）。

| 字段 | 类型 | 说明 |
|------|------|------|
| `pageSize` | `{ width?, height?, orientation? }` | 页面尺寸（英寸），`orientation`: `portrait`/`landscape` |
| `margins` | `{ top?, bottom?, left?, right?, header?, footer? }` | 页边距（英寸） |
| `headers` | `{ default?, first?, even? }` | 页眉文本 |
| `footers` | `{ default?, first?, even? }` | 页脚文本 |
| `columnCount` | `number` 1-16 | 分栏数 |
| `columnSpacing` | `number` | 栏间距（英寸） |

#### 文档元数据 DocumentMeta

设置文档核心属性（显示在 Word 的文件属性中）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | `string` | 文档标题 |
| `creator` | `string` | 作者 |
| `subject` | `string` | 主题 |
| `description` | `string` | 描述 |
| `keywords` | `string` | 关键词 |
| `category` | `string` | 分类 |
| `lastModifiedBy` | `string` | 最后修改者 |
| `revision` | `number` | 修订版本号 |

### edit — 编辑现有文档

参数：`file`（文件路径）、`replacements`（查找替换列表）

直接修改 XML 保留原有格式，适用于批量文本替换。

### analyze — 分析文档

参数：`file`（文件路径）

返回段落计数、表格计数和文本内容（截取前 8000 字符）。

### track-changes — 修订追踪

参数：`file`（文件路径）、`changes`（修订变更列表）

用 Word 修订标记（`<w:ins>`/`<w:del>`）标记增删，审阅者可在 Word 中接受或拒绝。

**限制**：查找文本需位于同一个 `<w:t>` 元素内。如果文本被 Word 拆分到多个 run（常见于混合格式段落），匹配会失败。建议先分析文档结构确认文本连续性。

### append-blocks — 追加内容块

参数：`file`（已有 DOCX 文件路径）、`blocks`（新内容块数组，与 create 的 blocks 结构相同）

向已有 DOCX 文件的 `<w:body>` 末尾追加内容块，保留原有内容不变。适用于：

- 大型文档分批创建：先 create 创建初始部分，再多次 append-blocks 追加后续内容
- 向已有文档追加新章节、表格或图片

**图片处理**：追加的内容块中包含图片时，自动将图片资源和关系合并到已有 DOCX。

**预览确认**：调用前必须向用户展示追加的内容块大纲。

### update-block — 更新指定内容块

参数：`file`（文件路径）、`blockIndex`（0-based 块索引）、`block`（新内容块对象）

替换已有 DOCX 中第 `blockIndex` 个内容块（按 `<w:p>`、`<w:tbl>`、`<w:sdt>` 等顶层元素计数），不影响其他块。

**索引确定**：建议先用 `analyze` 操作了解文档结构，再确定要更新的块索引。

**适用场景**：
- 修改单个段落、标题或表格
- 替换某个位置的图片

**预览确认**：调用前必须向用户展示原块摘要和新块内容。

## 输出路径与原地修改

- **create** 操作：生成文件自动写入 `ae/documents/docx/` 子目录，文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.docx`。文件名中的非 ASCII 字符（如中文标题）会自动替换为连字符，确保跨平台安全。如需自定义路径，传入 `outputPath` 参数
- **edit/track-changes/append-blocks/update-block** 操作：不指定 `outputPath` 时原地修改原文件（修改前自动备份为同目录 `.bak` 文件，修改成功后删除备份；修改失败则自动从备份恢复原文件）。指定 `outputPath` 时生成新文件，不修改原文件

## 视觉验证（硬约束）

**创建或修改 DOCX 后必须进行视觉验证。** 这是不可跳过的交付步骤。

### 标准验证流程

1. 先通过 `ae:libreoffice` 技能确认 LibreOffice 就绪（check 操作）
2. 调用 `ae-docx` 工具 `operation=to-image`，传入刚生成/修改的 DOCX 文件路径
3. 调用 `ae:image` 技能识别每张 PNG 图片的视觉内容（模型支持 vision 时可直接用 Read 工具读取图片）
4. **四维交叉验证**（不可跳过，详见下方四个验证维度）
5. 发现问题时使用 edit/update-block 修正，修正后再次 to-image + ae:image 验证
6. 所有页面验证通过后才算交付完成

### 四维交叉验证

视觉验证不是只"看一眼图片有没有内容"，必须同时执行以下四个维度的检查。每个维度都必须逐页通过，任何一个维度发现不一致就判定为验证失败，必须修复后重新验证。

#### 维度一：内容一致性验证（对照大纲）

将 `ae:image` 识别到的文字内容与确认时的内容大纲逐页对比：

- 每页的标题、段落文本是否与大纲一致（允许合理的文字润色，但语义不能偏离）
- 是否有遗漏的要点、多余的文字、错误的术语
- 表格内容是否与大纲匹配（单元格文本、行列数）
- 代码块内容是否与大纲完全一致
- 图片说明文字是否与大纲对应

**判定标准**：识别到的文字内容与大纲语义一致。出现遗漏、错误或多余内容时判定为不一致。

#### 维度二：设计一致性验证（对照风格规格书）

将 `ae:image` 识别到的颜色、布局、字体与 `@doc-architect` 给出的风格规格书逐页对比：

- 页面背景色是否与规格书一致
- 正文文字颜色是否与规格书一致（不应出现与背景色相近导致不可见的文字）
- 标题/强调色是否与规格书一致
- 字体是否与规格书一致
- 段落间距、缩进、对齐方式是否与规格书一致
- 表格样式（边框、底纹、对齐）是否与规格书一致

**判定标准**：视觉呈现与风格规格书一致。出现颜色偏差、字体替换、布局错位时判定为不一致。

#### 维度三：文字对比度验证

逐页检查每页中所有文字与背景的对比度是否满足可读性要求：

- 正文文字在背景上是否清晰可辨（WCAG AA 最低 4.5:1，推荐 AAA 7:1）
- 次要文字/说明文字是否可读（不能与背景色过于接近）
- 是否存在黑色文字出现在深色背景上（不可接受的对比度）
- 是否存在浅色文字出现在浅色背景上（同样不可接受）
- 表格文字在单元格背景上是否可读

**判定标准**：所有文字在其实际背景色上均清晰可辨，无对比度不足的文字。出现不可见或难以辨认的文字时判定为验证失败。

#### 维度四：页眉页脚与跨页一致性验证

逐页检查页眉、页脚和其他跨页统一元素是否一致：

- 页眉内容是否在所有页面一致（如有页眉设计）
- 页脚内容是否在所有页面一致（如有页脚设计）
- 页码格式和位置是否统一
- 章节标题样式是否在所有页面一致
- 字体、字号在不同页面间是否保持一致
- 段落间距、行距在不同页面间是否保持一致
- 表格样式、代码块样式在不同页面间是否保持一致
- 是否有某些页面突然出现不同的背景色、边框或装饰元素

**判定标准**：跨页元素（页眉、页脚、页码、整体风格）在所有页面保持一致。出现不统一的页面时判定为验证失败。

### 验证失败时的修复循环

1. 记录不一致的具体页码、维度和问题描述
2. 使用 edit/update-block 修正对应内容块
3. 修正后再次 to-image + ae:image 重新验证**该页及相邻页**
4. 如果是全局性问题（如颜色继承 bug），需要修正所有受影响页面后全量重新验证
5. 修复循环最多 3 轮；3 轮后仍有问题则停止并向用户报告

### 必须验证全部页面

- create / edit / append-blocks 后：必须验证全部页面
- update-block / track-changes 增量修改后：只需验证修改块所在页及其前后相邻页
- 大型文档可分批验证（每次 3-5 页），但全量创建/编辑时所有页面都必须覆盖

### to-image 操作

参数：
- `operation`：`to-image`
- `file`：DOCX 文件路径（必填）
- `pages`：指定页码列表（1-based），如 `[1, 3]` 只验证第1、3页；省略则转换所有页

输出：每页对应一张 PNG 图片，写入 `ae/documents/docx/` 目录。

DOCX 的 to-image 路径为：DOCX → PDF（LibreOffice soffice --convert-to pdf）→ PNG（pdfjs-dist + @napi-rs/canvas），需要 LibreOffice。

### 何时必须验证

- create 创建新文档后
- edit 编辑文档后
- track-changes 修订追踪后
- append-blocks 追加内容后
- update-block 更新内容块后

### 何时可不验证

- analyze（只读分析）
- to-markdown（只读读取）

## 边界

- 仅处理当前工作区内本地文件
- 不处理加密文档（需用户先解密）
- 所有操作通过内置 `ae-docx` 工具完成，无需额外安装依赖
- 图片支持 PNG 和 JPEG 格式
- 表格合并单元格（colspan/rowspan）在 Word 中渲染为合并单元格
