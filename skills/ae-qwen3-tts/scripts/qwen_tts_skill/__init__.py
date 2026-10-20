"""Qwen3-TTS 技能核心包。

公开 API:
    generate_custom_voice / generate_voice_design / generate_voice_clone
    ensure_decodable_ref_audio, get_model, resolve_device, resolve_dtype, DevicePolicyError
    load_config, resolve_model_root, resolve_output_dir
"""

from .constants import (
    ATTN_IMPLEMENTATIONS,
    DEFAULT_SPEAKER,
    MODEL_REGISTRY,
    MODEL_ROOT,
    SUPPORTED_LANGUAGES,
    SUPPORTED_SPEAKERS,
)
from .config import (
    find_config_file,
    load_config,
    resolve_attn_impl,
    resolve_default_output,
    resolve_model_root,
    resolve_output_dir,
)
from .devices import DevicePolicyError, resolve_device, resolve_dtype, seed_everything
from .generation import (
    ensure_decodable_ref_audio,
    generate_custom_voice,
    generate_voice_clone,
    generate_voice_design,
    resolve_output_path,
)
from .model_store import ensure_model, model_path, model_root
from .paths import (
    SKILL_DIR,
    SKILL_NAME,
    SKILL_SLUG,
    artifact_dir,
    log_dir,
    run_record_dir,
    temp_dir,
)
from .records import write_run_record
from .runtime import get_model

__all__ = [
    "generate_custom_voice",
    "generate_voice_design",
    "generate_voice_clone",
    "ensure_decodable_ref_audio",
    "get_model",
    "resolve_device",
    "resolve_dtype",
    "seed_everything",
    "DevicePolicyError",
    "ensure_model",
    "model_path",
    "model_root",
    "MODEL_REGISTRY",
    "MODEL_ROOT",
    "SUPPORTED_SPEAKERS",
    "SUPPORTED_LANGUAGES",
    "ATTN_IMPLEMENTATIONS",
    "DEFAULT_SPEAKER",
    "load_config",
    "find_config_file",
    "resolve_model_root",
    "resolve_output_dir",
    "resolve_default_output",
    "resolve_attn_impl",
    "resolve_output_path",
    "write_run_record",
    "SKILL_DIR",
    "SKILL_NAME",
    "SKILL_SLUG",
    "artifact_dir",
    "temp_dir",
    "log_dir",
    "run_record_dir",
]
