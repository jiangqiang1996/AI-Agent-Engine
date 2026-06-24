---
name: ae:pdf
description: "处理 PDF 文档：创建（元素化页面）、合并、拆分、提取文本、填写表单、旋转页面、删除页面、添加水印。通过 ae-pdf 工具实现，输出仍为 PDF 或结构化数据。"
argument-hint: "[创建|合并|拆分|提取|表单|旋转|删除|水印] [文件路径] [任务描述]"
---

# ae:pdf — PDF 文档处理

创建、合并、拆分、提取 PDF 内容，填写表单，旋转或删除页面，添加水印。通过内置 `ae-pdf` 工具实现，无需安装额外依赖。

## 与 ae:markitdown 的边界

| 场景 | 用 ae:markitdown | 用 ae:pdf |
|------|------------------|-----------|
| 只读提取文本供 LLM 阅读 | ✅ 优先用 markitdown | ❌ |
| 创建新 PDF | ❌ | ✅ |
| 合并/拆分 PDF | ❌ | ✅ |
| 填写 PDF 表单 | ❌ | ✅ |
| 旋转/删除页面 | ❌ | ✅ |
| 添加水印 | ❌ | ✅ |
| 提取纯文本 | ✅ 优先用 markitdown | 需配合其他操作时用本技能 |

**原则：只需读取文本时用 `ae:markitdown`；需要创建或操作 PDF 文件时用本技能。**

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
| 生成后发现小差异 | 调用支持编辑的操作更新现有文件（如 fill-form、add-watermark） |
| 生成后发现大差异（结构变化） | 重新调用 create 生成 |
| 工具返回错误 | 分析原因，修正参数后重试一次 |
| 无理由反复调用 | 禁止 |

**文件已生成后优先编辑而非重新生成**：发现差异时首选可用的编辑操作（如 `fill-form`、`add-watermark`、`rotate-pages`）更新现有文件；仅当内容结构性变化无法通过这些操作完成时才重新 `create`。

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

**字体支持**（12 种标准字体，WinAnsi 编码）：
Helvetica、HelveticaBold、HelveticaOblique、HelveticaBoldOblique、TimesRoman（含 Bold/Italic/BoldItalic）、Courier（含 Bold/Oblique/BoldOblique）

**颜色格式**：`{ r, g, b }`，分量范围 0-1（例如红色为 `{ r: 1, g: 0, b: 0 }`）

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

参数：`file`（文件路径）、`rotation`（90/180/270，默认 90）、`pageIndices`（可选，0-based 页码索引）

将指定页面（或全部页面）顺时针旋转指定角度。旋转基于当前角度累加并对 360 取模。

### delete-pages — 删除页面

参数：`file`（文件路径）、`pageIndices`（必填，0-based 页码索引）

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

## 输出路径

生成文件自动写入 `ae/documents/pdf/` 子目录，文件名规则：`<名称>-<操作>-<时间戳>-<随机串>.pdf`。如需自定义路径，传入 `outputPath` 参数。

## 边界

- 仅处理当前工作区内本地文件
- OCR 扫描件需用户预先处理（本技能不做 OCR）
- 加密 PDF 需用户先解密
- **CJK 文本限制**：所有标准字体使用 WinAnsi 编码，不支持中文、日文、韩文等非拉丁字符。如需 CJK 文本，请先用其他工具生成 PDF 再用本技能操作
- 所有操作通过内置 `ae-pdf` 工具完成，无需额外安装依赖
