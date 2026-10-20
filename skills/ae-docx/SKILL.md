---
name: ae-docx
description: Word 文档（.docx）创建、编辑、读取与格式验证技能，覆盖段落、表格、图片、样式、修订追踪、页眉页脚、目录、公式等 OOXML 能力，并配套风格设计、HTML 计算验证与截图审美验证流程。适用于 .docx 的读取、创建、编辑、分析、格式转换与排版校验。Use when creating, editing, reading, converting or validating Word .docx documents.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+；officecli 二进制由步骤 0 的 ensure 自动安装；跨平台（Windows/macOS/Linux）
metadata:
  author: ae-skills
  version: "1.0.0"
  ae-group: 文档
---

# ae-docx — Word 文档操作

通过本技能自带的 `scripts/officecli.mjs` 调用**官方 `officecli` 命令行**操作 `.docx` 文档，无需安装 Office。

> **硬性约束**：禁止使用宿主的文件读取能力直接读取 .docx 二进制内容，必须通过本技能的操作读取。

## 步骤 0：确保 officecli 可用（必做）

**每次会话首次操作 .docx 之前执行一次**，不要跳过。

```bash
node scripts/officecli.mjs ensure
```

输出 JSON：

```json
{ "installed": true, "version": "1.2.3", "channel": "existing", "path": "/usr/local/bin/officecli", "attempts": [] }
```

| 字段 | 含义 |
|---|---|
| `installed` | officecli 是否可用 |
| `version` | 已安装版本 |
| `channel` | `existing`（原本就装了）/ `npm` / `brew` / `scoop` / `install-script` / `failed` |
| `attempts` | 自动安装的尝试记录（含日志路径） |

脚本按 **npm → brew → scoop → 官方安装脚本** 的顺序尝试安装，**一次只试一种渠道**，失败才换下一种。

**若 `installed` 为 `false`**：说明所有渠道都失败了。此时**必须停止文档操作**，把下面的手动安装命令交给用户，任选一种执行，装好后重新跑一次 `ensure` 确认：

```bash
npm install -g @officecli/officecli     # 全平台
brew install officecli                  # macOS / Linux
scoop install officecli                # Windows
curl -fsSL https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.sh | bash
# Windows PowerShell：
irm https://raw.githubusercontent.com/iOfficeAI/OfficeCLI/main/install.ps1 | iex
```

> **一次只用一种安装渠道。** 若此前用 Homebrew 装过，要换渠道请先 `brew uninstall officecli/homebrew-officecli/officecli`。

---

## 调用方式

统一通过本技能自带的包装脚本调用，参数原样透传给官方 CLI：

```bash
node scripts/officecli.mjs run -- <officecli 参数…>
```

包装脚本负责：落日志到 `ae/logs/officecli/`、透传 stdout、透传退出码。

**官方 CLI 的参数形态是「命令 + 文件 + 位置参数 + 标志」**，不是 `key=value`：

```bash
officecli <command> <file> [path] [--flag value]
```

| 用途 | 写法 |
|---|---|
| 创建文档 | `node scripts/officecli.mjs run -- report.docx create` |
| 加段落 | `node scripts/officecli.mjs run -- report.docx add /body --type paragraph --prop text="标题" --prop style=Heading1` |
| 改属性 | `node scripts/officecli.mjs run -- report.docx set /body/p[1]/r[1] --prop bold=true` |
| 读元素 | `node scripts/officecli.mjs run -- report.docx get /body --depth 1 --json` |
| 查询 | `node scripts/officecli.mjs run -- report.docx query 'run:contains(TODO)' --json` |
| 查看结构 | `node scripts/officecli.mjs run -- report.docx view outline` |
| 校验 | `node scripts/officecli.mjs run -- report.docx validate` |

元素路径是 1 起始的路径寻址（不是 XPath）：`/body/p[3]/r[1]`、`/body/tbl[1]/tr[2]/tc[1]`、`/header[1]`。
属性用 `--prop key=value` 传递，多个 `--prop` 可叠加。

**不确定属性名、值格式或命令语法时先跑 help，不要猜：**

```bash
node scripts/officecli.mjs run -- help docx paragraph
node scripts/officecli.mjs run -- help docx set paragraph
```

---

## 路由关系

- **本技能**：`.docx` 文件的入口，提供 Word 专属元素、路径、属性和专用技能
- **调用入口**：本技能自带的 `scripts/officecli.mjs`，独立可用，不依赖其他技能
- **通用能力**：L1/L2/L3 分层、`watch`、`batch`、raw XML、文档级属性等详见 `ae-officecli` 技能

## 何时使用

- 创建、编辑、分析 Word 文档
- 需要修订追踪（`revision.type` 取 `ins` / `del` / `format`）
- 需要目录（TOC）、交叉引用、页码刷新
- 需要页眉页脚、分节、多栏布局
- 需要将 DOCX 转为 Markdown 或 HTML 阅读
- 需要验证文档格式或检测问题

## 何时不使用

- PDF 文档操作用 `ae-pdf`
- PowerPoint 用 `ae-pptx`
- Excel 用 `ae-xlsx`
- 需要 raw XML 操作或 CSS 选择器查询直接用 `ae-officecli`

## ⚠️ 重要：判断是否需要加载 Word 专用技能

仅当当前任务匹配以下专用场景时，先执行 `load_skill` 加载对应规则再操作：

| 名称 | 适用场景 |
|------|----------|
| `academic-paper` | 期刊/会议/学位论文：APA/Chicago/IEEE/MLA 引用、公式、SEQ+PAGEREF 交叉引用、多栏期刊布局、参考文献。不用于商业报告或信件（路由到 `word`） |

匹配时先加载：

```bash
node scripts/officecli.mjs run -- report.docx load_skill academic-paper
```

不匹配任何专用场景时无需加载，直接使用本技能即可。

## Word 专属元素类型

paragraph, run, table, row, cell, image, header, footer, section, bookmark, comment, footnote, endnote, formfield, sdt, chart, equation, field, hyperlink, style, toc, watermark, break, ole, num, abstractNum, lvl, tab, textbox, shape, diagram

## Word 专属路径语法

- 路径 **1-based**：`/body/p[3]` = 第三段
- 稳定 ID：`/body/p[@paraId=1A2B3C4D]`
- 文档级：`/`（设置 docDefaults、protection 等）
- 页眉页脚：`/header[1]`、`/footer[1]`
- 评论：`/comments/comment[@commentId=1]`

## Word 专属常用属性

| 属性 | 说明 | 示例 |
|------|------|------|
| `text` | 文本内容 | `"Hello World"` |
| `style` | 段落样式 | `"Heading1"`, `"Normal"` |
| `bold` | 粗体 | `"true"` |
| `italic` | 斜体 | `"true"` |
| `color` | 文字颜色 | `"red"`, `"FF0000"` |
| `font` | 字体名称 | `"Arial"`, `"微软雅黑"` |
| `size` | 字号 | `"12pt"`, `"14pt"` |
| `align` | 对齐 | `"left"`, `"center"`, `"right"` |
| `indent` | 缩进 | `"0.5cm"` |
| `spacing` | 行距 | `"1.5x"`, `"12pt"` |

## Word 修订追踪

```bash
# 带修订的查找替换
node scripts/officecli.mjs run -- doc.docx set / --find oldtext --replace newtext --prop revision.author=Alice

# 全部接受 / 全部拒绝
node scripts/officecli.mjs run -- doc.docx set /revision --prop revision.action=accept
node scripts/officecli.mjs run -- doc.docx set /revision --prop revision.action=reject

# 只处理某位作者的修订
node scripts/officecli.mjs run -- doc.docx set '/revision[@author=Alice]' --prop revision.action=accept

# 按序号逐条处理
node scripts/officecli.mjs run -- doc.docx set /revision[3] --prop revision.action=accept
```

`/revision` 是修订元素的规范路径：带 `w:id` 的修订按 id 寻址，否则回退到序号。要按修订类型（插入 `ins` / 删除 `del` / 格式 `format`）细分处理时，用选择器的 `@type` 属性过滤；`@author`、`@type` 与序号可叠加。列出修订清单用 `query` + `revision` 选择器，此时属性要写成点号形式（`revision.author` / `revision.type`）。

## 快速示例

```bash
node scripts/officecli.mjs run -- report.docx create
node scripts/officecli.mjs run -- report.docx add /body --type paragraph --prop text="标题" --prop style=Heading1
node scripts/officecli.mjs run -- report.docx add /body --type paragraph --prop text="正文内容。"
node scripts/officecli.mjs run -- report.docx view outline
```

## 设计系统

不使用固定模板。每次生成前，AI 根据内容主题、受众和场景**临时设计一套风格方案**，全程统一遵循。风格设计指南见 `references/design-templates.md`。

### 风格方案设计（生成流程第一步）

分析内容后，设计以下维度并记录为本次的风格方案：

| 维度 | 说明 | 约束 |
|------|------|------|
| 标题色 | 各级标题颜色 | 深色，与正文对比 |
| 正文色 | 正文文字颜色 | 深灰或黑色 |
| 强调色 | 强调/链接颜色 | 与标题色协调 |
| 表格表头底色 | 表头背景色 | 深色配白字或浅色配深字 |
| 表格表头文字色 | 表头文字颜色 | 与表头底色高对比 |
| 标题字体/字号 | 标题字体和字号层级 | 至少 2 级标题 |
| 正文字体/字号 | 正文字体和字号 | — |
| 标题间距 | 标题前/后间距 | — |
| 正文行间距 | 正文行距 | — |
| 首行缩进 | 是否缩进 | — |
| 页眉页脚 | 页眉/页脚内容 | — |

设计约束：
- 用户指定风格或品牌色时优先采纳
- 所有颜色使用 6 位 HEX 格式（如 `2C3E50`），不带 `#`

## 视觉验证

生成或修改后必须验证。验证分两层，**HTML 计算验证为主，截图审美验证为辅**。

### 第一层：HTML 计算验证（必须）

```bash
node scripts/officecli.mjs run -- report.docx view html -o ae/docx/report.html
```

HTML 输出包含每个元素的精确位置和尺寸。用以下方法做**精确计算验证**：

- 派发子代理解析 HTML（若宿主支持子代理派发能力），或写一个 Node.js 脚本解析 HTML
- 检测表格溢出：表格宽度是否超出页面可用宽度
- 检测图片溢出：图片宽度是否超出页面可用宽度
- 检测浮动图片重叠：仅对 floating wrap 图片检测与文字的重叠（普通段落/表格为流式布局，不会重叠）
- 检测分页异常：大表格或图片是否被分页截断

### 第二层：截图审美验证（可选）

```bash
node scripts/officecli.mjs run -- report.docx view screenshot -o ae/docx/preview.png
```

调用 `ae-image` 技能识别截图内容，检查配色、排版和整体观感。截图验证不用于检测精确布局问题。

### 修复循环

HTML 验证发现问题时用 `set` / `add` / `remove` 修复，每节最多 3 轮。

## 更新已有文档

**禁止全量重建**。更新已有文档时：

1. 先 `view outline` 读取当前结构
2. 只对需要变更的段落/表格执行 `set` / `add` / `remove`
3. 未变更的内容保持不动
4. 修改后执行视觉验证

## Word 专属最佳实践

1. **风格方案全程遵循** — 设计风格方案后，所有内容的配色、字体、间距从方案取值，不得混用
2. **匹配专用场景时先 `load_skill`**：学术论文任务先 `academic-paper`
3. **先读再改**：编辑前先 `view outline` 或 `get` 了解文档结构
4. **增量更新** — 只修改需要变更的部分，不重建整个文件
5. **用稳定 ID**：多步操作时优先使用 `@paraId=` 寻址，避免插入/删除后索引偏移
6. **批量操作**：多个修改用 `batch` 一次完成，减少进程开销
7. **生成后必须 HTML 计算验证** — `view html` 解析元素坐标，检测溢出和重叠
8. **不确定时用 help**：`node scripts/officecli.mjs run -- help docx paragraph` 查看完整属性列表
9. **修订追踪**：需要审阅的变更用 `revision.type` + `revision.author` 标记

## 产物与日志

| 类型 | 路径 |
|---|---|
| 本技能产物（渲染图、HTML 快照等） | `ae/docx/` |
| 命令日志 | `ae/logs/officecli/` |

## 完整 CLI 参考

L1/L2/L3 操作、watch、batch、raw XML、文档级属性等通用能力请参考 `ae-officecli` 技能。
