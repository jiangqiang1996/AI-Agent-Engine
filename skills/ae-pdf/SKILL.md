---
name: ae-pdf
description: PDF 文档处理技能：创建、合并、拆分、提取文本、填写表单、旋转/删除页面、添加水印、追加页面、局部更新、把 PDF 转成 Markdown 或 PNG 图片。所有涉及 .pdf 文件的读取、创建、编辑与格式转换都应使用本技能。PDF processing skill - create, merge, split, extract text, fill forms, rotate or delete pages, add watermark, append pages, overlay elements, convert PDF to Markdown or PNG images. 禁止使用宿主的文件读取能力直接读取 .pdf 二进制内容，必须通过本技能的 extract-text 或 to-markdown 操作。
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+ 与 npm。首次使用前在技能目录执行 npm install，安装 pdf-lib、@pdf-lib/fontkit、pdfjs-dist、@napi-rs/canvas、turndown、mdast-util-from-markdown。仅处理本地文件，不访问网络。
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 文档
---

# ae-pdf — PDF 文档处理

通过技能自带的 `scripts/pdf.mjs` 完成 PDF 的读取、创建、编辑与格式转换，无需任何宿主专属能力。

## Step 0：环境准备（首次使用必做）

脚本依赖若干 npm 包，**首次使用前需要在技能目录安装一次**（技能可独立拷走安装，依赖目录就在技能内）。

```bash
cd <本技能目录>     # 即 SKILL.md 所在目录
npm install         # 或 npm run setup（等价于 npm install --omit=dev）
```

判断是否已安装：

- 技能目录下存在 `node_modules/pdf-lib` 与 `node_modules/pdfjs-dist` → 已安装，可直接使用；
- 或直接执行 `node scripts/pdf.mjs --help`，若报「缺少依赖」，按提示在技能目录执行 `npm install`；
- 缺少依赖时脚本以退出码 1 结束，并给出需要安装的包名与安装目录，不会输出调用栈。

安装后无需再执行其他命令。`--help` 与参数校验类命令不依赖 npm 包，未安装也能正常返回。

## 调用契约

```bash
node scripts/pdf.mjs <operation> [options]
```

| 通道 | 内容 |
|------|------|
| stdout | **恒为单个 JSON 对象**：成功 `{ok:true, operation, summary, outputPath/outputPaths, content?, meta?}`；失败 `{ok:false, operation, error}` |
| stderr | 成功时一行人类可读摘要（含产物路径）；失败时一行可读错误信息（不含调用栈） |
| 退出码 | 0 = 成功；1 = 失败（参数错误、文件不存在、依赖缺失、PDF 解析失败等） |

- 加 `--json` 表示只要 JSON，成功时不再输出 stderr 摘要行。
- 产物默认写入 `<当前工作目录>/ae/pdf/`，运行日志写入 `<当前工作目录>/ae/logs/pdf/`。
- 所有路径参数按当前工作目录解析，也可直接传绝对路径。

## 操作选择

| 场景 | 用哪个操作 |
|------|-----------|
| 只读提取内容供模型阅读 | `to-markdown`（优先）或 `extract-text` |
| 只读理解视觉内容（模型不支持视觉） | `to-image` 转 PNG → 交给 ae-image 技能识别 |
| 从零生成 PDF | `create` |
| 合并 / 拆分 | `merge` / `split` |
| 填写表单 | `fill-form` |
| 调整页序内容 | `rotate-pages` / `delete-pages` |
| 加水印 | `add-watermark` |
| 在已有 PDF 后继续追加 | `add-pages` |
| 在已有页面上叠加内容 | `update-page` |

**原则：只读用 `to-markdown`；写操作用其他操作。**

## 操作清单

### create — 创建 PDF

```bash
node scripts/pdf.mjs create --pages-file pages.json --title "报告" --output ae/pdf/report.pdf
```

- `--pages-file <path>`：页面数组 JSON 文件（**推荐**，复杂页面用文件）
- `--pages <json>`：页面数组 JSON 字符串
- `--title <text>`：文档标题
- `--metadata <json>` / `--metadata-file <path>`：元数据（title/author/subject/keywords/creator/producer/creationDate/modificationDate）

页面数组元素（`PdfPageSpec`）：

```json
[
  {
    "size": "A4",
    "elements": [
      { "type": "text",  "text": "标题", "x": 50, "y": 780, "fontSize": 24, "font": "HelveticaBold",
        "color": { "r": 0.1, "g": 0.1, "b": 0.2 } },
      { "type": "rect",  "x": 50, "y": 700, "width": 200, "height": 40,
        "borderColor": { "r": 0.2, "g": 0.2, "b": 0.2 }, "borderWidth": 1,
        "fillColor": { "r": 0.93, "g": 0.95, "b": 1 } },
      { "type": "ellipse","x": 300, "y": 600, "width": 80, "height": 40, "fillColor": { "r": 0.9, "g": 0.2, "b": 0.2 } },
      { "type": "line",  "x": 50, "y": 650, "x2": 300, "y2": 650, "thickness": 1,
        "color": { "r": 0, "g": 0, "b": 0 } },
      { "type": "image", "imagePath": "logo.png", "x": 50, "y": 300, "imageWidth": 160, "imageHeight": 80 }
    ]
  },
  { "size": "Letter", "text": "整页文本\n第二行", "fontSize": 12 }
]
```

- `size`：`A4`（595.28×841.89pt）/ `Letter`（612×792）/ `Legal`（612×1008）/ 自定义 `[宽, 高]`
- `text` + `fontSize`：整页文本模式（与 `elements` 二选一）
- `elements` 支持 5 种类型：`text`、`rect`、`ellipse`、`line`、`image`
- `image` 用 `imagePath`（本地 JPG/PNG 路径）或 `imageData`（base64 / data URI）
- 单次最多 30 页，超出请分批：`create` 建首批 → `add-pages` 追加

### merge — 合并 PDF

```bash
node scripts/pdf.mjs merge --files a.pdf b.pdf --output ae/pdf/merged.pdf
```

按给定顺序合并；`--files` 可写多个路径，也可重复指定 `--files a.pdf --files b.pdf`。

### split — 拆分为单页文件

```bash
node scripts/pdf.mjs split --file report.pdf --output-dir ae/pdf/report-split
```

每页一个文件（`page_001.pdf`、`page_002.pdf`…），文件清单见 stdout 的 `outputPaths`。

### extract-text — 提取纯文本

```bash
node scripts/pdf.mjs extract-text --file report.pdf --output ae/pdf/report.txt
```

- 文本同时写文件（`outputPath`）并放在 stdout 的 `content` 字段；
- 默认截断到前 8000 字符，`--max-chars <n>` 可调整；
- `meta.pageCount` 为总页数，`meta.truncated` 表示是否被截断。

### fill-form — 填写表单

```bash
node scripts/pdf.mjs fill-form --file form.pdf --field "name=Alice" --field "agree=true" --output ae/pdf/form-filled.pdf
```

- 也可用 `--fields '[{"name":"name","value":"Alice"}]'` 或 `--fields-file fields.json`；
- 文本框直接写值；复选框值 `true`/`1`/`yes`/`on` 表示勾选，其他值取消勾选；
- 字段名不存在时跳过，并在 `meta.missingFields` 中列出。

### rotate-pages — 旋转页面

```bash
node scripts/pdf.mjs rotate-pages --file report.pdf --rotation 90 --page-indices 0,2
```

- `--rotation` 只能是 90 / 180 / 270，默认 90；
- `--page-indices` 为 **0-based** 页码索引，省略则旋转全部页面；
- 基于当前角度累加并对 360 取模。

### delete-pages — 删除页面

```bash
node scripts/pdf.mjs delete-pages --file report.pdf --page-indices 0,3 --output ae/pdf/report-cut.pdf
```

`--page-indices` 必填，**0-based**。

### add-watermark — 添加水印

```bash
node scripts/pdf.mjs add-watermark --file report.pdf --text "机密" --font-size 48 --opacity 0.2 --color 0.5,0.5,0.5
```

- 或整体配置：`--watermark '{"text":"机密","fontSize":48,"opacity":0.2,"rotation":45,"color":{"r":0.5,"g":0.5,"b":0.5}}'`
- 默认字号 50、不透明度 0.3、旋转 45°、灰色 `{r:0.5,g:0.5,b:0.5}`；
- 水印为所有页面居中绘制；含中文时自动使用 CJK 粗体字体。

### add-pages — 追加页面

```bash
node scripts/pdf.mjs add-pages --file report.pdf --pages-file more-pages.json
```

页面结构与 `create` 的 `--pages` 完全一致；不指定 `--output` 时原地追加（自动备份）。

### update-page — 在指定页面叠加元素

```bash
node scripts/pdf.mjs update-page --file report.pdf --page-index 0 --elements-file elements.json
```

- `--page-index` 为 **0-based** 页面索引；
- `--elements` 为元素数组（结构同 `create` 的 `elements`）；
- 新元素叠加在已有内容之上，不会删除原内容；未指定坐标的文本从页面顶部自动向下排列。

### to-markdown — PDF 转 Markdown

```bash
node scripts/pdf.mjs to-markdown --file report.pdf --output ae/pdf/report.md
node scripts/pdf.mjs to-markdown --file report.pdf --inline   # 只返回内容，不写文件
```

- 自动识别表格并输出 Markdown 表格语法，段落按阅读顺序还原；
- `--inline` 时内容放在 stdout 的 `content` 字段，不落盘；
- `meta.structure` 给出标题层级与表格数量。

### to-image — PDF 转 PNG

```bash
node scripts/pdf.mjs to-image --file report.pdf --output-dir ae/pdf/report-image --image-pages 1,3,5
```

- `--image-pages` 为 **1-based** 页码，省略则转换全部页面；
- `--scale` 为渲染倍率，默认 2.0；
- 输出 `report_page_001.png` 等文件，路径见 stdout 的 `outputPaths`。

## 输出路径与原地修改

| 操作 | 默认行为 |
|------|---------|
| `create` / `merge` | 新文件写入 `ae/pdf/`，文件名 `<名称>-<操作>-<时间戳>-<随机串>.pdf` |
| `split` / `to-image` | 新目录写入 `ae/pdf/`（可用 `--output-dir` 指定） |
| `to-markdown` / `extract-text` | 新文件写入 `ae/pdf/`（可用 `--output` 指定） |
| `fill-form` / `rotate-pages` / `delete-pages` / `add-watermark` / `add-pages` / `update-page` | 不指定 `--output` 时**原地修改原文件**：先写同目录 `.bak` 备份，成功后删除备份，失败自动回滚 |

指定 `--output` 时一律生成新文件，不动原文件。写入工作区之外的路径前，先与用户确认。

## ⚠ 参数防坑规则（硬约束）

### 1. 颜色范围是 0-1，不是 0-255

- 红色 `{r:1,g:0,b:0}`、黑色 `{r:0,g:0,b:0}`、白色 `{r:1,g:1,b:1}`、灰色 `{r:0.5,g:0.5,b:0.5}`
- 脚本对误传的 0-255 值有兜底归一化，但请始终按 0-1 传值。

### 2. PDF 坐标系 y=0 在页面底部

- A4 页面 x ∈ [0, 595.28]，y ∈ [0, 841.89]
- 顶部文字 `y ≈ 792`（= pageHeight - 50），中部 `y ≈ 420`，底部 `y ≈ 50`

### 3. 页码索引：page-index / page-indices 是 0-based，image-pages 是 1-based

- 第 1 页 → `--page-index 0`；`--image-pages 1` 才是第 1 页

### 4. 未指定坐标的文本元素自动向下排列

同一页多个文本元素都不给 `y` 时，会从页面顶部依次向下排布，不会重叠。需要精确控制位置就显式给 `x`、`y`。

### 5. 字体与 CJK 文本

- 标准字体（WinAnsi 编码）不含中文/日文/韩文字形；
- 未指定 `font` 的文本会自动检测 CJK 字符并切换到 CJK 字体；
- CJK 字体按 NotoSansSC → SimHei → MSYH 顺序在系统字体目录中查找（Windows/macOS/Linux 常见目录），找不到时自动降级到其他已安装的 CJK 字体，并在 `meta.fontFallbacks` 中说明；
- 也可 `--cjk-font-path <path>` 指定自定义 `.ttf`/`.otf`。

### 6. 页面尺寸单位是 pt

1pt ≈ 1/72 inch ≈ 0.35mm；A4 = 595.28 × 841.89pt；字号同样以 pt 计。

## 参数体大小控制（硬约束）

命令行参数有长度上限，参数体过大可能被截断或解析失败：

1. **单次 `create` / `add-pages` 页数 ≤ 5 页**（脚本硬上限 30 页，但实际执行建议 5 页一批）；
2. **复杂页面单独成批**：含多图、多段文字的页面不要与简单文本页面混在同一次调用里；
3. **先建骨架再叠加**：先 `create` 基础页面（标题、正文、背景块），再 `update-page` 叠加复杂元素；
4. **图片优先用 `imagePath`**：避免把 base64 图片塞进命令行参数；
5. **JSON 走文件**：页面/元素结构复杂时用 `--pages-file` / `--elements-file` / `--fields-file`，不要把大段 JSON 写进命令行。

分批示例（10 页文档）：

```bash
node scripts/pdf.mjs create --pages-file batch1.json          # 封面 + 目录 + 内容页
node scripts/pdf.mjs add-pages --file out.pdf --pages-file batch2.json
node scripts/pdf.mjs add-pages --file out.pdf --pages-file batch3.json
```

## 边界

- 只处理本地文件，不支持远程 URL；
- 不支持加密 PDF，需用户先解密；
- 不做 OCR，扫描件需用户预先处理；
- 标准字体不含 CJK 字形，需 CJK 字体或自动检测；
- 原地修改会先备份再写回，失败自动回滚，但仍建议先复制一份原始文件。

## 参考

- 版式与配色设计指南：`references/design-templates.md`
- 脚本参数全集：`node scripts/pdf.mjs --help`
- 脚本单元测试：`node --test tests/pdf.test.mjs`
