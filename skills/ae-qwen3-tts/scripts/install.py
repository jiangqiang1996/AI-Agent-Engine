#!/usr/bin/env python3
"""Qwen3-TTS 依赖安装（跨平台: Windows/Linux/macOS 通用）。

用法:
    python install.py                  # auto: 检测到 NVIDIA 显卡 → 装 CUDA 版 PyTorch；否则 CPU 版
    python install.py --cuda cu128     # 指定 CUDA wheel (cu126/cu128/cu129)
    python install.py --cuda cpu       # 明确安装 CPU 版
    python install.py --dry-run        # 仅打印将执行的命令

流程: 先安装 requirements.txt 里的其余依赖（qwen-tts、soundfile、modelscope、
huggingface_hub），再按所选变体安装/对齐 PyTorch，最后校验
torch.cuda.is_available() 并给出结论。

PyTorch 放在最后装，且在「已安装构建与目标变体不一致」时加 --force-reinstall：
否则 pip 会认为已满足 "torch" 而跳过安装，CPU 版永远换不成 CUDA 版；
反过来若先装 torch 再装 requirements.txt，requirements.txt 里的 torch>=2.0.0
又会把 CUDA 版覆盖回 PyPI 版（Windows 上 PyPI 版即 CPU 版）。
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import tempfile
from pathlib import Path

CUDA_INDEX = "https://download.pytorch.org/whl/{tag}"

# wheel tag → PyTorch 索引目录
CUDA_TAGS = ["cu126", "cu128", "cu129"]

REQUIREMENTS_FILE = Path(__file__).resolve().parent / "requirements.txt"


def detect_cuda_tag() -> str:
    """auto: 有 NVIDIA 显卡（nvidia-smi 存在）→ 默认最新 cu128；否则 cpu。"""
    if _has_nvidia_gpu():
        return "cu128"
    return "cpu"


def _has_nvidia_gpu() -> bool:
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=15,
        )
        return result.returncode == 0 and bool(result.stdout.strip())
    except (OSError, subprocess.TimeoutExpired):
        return False


def installed_torch_tag() -> str | None:
    """已安装 PyTorch 的构建标记：cuXXX / cpu / cuda（CUDA 版但无本地版本标记）；未安装返回 None。"""
    try:
        import torch
    except ImportError:
        return None
    version = str(getattr(torch, "__version__", ""))
    if "+" in version:
        return version.split("+", 1)[1]
    torch_version = getattr(torch, "version", None)
    if torch_version is None or torch_version.cuda is None:
        return "cpu"
    return "cuda"


def requirements_without_torch() -> Path:
    """生成一份去掉 torch 的 requirements（PyTorch 由本脚本单独安装）。"""
    lines = []
    for line in REQUIREMENTS_FILE.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.lower().startswith("torch"):
            continue
        lines.append(stripped)
    target = Path(tempfile.gettempdir()) / "qwen_tts_requirements_no_torch.txt"
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return target


def build_commands(tag: str) -> list[list[str]]:
    """组装 pip 命令：先装其余依赖，最后按变体装 PyTorch。"""
    pip = [sys.executable, "-m", "pip"]
    cmds: list[list[str]] = [
        pip + ["install", "--upgrade", "-r", str(requirements_without_torch())],
    ]
    torch_cmd = pip + ["install", "--upgrade", "torch"]
    if tag == "cpu":
        # 默认 PyPI 源即 CPU 版 PyTorch
        pass
    else:
        torch_cmd += ["--index-url", CUDA_INDEX.format(tag=tag)]
    # 已安装构建与目标不一致时强制重装（否则 pip 认为已满足而跳过）
    current = installed_torch_tag()
    if current is not None and not _tag_matches(current, tag):
        torch_cmd.append("--force-reinstall")
    cmds.append(torch_cmd)
    return cmds


def _tag_matches(current: str, target: str) -> bool:
    """已安装构建是否已经满足目标变体。"""
    if target == "cpu":
        return current in ("cpu",)
    return current.lower() == target.lower()


def verify(tag: str) -> int:
    print("\n[tts] 校验安装结果 ...")
    try:
        import torch
    except ImportError:
        print("[tts] PyTorch 导入失败，安装可能未完成")
        return 1
    print(f"[tts] torch={torch.__version__}, CUDA 构建={torch.version.cuda}")
    ok = torch.cuda.is_available()
    print(f"[tts] torch.cuda.is_available() = {ok}")
    if ok:
        for i in range(torch.cuda.device_count()):
            print(f"[tts]   GPU {i}: {torch.cuda.get_device_name(i)}")
    if tag != "cpu" and not ok:
        print("[tts] 警告: 安装了 CUDA 版 PyTorch 但 CUDA 不可用，请检查显卡驱动")
        return 1
    if tag == "cpu" and ok:
        print("[tts] 提示: 已存在可用的 CUDA 环境，建议用 --cuda cu128 重新安装以启用 GPU")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Qwen3-TTS 依赖安装")
    parser.add_argument("--cuda", default="auto",
                        choices=["auto"] + CUDA_TAGS + ["cpu"],
                        help="PyTorch 变体 (默认: auto=检测 NVIDIA 显卡)")
    parser.add_argument("--dry-run", action="store_true",
                        help="仅打印将执行的命令，不实际安装")
    args = parser.parse_args()

    tag = detect_cuda_tag() if args.cuda == "auto" else args.cuda
    print(f"[tts] PyTorch 变体: {tag}")
    if tag != "cpu" and not _has_nvidia_gpu():
        print("[tts] 警告: 未检测到 NVIDIA 显卡，安装 CUDA 版 PyTorch 也无法启用 GPU")
    current = installed_torch_tag()
    print(f"[tts] 当前 PyTorch 构建: {current or '未安装'}")

    for cmd in build_commands(tag):
        print("[tts] 运行:", " ".join(cmd))
        if args.dry_run:
            continue
        result = subprocess.run(cmd)
        if result.returncode != 0:
            print(f"[tts] 命令失败（退出码 {result.returncode}）: {' '.join(cmd)}")
            return result.returncode

    if args.dry_run:
        print("[tts] dry-run 完成，未实际安装")
        return 0
    return verify(tag)


if __name__ == "__main__":
    sys.exit(main())
