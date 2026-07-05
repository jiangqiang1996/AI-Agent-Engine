---
name: ae:pptx
description: "所有涉及 .pptx 文件的读取、创建、编辑、分析、格式转换和视觉验证操作都必须使用本技能。包括：创建演示文稿、编辑现有 PPTX、分析幻灯片结构、追加幻灯片、更新单张幻灯片、合并多个演示文稿、将 PPTX 转为 Markdown 阅读、将 PPTX 转为图片进行视觉验证。禁止使用 Read 或 bash 直接读取 .pptx 文件内容，必须通过本技能的 to-markdown 或 analyze 操作。"
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

**原则：只需读取内容时用 `to-markdown` 操作；需要创建或修改 .pptx 文件时用其他操作。**

## 读取内容的两种路径

- **文本提取**：`to-markdown` 将 PPTX 转为 Markdown，适合提取文字内容、标题层级和表格结构
- **视觉理解**：`to-image` 将 PPTX 转为 PNG 图片，再用 `ae:image` 技能识别图片内容，适合理解布局、样式、图表和整体视觉效果

当模型不支持 vision 时，必须走"to-image → ae:image"路径来理解文档视觉内容，禁止尝试直接读取 .pptx 文件。

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

#### textRuns 多段落列表约束（硬约束）

`textRuns` 是 pptxgenjs 的同段落富文本运行数组，用于在**同一个段落内**混合不同样式（如一段话中部分文字加粗、部分变色）。`breakLine: true` 只是在运行后插入软换行，**不会创建新的 XML 段落节点**。`bullet` 是段落级属性，在单个 `text` 元素中只应用一次。

因此以下用法是**错误的**，会导致列表项全部合并为一段连续文本、项目符号只出现一次或不出现：

```json
{
  "type": "text",
  "x": 0.7, "y": 1.6, "w": 11.93, "h": 5.2,
  "textRuns": [
    { "text": "第一项", "bullet": true, "breakLine": true },
    { "text": "第二项", "bullet": true, "breakLine": true },
    { "text": "第三项", "bullet": true }
  ]
}
```

**正确做法：每个列表项必须是独立的 `text` 元素**，各自设置坐标和 `bullet`：

```json
[
  { "type": "text", "x": 0.7, "y": 1.6, "w": 11.93, "h": 0.5, "bullet": true, "text": "第一项" },
  { "type": "text", "x": 0.7, "y": 2.1, "w": 11.93, "h": 0.5, "bullet": true, "text": "第二项" },
  { "type": "text", "x": 0.7, "y": 2.6, "w": 11.93, "h": 0.5, "bullet": true, "text": "第三项" }
]
```

同理，代码块中每行代码也必须是独立的 `text` 元素，不能在单个 `text` 元素中用 `textRuns` + `breakLine` 模拟多行代码。

**规则总结**：
1. 需要多个带项目符号的列表项 → 每项一个独立 `text` 元素
2. 需要多行代码/命令 → 每行一个独立 `text` 元素
3. `textRuns` 仅用于同段落内的富文本样式混合（如一句话中部分加粗变色）

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

### merge — 合并多个 PPTX 文件

参数：`files`（要合并的 PPTX 文件路径列表，至少 2 个）

将多个 PPTX 文件的幻灯片合并为一个文件。合并时：
- 以第一个文件为基础，解析其 `presentation.xml` 中的幻灯片 ID 体系（`sldIdLst`）和关系映射
- 逐个读取后续文件，将每张幻灯片的 XML 复制到基础文件中，分配新的幻灯片编号
- 自动复制幻灯片关联的 media 资源（图片等）和关系文件
- 在 `presentation.xml` 的 `sldIdLst` 中追加新的幻灯片 ID 条目
- 在 `presentation.xml.rels` 中添加新的幻灯片关系

**适用场景**：
- 将多个独立演示文稿合并为完整演示
- 团队协作后合并各成员负责的幻灯片部分

**输出**：生成文件自动写入 `ae/documents/pptx/` 子目录，可通过 `outputPath` 参数自定义路径。

### 增量调用策略

| 场景 | 策略 |
|------|------|
| 大型演示文稿（>10 张幻灯片） | 先用 create 创建初始幻灯片（3-5 张），再用 append-slides 分批追加 |
| 需修改单张幻灯片内容 | 使用 update-slide 局部替换，而非重新 create 整个演示文稿 |
| 需修改多张幻灯片 | 每次调用 update-slide 只修改一张幻灯片，逐页修改并逐页验证 |
| 多次追加幻灯片 | append-slides 可多次调用，每次追加一批幻灯片 |
| 超过 50 张幻灯片 | 硬性上限：单次最多 50 张，超过时 Zod 校验会拒绝，必须分批操作 |

**原则：对于大型或需要局部修改的演示文稿，优先使用增量操作（append-slides/update-slide）而非重新创建整个文档。修改多张幻灯片时，每次只改一张，改完验证后再改下一张。**

### 参数体大小控制（硬约束）

opencode 工具调用的参数通过 JSON 传输，当参数体过大时可能导致 JSON 解析失败（非语法错误，而是传输层截断）。为避免此问题，必须控制单次工具调用的参数体大小：

1. **单次 create/append-slides 幻灯片数 ≤ 5 张**：即使 Zod 上限是 50 张，实际调用时应将每次 create 或 append-slides 的幻灯片数控制在 5 张以内，大幅降低参数体体积
2. **单张幻灯片元素数 ≤ 15 个**：单页元素过多会显著增加参数体体积，复杂页面应分步构建
3. **含表格的幻灯片单独操作**：表格的嵌套二维数组结构会大幅增加参数体体积，含表格的页面不应与其他页面混合在同一次调用中
4. **单页参数体过大时分步写入**：当单页元素数超过 15 个或包含大型表格时，先用 update-slide 写入基础骨架（标题、装饰线、背景），再用 update-slide 追加内容元素（实际做法是第二次调用时传入完整元素数组，包含骨架和新增元素）
5. **避免单次传入大量 base64 图片数据**：图片优先使用 `imagePath` 引用本地文件，避免 `imageData` 内联 base64

**分步写入示例**（12 张幻灯片的演示文稿）：

```
第 1 次 create：       创建前 4 张（封面 + 章节1 + 内容页 ×2）
第 2 次 append-slides：追加 3 张（章节2 + 内容页 ×2）
第 3 次 append-slides：追加 3 张（代码页 ×2 + 表格页 ×1）
第 4 次 append-slides：追加 2 张（章节4 + 内容页 ×1）
第 5 次 append-slides：追加 2 张（内容页 + 总结页）
```

**单页分步写入示例**（含大型表格的页面）：

```
第 1 次 create/append-slides：写入页面骨架（标题 + 装饰线 + 背景形状），不含表格
第 2 次 update-slide：        传入完整元素数组（骨架 + 表格），替换该页
```

## 坐标与尺寸单位

- 默认单位为英寸（如 `x: 1, y: 0.5, w: 10, h: 3`）
- 支持百分比字符串（如 `x: '10%'`）
- 16:9 布局页面尺寸为 13.33 × 7.5 英寸

## 输出路径与原地修改

- **create** 操作：生成文件自动写入 `ae/documents/pptx/` 子目录，文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.pptx`。文件名中的非 ASCII 字符（如中文标题）会自动替换为连字符，确保跨平台安全。如需自定义路径，传入 `outputPath` 参数
- **edit/append-slides/update-slide** 操作：不指定 `outputPath` 时原地修改原文件（修改前自动备份为同目录 `.bak` 文件，修改成功后删除备份；修改失败则自动从备份恢复原文件）。指定 `outputPath` 时生成新文件，不修改原文件

## 视觉验证

**创建或修改 PPTX 后必须进行视觉验证。**

### 验证流程

1. 先通过 `ae:libreoffice` 技能确认 LibreOffice 就绪（check 操作）
2. 调用 `ae-pptx` 工具 `operation=to-image`，传入刚生成/修改的 PPTX 文件路径
3. 调用 `ae:image` 技能识别每张 PNG 图片的视觉内容（模型支持 vision 时可直接用 Read 工具读取图片）
4. 逐页检查内容是否正确呈现、文字是否清晰可辨、整体视觉效果是否符合预期
5. 发现问题时使用 edit/update-slide 修正，修正后再次 to-image + ae:image 验证该页

### to-image 操作

参数：
- `operation`：`to-image`
- `file`：PPTX 文件路径（必填）
- `pages`：指定幻灯片页码列表（1-based），如 `[1, 3, 5]` 只验证第1、3、5张幻灯片；省略则转换所有幻灯片

输出：每张幻灯片对应一张 PNG 图片，写入 `ae/documents/pptx/` 目录。

### 验证范围

- create / edit / append-slides 后：验证全部幻灯片
- update-slide 增量修改后：验证修改页及其前后相邻页（如修改第 5 页，验证第 4-6 页）
- 大型演示文稿可分批验证（每次 3-5 张），但全量创建/编辑时所有幻灯片都必须覆盖

### 何时可不验证

- analyze（只读分析）
- to-markdown（只读读取）
- 未对文件做任何修改的纯查看场景

## 边界

- 支持任意本地绝对路径（工作区内和工作区外均可），工作区外写入操作会请求用户确认
- 所有操作通过内置 `ae-pptx` 工具完成，无需额外安装依赖
- 浏览器操作统一通过 `ae:chrome-devtools` 技能完成
