"""环境诊断: GPU / PyTorch / 模型目录状态报告（供 scripts/check_gpu.py 使用）。"""

from __future__ import annotations

import platform
from pathlib import Path

from .config import find_config_file, load_config, resolve_model_root, resolve_output_dir
from .constants import MODEL_REGISTRY
from .model_store import is_model_ready
from .paths import SKILL_SLUG, artifact_dir


def _module_version(name: str) -> str | None:
    from importlib.metadata import version
    try:
        return version(name)
    except Exception:
        return None


def _dir_size(path: Path) -> str:
    total = 0
    for f in path.rglob("*"):
        if f.is_file():
            total += f.stat().st_size
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if total < 1024 or unit == "TB":
            return f"{total:.1f}{unit}"
        total /= 1024
    return f"{total:.1f}TB"


def collect_env_report() -> dict:
    """收集环境信息，返回结构化报告（不加载模型）。"""
    model_root = resolve_model_root()
    config_file = find_config_file()
    report: dict = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "model_root": str(model_root),
        "config_file": str(config_file) if config_file else None,
        "config": load_config(),
        "artifact_dir": str(artifact_dir()),
        "output_dir": str(resolve_output_dir()),
    }

    try:
        import torch
    except ImportError:
        report["torch"] = None
        report["verdict"] = "未安装 PyTorch，请先运行 python scripts/install.py"
        return report

    report["torch"] = torch.__version__
    report["torch_cuda_build"] = torch.version.cuda
    report["cuda_available"] = torch.cuda.is_available()
    report["flash_attn"] = _module_version("flash_attn")
    report["qwen_tts"] = _module_version("qwen_tts")

    if torch.cuda.is_available():
        gpus = []
        for i in range(torch.cuda.device_count()):
            props = torch.cuda.get_device_properties(i)
            free, total = torch.cuda.mem_get_info(i)
            gpus.append({
                "index": i,
                "name": props.name,
                "capability": f"{props.major}.{props.minor}",
                "total_mem_gb": round(total / 1024**3, 1),
                "free_mem_gb": round(free / 1024**3, 1),
                "bf16": torch.cuda.is_bf16_supported(),
            })
        report["gpus"] = gpus
        report["verdict"] = "GPU 可用，tts 将使用 GPU 运行"
    else:
        report["gpus"] = []
        report["verdict"] = (
            "无可用 GPU（torch.cuda.is_available()=False）"
            + ("" if torch.version.cuda is None
               else "；PyTorch 为 CUDA 版但 CUDA 初始化失败")
            + "，将回退 CPU 运行"
        )

    models = []
    for key, info in MODEL_REGISTRY.items():
        p = model_root / info["default_dir"]
        models.append({
            "key": key,
            "path": str(p),
            "ready": is_model_ready(p),
            "size": _dir_size(p) if is_model_ready(p) else "-",
        })
    report["models"] = models
    return report


def print_env_report() -> dict:
    """打印环境报告并返回。"""
    r = collect_env_report()
    print("=" * 62)
    print("Qwen3-TTS 运行环境检查")
    print("=" * 62)
    print(f"Python        : {r['python']}")
    print(f"平台          : {r['platform']}")
    print(f"模型目录      : {r['model_root']}")
    print(f"产物目录      : {r['artifact_dir']}")
    print(f"默认输出目录  : {r['output_dir']}")
    print(f"配置文件      : {r['config_file'] or '未找到 ae.jsonc（用内置默认值）'}")
    if r.get("torch") is None:
        print("PyTorch       : 未安装")
    else:
        print(f"PyTorch       : {r['torch']}  (CUDA 构建: {r['torch_cuda_build']})")
        print(f"flash-attn    : {r['flash_attn'] or '未安装（可选，加速注意力）'}")
        print(f"qwen-tts      : {r['qwen_tts'] or '未安装'}")
        if r["gpus"]:
            for g in r["gpus"]:
                print(f"GPU {g['index']}          : {g['name']} "
                      f"(sm_{g['capability']}, {g['free_mem_gb']}/{g['total_mem_gb']} GB 空闲, "
                      f"bf16={'支持' if g['bf16'] else '不支持'})")
        else:
            print("GPU           : 无")
        print(f"CUDA 可用     : {'是' if r['cuda_available'] else '否'}")
    print("-" * 62)
    for m in r["models"]:
        print(f"模型 [{m['key']:<18}] {'已就绪 ' + m['size'] if m['ready'] else '未下载'}  "
              f"{m['path']}")
    print("-" * 62)
    print(f"结论          : {r['verdict']}")
    print("=" * 62)
    return r
