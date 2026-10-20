#!/usr/bin/env python3
"""Qwen3-TTS 环境检查入口（跨平台: Windows/Linux/macOS 通用）。

用法:
    python check_gpu.py
"""

import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPTS_DIR))

from qwen_tts_skill.diagnostics import print_env_report

if __name__ == "__main__":
    print_env_report()
