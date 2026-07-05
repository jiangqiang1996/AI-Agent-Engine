---
name: ae:docx
description: "所有涉及 .docx 文件的读取、创建、编辑、分析和格式转换操作都必须使用本技能。包括：创建文档、编辑文本替换、分析段落和表格结构、修订追踪、追加内容块、更新单个块、合并多个文档、拆分文档、将 DOCX 转为 Markdown 阅读、将 DOCX 转为图片辅助理解视觉内容。禁止使用 Read 或 Bash 直接读取 .docx 文件内容，必须通过本技能的 to-markdown 或 analyze 操作。"
argument-hint: "[创建|编辑|分析|修订|追加|更新块] [文件路径] [任务描述]"
---

# ae:docx — Word 文档处理

创建、编辑、分析 `.docx` 文件。通过内置 `ae-docx` 工具实现，无需额外安装依赖。

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

**原则：只需读取内容时用 `to-markdown` 操作；需要创建或修改 .docx 文件时用其他操作。需要理解文档视觉内容但模型不支持 vision 时，走"to-image → ae:image"路径。**

## 读取内容的两种路径

- **文本提取**：`to-markdown` 将 DOCX 转为 Markdown，适合提取文字内容、标题层级和表格结构
- **视觉理解**：`to-image` 将 DOCX 转为 PNG 图片，再用 `ae:image` 技能识别图片内容，适合理解排版、样式、表格布局和整体视觉效果

当模型不支持 vision 时，必须走"to-image → ae:image"路径来理解文档视觉内容，禁止尝试直接读取 .docx 文件。

## 参数体大小控制（硬约束）

opencode 工具调用的参数通过 JSON 传输，当参数体过大时可能导致 JSON 解析失败。为避免此问题，必须控制单次工具调用的参数体大小：

1. **单次 create 内容块数 ≤ 15 个**：即使 Zod 上限是 80 个块，实际调用时应将每次 create 的块数控制在 15 个以内，大幅降低参数体体积
2. **单次 append-blocks 内容块数 ≤ 15 个**：追加内容时同样控制在 15 个以内
3. **含大型表格的内容块单独操作**：表格的嵌套二维数组结构会大幅增加参数体体积，含大型表格的文档不应与纯文本块混合在同一次调用中
4. **含图片的内容块优先使用 imagePath**：图片优先使用 `imagePath` 引用本地文件，避免 `imageData` 内联 base64
5. **大型文档分步构建**：先 create 创建初始部分，再 append-blocks 分批追加后续内容

**分步写入示例**（30 个内容块的大型文档）：

```
第 1 次 create：         创建前 12 个块（标题 + 前言 + 3 个章节的开头部分）
第 2 次 append-blocks：  追加 10 个块（章节 4 + 章节 5）
第 3 次 append-blocks：  追加 8 个块（章节 6 + 附录）
```

**含大型表格的分步写入示例**：

```
第 1 次 create：         创建前 10 个块（不含大型表格块）
第 2 次 append-blocks：  追加大型表格块（单独操作）
第 3 次 append-blocks：  追加剩余 5 个块
```

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

### update-block — 更新指定内容块

参数：`file`（文件路径）、`blockIndex`（0-based 块索引）、`block`（新内容块对象）

替换已有 DOCX 中第 `blockIndex` 个内容块（按 `<w:p>`、`<w:tbl>`、`<w:sdt>` 等顶层元素计数），不影响其他块。

**索引确定**：建议先用 `analyze` 操作了解文档结构，再确定要更新的块索引。

**适用场景**：
- 修改单个段落、标题或表格
- 替换某个位置的图片

### merge — 合并多个 DOCX 文件

参数：`files`（要合并的 DOCX 文件路径列表，至少 2 个）

将多个 DOCX 文件的正文内容合并为一个文件。合并时：
- 自动迁移 media/embeddings 资源（图片、嵌入对象）
- 自动补充 `[Content_Types].xml` 中缺失的资源类型声明
- 剥离源文档的分节符避免冲突

**适用场景**：
- 将多个独立章节文档合并为完整报告
- 团队协作后合并各成员负责的文档部分

**输出**：生成文件自动写入 `ae/documents/docx/` 子目录，可通过 `outputPath` 参数自定义路径。

### split — 拆分 DOCX 文件

参数：`file`（要拆分的 DOCX 文件路径）

将一个 DOCX 文件按分节符（`w:sectPr`）或分页符（`w:br type="page"`）拆分为多个独立文件。优先按分节符拆分，无分节符时降级按分页符拆分。

**适用场景**：
- 将大型报告拆分为独立章节
- 提取文档中的特定部分

**输出**：生成多个 DOCX 文件，写入 `ae/documents/docx/` 子目录，文件名包含 `sectionN` 序号。路径通过 `outputPaths` 返回。

**限制**：文档必须包含至少 2 个分节符或分页符，否则无法拆分。

## 输出路径与原地修改

- **create** 操作：生成文件自动写入 `ae/documents/docx/` 子目录，文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.docx`。文件名中的非 ASCII 字符（如中文标题）会自动替换为连字符，确保跨平台安全。如需自定义路径，传入 `outputPath` 参数
- **edit/track-changes/append-blocks/update-block** 操作：不指定 `outputPath` 时原地修改原文件（修改前自动备份为同目录 `.bak` 文件，修改成功后删除备份；修改失败则自动从备份恢复原文件）。指定 `outputPath` 时生成新文件，不修改原文件

## to-image 操作

参数：
- `operation`：`to-image`
- `file`：DOCX 文件路径（必填）
- `pages`：指定页码列表（1-based），如 `[1, 3]` 只验证第1、3页；省略则转换所有页

输出：每页对应一张 PNG 图片，写入 `ae/documents/docx/` 目录。

DOCX 的 to-image 路径为：DOCX → PDF（LibreOffice soffice --convert-to pdf）→ PNG（pdfjs-dist + @napi-rs/canvas），需要 LibreOffice。

## 边界

- 支持任意本地绝对路径（工作区内和工作区外均可），工作区外写入操作会请求用户确认
- 不处理加密文档（需用户先解密）
- 所有操作通过内置 `ae-docx` 工具完成，无需额外安装依赖
- 图片支持 PNG 和 JPEG 格式
- 表格合并单元格（colspan/rowspan）在 Word 中渲染为合并单元格
