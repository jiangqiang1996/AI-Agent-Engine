#!/usr/bin/env python3
"""Qwen3-TTS CLI 入口（跨平台: Windows/Linux/macOS 通用）。

用法:
    python tts.py "你好世界"
    python tts.py -h
"""

import sys
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(_SCRIPTS_DIR))

from qwen_tts_skill.cli import main

if __name__ == "__main__":
    main()
