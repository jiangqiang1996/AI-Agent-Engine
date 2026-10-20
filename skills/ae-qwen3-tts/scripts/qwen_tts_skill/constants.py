"""Qwen3-TTS 技能常量与模型注册表。"""

from __future__ import annotations

from .paths import MODEL_ROOT_DEFAULT, SKILL_DIR

# 模型根目录默认值（技能子目录 models/，已被 git 忽略）。
# 实际生效路径可由 ae.jsonc 的 modelRoot 或环境变量覆盖，见 config.resolve_model_root()。
MODEL_ROOT = MODEL_ROOT_DEFAULT

# 模型 ID 与默认本地目录名
MODEL_REGISTRY: dict[str, dict[str, str]] = {
    "custom_voice": {
        "hf_id": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
        "default_dir": "Qwen3-TTS-12Hz-0.6B-CustomVoice",
    },
    "custom_voice_1.7b": {
        "hf_id": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        "default_dir": "Qwen3-TTS-12Hz-1.7B-CustomVoice",
    },
    "voice_design": {
        "hf_id": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "default_dir": "Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    },
    "voice_clone": {
        "hf_id": "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        "default_dir": "Qwen3-TTS-12Hz-0.6B-Base",
    },
    "voice_clone_1.7b": {
        "hf_id": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "default_dir": "Qwen3-TTS-12Hz-1.7B-Base",
    },
}

SUPPORTED_SPEAKERS = [
    "Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric",
    "Ryan", "Aiden", "Ono_Anna", "Sohee",
]

# 技能默认音色：成都口音男声（技能默认输出川渝口音）
DEFAULT_SPEAKER = "Eric"

SUPPORTED_LANGUAGES = [
    "Chinese", "English", "Japanese", "Korean",
    "German", "French", "Russian", "Portuguese", "Spanish", "Italian",
]

ATTN_IMPLEMENTATIONS = ["auto", "sdpa", "flash_attention_2", "eager", "flex_attention"]

DTYPES = ["auto", "bfloat16", "float16", "float32"]
# 音频扩展名（批量输出路径判定：含 {i} → 模板；音频扩展名 → 前缀；其余 → 目录）
AUDIO_SUFFIXES = {
    ".wav", ".flac", ".ogg", ".oga", ".mp3", ".opus",
    ".aif", ".aiff", ".aifc", ".au", ".w64", ".rf64",
}
