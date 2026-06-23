---
name: ae:markitdown
description: 将本地文件转换为 Markdown，支持 HTML/CSV/TSV/JSON/DOCX/XLSX/PDF/PPTX/JPG/PNG
argument-hint: "file=路径 [format=格式] [outputPath=路径]"
---

# Skill: ae:markitdown

将当前工作区内的本地文件转换为 Markdown，便于阅读、归档或作为 LLM 输入。

## 何时使用

- 用户需要把 HTML、CSV、TSV、JSON、DOCX、XLSX、PDF、PPTX、JPG/PNG 等文件转为 Markdown。
- 用户需要读取二进制文档（DOCX、XLSX、PDF、PPTX 等）的内容。
- Read 工具提示不支持某格式输入（如 PDF、DOCX、XLSX、PPTX 等二进制文档）时，改用本技能读取。
- 用户说"转成 Markdown"、"读取这个文件"、"识别图片内容"等。

## 如何使用

**不要用 Read 工具读取 PDF、DOCX、XLSX、PPTX 等二进制文档**——Read 工具会把文件作为模型输入，而这些格式模型不支持。`ae-markitdown` 是读取这类文件的唯一正确方式。

直接调用 `ae-markitdown` 工具，按工具参数说明传参即可：

- `file`（必填）：本地文件路径。
- `format`（可选）：显式指定格式；省略时由工具根据扩展名推断。

工具内部完成路径解析、格式识别、内容读取、转换，并将结果自动写入当前工作区 `ae/markitdown/` 子目录。输出文件名规则：`<原始文件名>-<时间戳>-<随机串>.md`，保留原始文件名便于追溯来源，时间戳与随机串确保同一文件反复转换不会冲突。转换完毕后通过 `metadata.outputPath` 返回写入的绝对路径。转换失败时按工具返回的中文提示让用户修正路径、格式或权限后重试。

## 调用纪律

**核心规则：一次技能触发只调用一次工具。**

- 加载本技能后，针对用户指定的文件参数，只调用一次 `ae-markitdown` 工具。
- 收到工具返回值后，任务即完成。直接使用返回的 `output` 和 `metadata.outputPath` 向用户汇报结果。
- **禁止在未收到用户新指令的情况下，再次发起相同参数的工具调用。** 这包括：不要因为想"确认结果"、想"再读一次"、想"验证写入"而重复调用。
- 如果用户在同一会话中再次明确要求转换同一文件（例如源文件已修改），可再次调用，每次调用都会生成独立产物文件。
- 工具调用是一次性的：发起 → 等待返回 → 汇报结果 → 结束。不要在单次响应中循环或重复发起。

## 边界

- 仅处理当前工作区内本地文件，不支持远程 URL。
- 不支持音频、视频等非文档格式。
- 单文件默认上限 100 MB，可通过环境变量 `AE_MARKITDOWN_MAX_BYTES` 调整。
