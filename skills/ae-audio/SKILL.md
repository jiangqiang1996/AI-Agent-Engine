---
name: ae-audio
description: 音频转文字（audio to text / transcription / speech to text / 语音转写 / 录音转文字）。当当前模型不支持直接读取音频输入时，自动把本地音频转成 Markdown 转写稿并写入 ae/audio/。Use when the model lacks native audio input - converts MP3/WAV/M4A/FLAC/OGG into text through an OpenAI-compatible transcription endpoint, a local whisper command, or a metadata-only fallback. 触发关键词：音频转写、语音识别、录音转文字、字幕生成、audio transcription、speech to text、whisper、voice memo.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+（运行本技能脚本）。可选外部命令 ffprobe（读取时长与编码信息）、whisper（本地转写后端）、ffmpeg（转码）。仅在使用 OpenAI 兼容转写接口时需要网络访问。脚本零外部依赖，无需安装任何 npm 包。
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 媒体
---

# ae-audio — 音频转文字

把本地音频转成 Markdown 转写稿，让**不支持音频输入**的模型也能"听懂"录音。

本技能是**降级通道**：只有当当前模型不能直接读取音频时才需要它。它不创建会话、不派发代理、不修改音频文件，只产出可读的文字。

## 何时使用

- 当前模型不支持直接读取音频输入时，把音频转成文字后继续原任务（`Use when the model lacks native audio input`）。
- 需要把录音内容持久化成 Markdown 文档。
- 会议录音、播客、采访、语音消息的逐字转写与要点提取。
- 音频格式特殊（本地 whisper 不支持）时，先转码再转写。

## 何时不使用

- 当前模型本身支持音频输入、只需听一遍就能回答 → 直接使用宿主的音频读取能力，不要绕道本技能。
- 非音频文件（图片、视频、文本）→ 交给对应技能，或直接按文本读取。
- 远程 URL → 本技能只处理本地文件。

## 媒体降级策略

- **不支持音频输入时，禁止尝试直接读取音频文件**：直接读取会失败并白白消耗一轮工具调用。此时必须先调用本技能，把音频转成文字再继续。
- **自动调用，不询问用户**：不要问"要不要转写这段录音"、不要列方案让用户挑，直接执行，拿到结果后继续原任务。
- **最多重试一次**：第一次失败（接口不可用 / 本地转写不可用 / 文件不存在）时改用下一个后端再试一次；仍然失败就如实告诉用户"无法转写该音频"，不要反复重试。
- 建议把 `references/media-policy.md` 里的策略粘贴到项目的 `AGENTS.md` / `CLAUDE.md`，让整个会话遵守同一条降级规则。

## 快速开始

```bash
node scripts/describe-audio.mjs --file <音频路径> [--output <输出路径>]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--file` | 是 | 音频路径（相对当前工作目录或绝对路径），必须是真实存在的文件 |
| `--output` | 否 | 指定输出文件；不传时写入 `ae/audio/` |

脚本在标准输出打印产物路径、实际使用的后端，以及转写正文的前 800 字摘要。

## 三级后端

脚本按顺序尝试，命中即返回；被跳过的层级会写进产物末尾的"注意事项"。

### 后端 1：OpenAI 兼容转写接口

在 `ae.jsonc` 的 `ae-audio` key 下配置：

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `endpoint` | 转写接口地址（OpenAI 兼容的 audio transcriptions） | 不配置则跳过本级 |
| `model` | 模型名 | `whisper-1` |
| `apiKeyEnv` | 存放 API Key 的**环境变量名** | 不配置则跳过本级 |
| `whisperCommand` | 本地转写命令名 | `whisper` |
| `ffmpeg` | 转码命令名（先把音频转成标准 wav 再转写时用） | `ffmpeg` |
| `ffprobe` | 探测命令名（读取时长、声道、采样率） | `ffprobe` |

### 后端 2：本地 whisper

没有可用转写接口（或接口调用失败）时，调用本机 `whisper` 命令做本地转写，命令名用 `whisperCommand` 覆盖。本机没装 whisper 时本级直接跳过。

### 后端 3：元信息兜底

前两级都不可用时，只输出可确定的客观信息（文件名、类型、大小、时长），并明确标注"无法在本地判定"。**绝不编造语音内容。**

### 元信息探测

脚本用 `ffprobe` 读取时长、声道、采样率、编码，写进产物的"文件信息"段。系统没装 `ffprobe` 时该段显示"未知"，不影响转写本身。

## 配置

在项目根目录建 `ae.jsonc`（或放到用户主目录 `~/.ae.jsonc`），只写 `ae-audio` 这一个 key：

```jsonc
{
  "ae-audio": {
    "endpoint": "https://api.openai.com/v1/audio/transcriptions",
    "model": "whisper-1",
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
| 持久产物（Markdown 转写稿） | `ae/audio/<原文件名>-to-markdown-<时间戳>.md` |
| 日志 | `ae/logs/audio/describe-audio-<时间戳>.log` |

产物结构：文件信息（路径、类型、大小、时长、声道、采样率、后端）→ 转写内容 → 注意事项（降级原因）。

## 转写质量建议

- 会议录音：让转写结果按发言人分组，保留语气词与停顿，不总结。
- 技术内容：命令、报错、术语原样保留，不要改写成近义词。
- 长音频：先按 10~30 分钟切片转写，再合并，避免单次请求过长。
- 噪声大、方言重、口音重时，优先用远程转写接口，本地 whisper 准确率通常更低。

## 边界

- 只处理本地音频文件（MP3 / WAV / M4A / AAC / FLAC / OGG 等），不处理远程 URL。
- 不处理图片、视频；不修改原始音频。
- 音频不存在时给出可读提示并以非零退出码结束。
- 兜底后端不会猜测语音内容。

## 参考

- `references/media-policy.md` — 可直接粘贴进项目 `AGENTS.md` / `CLAUDE.md` 的媒体降级策略。
