"""设备与精度策略。

策略（强制）: 优先使用 GPU；仅当没有 GPU 或当前 PyTorch 不支持 GPU 时
才允许 CPU。检测到可用 GPU 时禁止使用 CPU，GPU 加载失败也不回退。
"""

from __future__ import annotations


class DevicePolicyError(RuntimeError):
    """违反设备策略（例如检测到 GPU 却要求使用 CPU）。"""


def _best_cuda_index() -> int:
    """选择空闲显存最多的 GPU 序号。"""
    import torch

    best, best_free = 0, -1
    for i in range(torch.cuda.device_count()):
        free, _total = torch.cuda.mem_get_info(i)
        if free > best_free:
            best, best_free = i, free
    return best


def resolve_device(requested: str | None) -> str:
    """按策略解析设备。

    - auto          : 有可用 GPU → cuda:N（空闲显存最大的一块）；没有 → CPU
    - cuda / cuda:N : 显式指定 GPU；当前 PyTorch 不支持 CUDA 时回退 CPU（并警告）
    - cpu           : 仅当没有可用 GPU 时允许；检测到可用 GPU 时直接报错
    """
    import torch

    requested = (requested or "auto").strip().lower()
    cuda_ok = torch.cuda.is_available()

    if requested == "auto":
        if cuda_ok:
            return f"cuda:{_best_cuda_index()}"
        print("[tts] 未检测到可用 GPU，使用 CPU")
        return "cpu"

    if requested.startswith("cuda"):
        if not cuda_ok:
            print("[tts] 警告: 当前 PyTorch 不支持 CUDA（torch.cuda.is_available()=False），"
                  "无法使用 GPU，回退 CPU。请安装 CUDA 版 PyTorch（python scripts/install.py）。")
            return "cpu"
        if ":" in requested:
            try:
                idx = int(requested.split(":", 1)[1])
            except ValueError as error:
                raise DevicePolicyError(f"非法设备: {requested}") from error
            if idx >= torch.cuda.device_count():
                raise DevicePolicyError(
                    f"请求的设备 {requested} 不存在；可用 GPU 数量: {torch.cuda.device_count()}")
            return f"cuda:{idx}"
        return f"cuda:{_best_cuda_index()}"

    if requested == "cpu":
        if cuda_ok:
            raise DevicePolicyError(
                "检测到可用 GPU（torch.cuda.is_available()=True），策略禁止使用 CPU。\n"
                "  请使用 GPU: --device auto（或 --device cuda:N）；\n"
                "  若 GPU 报错请先修复 CUDA 环境（python scripts/install.py --cuda auto）。")
        return "cpu"

    raise DevicePolicyError(f"未知设备: {requested}（可选: auto / cuda:N / cpu）")


def resolve_dtype(dtype: str | None, device: str) -> str:
    """解析精度。auto: GPU→bfloat16（不支持 bf16 的卡→float16）；CPU→float32。"""
    if device == "cpu":
        if dtype in (None, "auto"):
            return "float32"
        if dtype == "float16":
            raise DevicePolicyError("CPU 不支持 float16 推理，请使用 float32 或 bfloat16。")
        return dtype
    if dtype in (None, "auto"):
        import torch
        return "bfloat16" if torch.cuda.is_bf16_supported() else "float16"
    return dtype


def seed_everything(seed: int | None) -> None:
    """固定随机种子以复现结果。"""
    if seed is None:
        return
    import torch

    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
    print(f"[tts] seed={seed}")
