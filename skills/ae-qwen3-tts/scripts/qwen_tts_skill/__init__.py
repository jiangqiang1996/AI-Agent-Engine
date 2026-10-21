"""Qwen3-TTS 技能核心包。

公开 API（与 __all__ 一致）:
    生成: generate_custom_voice / generate_voice_design / generate_voice_clone
    参考音频: ensure_decodable_ref_audio
    输出冲突: OutputConflictError（目标文件已存在且未加 --overwrite）
    模型: get_model / ensure_model / model_path / model_root
    设备与精度策略: resolve_device / resolve_dtype / seed_everything / DevicePolicyError
    配置读取: load_config / find_config_file / resolve_model_root / resolve_output_dir /
              resolve_default_output / resolve_attn_impl /
              resolve_device_setting / resolve_dtype_setting
    输出与产物: resolve_output_path / write_run_record /
               SKILL_DIR / SKILL_NAME / SKILL_SLUG / artifact_dir / temp_dir /
               log_dir / run_record_dir
    常量: MODEL_REGISTRY / MODEL_ROOT / SUPPORTED_SPEAKERS / SUPPORTED_LANGUAGES /
          ATTN_IMPLEMENTATIONS / DEFAULT_SPEAKER

命名约定（同名歧义已消除）:
    resolve_device / resolve_dtype        → devices.py 的设备与精度「策略」入口
    resolve_device_setting / resolve_dtype_setting → config.py 的 ae.jsonc 与环境变量「默认取值」读取
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
    resolve_device_setting,
    resolve_dtype_setting,
    resolve_model_root,
    resolve_output_dir,
)
from .devices import DevicePolicyError, resolve_device, resolve_dtype, seed_everything
from .generation import (
    OutputConflictError,
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
    "OutputConflictError",
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
    "resolve_device_setting",
    "resolve_dtype_setting",
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
