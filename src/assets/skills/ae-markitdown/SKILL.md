---
name: ae:markitdown
description: 将本地文件转换为 Markdown，支持 HTML/CSV/TSV/JSON/XML/YAML/文本/Markdown/DOCX/XLSX/PDF/IPYNB/PPTX/ZIP/JPG/RSS/EPUB/MSG
argument-hint: "[file] [format] [outputPath=路径]"
---

# Skill: ae:markitdown

将当前工作区内的本地文件统一转换为 Markdown 格式，便于阅读、归档或作为 LLM 输入。

## 使用场景

- 用户需要将 HTML、CSV、TSV、JSON、XML、YAML、TXT 等文本格式文件转为 Markdown。
- 用户需要读取 DOCX、XLSX、PDF、IPYNB、PPTX 等二进制文档格式文件的内容。
- 用户需要提取 ZIP、EPUB、RSS/Atom、Outlook MSG 等容器或聚合格式的内容。
- 用户需要提取 JPG/PNG 图片的 EXIF 元数据（尺寸、GPS、拍摄时间等）。
- 用户希望将转换结果直接写入 .md 文件以便归档或后续处理。
- 用户说"转成 Markdown"、"读取这个文件"、"把 DOCX 转成文本"、"提取图片元数据"等。

## 参数

- `file`：必填，当前工作区内的本地文件路径，支持绝对路径或相对路径。
- `format`：可选，显式指定文件格式。取值：`html`、`csv`、`json`、`xml`、`yaml`、`text`、`markdown`、`docx`、`xlsx`、`pdf`、`ipynb`、`pptx`、`zip`、`jpg`、`rss`、`epub`、`msg`。省略时根据扩展名自动推断（`.tsv`/`.atom`/`.jpeg`/`.png` 等会映射到对应格式）。
- `outputPath`：可选，输出 .md 文件路径，支持绝对路径或相对路径。指定后转换结果会写入该文件；路径必须位于当前工作区内。

参数解析规则：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定。
2. 顺序兜底：`file → format`（`outputPath` 必须显式命名，不参与顺序兜底）。

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `file=./doc/report.docx`），不依赖值特征推断。

## 行为边界

- 仅处理当前工作区内的本地文件，不支持远程 URL。
- 单文件默认上限 100 MB，可通过环境变量 `AE_MARKITDOWN_MAX_BYTES` 调整。
- 路径安全：输入文件和输出路径都必须位于工作区内，禁止目录穿越。
- 不支持的格式：音频、视频等非文档格式。
- HTML 通过 turndown 转为 GFM Markdown（标题、列表、表格、链接、删除线）。
- CSV/TSV 转为 Markdown 表格，最多 5000 行、50 列。
- JSON 对象数组转为表格，其他 JSON 在代码块中格式化输出。
- XML/YAML/纯文本在代码块中输出。
- Markdown 文件原样返回。
- DOCX 通过 mammoth 提取 HTML 后转 Markdown；OMML 数学公式转为 LaTeX 行内公式。
- XLSX 逐工作表转为 Markdown 表格，多工作表时以二级标题分隔。
- PDF 提取纯文本并识别表格/表单结构；扫描件或纯图片 PDF 可能无法提取文本。
- IPYNB 按单元格类型输出：代码单元格输出为带语言标签的代码块，Markdown 单元格原样输出。
- PPTX 提取幻灯片文本和图片引用，按幻灯片编号分节。
- ZIP 递归转换内部文件，按目录结构组织输出。
- JPG/PNG 提取 EXIF 元数据（尺寸、GPS、拍摄时间、描述等），PNG 额外解析 tEXt/zTXt/iTXt 文本块。
- RSS/Atom 提取频道信息和条目列表。
- EPUB 提取章节内容，按章节标题分节。
- MSG 提取 Outlook 邮件（发件人、收件人、主题、正文、附件列表）。
- 提供 `outputPath` 时，转换结果同时写入指定 .md 文件；未提供时仅通过工具返回值输出。

## 工具调用

使用 `ae-markitdown` 工具，并传入结构化参数。不要把自然语言解析作为唯一入口。
