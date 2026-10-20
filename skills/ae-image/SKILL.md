---
name: ae-image
description: 图片转文字描述（image to text / image description / OCR / 截图识别 / 视觉描述）。当当前模型不支持直接读取图片输入时，自动把本地图片转换成 Markdown 文字描述并写入 ae/image/。Use when the model lacks native image input - converts PNG/JPG/GIF/WebP/BMP into Markdown through an OpenAI-compatible vision endpoint, a local tesseract OCR, or a metadata-only fallback. 触发关键词：图片识别、截图分析、图像转文字、看图、图片描述、OCR、image to text、describe image、screenshot analysis、vision fallback.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+（运行本技能脚本）。可选外部命令 tesseract（本地 OCR 后端）。仅在使用 OpenAI 兼容视觉接口时需要网络访问。脚本零外部依赖，无需安装任何 npm 包。
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 媒体
---

# ae-image — 图片转文字描述

把本地图片转换成 Markdown 文字描述，让**不支持图像输入**的模型也能"看懂"图片。

本技能是**降级通道**：只有当当前模型不能直接读取图片时才需要它。它不创建会话、不派发代理、不修改图片文件，只产出可读的文字。

## 何时使用

- 当前模型不支持直接读取图片输入时，把图片转成文字后继续原任务（`Use when the model lacks native image input`）。
- 需要把图片内容持久化成 Markdown 文档。
- 需要定向识别图片中的某类信息（表格、界面元素、报错信息、图表数据等）。
- 其他工作流产出 PNG 截图后，模型无法直接查看，需要识别其视觉内容。

## 何时不使用

- 当前模型本身支持图像输入、只需看一眼就能回答 → 直接使用宿主的图片读取能力，不要绕道本技能。
- 非图片文件（音频、视频、PDF、SVG 文本）→ 交给对应技能，或直接按文本读取。
- 远程 URL → 本技能只处理本地文件。

## 媒体降级策略

- **不支持图像输入时，禁止尝试直接读取图片文件**：直接读取会失败并白白消耗一轮工具调用。此时必须先调用本技能，把图片转成文字再继续。
- **自动调用，不询问用户**：不要问"要不要识别这张图"、不要列方案让用户挑，直接执行，拿到结果后继续原任务。
- **最多重试一次**：第一次失败（接口不可用 / OCR 不可用 / 文件不存在）时改用下一个后端再试一次；仍然失败就如实告诉用户"无法识别该图片"，不要反复重试。
- 建议把 `references/media-policy.md` 里的策略粘贴到项目的 `AGENTS.md` / `CLAUDE.md`，让整个会话遵守同一条降级规则。

## 快速开始

```bash
node scripts/describe-image.mjs --file <图片路径> [--prompt <额外要求>] [--output <输出路径>]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--file` | 是 | 图片路径（相对当前工作目录或绝对路径），必须是真实存在的文件 |
| `--prompt` | 否 | 额外的识别要求，覆盖默认提示词 |
| `--output` | 否 | 指定输出文件；不传时写入 `ae/image/` |

脚本在标准输出打印产物路径、实际使用的后端，以及描述正文的前 800 字摘要。

## 三级后端

脚本按顺序尝试，命中即返回；被跳过的层级会写进产物末尾的"注意事项"。

### 后端 1：OpenAI 兼容视觉接口

在 `ae.jsonc` 的 `ae-image` key 下配置：

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `endpoint` | 视觉接口地址（OpenAI 兼容的 chat completions） | 不配置则跳过本级 |
| `model` | 模型名 | `gpt-4o-mini` |
| `apiKeyEnv` | 存放 API Key 的**环境变量名** | 不配置则跳过本级 |
| `prompt` | 默认提示词 | 内置中文描述提示词 |
| `ocrCommand` | 本地 OCR 命令名 | `tesseract` |
| `ocrLanguage` | OCR 语言包 | `chi_sim+eng` |

### 后端 2：本地 tesseract OCR

没有可用视觉接口（或接口调用失败）时，调用本机 `tesseract` 提取图片里的文字。命令名用 `ocrCommand` 覆盖，语言用 `ocrLanguage` 指定。本机没装 tesseract 时本级直接跳过。

### 后端 3：元信息兜底

前两级都不可用时，只输出可确定的客观信息（文件名、类型、字节数），并明确标注"无法在本地判定"。**绝不编造图片内容。**

## 配置

在项目根目录建 `ae.jsonc`（或放到用户主目录 `~/.ae.jsonc`），只写 `ae-image` 这一个 key：

```jsonc
{
  "ae-image": {
    "endpoint": "https://api.openai.com/v1/chat/completions",
    "model": "gpt-4o-mini",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

API Key 本身写进环境变量，不要落进配置文件：

```bash
export OPENAI_API_KEY=sk-...      # macOS / Linux
set OPENAI_API_KEY=sk-...         # Windows PowerShell
```

**查找顺序**（先命中先用，命中后不再继续）：

1. 环境变量 `AE_CONFIG` 指向的文件（显式覆盖）
2. `<当前工作目录>/ae.jsonc`
3. 从 `<当前工作目录>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`

每个技能只读 `ae.jsonc` 里与自己同名的顶层 key，互不干扰。

## 输出与日志

| 类别 | 路径 |
|------|------|
| 持久产物（Markdown 描述） | `ae/image/<原文件名>-to-markdown-<时间戳>.md` |
| 日志 | `ae/logs/image/describe-image-<时间戳>.log` |

产物结构：文件信息（路径、类型、后端）→ 内容 → 注意事项（降级原因）。

## prompt 使用指南

`--prompt` 是本技能的核心能力，用来控制识别重点。

**提取表格数据**

```
--prompt 提取图片中所有表格的数据，以 Markdown 表格输出，保留原始行列结构，表头加粗
```

**识别界面元素**

```
--prompt 识别这个界面截图中的所有交互元素：按钮（文字与位置）、输入框（标签与占位符）、链接、下拉菜单，按从上到下、从左到右列出
```

**文档视觉验证**

```
--prompt 这是一页文档渲染后的图片。请详细描述：1. 页面布局结构 2. 所有可见文字（逐字逐句）3. 表格与图表 4. 是否存在文字溢出、重叠、裁剪 5. 中文是否正常显示
```

编写原则：明确识别目标 → 结构化列出维度（编号）→ 要求逐字保留原文 → 显式要求报告异常 → 约定输出格式。

## 边界

- 只处理本地图片文件（JPG / PNG / GIF / WebP / BMP / AVIF 等），不处理远程 URL。
- 不处理音频、视频、PDF；不修改原始图片。
- 图片不存在时给出可读提示并以非零退出码结束。
- 兜底后端不会猜测画面内容。

## 参考

- `references/media-policy.md` — 可直接粘贴进项目 `AGENTS.md` / `CLAUDE.md` 的媒体降级策略。
