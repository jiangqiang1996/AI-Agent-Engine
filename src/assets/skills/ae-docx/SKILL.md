---
name: ae:docx
description: "ae:officecli 的 .docx 专属包装技能。所有涉及 .docx 文件的读取、创建、编辑、分析和格式转换操作都应使用本技能。底层通过 ae-officecli 工具操作 Word 文档，支持段落、表格、图片、样式、修订追踪、页眉页脚、目录、公式等全部 OOXML 能力。禁止使用 Read 或 Bash 直接读取 .docx 文件内容。"
argument-hint: "[创建|编辑|分析|读取|追加|格式转换] [文件路径] [任务描述]"
---

# ae:docx - Word 专属包装技能

`ae:officecli` 的 `.docx` 专属包装技能。通过 `ae-officecli` 工具操作 Word 文档，无需安装 Office。

## 路由关系

- **本技能**：`.docx` 文件的入口，提供 Word 专属元素、路径、属性和专用技能
- **ae:officecli**：完整 CLI 参考（L1/L2/L3、watch、batch、raw XML、文档级属性等），本技能不重复
- 操作实际通过 `ae-officecli` 工具执行

## 何时使用

- 创建、编辑、分析 Word 文档
- 需要修订追踪（revision.type=ins|del|format）
- 需要目录（TOC）、交叉引用、页码刷新
- 需要页眉页脚、分节、多栏布局
- 需要将 DOCX 转为 Markdown 或 HTML 阅读
- 需要验证文档格式或检测问题

## 何时不使用

- PDF 文档操作用 `ae:pdf`
- PowerPoint 用 `ae:pptx`
- Excel 用 `ae:xlsx`
- 需要 raw XML 操作或 CSS 选择器查询直接用 `ae:officecli`

## ⚠️ 重要：判断是否需要加载 Word 专用技能

仅当当前任务匹配以下专用场景时，先执行 `load_skill` 加载对应规则再操作：

| 名称 | 适用场景 |
|------|----------|
| `academic-paper` | 期刊/会议/学位论文：APA/Chicago/IEEE/MLA 引用、公式、SEQ+PAGEREF 交叉引用、多栏期刊布局、参考文献。不用于商业报告或信件（路由到 `word`） |

匹配时先加载：
```
ae-officecli file=report.docx command=load_skill path=academic-paper
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

```
# 带修订的查找替换
ae-officecli file=doc.docx command=set path=/ find=oldtext replace=newtext props='{"revision.author":"Alice"}'

# 接受修订
ae-officecli file=doc.docx command=set path='/revision[@type=ins]' props='{"revision.action":"accept"}'

# 拒绝修订
ae-officecli file=doc.docx command=set path='/revision[@type=del]' props='{"revision.action":"reject"}'
```

## 快速示例

```
ae-officecli file=report.docx command=create
ae-officecli file=report.docx command=add path=/body type=paragraph props='{"text":"标题","style":"Heading1"}'
ae-officecli file=report.docx command=add path=/body type=paragraph props='{"text":"正文内容。"}'
ae-officecli file=report.docx command=view mode=outline
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

```
ae-officecli file=report.docx command=view mode=html
```

HTML 输出包含每个元素的精确位置和尺寸。用以下方法做**精确计算验证**：

- 委托 explore 子代理或写 JS 脚本解析 HTML
- 检测表格溢出：表格宽度是否超出页面可用宽度
- 检测图片溢出：图片宽度是否超出页面可用宽度
- 检测浮动图片重叠：仅对 floating wrap 图片检测与文字的重叠（普通段落/表格为流式布局，不会重叠）
- 检测分页异常：大表格或图片是否被分页截断

### 第二层：截图审美验证（可选）

```
ae-officecli file=report.docx command=view mode=screenshot output=preview.png
```

用 `ae:image` 识别截图内容，检查配色、排版和整体观感。截图验证不用于检测精确布局问题。

### 修复循环

HTML 验证发现问题时用 `set`/`add`/`remove` 修复，每节最多 3 轮。

## 更新已有文档

**禁止全量重建**。更新已有文档时：

1. 先 `command=view mode=outline` 读取当前结构
2. 只对需要变更的段落/表格执行 `command=set`/`add`/`remove`
3. 未变更的内容保持不动
4. 修改后执行视觉验证

## Word 专属最佳实践

1. **风格方案全程遵循** — 设计风格方案后，所有内容的配色、字体、间距从方案取值，不得混用
2. **匹配专用场景时先 `load_skill`**：学术论文任务先 `academic-paper`
3. **先读再改**：编辑前先 `view outline` 或 `get` 了解文档结构
4. **增量更新** — 只修改需要变更的部分，不重建整个文件
5. **用稳定 ID**：多步操作时优先使用 `@paraId=` 寻址，避免插入/删除后索引偏移
6. **批量操作**：多个修改用 `batch` 一次完成，减少进程开销
7. **生成后必须 HTML 计算验证** — `view mode=html` 解析元素坐标，检测溢出和重叠
8. **不确定时用 help**：`command=help path="docx paragraph"` 查看完整属性列表
9. **修订追踪**：需要审阅的变更用 `revision.type` + `revision.author` 标记

## 完整 CLI 参考

L1/L2/L3 操作、watch、batch、raw XML、文档级属性等通用能力请参考 `ae:officecli` 技能。
