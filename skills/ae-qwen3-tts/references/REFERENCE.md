# Qwen3-TTS 完整参考

SKILL.md 的按需细节：完整参数表、Python API、可选依赖、模型注册表。
命令均在**技能目录**（含 `scripts/` 的那一层）下执行。

## 全部参数

生成参数留空 = 使用模型 `generate_config.json` 默认（无则用库默认：
`do_sample=True, temperature=0.9, top_k=50, top_p=1.0, repetition_penalty=1.05, subtalker_* 同上, max_new_tokens=2048`）。

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `-m/--mode` | custom_voice | custom_voice / voice_design / voice_clone |
| `--model-name` | 0.6b | 模型规模（voice_design 强制 1.7b） |
| `--model-kwargs` | {} | JSON，额外传给 `from_pretrained`（禁含 device_map/dtype/attn_implementation） |
| `-s/--speaker` | Eric | 音色名称 |
| `-l/--language` | Chinese（voice_clone 为 Auto） | 语言 |
| `-i/--instruct` | "" | 情感/风格指令或音色描述 |
| `--ref-audio` | - | 参考音频（本地文件/URL/base64，voice_clone 必填） |
| `--ref-text` | "" | 参考音频文本（voice_clone 必填，`--xvec-only` 时可省略） |
| `--xvec-only` | false | 仅使用声纹向量 |
| `-o/--output` | `ae/qwen3-tts/output.wav` | 输出路径（单条→文件；批量→目录 / 含 `{i}` 模板 / 音频扩展名前缀） |
| `--overwrite` | false | 允许覆盖已存在的输出文件（默认拒绝覆盖并报错退出 1；批量模式会覆盖目录内同名文件） |
| `-f/--file` | - | 从文件读取文本（每行一条，批量） |
| `--max-new-tokens` | 库默认 2048 | 最大生成 codec token 数 |
| `--temperature` | 库默认 0.9 | 采样温度 |
| `--top-k` | 库默认 50 | top-k 采样 |
| `--top-p` | 库默认 1.0 | nucleus 采样 |
| `--repetition-penalty` | 库默认 1.05 | 重复惩罚 |
| `--eos-token-id` | 模型配置 | 提前终止 token id |
| `--no-sample` | - | do_sample=False 且 subtalker_dosample=False → 确定性输出 |
| `--subtalker-dosample` | 库默认开 | 子 talker 是否采样（12Hz tokenizer） |
| `--subtalker-temperature` | 库默认 0.9 | 子 talker 采样温度 |
| `--subtalker-top-k` | 库默认 50 | 子 talker top-k |
| `--subtalker-top-p` | 库默认 1.0 | 子 talker top-p |
| `--non-streaming` | auto | 非流式文本输入（auto=custom_voice/voice_design 开、voice_clone 关） |
| `--seed` | - | 随机种子（固定后可复现） |
| `--generation-kwargs` | {} | JSON，额外透传底层 `generate()`，覆盖同名项 |
| `--device` | auto | auto / cuda:N / cpu（有 GPU 时禁止 cpu） |
| `--dtype` | auto | auto / bfloat16 / float16 / float32 |
| `--attn-impl` | auto | auto / sdpa / flash_attention_2 / eager / flex_attention |
| `--list-speakers` / `--list-languages` | - | 列出音色/语言后退出 |

底层 `model.generate()` 实际消费的即上表所列键；其余 Transformers 生成参数（如 `num_beams`）不会被使用，仅经 `--generation-kwargs` 透传备用。`min_new_tokens` 由上游固定为 2，不开放。

支持的语言：Chinese / English / Japanese / Korean / German / French / Russian / Portuguese / Spanish / Italian（`python scripts/tts.py --list-languages`）。

## Python API（编排/批量场景）

```python
import sys
from pathlib import Path

# 技能目录（含 scripts/ 的那一层）
SKILL_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from qwen_tts_skill import generate_custom_voice, generate_voice_design, generate_voice_clone

paths = generate_custom_voice("你好", speaker="Eric", output="out.wav")
paths = generate_voice_design("你好", instruct="低沉男声", output="out.wav")
paths = generate_voice_clone("你好", ref_audio="ref.wav", ref_text="参考文本", output="cloned.wav")

# 文本可为 list[str]（批量）；返回 list[Path] 实际写出的音频路径。
# output 传 None 时落到默认产物目录 <cwd>/ae/<skill-slug>/output.wav。
# 支持 device/dtype/attn_implementation/seed/temperature/top_k/top_p/
# repetition_penalty/max_new_tokens 等关键字，语义与 CLI 参数一致。
# overwrite=True 才允许覆盖已存在的输出文件（默认 overwrite=False：
# 目标文件已存在即抛 OutputConflictError，一个文件都不写）。
```

命名约定（避免同名歧义）：

| 名称 | 来源 | 语义 |
|------|------|------|
| `resolve_device(requested)` | `devices` | 设备**策略**入口：auto/cuda:N/cpu 解析与违规拒绝 |
| `resolve_dtype(dtype, device)` | `devices` | 精度**策略**入口：auto → bf16/fp16/fp32 |
| `resolve_device_setting(cwd)` | `config` | 读 `ae.jsonc` 与 `AE_QWEN3_TTS_DEVICE` 得**默认设备** |
| `resolve_dtype_setting(cwd)` | `config` | 读 `ae.jsonc` 与 `AE_QWEN3_TTS_DTYPE` 得**默认精度** |

包级导出（`from qwen_tts_skill import ...`）含 `resolve_device` / `resolve_dtype`（策略）与
`resolve_device_setting` / `resolve_dtype_setting`（配置读取），两者签名不同、互不顶替。

## 配置（ae.jsonc）

本技能只读 `ae.jsonc` 里的顶层 key `ae-qwen3-tts`：

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

- `modelRoot`：模型根目录（空=技能目录 `models/`）。
- `outputDir`：默认输出目录（空=`<cwd>/ae/<skill-slug>/`）。
- `device` / `dtype` / `attnImpl`：命令行未显式指定时的默认值。

查找顺序：环境变量 `AE_CONFIG` → `<cwd>/ae.jsonc` → 逐级向上查找 → `~/.ae.jsonc`。
优先级：命令行参数 > 环境变量（`AE_QWEN3_TTS_MODEL_ROOT` / `AE_QWEN3_TTS_OUTPUT_DIR` /
`AE_QWEN3_TTS_DEVICE` / `AE_QWEN3_TTS_DTYPE` / `AE_QWEN3_TTS_ATTN_IMPL`）> `ae.jsonc` > 内置默认值。

## 可选依赖（不由 install.py 安装，仅检测提示）

- **flash-attn**：加速长文本/批量生成并降低显存峰值，输出与 sdpa 数学等价；缺失时 `--attn-impl auto` 自动走 sdpa，功能不受影响。安装：`pip install flash-attn --no-build-isolation`（Windows 无预编译 wheel，需 MSVC + CUDA 工具链源码编译，版本需匹配 PyTorch CUDA 构建）。
- **SoX 系统二进制**：仅加载 25Hz tokenizer 的旧版模型做音频→token 编码时需要（25Hz 编码路径在编码前用 pysox 做 -6dB 响度归一化，缺 `sox` 二进制直接抛错）。本技能下载的全部模型均为 12Hz，编码路径零 SoX 依赖；`import qwen_tts` 打印的 "SoX could not be found" 来自 pysox 导入期检测，可忽略。Python 侧 `pysox` 已随 qwen-tts 自动安装，缺的只是系统程序 sox（http://sox.sourceforge.net/ 安装并加入 PATH）。输出保存走 soundfile（libsndfile），wav/flac/ogg 全覆盖，与 SoX 无关。

## 自测

```bash
python tests/test_tts.py --fast       # 秒级：静态编译 + CLI 退出码 + 设备策略 + 参数/默认音色/参考音频转换单元
python tests/test_tts.py              # 全量：+ GPU 三模式端到端（缺失模型自动下载，约 10-25 分钟）
python tests/test_tts.py --gpu-only   # 仅 GPU 端到端
python tests/test_tts.py --keep       # 保留测试产物 ae/qwen3-tts/tmp/selftest/（默认清理）
```

结果三态 PASS/FAIL/SKIP（无 GPU 或前置依赖缺失时 SKIP）；退出码 0=全部通过、1=存在 FAIL。GPU 用例覆盖：单条/批量生成、instruct 警告、seed 复现、确定性（do_sample=False）、generation_kwargs 透传、CLI 子进程端到端、voice_clone ICL 与声纹模式、m4a 参考音频自动转换端到端、voice_design、0.6B→1.7B 模型切换显存释放。

## 模型存放

模型默认存放于技能子目录 `models/`（git 已忽略），可用 `ae.jsonc` 的 `modelRoot` 覆盖。首次使用按需自动下载（ModelScope 优先，HuggingFace 回退；下载中目录以 `.downloading` 暂存，就绪判定要求至少一个权重文件）。注册表（`scripts/qwen_tts_skill/constants.py`）：

| registry key | HF/ModelScope ID |
|---|---|
| custom_voice | Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice |
| custom_voice_1.7b | Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice |
| voice_design | Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign |
| voice_clone | Qwen/Qwen3-TTS-12Hz-0.6B-Base |
| voice_clone_1.7b | Qwen/Qwen3-TTS-12Hz-1.7B-Base |

体积参考（tests/test_tts.py 实测注释）：0.6B-Base 约 2.5GB，1.7B-VoiceDesign 约 3.4GB。

## 产物路径

| 类别 | 路径 |
|---|---|
| 音频产物 | `ae/qwen3-tts/`（默认 `output.wav`；批量按 `-o` 指定） |
| 生成记录 | `ae/qwen3-tts/runs/<时间戳>.json` |
| 临时产物 | `ae/qwen3-tts/tmp/` |
| 日志 | `ae/logs/qwen3-tts/` |

`<skill-slug>` 由技能目录名推导（去掉 `ae-` 前缀），不写死技能名。
