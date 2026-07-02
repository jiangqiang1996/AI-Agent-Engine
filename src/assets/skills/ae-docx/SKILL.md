---
name: ae:docx
description: "创建、编辑、分析 Word 文档（.docx），支持 11 种内容块类型、富文本运行、表格单元格样式、节属性和文档元数据。支持增量追加和局部更新。通过 ae-docx 工具实现，输出仍为 .docx。"
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
| 创建新文档 | ❌ | ✅ 输出 .docx |
| 编辑现有文档 | ❌ | ✅ 输出 .docx |
| 修订追踪（tracked changes） | ❌ | ✅ 输出 .docx |
| 提取纯文本 | ✅ 优先用 to-markdown | 仅需结构化分析时用 analyze |

**原则：只需读取内容时用 `to-markdown` 操作；需要创建或修改 .docx 文件时用其他操作。**

## 核心工作流：两阶段预览确认

所有创建和编辑操作必须遵循两阶段流程：

### 阶段一：预览确认（必须）

在调用 `ae-docx` 工具前，先向用户展示即将生成的内容结构，等待用户确认后再执行。

- **create**：展示内容块大纲
  - 标题层级（H1-H6）
  - 段落摘要（每段前 20 字）
  - 表格结构（行数 × 列数 + 表头）
  - 图片列表（来源 + 尺寸）
  - 引用和代码块摘要
- **append-blocks**：展示追加的内容块大纲
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

用户确认后，调用 `ae-docx` 工具执行操作。

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

## 输出路径

生成文件自动写入 `ae/documents/docx/` 子目录，文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.docx`。如需自定义路径，传入 `outputPath` 参数。

## 边界

- 仅处理当前工作区内本地文件
- 不处理加密文档（需用户先解密）
- 所有操作通过内置 `ae-docx` 工具完成，无需额外安装依赖
- 图片支持 PNG 和 JPEG 格式
- 表格合并单元格（colspan/rowspan）在 Word 中渲染为合并单元格
