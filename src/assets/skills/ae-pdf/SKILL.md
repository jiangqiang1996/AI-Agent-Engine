---
name: ae:pdf
description: "处理 PDF 文档：创建（元素化页面）、合并、拆分、提取文本、填写表单、旋转页面、删除页面、添加水印、追加页面、局部更新。通过 ae-pdf 工具实现，输出仍为 PDF 或结构化数据。"
argument-hint: "[创建|合并|拆分|提取|表单|旋转|删除|水印|追加|更新] [文件路径] [任务描述]"
---

# ae:pdf — PDF 文档处理

创建、合并、拆分、提取 PDF 内容，填写表单，旋转或删除页面，添加水印，追加页面或局部更新。通过内置 `ae-pdf` 工具实现，无需安装额外依赖。

## 与 ae:markitdown 的边界

| 场景 | 用 ae:markitdown | 用 ae:pdf |
|------|------------------|-----------|
| 只读提取文本供 LLM 阅读 | ✅ 优先用 markitdown | ❌ |
| 创建新 PDF | ❌ | ✅ |
| 合并/拆分 PDF | ❌ | ✅ |
| 填写 PDF 表单 | ❌ | ✅ |
| 旋转/删除页面 | ❌ | ✅ |
| 添加水印 | ❌ | ✅ |
| 追加新页面 | ❌ | ✅ |
| 在已有页面上叠加元素 | ❌ | ✅ |
| 提取纯文本 | ✅ 优先用 markitdown | 需配合其他操作时用本技能 |

**原则：只需读取文本时用 `ae:markitdown`；需要创建或操作 PDF 文件时用本技能。**

## ⚠ 参数防坑规则（硬约束）

以下规则是 LLM 调用 ae-pdf 工具时最常见的参数错误，必须严格遵守：

### 1. 颜色范围是 0-1，不是 0-255！

- 红色 = `{ r: 1, g: 0, b: 0 }`（不是 `{ r: 255, g: 0, b: 0 }`）
- 黑色 = `{ r: 0, g: 0, b: 0 }`
- 白色 = `{ r: 1, g: 1, b: 1 }`
- 灰色 = `{ r: 0.5, g: 0.5, b: 0.5 }`
- 深蓝色 = `{ r: 0, g: 0, b: 0.8 }`

**服务层已内置防御：如果误传 0-255 范围的值（如 r: 255），会自动归一化到 0-1（255→1），但请不要依赖此机制，始终使用 0-1 范围。**

### 2. PDF 坐标系 y=0 在页面底部！

PDF 使用数学坐标系，与 Web/CSS 坐标系相反：
- **y=0 在页面底部，y 最大值在页面顶部**
- A4 页面：x 范围 0-595.28，y 范围 0-841.89
- 文字从页面顶部开始 → y 应设为接近页面高度（如 A4 页面顶部约 y=792）
- 文字从页面底部开始 → y 应设为接近 0

**典型值参考**：
- A4 页面顶部文字：`x: 50, y: 792`（pageHeight - 50）
- A4 页面中间文字：`x: 50, y: 420`（pageHeight / 2）
- A4 页面底部文字：`x: 50, y: 50`

### 3. pageIndex 是 0-based，不是 1-based！

- 第 1 页 = `pageIndex: 0`
- 第 2 页 = `pageIndex: 1`
- 第 N 页 = `pageIndex: N-1`

### 4. 未指定坐标的文本元素自动向下排列（防重叠）

同一页面的多个文本元素，如果不指定 `x` 和 `y` 坐标，会自动从页面顶部开始依次向下排列，不会重叠。这是防重叠保护机制：
- 第 1 个文本元素：从 y ≈ pageHeight-50 开始
- 第 2 个文本元素：从上一个元素结束位置继续向下
- 如需精确控制位置，请显式指定 `x` 和 `y`

### 5. 字体与 CJK 文本

- 标准字体不支持中文/日文/韩文等 CJK 字符
- 含 CJK 字符的文本必须使用 CJK 字体（NotoSansSC/SimHei/MSYH 等）或依赖自动检测
- **未指定 font 的文本元素会自动检测 CJK 字符并切换到 NotoSansSC**——请信任自动检测，不要手动对纯英文文本指定 CJK 字体

### 6. 页面尺寸单位是 pt（磅）

- 1 pt ≈ 1/72 inch ≈ 0.35mm
- A4：595.28 × 841.89 pt
- fontSize 也以 pt 为单位（12pt ≈ 4.2mm）

## 核心工作流：两阶段预览确认

所有创建、合并和填写表单操作遵循两阶段流程：

### 阶段一：预览确认（推荐）

在调用 `ae-pdf` 工具前，先向用户展示即将生成的内容结构，等待用户确认后再执行。

- **create**：展示页面大纲
  - 页码 | 元素列表摘要（类型 + 文本前 30 字或尺寸）| 页面尺寸
- **merge**：展示文件列表和合并顺序
  - 序号 | 文件路径 | 页数（如可知）
- **fill-form**：展示字段填写对照表
  - 序号 | 字段名 | 值 | 字段类型（文本框/复选框）

### 阶段二：执行生成

用户确认后，调用 `ae-pdf` 工具执行操作。

## 调用纪律（硬约束）

预览确认后只调用一次工具，禁止无理由反复生成。

| 场景 | 允许操作 |
|------|----------|
| 预览确认后首次生成 | 调用一次 create |
| 生成后发现小差异 | 调用支持编辑的操作更新现有文件（如 fill-form、add-watermark、update-page） |
| 生成后发现大差异（结构变化） | 重新调用 create 生成 |
| 工具返回错误 | 分析原因，修正参数后重试一次 |
| 无理由反复调用 | 禁止 |

**文件已生成后优先编辑而非重新生成**：发现差异时首选可用的编辑操作（如 `fill-form`、`add-watermark`、`rotate-pages`、`update-page`）更新现有文件；仅当内容结构性变化无法通过这些操作完成时才重新 `create`。

### 增量调用策略

| 场景 | 策略 |
|------|------|
| 大型 PDF（>5 页） | 先用 create 创建初始页面（3-5 页），再用 add-pages 分批追加后续页面 |
| 需在已有页面上添加元素 | 使用 update-page 局部更新，而非重新 create 整个文档 |
| 多次追加页面 | add-pages 可多次调用，每次追加一批页面，追加到同一个文件 |
| 超过 30 页 | 硬性上限：单次最多 30 页，超过时 Zod 校验会拒绝，必须分批操作 |

**重要：增量操作始终操作同一个文件，最终只保留一个完整 PDF。不要创建多个中间文件再合并，而是用 add-pages 直接追加到同一个文件中。**

## 可用操作

### create — 创建 PDF

参数：`title`（可选标题）、`pages`（页面数组）、`metadata`（可选元数据）

每页（`PdfPageSpec`）可指定：
- `elements`：元素化绘制列表（推荐模式），每个元素支持以下类型：
  - `text`：文本，可指定 `x/y` 坐标、`fontSize`、`font`、`color`、`lineHeight`，支持换行
  - `rect`：矩形，可指定 `x/y`、`width/height`、`borderColor`、`borderWidth`、`fillColor`、`opacity`
  - `ellipse`：椭圆，参数同矩形（`x/y` 为中心点）
  - `line`：直线，指定 `x/y`（起点）和 `x2/y2`（终点）、`thickness`、`color`
  - `image`：图片，指定 `imagePath`（本地路径）或 `imageData`（base64），可指定 `imageWidth/imageHeight`
- `text`：整页文本，支持换行（兼容旧模式，与 `elements` 二选一）
- `fontSize`：字号，默认 12（兼容旧模式）
- `size`：页面尺寸，默认 `A4`

**页面尺寸预设**：
- `A4`：595.28 × 841.89 pt
- `Letter`：612 × 792 pt
- `Legal`：612 × 1008 pt
- 自定义：`[宽, 高]` 数组（pt）

**字体支持**（17 种：12 种标准字体 + 5 种 CJK 字体）：

标准字体（WinAnsi 编码）：Helvetica、HelveticaBold、HelveticaOblique、HelveticaBoldOblique、TimesRoman（含 Bold/Italic/BoldItalic）、Courier（含 Bold/Oblique/BoldOblique）

CJK 字体（通过嵌入系统 TTF/OTF 实现）：NotoSansSC（思源黑体常规）、NotoSansSCBold（思源黑体粗体）、SimHei（黑体）、MSYH（微软雅黑常规）、MSYHBD（微软雅黑粗体）

**CJK 自动检测**：未指定 `font` 的 text 元素会自动检测文本是否含 CJK 字符，含 CJK 字符时自动使用 NotoSansSC 字体。

**自定义 CJK 字体路径**：通过 `cjkFontPath` 参数指定自定义 .ttf/.otf 字体文件路径，覆盖默认的系统字体搜索。

**颜色格式**：`{ r, g, b }`，分量范围 **0-1**（不是 0-255！红色为 `{ r: 1, g: 0, b: 0 }`）

**坐标说明**：`x/y` 使用 PDF 坐标系，**y=0 在页面底部**（不是 Web 坐标系！）。A4 页面顶部约 y=792。未指定坐标的文本元素自动从顶部向下排列防重叠。

**元数据**（`metadata`）：title、author、subject、keywords、creator、producer、creationDate、modificationDate

### merge — 合并 PDF

参数：`files`（文件路径数组）

按顺序合并所有 PDF 文件为一个。

### split — 拆分 PDF

参数：`file`（文件路径）

将 PDF 拆分为单页文件，输出多个文件路径通过 `metadata.outputPaths` 返回。

### extract-text — 提取文本

参数：`file`（文件路径）

返回页数和全文文本（截取前 8000 字符）。

### fill-form — 填写表单

参数：`file`（文件路径）、`fields`（字段填写列表）

支持文本框（`setText`）和复选框（`check`/`uncheck`）。复选框值 `true`/`1`/`yes`/`on` 表示勾选，其他值表示取消勾选。字段名需与 PDF 表单字段名一致。

### rotate-pages — 旋转页面

参数：`file`（文件路径）、`rotation`（90/180/270，默认 90）、`pageIndices`（可选，**0-based** 页码索引）

将指定页面（或全部页面）顺时针旋转指定角度。旋转基于当前角度累加并对 360 取模。

### delete-pages — 删除页面

参数：`file`（文件路径）、`pageIndices`（必填，**0-based** 页码索引）

删除指定页面，保留其余页面。内部通过创建新文档并复制保留页实现。

### add-watermark — 添加水印

参数：`file`（文件路径）、`watermark`（水印配置）

水印配置：
- `text`：水印文本（必填）
- `fontSize`：字号，默认 50
- `color`：颜色，默认灰色 `{ r: 0.5, g: 0.5, b: 0.5 }`
- `opacity`：不透明度，默认 0.3
- `rotation`：旋转角度，默认 45

为所有页面添加居中文本水印。

### add-pages — 追加新页面

参数：`file`（已有 PDF 文件路径）、`pages`（新页面数组，与 create 的 pages 结构相同）、`outputPath`（可选，默认覆盖原文件）

向已有 PDF 文件末尾追加新页面。每个新页面的结构与 create 的 pages 参数完全相同：
- `elements`：元素化绘制列表（推荐模式）
- `text`：整页文本，支持换行（兼容旧模式）
- `fontSize`：字号，默认 12
- `size`：页面尺寸，默认 A4

返回追加的页数、新文件路径和总页数。

**重要：add-pages 始终追加到同一个文件，最终只保留一个完整 PDF。**

### update-page — 局部更新页面

参数：`file`（文件路径）、`pageIndex`（**0-based** 页面索引）、`elements`（新元素数组）、`outputPath`（可选，默认覆盖原文件）

在已有 PDF 的指定页面上叠加绘制新元素（文本/矩形/椭圆/直线/图片）。新元素叠加在已有内容之上（pdf-lib 的 draw 是叠加模式），不会删除或覆盖原有内容。

支持的元素类型与 create 相同：text、rect、ellipse、line、image。

**未指定坐标的文本元素自动从页面顶部向下排列，防重叠。**

返回更新的页面索引和新文件路径。

## 输出路径

生成文件自动写入 `ae/documents/pdf/` 子目录，文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.pdf`。如需自定义路径，传入 `outputPath` 参数。

## 边界

- 仅处理当前工作区内本地文件
- OCR 扩描件需用户预先处理（本技能不做 OCR）
- 加密 PDF 需用户先解密
- 标准字体（WinAnsi 编码）不支持中文/日文/韩文等 CJK 字符，需使用 CJK 字体或依赖自动检测
- 所有操作通过内置 `ae-pdf` 工具完成，无需额外安装依赖
