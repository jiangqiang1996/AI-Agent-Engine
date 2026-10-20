"""模型加载（进程内单例）。"""

from __future__ import annotations

import gc
import json
import time

from .devices import resolve_device, resolve_dtype
from .model_store import ensure_model

_model = None
_model_key: str | None = None


def get_model(
    registry_key: str,
    device: str = "auto",
    dtype: str = "auto",
    attn_implementation: str = "auto",
    model_kwargs: dict | None = None,
):
    """获取或初始化模型（进程内单例）。

    device/dtype 支持 auto 自动解析。GPU 可用但加载失败时直接抛错，
    不回退 CPU（策略禁止）。

    Args:
        registry_key: MODEL_REGISTRY 键。
        device: auto / cuda:N / cpu。
        dtype: auto / bfloat16 / float16 / float32。
        attn_implementation: auto / sdpa / flash_attention_2 / eager / flex_attention。
        model_kwargs: 额外透传给 from_pretrained 的参数。
    """
    global _model, _model_key

    device = resolve_device(device)
    dtype = resolve_dtype(dtype, device)
    model_kwargs = dict(model_kwargs or {})
    cache_key = (
        f"{registry_key}:{device}:{dtype}:{attn_implementation}:"
        f"{json.dumps(model_kwargs, sort_keys=True)}"
    )
    if _model is not None and _model_key == cache_key:
        return _model

    import torch
    from qwen_tts import Qwen3TTSModel

    if _model is not None:
        print("[tts] 释放已加载模型，切换模型配置 ...")
        del _model
        _model = None
        _model_key = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    model_path = ensure_model(registry_key)

    dtype_map = {
        "bfloat16": torch.bfloat16,
        "float16": torch.float16,
        "float32": torch.float32,
    }
    load_kwargs: dict = dict(device_map=device, dtype=dtype_map[dtype], **model_kwargs)
    if attn_implementation and attn_implementation != "auto":
        load_kwargs["attn_implementation"] = attn_implementation

    print(f"[tts] 加载模型到 {device} (dtype={dtype}"
          + (f", attn={attn_implementation}" if attn_implementation != "auto" else "")
          + ") ...")
    t0 = time.time()
    try:
        model = Qwen3TTSModel.from_pretrained(model_path, **load_kwargs)
    except Exception as error:
        if device.startswith("cuda"):
            raise RuntimeError(
                f"GPU ({device}) 加载失败: {error}\n"
                "  策略禁止回退 CPU。请修复 CUDA 环境（python scripts/install.py --cuda auto），\n"
                "  或确认已安装与本机 GPU 匹配的 CUDA 版 PyTorch。") from error
        raise
    _model = model
    _model_key = cache_key
    print(f"[tts] 模型加载完成 ({time.time() - t0:.1f}s, device={device}, dtype={dtype})")
    return _model
