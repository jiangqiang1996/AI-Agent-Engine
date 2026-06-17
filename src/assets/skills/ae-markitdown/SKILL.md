---
name: ae:markitdown
description: 将本地文件转换为 Markdown，支持 HTML/CSV/JSON/XML/YAML/文本/Markdown/DOCX/XLSX/PDF/IPYNB
argument-hint: "[file] [format]"
---

# Skill: ae:markitdown

将当前工作区内的本地文件统一转换为 Markdown 格式，便于阅读、归档或作为 LLM 输入。

## 使用场景

- 用户需要将 HTML、CSV、JSON、XML、YAML、TXT 等文本格式文件转为 Markdown。
- 用户需要读取 DOCX、XLSX、PDF、IPYNB 等二进制格式文件的内容。
- 用户说"转成 Markdown"、"读取这个文件"、"把 DOCX 转成文本"等。

## 参数

- `file`：必填，当前工作区内的本地文件路径，支持绝对路径或相对路径。
- `format`：可选，显式指定文件格式（`html`、`csv`、`json`、`xml`、`yaml`、`text`、`markdown`、`docx`、`xlsx`、`pdf`、`ipynb`）。省略时根据扩展名自动推断。

参数解析规则：
1. 显式命名：`key=value`、`key:value`、`--key=value` 直接绑定。
2. 顺序兜底：`file → format`。

**内部调用约定**：当本技能被其他技能自动调用时，所有参数必须使用显式命名格式（如 `file=./doc/report.docx`），不依赖值特征推断。

## 行为边界

- 仅处理当前工作区内的本地文件，不支持远程 URL。
- 单文件上限 10 MB。
- 路径安全：文件必须位于工作区内，禁止目录穿越。
- 不支持的格式：音频、视频、图片、压缩包等非文档格式。
- HTML 通过 turndown 转为 GFM Markdown（标题、列表、表格、链接、删除线）。
- CSV/TSV 转为 Markdown 表格，最多 5000 行、50 列。
- JSON 对象数组转为表格，其他 JSON 在代码块中格式化输出。
- XML/YAML/纯文本在代码块中输出。
- Markdown 文件原样返回。
- DOCX 通过 mammoth 提取 HTML 后转 Markdown。
- XLSX 逐工作表转为 Markdown 表格，多工作表时以二级标题分隔。
- PDF 提取纯文本到代码块；扫描件或纯图片 PDF 可能无法提取文本。
- IPYNB 按单元格类型输出：代码单元格输出为带语言标签的代码块，Markdown 单元格原样输出。

## 工具调用

使用 `ae-markitdown` 工具，并传入结构化参数。不要把自然语言解析作为唯一入口。
