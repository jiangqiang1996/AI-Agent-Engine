---
name: ae-qwen3-tts
description: 文字转语音（TTS）音频生成：预置音色朗读（9 种音色）、自然语言音色设计、参考音频语音克隆；支持逐行批量生成、种子复现、wav/flac/ogg/mp3 输出、m4a 等参考音频自动 ffmpeg 转码、模型自动下载、GPU 优先。Use when the user needs to turn text into speech or audio, generate narration/voice-over, clone a voice, design a voice timbre, or export audio files. 触发关键词：TTS、文字转音频、文字转语音、语音合成、生成配音、朗读音频、克隆声音、设计音色、输出音频文件、text to speech、voice clone、voice design。
license: GPL-3.0-or-later
compatibility: 需要 Python 3.9+（运行本技能脚本）与首次运行的网络访问（ModelScope/HuggingFace 下载模型）。依赖 qwen-tts / torch / soundfile / modelscope / huggingface_hub，由 scripts/install.py 按需安装（非 npm 依赖）。推荐 NVIDIA GPU：检测到可用 GPU 时禁止 CPU 运行。ffmpeg 仅在参考音频为 m4a/aac 等格式时需要。
metadata:
  version: "1.0.0"
  ae-group: 音频与多媒体
  author: ae-skills
---

# ae-qwen3-tts — 文字转音频（语音合成）

通过本技能目录下的 `scripts/tts.py` 把文字合成为音频文件（Windows / Linux / macOS 通用）。

- **执行位置**：以下 `python scripts/...` 命令均在**技能目录**（含 `scripts/` 的那一层）下执行。
- 完整参数表、Python API、可选依赖（flash-attn / SoX）、模型注册表见 [references/REFERENCE.md](references/REFERENCE.md)（按需读取）。

## 何时使用

- 用户要把文本变成音频：配音、旁白、朗读、有声内容。
- 用户要克隆某个人的声音（提供参考音频）或用自然语言设计一个新音色。
- 用户要批量生成语音（逐行脚本 → 多个音频文件）。
- 用户要 wav / flac / ogg / mp3 等格式的音频文件，或需要固定种子复现同一段语音。
- 关键词命中：TTS、文字转音频、文字转语音、语音合成、生成配音、朗读音频、克隆声音、设计音色、输出音频文件、text to speech, voice clone, voice design。

## 何时不使用

- 把音频**转成文字**（语音识别、听写）→ 属于语音识别范畴。
- 音乐伴奏、音效、混音、母带处理 → 属于音频后期制作范畴。
- 视频剪辑、字幕时间轴对齐 → 属于视频处理范畴。
- 大规模商业配音流水线（多角色、多语言批量交付）→ 先与用户确认本技能的单机单卡能力是否够用。

## 第 0 步：环境准备

```bash
python scripts/check_gpu.py                        # GPU/PyTorch/flash-attn/模型就绪状态
python scripts/install.py                          # 安装依赖: auto=有 N 卡装 CUDA 版 PyTorch
python scripts/install.py --cuda cu128             # 指定 cu126/cu128/cu129/cpu；--dry-run 仅打印
python scripts/check_gpu.py                        # 装完复查
```

- 依赖装在**当前 Python 环境**里（`pip install -r scripts/requirements.txt` 的等价物），不写进项目代码。
- 首次运行会**自动下载模型**（ModelScope 优先，HuggingFace 回退）到技能目录 `models/`：单个模型数 GB（0.6B 约 2.5GB、1.7B-VoiceDesign 约 3.4GB），之后离线可用。
- 退出码：`0` 成功；`2` **参数错误或设备策略违规**（argparse 校验失败，如缺 `--ref-audio`、非法 `--dtype`；检测到 GPU 却指定 `--device cpu`）；`1` **运行错误**（`-f` 文件为空、模型加载或生成失败、输出文件已存在拒绝覆盖等）。

**设备策略（强制，勿绕过）**：

- `--device auto`：有可用 GPU 时自动选空闲显存最大的一块；仅当无 GPU 或 PyTorch 不支持 CUDA 时用 CPU。
- 检测到可用 GPU 时显式 `--device cpu` 直接报错（退出码 2）；GPU 加载失败不静默回退 CPU。
- `--dtype auto`：GPU→bfloat16（不支持 bf16 的卡→float16），CPU→float32。
- 有 NVIDIA 显卡但 PyTorch 为 CPU 版（版本号带 `+cpu`）→ `python scripts/install.py --cuda auto` 修复。

## 模式决策

| 用户意图 | 模式 | 必需参数 |
|---|---|---|
| 用预置音色朗读（可带情感/风格） | `custom_voice`（默认） | `-s` 音色；`-i` 情感指令可选（0.6B 模型忽略 `-i`） |
| 用自然语言描述想要的音色 | `voice_design` | `-i` 音色描述（模型强制 1.7b） |
| 提供参考音频克隆声音 | `voice_clone` | `--ref-audio`；`--ref-text` 参考音频文本（或 `--xvec-only` 仅取声纹，可省 ref-text） |

拿不准用户想要哪种模式时，先问一句再动手；用户明确给了参考音频就用 `voice_clone`，明确描述了音色长相就用 `voice_design`，其余走 `custom_voice`。

## 音色（custom_voice）

| 音色 | 描述 | 原生语言 |
|------|------|----------|
| Vivian | 明亮、略带棱角的年轻女声 | Chinese |
| Serena | 温暖、柔和的年轻女声 | Chinese |
| Uncle_Fu | 低沉醇厚的成熟男声 | Chinese |
| Dylan | 清晰自然的北京男声 | Chinese (Beijing) |
| Eric | 略带沙哑的成都男声（**默认**，输出川渝口音） | Chinese (Sichuan) |
| Ryan | 节奏感强的活力男声 | English |
| Aiden | 阳光清晰的美式男声 | English |
| Ono_Anna | 轻快灵动的日式女声 | Japanese |
| Sohee | 温暖情感丰富的韩式女声 | Korean |

`python scripts/tts.py --list-speakers` / `--list-languages` 可列出音色与语言。

## 常用示例

```bash
# 预置音色 + 情感指令
python scripts/tts.py "Hello" -s Ryan -l English -i "Very happy" -o hello.wav

# 音色设计（自动 1.7b）
python scripts/tts.py "你好" -m voice_design -i "带四川成都口音的年轻女声" -o designed.wav

# 语音克隆
python scripts/tts.py "你好" -m voice_clone --ref-audio ref.wav --ref-text "参考文本" -o cloned.wav

# 批量（-f 文件每行一条）
python scripts/tts.py -f script.txt -o output_dir/ -s Serena            # 目录 → 000.wav…
python scripts/tts.py -f script.txt -o "out/chapter-{i}.wav" -s Serena  # 模板 → chapter-000.wav…
python scripts/tts.py -f script.txt -o out/speech.wav -s Serena         # 前缀 → speech-000.wav…

# 可复现/确定性
python scripts/tts.py "文本" --seed 42            # 固定种子复现
python scripts/tts.py "文本" --no-sample          # 关闭采样，两次输出一致

# 覆盖既有输出（默认拒绝覆盖；确认后再加 --overwrite）
python scripts/tts.py "文本" -o out.wav --overwrite

# 运行时配置（更多参数见 references/REFERENCE.md）
python scripts/tts.py "文本" --model-name 1.7b --device cuda:0 --dtype bfloat16 --attn-impl sdpa
```

## 输出路径语义（-o）

- 单条：文件路径；无扩展名自动补 `.wav`；音频格式跟随扩展名（wav/flac/ogg/mp3 等）；父目录自动创建。
- 批量三形态：目录 / 含 `{i}` 的模板 / 音频扩展名前缀（见上例）。
- **不传 `-o` 时**写到默认产物目录 `ae/qwen3-tts/output.wav`。
- **默认不覆盖既有文件**：目标文件已存在时报错退出（退出码 1）并点名冲突文件；确认可覆盖时加 `--overwrite`（批量模式会覆盖目录内同名文件）。

## 参考音频语义（voice_clone）

- 本地文件先用 soundfile 探测：wav/flac/ogg/mp3 等直接使用。
- soundfile 解码失败的容器（m4a/aac/mp4/微信语音等）自动调用 ffmpeg 转 24kHz 单声道 wav（按源路径+大小+修改时间哈希缓存在系统临时目录）；未安装 ffmpeg 时报错退出。
- URL / base64 原样透传给底层库；带扩展名的本地路径不存在时快速失败。
- 用户想克隆自己的声音但尚无录音素材时，让其朗读下面这段文本录音（即为最佳参考音频）：

  > 大家好，我是小张。今天天气不错，阳光正好，微风轻轻吹过窗台。我平时喜欢跑步、读书，偶尔也看看电影。周末常和家人去公园散步，聊聊最近发生的事。现在人工智能发展得真快，语音合成听起来特别自然，你说神奇不神奇？希望这段录音能帮上忙，谢谢大家！

## 配置

配置统一从 `ae.jsonc` 读取，本技能只读自己的顶层 key `ae-qwen3-tts`（与其它技能互不干扰）。

在项目根目录建 `ae.jsonc`（或放到用户主目录 `~/.ae.jsonc`），只写这一个 key：

```jsonc
{
  "ae-qwen3-tts": {
    "modelRoot": "",
    "outputDir": "",
    "device": "auto",
    "dtype": "auto",
    "attnImpl": "auto"
  }
}
```

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `modelRoot` | 模型根目录（空=技能目录 `models/`） | `<技能目录>/models/` |
| `outputDir` | 默认输出目录（空=产物目录 `ae/qwen3-tts/`） | `ae/qwen3-tts/` |
| `device` | 默认设备（`auto` / `cuda:N` / `cpu`） | `auto` |
| `dtype` | 默认精度（`auto` / `bfloat16` / `float16` / `float32`） | `auto` |
| `attnImpl` | 默认注意力实现（`auto` / `sdpa` / `flash_attention_2` / `eager` / `flex_attention`） | `auto` |

**配置文件查找顺序**（先命中先用）：环境变量 `AE_CONFIG` 指向的文件 → `<cwd>/ae.jsonc` → 从 `<cwd>` 逐级向上查找 → `~/.ae.jsonc`。

**优先级**：命令行参数 > 环境变量 > `ae.jsonc` > 内置默认值。
环境变量覆盖：`AE_QWEN3_TTS_MODEL_ROOT`、`AE_QWEN3_TTS_OUTPUT_DIR`、`AE_QWEN3_TTS_DEVICE`、`AE_QWEN3_TTS_DTYPE`、`AE_QWEN3_TTS_ATTN_IMPL`。

## 产物与日志

| 类别 | 路径 | 内容 |
|------|------|------|
| 音频产物 | `ae/qwen3-tts/`（默认 `output.wav`；批量按 `-o` 指定） | 合成的音频文件 |
| 生成记录 | `ae/qwen3-tts/runs/<时间戳>.json` | 模式、模型、音色、语言、种子、输出文件列表 |
| 临时产物 | `ae/qwen3-tts/tmp/` | 自测与中间文件 |
| 日志 | `ae/logs/qwen3-tts/` | 手动重定向标准输出时放这里 |
| 模型缓存 | `<技能目录>/models/`（可用 `modelRoot` 覆盖） | 下载的模型权重（GB 级） |

- 这些目录都在**当前工作目录**下（模型缓存除外），随项目走；不要写进其它技能的产物目录。
- 音频是交付物，默认落在 `ae/qwen3-tts/`；用户指定了别的 `-o` 路径就按用户的来。

## 安全边界

- **不覆盖用户文件**：`-o` 指向已存在的文件时**默认拒绝写入**并报错（点名冲突文件，退出码 1）；批量输出先检查目录内全部同名文件，冲突时一个都不写。确认可覆盖再加 `--overwrite`。
- **不擅自上传**：参考音频、克隆素材只在本机处理，不外传。
- **不静默回退**：GPU 加载失败要报错，不要偷偷改成 CPU 跑（慢十倍还可能超时）。
- **大文件下载前提醒**：模型数 GB，先告知用户体积与耗时再开始下载。
- **不改动目标项目代码**：本技能只在 `ae/` 产物目录与技能自身目录内写文件。

## 完成标准

- 音频文件已生成并回报了**实际路径**（不是"已生成"这种空话）。
- 用了与用户意图匹配的模式与音色（预置音色 / 音色设计 / 克隆）。
- 参考音频场景：明确告知用户参考音频是什么、是否做了格式转换。
- 退出码为 0；非 0 时给出中文原因与下一步（对照「故障排查」）。
- 产物落在 `ae/qwen3-tts/`，生成记录已写入并回报。

## 故障排查

| 现象 | 常见原因 | 处理 |
|---|---|---|
| `ModuleNotFoundError: qwen_tts` | 依赖没装 | `python scripts/install.py` |
| 退出码 2 + "检测到可用 GPU" | 显式指定了 `--device cpu` | 去掉该参数用 `--device auto` |
| 退出码 2 + argparse 用法报错 | 参数缺失或取值非法（如缺 `--ref-audio`、`--dtype` 非法） | 按用法补齐/改正参数 |
| "PyTorch 不支持 CUDA"（仅警告，仍会跑 CPU） | 装的是 CPU 版 torch | `python scripts/install.py --cuda auto` 装 CUDA 版 |
| 退出码 1 + "输出文件已存在，拒绝覆盖" | 目标文件已存在（默认保护用户文件） | 换个 `-o`，或确认后加 `--overwrite` |
| "soundfile 无法解码" | m4a/aac 容器 | 装 ffmpeg，或先转成 wav |
| 模型下载失败 | 网络不通 / 镜像限流 | 检查网络；ModelScope 与 HuggingFace 换手重试 |
| 显存不足（OOM） | 1.7B + 长文本 | 换 0.6B 模型、拆短文本、降低 `--max-new-tokens` |
| 生成很慢 | 落到 CPU 跑了 | `python scripts/check_gpu.py` 看 GPU 与 torch 构建 |

## 自测

```bash
python tests/test_tts.py --fast       # 秒级：静态编译 + CLI 退出码 + 设备策略 + 参数/默认音色/参考音频转换单元
python tests/test_tts.py              # 全量：+ GPU 三模式端到端（缺失模型自动下载，约 10-25 分钟）
python tests/test_tts.py --gpu-only   # 仅 GPU 端到端
python tests/test_tts.py --keep       # 保留测试产物 ae/qwen3-tts/tmp/selftest/（默认清理）
```

结果三态 PASS/FAIL/SKIP（无 GPU 或前置依赖缺失时 SKIP）；退出码 0=全部通过、1=存在 FAIL。
