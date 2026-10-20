"""生成记录落盘。

每次成功生成后写一条 JSON 记录到 <cwd>/ae/<skill-slug>/runs/<时间戳>.json，
便于回溯"哪句话、用什么音色、写到哪个文件"。
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from .paths import run_record_dir


def _timestamp() -> str:
    return time.strftime("%Y%m%d-%H%M%S")


def write_run_record(payload: dict, cwd: str | Path | None = None) -> Path | None:
    """写一条生成记录；落盘失败不打断主流程（返回 None）。"""
    try:
        directory = run_record_dir(cwd)
        directory.mkdir(parents=True, exist_ok=True)
        path = directory / f"{_timestamp()}.json"
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )
        return path
    except OSError:
        return None
