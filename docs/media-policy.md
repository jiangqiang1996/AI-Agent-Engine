# 媒体降级策略

> 当你的模型**不支持**直接读取图片 / 音频 / 视频时，用本策略避免无效的工具调用。

完整版策略文本（可直接粘贴进 `AGENTS.md` / `CLAUDE.md`）位于：

- `skills/ae-image/references/media-policy.md`
- `skills/ae-audio/references/media-policy.md`
- `skills/ae-video/references/media-policy.md`

三份内容一致，任选其一复制到项目的指令文件即可。

## 核心规则（摘要）

1. **先判断能力，再决定动作。** 模型支持该媒体类型 → 直接读取；不支持 → 先转成文字再读。
2. **不支持输入时，禁止直接读取媒体文件**，也不反复重试同一次失败。
3. **降级要自动**，不询问用户是否要识别。
4. **最多重试一次**，失败就换下一级后端；仍失败则如实说明并给出下一步。
5. **不编造**。兜底输出只含可确定的客观信息（文件名、类型、大小、时长、编码）。
6. **保留原始措辞**。转写中的术语、命令、报错信息原样保留。

## 对应技能

| 媒体类型 | 技能 | 产物目录 | 后端优先级 |
|---|---|---|---|
| 图片 | `ae-image` | `ae/image/` | 视觉接口 → 本地 tesseract → 元信息 |
| 音频 | `ae-audio` | `ae/audio/` | 转写接口 → 本地 whisper → 元信息 |
| 视频 | `ae-video` | `ae/video/` | 抽帧（ffmpeg）+ 音轨转写 → 同上 |

## 配置后端

在项目根目录的 `ae.jsonc`（或全局 `~/.ae.jsonc`）中按技能分片配置：

```jsonc
{
  "ae-image": {
    "endpoint": "https://api.openai.com/v1/chat/completions",
    "model": "gpt-4o-mini",
    "apiKeyEnv": "OPENAI_API_KEY"
  },
  "ae-audio": {
    "endpoint": "https://api.openai.com/v1/audio/transcriptions",
    "model": "whisper-1",
    "apiKeyEnv": "OPENAI_API_KEY"
  }
}
```

不配置时，脚本会自动尝试本地工具（`tesseract` / `whisper` / `ffmpeg`）；都没有则输出元信息兜底并提示如何配置。

详见 [configuration.md](configuration.md)。
