---
name: ae:image
description: "当当前模型不支持图像处理且需要读取或理解图片内容时，必须使用本技能将图片转为 Markdown 描述。支持 JPG/PNG/GIF/WebP/BMP 格式，支持 outputMode 和 prompt 参数控制输出方式和识别重点。模型支持 vision 时可直接用 Read 工具读取图片；模型不支持 vision 时禁止尝试直接读取图片文件，必须通过本技能转换。"
argument-hint: "file=图片路径 [format=jpg|png|gif|webp|bmp] [outputMode=file|inline] [prompt=识别提示词] [outputPath=路径]"
---

# ae:image — 图片内容识别

将本地图片转换为 Markdown 描述。通过内置 `ae-image` 工具实现，无需安装额外依赖。

## 适用场景

- 用户需要理解图片内容（将图片转为文字描述供 LLM 阅读）
- 用户明确要求将图片内容持久化为 Markdown 文件
- 当前模型不支持直接读取图片文件时，用本技能替代直接读取
- 需要定向识别图片特定内容时，通过 prompt 参数指定识别重点

## 不适用场景

- 模型支持读取图片且只需查看/理解图片内容时，应直接使用 Read 工具读取，禁止调用本技能
- 不支持音频、视频等非图片格式
- 不支持远程 URL，仅处理当前工作区内本地文件

## 关键约束

- **模型不支持 vision 时禁止使用 Read 工具读取图片**：Read 工具读取 PNG/JPG 等图片文件时，如果当前模型不支持图像输入，会报错 "Cannot read image (this model does not support image input)"。此时必须通过本技能转换，不得尝试直接 Read 图片文件。
- 所有 to-image 操作（ae:pptx、ae:docx、ae:pdf 的 to-image）生成的 PNG 图片，在模型不支持 vision 时，必须通过本技能识别，不得直接 Read。

## 核心工作流

1. 接收用户提供的图片文件路径
2. 检测图片格式（JPG/PNG/GIF/WebP/BMP）
3. 读取图片内容，调用 vision 模型识别（可通过 prompt 参数指定识别重点）
4. 将识别结果转为 Markdown
5. 根据 outputMode 参数决定输出方式：
   - `file`（默认）：写入 `ae/markdown/` 目录（或用户指定的 outputPath）
   - `inline`：直接返回 Markdown 内容，不写文件

## 调用纪律

- 单次调用只处理一个文件；需要批量处理时逐一调用或建议用户使用脚本
- outputMode=file 时转换结果自动写入 `ae/markdown/` 子目录，文件名规则：`<原始文件名>-<时间戳>-<随机串>.md`
- prompt 参数指定时，覆盖默认识别提示词，用于定向识别（如"识别图片中的表格数据"、"提取 UI 界面中的按钮和文字"）
- 不需要用户确认即可执行（只读操作，不修改原图）

## 输出

返回 Markdown 格式的图片描述，包含：
- outputPath：写入的 Markdown 文件路径（outputMode=file 时存在）
- content：图片内容的 Markdown 描述

## 边界

- 仅处理当前工作区内本地图片文件（JPG/PNG/GIF/WebP/BMP）
- 不处理远程 URL
- 不处理音频、视频等非图片格式
- 图片文件不存在时返回友好提示
- 图片过大时返回提示并建议缩小文件
