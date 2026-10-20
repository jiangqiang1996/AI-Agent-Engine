---
name: ae-video
description: 视频转文字（video to text / video description / 视频描述 / 视频字幕 / 关键帧分析）。当当前模型不支持直接读取视频输入时，自动抽关键帧并转写音轨，合成 Markdown 描述写入 ae/video/。Use when the model lacks native video input - extracts keyframes with ffmpeg, describes each frame through a vision endpoint or OCR, transcribes the audio track, and merges both into one Markdown report. 触发关键词：视频转文字、视频描述、视频字幕、关键帧、视频分析、video to text、video description、keyframe analysis、video subtitles.
license: GPL-3.0-or-later
compatibility: 需要 Node.js 18+（运行本技能脚本），且 PATH 上必须有 ffmpeg 与 ffprobe（抽帧、抽音轨、读元信息）。可选外部命令 tesseract / whisper。仅在使用 OpenAI 兼容视觉或转写接口时需要网络访问。脚本零外部依赖，无需安装任何 npm 包。
metadata:
  author: ae-skills
  version: 1.0.0
  ae-group: 媒体
---

# ae-video — 视频转文字

把本地视频转成 Markdown 描述，让**不支持视频输入**的模型也能"看懂"录像。

本技能是**降级通道**：只有当当前模型不能直接读取视频时才需要它。它不创建会话、不派发代理、不修改视频文件，只产出可读的文字。

## 何时使用

- 当前模型不支持直接读取视频输入时，把视频转成文字后继续原任务（`Use when the model lacks native video input`）。
- 需要把视频内容持久化成 Markdown 文档。
- 教程录屏、会议录屏、监控片段的内容梳理、步骤提取、字幕生成。

## 何时不使用

- 当前模型本身支持视频输入、只需看一眼就能回答 → 直接使用宿主的视频读取能力，不要绕道本技能。
- 非视频文件（图片、音频、文本）→ 交给对应技能，或直接按文本读取。
- 远程 URL → 本技能只处理本地文件。

## 媒体降级策略

- **不支持视频输入时，禁止尝试直接读取视频文件**：直接读取会失败并白白消耗一轮工具调用。此时必须先调用本技能，把视频转成文字再继续。
- **自动调用，不询问用户**：不要问"要不要解析这个视频"、不要列方案让用户挑，直接执行，拿到结果后继续原任务。
- **最多重试一次**：第一次失败（缺少 ffmpeg / 帧描述后端不可用 / 音轨转写失败）时改用下一个后端再试一次；仍然失败就如实告诉用户"无法解析该视频"，不要反复重试。
- 建议把 `references/media-policy.md` 里的策略粘贴到项目的 `AGENTS.md` / `CLAUDE.md`，让整个会话遵守同一条降级规则。

## 快速开始

```bash
node scripts/describe-video.mjs --file <视频路径> [--interval <秒>] [--max-frames <n>] [--output <输出路径>]
```

| 参数 | 必填 | 说明 |
|------|------|------|
| `--file` | 是 | 视频路径（相对当前工作目录或绝对路径），必须是真实存在的文件 |
| `--interval` | 否 | 抽帧间隔（秒），默认 `5` |
| `--max-frames` | 否 | 最多抽取多少张关键帧，默认 `12` |
| `--output` | 否 | 指定输出文件；不传时写入 `ae/video/` |

脚本在标准输出打印产物路径、关键帧数量，以及正文前 1200 字摘要。

## 处理流程

1. **元信息探测** —— 用 `ffprobe` 读取时长、分辨率、帧率、视频编码、音频编码。
2. **关键帧抽取** —— 用 `ffmpeg` 按 `--interval` 间隔抽帧，最多 `--max-frames` 张，落在临时目录 `ae/video/tmp/frames/`。
3. **逐帧描述** —— 每张关键帧走一遍**图片描述后端**（与 `ae-image` 同一套三级后端），得到该帧的画面描述。
4. **音轨转写** —— 用 `ffmpeg` 把音轨抽成 16 kHz 单声道 wav（`ae/video/tmp/audio.wav`），再走一遍**音频转写后端**（与 `ae-audio` 同一套三级后端）。
5. **合成产物** —— 元信息 + 关键帧描述 + 音轨转写 + 注意事项，合并成一份 Markdown。

视频没有音轨时，音轨段落标注"（未抽取到音轨或无可用转写后端）"。

## 后端与配置

帧描述走图片后端，音轨转写走音频后端，两个后端都是三级降级：**远程接口 → 本地命令 → 元信息兜底**。

在 `ae.jsonc` 里配置，`ae-video` key 优先，未配置的字段回落到 `ae-image` / `ae-audio` key：

```jsonc
{
  "ae-video": {
    "ffmpeg": "ffmpeg",
    "ffprobe": "ffprobe",
    "endpoint": "https://api.openai.com/v1/chat/completions",
    "model": "gpt-4o-mini",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `ffmpeg` | 抽帧与抽音轨用的命令名 | `ffmpeg` |
| `ffprobe` | 探测元信息用的命令名 | `ffprobe` |
| `endpoint` | 帧描述用的视觉接口（缺省时用 `ae-image` 的配置） | 见 `ae-image` |
| `model` | 视觉模型名 | 见 `ae-image` |
| `apiKeyEnv` | API Key 所在的环境变量名 | 见 `ae-image` |

音轨转写接口单独配在 `ae-audio` key 下（`endpoint` / `model` / `apiKeyEnv` / `whisperCommand`）。

API Key 写进环境变量，不要落进配置文件：

```bash
export OPENAI_API_KEY=sk-...      # macOS / Linux
set OPENAI_API_KEY=sk-...         # Windows PowerShell
```

**查找顺序**（先命中先用，命中后不再继续）：

1. 环境变量 `AE_CONFIG` 指向的文件（显式覆盖）
2. `<当前工作目录>/ae.jsonc`
3. 从 `<当前工作目录>` 逐级向上查找 `ae.jsonc`（最近者胜）
4. `~/.ae.jsonc`

## 输出与日志

| 类别 | 路径 |
|------|------|
| 持久产物（Markdown 描述） | `ae/video/<原文件名>-to-markdown-<时间戳>.md` |
| 临时产物（关键帧、音轨） | `ae/video/tmp/` |
| 日志 | `ae/logs/video/describe-video-<时间戳>.log` |

产物结构：文件信息（路径、类型、大小、时长、分辨率、帧率、关键帧数）→ 关键帧描述 → 音轨转写 → 注意事项。

## 参数选择建议

| 场景 | 建议 |
|------|------|
| 短演示（< 2 分钟） | `--interval 3 --max-frames 20` |
| 长会议（> 30 分钟） | `--interval 15 --max-frames 12` |
| 纯语音内容 | `--interval 30 --max-frames 2`，重点看音轨转写 |
| 界面操作教程 | `--interval 2 --max-frames 30` |

## 边界

- 只处理本地视频文件（MP4 / MOV / MKV / WebM / AVI / FLV 等），不处理远程 URL。
- **PATH 上必须有 `ffmpeg` 与 `ffprobe`**，否则无法抽帧与读元信息，脚本会明确报错。
- 不处理图片、音频等非视频文件；不修改原始视频。
- 视频不存在时给出可读提示并以非零退出码结束。
- 关键帧描述是抽帧采样，不等于逐帧完整还原；需要精确时间点时请缩小 `--interval`。

## 参考

- `references/media-policy.md` — 可直接粘贴进项目 `AGENTS.md` / `CLAUDE.md` 的媒体降级策略。
