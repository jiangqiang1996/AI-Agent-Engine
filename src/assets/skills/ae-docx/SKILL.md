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

## Word 专属最佳实践

1. **匹配专用场景时先 `load_skill`**：学术论文任务先 `academic-paper`
2. **先读再改**：编辑前先 `view outline` 或 `get` 了解文档结构
3. **用稳定 ID**：多步操作时优先使用 `@paraId=` 寻址，避免插入/删除后索引偏移
4. **批量操作**：多个修改用 `batch` 一次完成，减少进程开销
5. **验证结果**：修改后运行 `validate` 或 `view issues` 检查
6. **不确定时用 help**：`command=help path="docx paragraph"` 查看完整属性列表
7. **转 HTML 验证**：用 `view html` 而非 `view screenshot` 做视觉验证--更快
8. **修订追踪**：需要审阅的变更用 `revision.type` + `revision.author` 标记

## 完整 CLI 参考

L1/L2/L3 操作、watch、batch、raw XML、文档级属性等通用能力请参考 `ae:officecli` 技能。
