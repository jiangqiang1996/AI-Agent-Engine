"""技能身份与产物路径。

产物路径约定（与仓库规范一致）:

  - 持久产物: <cwd>/ae/<skill-slug>/
  - 临时产物: <cwd>/ae/<skill-slug>/tmp/
  - 日志:     <cwd>/ae/logs/<skill-slug>/

<skill-slug> = 技能目录名去掉 "ae-" 前缀。技能目录名从脚本自身路径推导，
不写死技能名：技能目录被改名或整体拷走后，产物路径自动跟随。
"""

from __future__ import annotations

import os
from pathlib import Path

# scripts/qwen_tts_skill/paths.py → 技能根目录
SKILL_DIR = Path(__file__).resolve().parents[2]

# 技能目录名（形如 ae-xxx）
SKILL_NAME = SKILL_DIR.name

# 产物子目录名（去掉 ae- 前缀）
SKILL_SLUG = SKILL_NAME[3:] if SKILL_NAME.startswith("ae-") else SKILL_NAME

# 配置文件里的顶层 key（与技能名一致）
CONFIG_KEY = SKILL_NAME

# 环境变量前缀（由技能名推导，不写死）
ENV_PREFIX = "AE_" + SKILL_SLUG.upper().replace("-", "_")

AE_ROOT_DIR = "ae"
LOGS_DIR = "logs"

# 模型根目录默认值：放在技能子目录 models/（跨项目复用，只需下载一次）
MODEL_ROOT_DEFAULT = SKILL_DIR / "models"


def _cwd(cwd: str | Path | None = None) -> Path:
    return Path(cwd).resolve() if cwd else Path(os.getcwd()).resolve()


def ae_root(cwd: str | Path | None = None) -> Path:
    """产物根目录：<cwd>/ae/。"""
    return _cwd(cwd) / AE_ROOT_DIR


def artifact_dir(cwd: str | Path | None = None) -> Path:
    """技能的持久产物目录：<cwd>/ae/<skill-slug>/。"""
    return ae_root(cwd) / SKILL_SLUG


def temp_dir(cwd: str | Path | None = None) -> Path:
    """技能的临时产物目录：<cwd>/ae/<skill-slug>/tmp/。"""
    return artifact_dir(cwd) / "tmp"


def log_dir(cwd: str | Path | None = None) -> Path:
    """技能的日志目录：<cwd>/ae/logs/<skill-slug>/。"""
    return ae_root(cwd) / LOGS_DIR / SKILL_SLUG


def run_record_dir(cwd: str | Path | None = None) -> Path:
    """生成记录目录：<cwd>/ae/<skill-slug>/runs/。"""
    return artifact_dir(cwd) / "runs"


def default_output_path(cwd: str | Path | None = None) -> Path:
    """默认输出文件：<cwd>/ae/<skill-slug>/output.wav。"""
    return artifact_dir(cwd) / "output.wav"
