"""ae.jsonc 配置读取。

查找顺序（先命中先用）:

  1. 环境变量 AE_CONFIG 指向的文件
  2. <cwd>/ae.jsonc
  3. 从 <cwd> 逐级向上查找 ae.jsonc（最近者胜）
  4. ~/.ae.jsonc

本技能只读自己的顶层 key（与技能目录同名），其余 key 一律忽略。
所有配置项都是可选的，未配置时用内置默认值。

优先级：命令行参数 > 环境变量 > ae.jsonc > 内置默认值。
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from .paths import (
    CONFIG_KEY,
    ENV_PREFIX,
    MODEL_ROOT_DEFAULT,
    artifact_dir,
    default_output_path,
)

CONFIG_FILE_NAME = "ae.jsonc"

# 配置文件里本技能支持的字段
CONFIG_FIELDS = ("modelRoot", "outputDir", "device", "dtype", "attnImpl")


def _strip_jsonc(text: str) -> str:
    """去掉 JSONC 的注释与尾逗号（字符串内的内容原样保留）。"""
    out: list[str] = []
    i = 0
    n = len(text)
    in_string = False
    escaped = False
    while i < n:
        ch = text[i]
        if in_string:
            out.append(ch)
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == '"':
                in_string = False
            i += 1
            continue
        if ch == '"':
            in_string = True
            out.append(ch)
            i += 1
            continue
        if ch == "/" and i + 1 < n:
            nxt = text[i + 1]
            if nxt == "/":  # 行注释
                end = text.find("\n", i)
                if end == -1:
                    break
                i = end
                continue
            if nxt == "*":  # 块注释
                end = text.find("*/", i + 2)
                if end == -1:
                    break
                i = end + 2
                continue
        if ch == ",":  # 尾逗号：后面紧跟 } 或 ] 时丢弃
            j = i + 1
            while j < n and text[j] in " \t\r\n":
                j += 1
            if j < n and text[j] in "}]":
                i += 1
                continue
        out.append(ch)
        i += 1
    return "".join(out)


def find_config_file(cwd: str | Path | None = None) -> Path | None:
    """按查找顺序定位 ae.jsonc；找不到返回 None。"""
    env_path = os.environ.get("AE_CONFIG")
    if env_path:
        candidate = Path(env_path).expanduser()
        return candidate if candidate.is_file() else None
    current = Path(cwd).resolve() if cwd else Path(os.getcwd()).resolve()
    for directory in [current, *current.parents]:
        candidate = directory / CONFIG_FILE_NAME
        if candidate.is_file():
            return candidate
    home = Path.home() / CONFIG_FILE_NAME
    return home if home.is_file() else None


def load_config(cwd: str | Path | None = None) -> dict:
    """读取本技能自己的配置分片；找不到或解析失败时返回空字典。"""
    path = find_config_file(cwd)
    if path is None:
        return {}
    try:
        text = path.read_text(encoding="utf-8-sig")
    except OSError as error:
        print(f"[tts] 读取配置文件失败（{path}）: {error}", file=sys.stderr)
        return {}
    try:
        data = json.loads(_strip_jsonc(text))
    except json.JSONDecodeError as error:
        print(f"[tts] 配置文件解析失败（{path}）: {error}", file=sys.stderr)
        return {}
    if not isinstance(data, dict):
        return {}
    section = data.get(CONFIG_KEY)
    if not isinstance(section, dict):
        return {}
    return {k: v for k, v in section.items() if k in CONFIG_FIELDS}


def _setting(name: str, env_suffix: str, cwd: str | Path | None = None) -> str | None:
    """环境变量 > ae.jsonc > None。"""
    env_value = os.environ.get(ENV_PREFIX + env_suffix)
    if env_value:
        return env_value
    value = load_config(cwd).get(name)
    if value is None:
        return None
    return str(value)


def resolve_model_root(cwd: str | Path | None = None) -> Path:
    """模型根目录：环境变量 > ae.jsonc > <技能目录>/models/。"""
    raw = _setting("modelRoot", "MODEL_ROOT", cwd)
    if raw:
        return Path(raw).expanduser()
    return MODEL_ROOT_DEFAULT


def resolve_output_dir(cwd: str | Path | None = None) -> Path:
    """默认输出目录：环境变量 > ae.jsonc > <cwd>/ae/<skill-slug>/。"""
    raw = _setting("outputDir", "OUTPUT_DIR", cwd)
    if raw:
        return Path(raw).expanduser()
    return artifact_dir(cwd)


def resolve_default_output(cwd: str | Path | None = None) -> Path:
    """默认输出文件。"""
    return resolve_output_dir(cwd) / default_output_path(cwd).name


def resolve_device(cwd: str | Path | None = None) -> str:
    """默认设备（auto / cuda:N / cpu）。"""
    return _setting("device", "DEVICE", cwd) or "auto"


def resolve_dtype(cwd: str | Path | None = None) -> str:
    """默认精度（auto / bfloat16 / float16 / float32）。"""
    return _setting("dtype", "DTYPE", cwd) or "auto"


def resolve_attn_impl(cwd: str | Path | None = None) -> str:
    """默认注意力实现（auto / sdpa / flash_attention_2 / eager / flex_attention）。"""
    return _setting("attnImpl", "ATTN_IMPL", cwd) or "auto"
