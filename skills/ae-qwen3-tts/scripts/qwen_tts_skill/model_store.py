"""模型存储: 固定目录、下载（ModelScope 优先，HuggingFace 回退）与就绪检查。

模型根目录默认放在技能子目录 models/，可用 ae.jsonc 的 modelRoot
或环境变量覆盖（见 config.resolve_model_root()）。
"""

from __future__ import annotations

import shutil
from pathlib import Path

from .config import resolve_model_root
from .constants import MODEL_REGISTRY


def model_root() -> Path:
    """模型根目录（默认: <技能目录>/models，可配置覆盖）。"""
    return resolve_model_root()


def model_path(registry_key: str) -> Path:
    return model_root() / MODEL_REGISTRY[registry_key]["default_dir"]

_WEIGHT_SUFFIXES = {".safetensors", ".bin", ".pt", ".pth", ".onnx"}


def is_model_ready(path: Path) -> bool:
    """目录存在且包含至少一个模型权重文件（防止半成品下载目录被误判就绪）。"""
    if not path.is_dir():
        return False
    try:
        return any(
            f.suffix.lower() in _WEIGHT_SUFFIXES
            for f in path.rglob("*") if f.is_file()
        )
    except OSError:
        return False


def _download_model(hf_id: str, local_dir: Path) -> None:
    """下载模型到独立目录，先 ModelScope 后 HuggingFace。"""
    local_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = local_dir.with_name(f".{local_dir.name}.downloading")
    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)

    try:
        from modelscope import snapshot_download as ms_download
        print(f"[tts] ModelScope 下载: {hf_id}")
        downloaded = Path(ms_download(hf_id, local_dir=str(staging)))
        if downloaded != staging and is_model_ready(downloaded):
            shutil.copytree(downloaded, staging, dirs_exist_ok=True)
        if is_model_ready(staging):
            staging.replace(local_dir)
            return
    except ImportError:
        print("[tts] modelscope 未安装，跳过")
    except Exception as e:
        print(f"[tts] ModelScope 失败: {e}")

    if staging.exists():
        shutil.rmtree(staging)
    staging.mkdir(parents=True, exist_ok=True)
    try:
        from huggingface_hub import snapshot_download as hf_download
        print(f"[tts] HuggingFace 下载: {hf_id}")
        hf_download(hf_id, local_dir=str(staging))
        if is_model_ready(staging):
            staging.replace(local_dir)
            return
    except ImportError:
        print("[tts] huggingface_hub 未安装")
    except Exception as e:
        print(f"[tts] HuggingFace 失败: {e}")
    finally:
        if staging.exists() and not is_model_ready(staging):
            shutil.rmtree(staging, ignore_errors=True)

    raise RuntimeError(f"无法下载模型 {hf_id}，请检查网络或手动下载到 {local_dir}")


def ensure_model(registry_key: str) -> str:
    """确保模型就绪，返回本地路径。"""
    info = MODEL_REGISTRY[registry_key]
    path = model_path(registry_key)
    if is_model_ready(path):
        print(f"[tts] 使用本地模型: {path}")
        return str(path)
    _download_model(info["hf_id"], path)
    return str(path)

