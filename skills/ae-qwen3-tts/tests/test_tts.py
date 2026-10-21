#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Qwen3-TTS 技能综合测试（一条命令覆盖全部固定检测逻辑）。

用法:
    python tests/test_tts.py             # 全量: 静态 + CLI + 策略/单元 + GPU 端到端
    python tests/test_tts.py --fast      # 仅静态 + CLI + 策略/单元（不加载模型，秒级）
    python tests/test_tts.py --gpu-only  # 仅 GPU 端到端（三模式真实生成）
    python tests/test_tts.py --keep      # 保留测试产物 ae/<slug>/tmp/selftest/（默认清理）

GPU 部分会按需自动下载缺失模型（ModelScope 优先）到模型目录：
    voice_clone → Qwen3-TTS-12Hz-0.6B-Base (~2.5GB)
    voice_design → Qwen3-TTS-12Hz-1.7B-VoiceDesign (~3.4GB)

结果三态: PASS / FAIL / SKIP（无 GPU 或前置依赖缺失）。
退出码: 0 = 全部通过；1 = 存在 FAIL。
"""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import io
import json
import os
import shutil
import subprocess
import sys
import time
import traceback
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SKILL_DIR / "scripts"))

from qwen_tts_skill.paths import SKILL_SLUG, temp_dir  # noqa: E402

# 测试产物统一落在 <cwd>/ae/<skill-slug>/tmp/selftest/（临时产物目录）
WORK_ROOT = Path(temp_dir())
_SELFTEST_OUT = WORK_ROOT / "selftest"

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

RESULTS: list[dict] = []  # {name, status: PASS|FAIL|SKIP, detail}


def record(name: str, status: str, detail: str = "") -> None:
    RESULTS.append({"name": name, "status": status, "detail": detail})
    tag = {"PASS": "[PASS]", "FAIL": "[FAIL]", "SKIP": "[SKIP]"}[status]
    print(f"{tag} {name}" + (f" — {detail}" if detail else ""), flush=True)


def case(name: str, depends_gpu: bool = False):
    """测试装饰器：异常捕获 → FAIL；无 GPU → SKIP。"""
    def deco(fn):
        def run():
            gpu_ok = _gpu_available()
            if depends_gpu and not gpu_ok:
                record(name, "SKIP", "无可用 GPU")
                return
            t0 = time.time()
            try:
                detail = fn()
                record(name, "PASS",
                       (f"{detail} " if detail else "") + f"({time.time() - t0:.1f}s)")
            except SkipTest as e:
                record(name, "SKIP", str(e))
            except Exception as e:
                traceback.print_exc()
                record(name, "FAIL", f"{type(e).__name__}: {e}")
        run.__name__ = fn.__name__
        return run
    return deco


class SkipTest(Exception):
    """前置条件不满足，跳过。"""


_GPU: bool | None = None


def _gpu_available() -> bool:
    global _GPU
    if _GPU is None:
        try:
            import torch
            _GPU = torch.cuda.is_available()
        except ImportError:
            _GPU = False
    return _GPU


def _vram_info() -> str:
    if not _gpu_available():
        return "cpu"
    import torch
    alloc = torch.cuda.memory_allocated() / 1024**3
    reserved = torch.cuda.memory_reserved() / 1024**3
    return f"VRAM alloc={alloc:.2f}GB reserved={reserved:.2f}GB"


def _run_cli(*args: str) -> subprocess.CompletedProcess:
    env = dict(os.environ, PYTHONIOENCODING="utf-8")
    return subprocess.run(
        [sys.executable, str(SKILL_DIR / "scripts" / "tts.py"), *args],
        capture_output=True, text=True, encoding="utf-8",
        errors="replace", env=env, cwd=str(Path.cwd()), timeout=600,
    )


def _md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


@contextlib.contextmanager
def isolated_env(**overrides: str | None):
    """隔离宿主环境：临时清空/覆盖环境变量，退出时原样恢复。

    值为 None 表示删除该变量。用于让用例不受机器上的
    AE_CONFIG / AE_QWEN3_TTS_* 等环境变量影响（保持可复现）。
    """
    saved = {k: os.environ.get(k) for k in overrides}
    try:
        for k, v in overrides.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
        yield
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v


@contextlib.contextmanager
def no_config_file():
    """让配置文件查找恒返回 None（屏蔽 ae.jsonc / ~/.ae.jsonc 干扰）。"""
    from qwen_tts_skill import config as config_mod

    saved = config_mod.find_config_file
    try:
        config_mod.find_config_file = lambda cwd=None: None
        yield
    finally:
        config_mod.find_config_file = saved


@contextlib.contextmanager
def config_file_only(root: Path):
    """配置文件查找只认 <root>/ae.jsonc（屏蔽 AE_CONFIG 与 ~/.ae.jsonc 干扰）。"""
    from qwen_tts_skill import config as config_mod

    saved = config_mod.find_config_file
    try:
        config_mod.find_config_file = lambda cwd=None: (
            Path(root) / "ae.jsonc" if (Path(root) / "ae.jsonc").is_file() else None
        )
        yield
    finally:
        config_mod.find_config_file = saved


def _wav_ok(path: Path, min_seconds: float = 0.4) -> str:
    import soundfile as sf
    data, sr = sf.read(str(path))
    dur = len(data) / sr
    assert sr > 0 and len(data) > 0, f"空音频: {path}"
    assert dur >= min_seconds, f"音频过短 {dur:.2f}s: {path}"
    return f"sr={sr}, {dur:.2f}s"


# ============================================================================
# Part A: 静态检查
# ============================================================================

@case("A1 全部源文件可编译")
def a1():
    import py_compile
    files = sorted((SKILL_DIR / "scripts" / "qwen_tts_skill").glob("*.py")) \
        + sorted((SKILL_DIR / "scripts").glob("*.py")) \
        + sorted((SKILL_DIR / "tests").glob("*.py"))
    assert files, "未找到源文件"
    for f in files:
        py_compile.compile(str(f), doraise=True)
    return f"{len(files)} 个文件"


@case("A2 包导入与公开 API")
def a2():
    import qwen_tts_skill as pkg
    required = [
        "generate_custom_voice", "generate_voice_design", "generate_voice_clone",
        "ensure_decodable_ref_audio",
        "get_model", "resolve_device", "resolve_dtype", "seed_everything",
        "DevicePolicyError", "ensure_model", "model_path", "model_root",
        "MODEL_REGISTRY", "SUPPORTED_SPEAKERS", "SUPPORTED_LANGUAGES",
        "DEFAULT_SPEAKER",
        "OutputConflictError", "resolve_device_setting", "resolve_dtype_setting",
    ]
    missing = [n for n in required if not hasattr(pkg, n)]
    assert not missing, f"缺少导出: {missing}"
    gone = [n for n in ("ensure_tokenizer", "tokenizer_path") if hasattr(pkg, n)]
    assert not gone, f"已废弃导出仍存在: {gone}"
    assert len(pkg.MODEL_REGISTRY) == 5
    assert set(pkg.SUPPORTED_SPEAKERS) == {
        "Vivian", "Serena", "Uncle_Fu", "Dylan", "Eric",
        "Ryan", "Aiden", "Ono_Anna", "Sohee"}
    return f"{len(required)} 个导出校验通过"


@case("A3 模型注册表与目录布局")
def a3():
    from qwen_tts_skill.constants import MODEL_ROOT
    from qwen_tts_skill.model_store import model_root
    assert MODEL_ROOT == SKILL_DIR / "models", f"默认模型根目录错误: {MODEL_ROOT}"
    # 隔离宿主环境：AE_QWEN3_TTS_MODEL_ROOT / ae.jsonc 的 modelRoot 都不得影响默认模型根
    with isolated_env(AE_QWEN3_TTS_MODEL_ROOT=None), no_config_file():
        assert model_root() == MODEL_ROOT, f"默认模型根目录未生效: {model_root()}"
    from qwen_tts_skill.constants import MODEL_REGISTRY
    for key, info in MODEL_REGISTRY.items():
        assert info["hf_id"].startswith("Qwen/Qwen3-TTS-12Hz"), key
        assert info["default_dir"], key
    return f"{len(MODEL_REGISTRY)} 个模型条目"


@case("A4 产物路径归属与配置读取")
def a4():
    import tempfile
    from qwen_tts_skill.config import _strip_jsonc, load_config, resolve_output_dir
    from qwen_tts_skill.paths import CONFIG_KEY, SKILL_SLUG, artifact_dir, log_dir

    assert CONFIG_KEY == SKILL_DIR.name, CONFIG_KEY
    assert SKILL_SLUG == "qwen3-tts", SKILL_SLUG
    assert artifact_dir() == Path.cwd() / "ae" / SKILL_SLUG, artifact_dir()
    assert log_dir() == Path.cwd() / "ae" / "logs" / SKILL_SLUG, log_dir()

    # JSONC：注释与尾逗号都能剥掉
    stripped = _strip_jsonc('{ /* 注释 */ "a": 1, // 行注释\n "b": [1, 2,], }')
    assert json.loads(stripped) == {"a": 1, "b": [1, 2]}, stripped
    # 字符串里的 // 与 , 不受影响
    kept = _strip_jsonc('{"url": "http://x/y", "s": "a,}"}')
    assert json.loads(kept) == {"url": "http://x/y", "s": "a,}"}, kept

    # 只读自己的顶层 key；无配置时用内置默认值
    # 隔离宿主环境：AE_CONFIG 与 AE_QWEN3_TTS_OUTPUT_DIR 不得影响结果
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        with isolated_env(AE_CONFIG=None, AE_QWEN3_TTS_OUTPUT_DIR=None), config_file_only(root):
            assert load_config(root) == {}, load_config(root)
            assert resolve_output_dir(root) == artifact_dir(root), resolve_output_dir(root)
            (root / "ae.jsonc").write_text(
                '{"ae-qwen3-tts": {"device": "cuda:0"}, "ae-other": {"x": 1}}',
                encoding="utf-8")
            cfg = load_config(root)
            assert cfg == {"device": "cuda:0"}, cfg
    return f"slug={SKILL_SLUG}"


# ============================================================================
# Part B: CLI 路径与退出码（subprocess，不加载模型）
# ============================================================================

@case("B1 CLI --list-speakers")
def b1():
    r = _run_cli("--list-speakers")
    assert r.returncode == 0, f"rc={r.returncode}, stderr={r.stderr}"
    for s in ("Vivian", "Ono_Anna", "Sohee"):
        assert s in r.stdout, f"缺少音色 {s}"
    return ""


@case("B2 CLI --list-languages")
def b2():
    r = _run_cli("--list-languages")
    assert r.returncode == 0, f"rc={r.returncode}, stderr={r.stderr}"
    for lang in ("Chinese", "Japanese", "Italian"):
        assert lang in r.stdout, f"缺少语言 {lang}"
    return ""


@case("B3 CLI 无文本输入 → rc=2")
def b3():
    r = _run_cli()
    assert r.returncode == 2, f"rc={r.returncode}"
    assert "文字内容" in r.stderr, r.stderr
    return ""


@case("B4 voice_clone 缺 --ref-audio → rc=2")
def b4():
    r = _run_cli("你好", "-m", "voice_clone")
    assert r.returncode == 2, f"rc={r.returncode}"
    assert "--ref-audio" in r.stderr, r.stderr
    return ""


@case("B5 voice_clone 缺 --ref-text/--xvec-only → rc=2")
def b5():
    r = _run_cli("你好", "-m", "voice_clone", "--ref-audio", "ref.wav")
    assert r.returncode == 2, f"rc={r.returncode}"
    assert "--ref-text" in r.stderr, r.stderr
    return ""


@case("B6 voice_design 缺 -i → rc=2")
def b6():
    r = _run_cli("你好", "-m", "voice_design")
    assert r.returncode == 2, f"rc={r.returncode}"
    assert "instruct" in r.stderr, r.stderr
    return ""


@case("B7 有 GPU 时 --device cpu → rc=2")
def b7():
    if not _gpu_available():
        raise SkipTest("无 GPU，策略允许 CPU")
    r = _run_cli("你好", "--device", "cpu")
    assert r.returncode == 2, f"rc={r.returncode}, stderr={r.stderr}"
    assert "设备策略错误" in r.stderr, r.stderr
    return ""


@case("B8 --device cuda:99 越界 → rc=2")
def b8():
    if not _gpu_available():
        raise SkipTest("无 GPU")
    r = _run_cli("你好", "--device", "cuda:99")
    assert r.returncode == 2, f"rc={r.returncode}, stderr={r.stderr}"
    return ""


@case("B9 --device 非法值 → rc=2")
def b9():
    r = _run_cli("你好", "--device", "tpu")
    assert r.returncode == 2, f"rc={r.returncode}, stderr={r.stderr}"
    assert "未知设备" in r.stderr, r.stderr
    return ""


@case("B10 --model-kwargs 非法 JSON → rc=2")
def b10():
    r = _run_cli("你好", "--model-kwargs", "{bad json")
    assert r.returncode == 2, f"rc={r.returncode}"
    assert "JSON" in r.stderr, r.stderr
    return ""


@case("B11 --model-kwargs 含禁用键 → rc=2")
def b11():
    r = _run_cli("你好", "--model-kwargs", '{"device_map": "cpu"}')
    assert r.returncode == 2, f"rc={r.returncode}"
    assert "不得覆盖" in r.stderr, r.stderr
    return ""


@case("B12 --non-streaming 非法值 → rc=2")
def b12():
    r = _run_cli("你好", "--non-streaming", "maybe")
    assert r.returncode == 2, f"rc={r.returncode}"
    return ""


@case("B13 -f 空文件 → rc=1")
def b13(tmp=None):
    out = _SELFTEST_OUT
    out.mkdir(parents=True, exist_ok=True)
    empty = out / "empty.txt"
    empty.write_text("\n \n", encoding="utf-8")
    r = _run_cli("-f", str(empty))
    assert r.returncode == 1, f"rc={r.returncode}, stderr={r.stderr}"
    assert "文件为空" in r.stderr, r.stderr
    return ""


# ============================================================================
# Part C: 设备策略与生成参数逻辑（进程内，不加载模型）
# ============================================================================

@case("C1 resolve_device 策略")
def c1():
    from qwen_tts_skill.devices import DevicePolicyError, resolve_device
    if _gpu_available():
        dev = resolve_device("auto")
        assert dev.startswith("cuda:"), dev
        assert resolve_device("CUDA:0") == "cuda:0", "大小写归一失败"
        assert resolve_device("cuda").startswith("cuda:")
        try:
            resolve_device("cpu")
            raise AssertionError("有 GPU 时 cpu 应被拒绝")
        except DevicePolicyError:
            pass
        try:
            resolve_device("cuda:99")
            raise AssertionError("越界索引应被拒绝")
        except DevicePolicyError:
            pass
        return f"auto→{dev}"
    assert resolve_device("auto") == "cpu"
    assert resolve_device("cpu") == "cpu"
    return "无 GPU 分支"


@case("C2 resolve_dtype 策略")
def c2():
    from qwen_tts_skill.devices import DevicePolicyError, resolve_dtype
    assert resolve_dtype(None, "cpu") == "float32"
    assert resolve_dtype("auto", "cpu") == "float32"
    assert resolve_dtype("float32", "cpu") == "float32"
    try:
        resolve_dtype("float16", "cpu")
        raise AssertionError("CPU float16 应被拒绝")
    except DevicePolicyError:
        pass
    if _gpu_available():
        import torch
        want = "bfloat16" if torch.cuda.is_bf16_supported() else "float16"
        assert resolve_dtype("auto", "cuda:0") == want
    assert resolve_dtype("bfloat16", "cuda:0") == "bfloat16"
    return ""


@case("C3 build_generation_kwargs 组装")
def c3():
    from qwen_tts_skill.generation import build_generation_kwargs
    g = build_generation_kwargs()
    assert g == {}, f"全 None 应为空: {g}"
    g = build_generation_kwargs(temperature=0.5, max_new_tokens=100)
    assert g == {"temperature": 0.5, "max_new_tokens": 100}, g
    g = build_generation_kwargs(temperature=0.5, extra={"temperature": 0.9, "num_beams": 2})
    assert g["temperature"] == 0.9 and g["num_beams"] == 2, "extra 应覆盖同名项"
    g = build_generation_kwargs(do_sample=False)
    assert g == {"do_sample": False}, "False 也必须透传"
    return ""


@case("C4 resolve_non_streaming 解析")
def c4():
    from qwen_tts_skill.generation import resolve_non_streaming
    assert resolve_non_streaming(None) is None
    assert resolve_non_streaming("auto") is None
    assert resolve_non_streaming("on") is True
    assert resolve_non_streaming("off") is False
    try:
        resolve_non_streaming("bad")
        raise AssertionError("非法值应抛 ValueError")
    except ValueError:
        pass
    return ""


@case("C5 _pad 与 _save_wavs（输出路径语义）")
def c5():
    import numpy as np
    from qwen_tts_skill.generation import _pad, _save_wavs
    assert _pad("x", 3) == ["x"] * 3
    assert _pad(["a", "b"], 2) == ["a", "b"]
    out = _SELFTEST_OUT / "unit"
    shutil.rmtree(out, ignore_errors=True)
    wav = np.sin(np.linspace(0, 440 * 6.28, 8000)).astype("float32") * 0.3
    paths = _save_wavs([wav], 8000, out / "single.wav", is_batch=False)
    assert paths[0].exists() and paths[0].stat().st_size > 1000
    paths = _save_wavs([wav], 8000, out / "nosuffix", is_batch=False)
    assert paths[0].name == "nosuffix.wav" and paths[0].exists()
    paths = _save_wavs([wav], 8000, out / "sub" / "deep" / "x.flac", is_batch=False)
    assert paths[0].suffix == ".flac" and paths[0].exists()
    paths = _save_wavs([wav, wav * 0.5], 8000, out / "batch", is_batch=True)
    assert [p.name for p in paths] == ["000.wav", "001.wav"], paths
    assert all(p.exists() for p in paths)
    paths = _save_wavs([wav, wav * 0.5], 8000,
                       out / "tpl" / "chapter-{i}.flac", is_batch=True)
    assert [p.name for p in paths] == ["chapter-000.flac", "chapter-001.flac"], paths
    assert all(p.exists() for p in paths)
    paths = _save_wavs([wav, wav * 0.5], 8000, out / "prefix" / "speech.wav", is_batch=True)
    assert [p.name for p in paths] == ["speech-000.wav", "speech-001.wav"], paths
    assert all(p.exists() for p in paths)
    return ""


@case("C6 is_model_ready 权重文件检查")
def c6():
    from qwen_tts_skill.model_store import is_model_ready
    out = _SELFTEST_OUT / "fake_model"
    shutil.rmtree(out, ignore_errors=True)
    assert not is_model_ready(out), "不存在应 False"
    out.mkdir(parents=True)
    (out / "config.json").write_text("{}", encoding="utf-8")
    assert not is_model_ready(out), "仅配置无权重应 False（半成品防护）"
    (out / "model.safetensors").write_bytes(b"\0" * 16)
    assert is_model_ready(out), "有权重应 True"
    shutil.rmtree(out, ignore_errors=True)
    return ""


@case("C7 环境诊断报告")
def c7():
    from qwen_tts_skill.diagnostics import collect_env_report
    r = collect_env_report()
    assert "torch" in r and "verdict" in r and "models" in r
    assert len(r["models"]) == 5
    assert "tokenizer_ready" not in r, "已废弃字段仍存在"
    return r.get("verdict", "")


@case("C8 默认音色为成都口音 Eric")
def c8():
    import inspect
    from qwen_tts_skill.cli import _build_parser
    from qwen_tts_skill.constants import DEFAULT_SPEAKER
    from qwen_tts_skill.generation import generate_custom_voice
    assert DEFAULT_SPEAKER == "Eric"
    sig = inspect.signature(generate_custom_voice)
    assert sig.parameters["speaker"].default == "Eric", sig.parameters["speaker"].default
    args = _build_parser().parse_args(["你好"])
    assert args.speaker == "Eric", args.speaker
    return "API 与 CLI 默认音色均为 Eric（成都口音）"


@case("C9 参考音频解码保障（m4a 自动转 wav）")
def c9():
    import soundfile as sf
    from qwen_tts_skill.generation import ensure_decodable_ref_audio
    out = _SELFTEST_OUT
    out.mkdir(parents=True, exist_ok=True)
    # wav 直接透传
    wav = out / "c9_ref.wav"
    sf.write(str(wav), [0.0] * 2400, 24000)
    assert ensure_decodable_ref_audio(str(wav)) == str(wav)
    # 带扩展名的本地路径不存在 → 快速报错；URL / base64 原样透传
    try:
        ensure_decodable_ref_audio(str(out / "missing.m4a"))
        raise AssertionError("缺失的本地参考音频应快速报错")
    except ValueError as e:
        assert "不存在" in str(e), str(e)
    assert ensure_decodable_ref_audio("http://example.com/a.mp3") == "http://example.com/a.mp3"
    b64 = "A" * 600  # 无扩展名长串按 base64 透传
    assert ensure_decodable_ref_audio(b64) == b64
    # m4a 自动转换 + 缓存复用
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise SkipTest("系统未安装 ffmpeg")
    m4a = out / "c9_ref.m4a"
    subprocess.run(
        [ffmpeg, "-y", "-v", "error", "-f", "lavfi",
         "-i", "sine=frequency=440:duration=0.5", "-b:a", "64k", str(m4a)],
        check=True)
    p1 = ensure_decodable_ref_audio(str(m4a))
    assert p1.endswith(".wav") and Path(p1) != m4a, p1
    info = sf.info(p1)
    assert info.samplerate == 24000 and info.channels == 1, (info.samplerate, info.channels)
    assert ensure_decodable_ref_audio(str(m4a)) == p1, "缓存未命中"
    return f"m4a → {Path(p1).name}"


@case("C10 输出覆盖保护（默认拒绝覆盖既有文件）")
def c10():
    import numpy as np
    from qwen_tts_skill.generation import OutputConflictError, _save_wavs
    out = _SELFTEST_OUT / "guard"
    shutil.rmtree(out, ignore_errors=True)
    wav = np.sin(np.linspace(0, 440 * 6.28, 8000)).astype("float32") * 0.3
    target = out / "one.wav"
    # 首次写入正常
    paths = _save_wavs([wav], 8000, target, is_batch=False)
    assert paths[0].exists()
    # 再次写入必须拒绝，并点名冲突文件
    try:
        _save_wavs([wav], 8000, target, is_batch=False)
        raise AssertionError("既有文件应被拒绝覆盖")
    except OutputConflictError as e:
        assert "已存在" in str(e), str(e)
        assert str(target) in str(e), str(e)
    # overwrite=True 才允许覆盖
    paths = _save_wavs([wav], 8000, target, is_batch=False, overwrite=True)
    assert paths[0].exists()
    # 批量：冲突时一个都不写（不出现"写一半"）
    batch_dir = out / "batch"
    _save_wavs([wav, wav * 0.5], 8000, batch_dir, is_batch=True)
    (batch_dir / "001.wav").write_bytes(b"stale")
    try:
        _save_wavs([wav, wav * 0.5], 8000, batch_dir, is_batch=True)
        raise AssertionError("批量同名文件应被拒绝覆盖")
    except OutputConflictError as e:
        assert str(batch_dir / "001.wav") in str(e), str(e)
    # 批量整体覆盖
    paths = _save_wavs([wav, wav * 0.5], 8000, batch_dir, is_batch=True, overwrite=True)
    assert [p.name for p in paths] == ["000.wav", "001.wav"], paths
    return ""


@case("C11 公开 API 命名无歧义（策略 vs 配置读取）")
def c11():
    import qwen_tts_skill as pkg
    from qwen_tts_skill import config as config_mod
    from qwen_tts_skill import devices as devices_mod
    # 包级 resolve_device / resolve_dtype 是 devices 的策略入口
    assert pkg.resolve_device is devices_mod.resolve_device
    assert pkg.resolve_dtype is devices_mod.resolve_dtype
    assert pkg.resolve_device_setting is config_mod.resolve_device_setting
    assert pkg.resolve_dtype_setting is config_mod.resolve_dtype_setting
    # 策略入口按位置参数调用（不被配置文件读取函数顶替）
    with isolated_env(AE_QWEN3_TTS_DEVICE=None, AE_QWEN3_TTS_DTYPE=None), no_config_file():
        dev = pkg.resolve_device("auto")
        assert dev == "cpu" or dev.startswith("cuda:"), dev
        assert pkg.resolve_dtype(None, "cpu") == "float32"
        # 配置读取入口按 cwd 读取，默认值 auto
        assert config_mod.resolve_device_setting() == "auto"
        assert config_mod.resolve_dtype_setting() == "auto"
    return ""


# ============================================================================
# Part D: GPU 端到端（真实生成；按需自动下载模型）
# ============================================================================

_TEXT_A = "你好，世界。今天天气怎么样？"
_TEXT_B = "人工智能正在改变我们的生活方式。"


@case("D1 custom_voice 单条生成", depends_gpu=True)
def d1():
    from qwen_tts_skill import generate_custom_voice
    out = _SELFTEST_OUT / "cv_single.wav"
    paths = generate_custom_voice(_TEXT_A, speaker="Vivian",
                                  language="Chinese", output=str(out))
    assert paths[0].exists()
    return _wav_ok(paths[0])


@case("D2 custom_voice 批量生成（异构 speaker/language）", depends_gpu=True)
def d2():
    from qwen_tts_skill import generate_custom_voice
    out_dir = _SELFTEST_OUT / "cv_batch"
    paths = generate_custom_voice(
        [_TEXT_A, "Hello world, this is a batch test."],
        speaker=["Vivian", "Ryan"], language=["Chinese", "English"],
        output=str(out_dir))
    assert len(paths) == 2 and all(p.exists() for p in paths)
    return f"{len(paths)} 个文件"


@case("D3 0.6B CustomVoice 传 instruct 出警告且不报错", depends_gpu=True)
def d3():
    from qwen_tts_skill import generate_custom_voice
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        paths = generate_custom_voice(_TEXT_A, speaker="Serena",
                                      instruct="非常开心", output=str(_SELFTEST_OUT / "cv_instruct.wav"))
    log = buf.getvalue()
    assert "不支持 instruct" in log, f"缺少警告输出: {log[-200:]}"
    return _wav_ok(paths[0])


@case("D4 seed 固定采样可复现（同 seed → 同字节）", depends_gpu=True)
def d4():
    from qwen_tts_skill import generate_custom_voice
    p1 = _SELFTEST_OUT / "seed1.wav"
    p2 = _SELFTEST_OUT / "seed2.wav"
    generate_custom_voice(_TEXT_B, speaker="Vivian", seed=42, output=str(p1))
    generate_custom_voice(_TEXT_B, speaker="Vivian", seed=42, output=str(p2))
    h1, h2 = _md5(p1), _md5(p2)
    assert h1 == h2, f"同 seed 两次生成不一致: {h1} vs {h2}"
    return f"md5={h1[:12]}"


@case("D5 确定性生成（do_sample=False + subtalker_dosample=False ×2）", depends_gpu=True)
def d5():
    from qwen_tts_skill import generate_custom_voice
    p1 = _SELFTEST_OUT / "ns1.wav"
    p2 = _SELFTEST_OUT / "ns2.wav"
    generate_custom_voice(_TEXT_B, speaker="Vivian", do_sample=False,
                          subtalker_dosample=False, output=str(p1))
    generate_custom_voice(_TEXT_B, speaker="Vivian", do_sample=False,
                          subtalker_dosample=False, output=str(p2))
    assert _md5(p1) == _md5(p2), "关闭全部采样后两次生成应完全一致"
    return ""


@case("D6 generation_kwargs 透传覆盖", depends_gpu=True)
def d6():
    from qwen_tts_skill import generate_custom_voice
    paths = generate_custom_voice(
        _TEXT_A, speaker="Dylan",
        generation_kwargs={"repetition_penalty": 1.3},
        output=str(_SELFTEST_OUT / "cv_genkw.wav"))
    return _wav_ok(paths[0])


@case("D7 CLI 端到端单条（子进程）", depends_gpu=True)
def d7():
    out = _SELFTEST_OUT / "cli_single.wav"
    r = _run_cli("端到端测试语音。", "-s", "Serena", "-o", str(out), "--seed", "7")
    assert r.returncode == 0, f"rc={r.returncode}\nstderr={r.stderr[-800:]}"
    return _wav_ok(out)


@case("D8 CLI 端到端批量 -f（子进程）", depends_gpu=True)
def d8():
    out_dir = _SELFTEST_OUT / "cli_batch"
    lines = _SELFTEST_OUT / "lines.txt"
    lines.parent.mkdir(parents=True, exist_ok=True)
    lines.write_text("第一行批量文本。\nSecond line of batch.\n", encoding="utf-8")
    r = _run_cli("-f", str(lines), "-o", str(out_dir), "-s", "Uncle_Fu")
    assert r.returncode == 0, f"rc={r.returncode}\nstderr={r.stderr[-800:]}"
    files = sorted(out_dir.glob("*.wav"))
    assert len(files) == 2, f"应 2 个文件: {files}"
    return f"{len(files)} 个文件"


@case("D9 voice_clone ICL 模式（含 Base 模型按需下载）", depends_gpu=True)
def d9():
    from qwen_tts_skill import generate_custom_voice, generate_voice_clone
    from qwen_tts_skill.model_store import model_root
    ref = _SELFTEST_OUT / "cv_single.wav"
    if not ref.exists():
        generate_custom_voice(_TEXT_A, speaker="Vivian", output=str(ref))
    out = _SELFTEST_OUT / "clone_icl.wav"
    paths = generate_voice_clone(
        "这段声音是克隆生成的测试。", ref_audio=str(ref), ref_text=_TEXT_A,
        output=str(out))
    base_dir = model_root() / "Qwen3-TTS-12Hz-0.6B-Base"
    assert base_dir.exists(), "Base 模型目录未创建"
    return _wav_ok(paths[0])


@case("D10 voice_clone x_vector_only 模式", depends_gpu=True)
def d10():
    from qwen_tts_skill import generate_voice_clone
    ref = _SELFTEST_OUT / "cv_single.wav"
    out = _SELFTEST_OUT / "clone_xvec.wav"
    paths = generate_voice_clone(
        "仅使用声纹向量合成这段话。", ref_audio=str(ref), ref_text="",
        x_vector_only=True, output=str(out))
    return _wav_ok(paths[0])


@case("D11 voice_design 音色设计（含 1.7B 模型按需下载）", depends_gpu=True)
def d11():
    from qwen_tts_skill import generate_voice_design
    from qwen_tts_skill.model_store import model_root
    out = _SELFTEST_OUT / "designed.wav"
    paths = generate_voice_design(
        "春风拂过湖面，泛起层层涟漪。",
        instruct="低沉成熟的男声，语速缓慢，充满磁性",
        output=str(out))
    d = model_root() / "Qwen3-TTS-12Hz-1.7B-VoiceDesign"
    assert d.exists(), "VoiceDesign 模型目录未创建"
    return _wav_ok(paths[0])


@case("D12 voice_design CLI 端到端（子进程，含 0.6B→1.7B 模型切换）", depends_gpu=True)
def d12():
    out = _SELFTEST_OUT / "cli_design.wav"
    r = _run_cli("设计音色端到端测试。", "-m", "voice_design",
                 "-i", "清澈明亮的年轻女声", "-o", str(out))
    assert r.returncode == 0, f"rc={r.returncode}\nstderr={r.stderr[-800:]}"
    return _wav_ok(out)


@case("D13 voice_clone 直用 m4a（ffmpeg 自动转换端到端）", depends_gpu=True)
def d13():
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise SkipTest("系统未安装 ffmpeg")
    from qwen_tts_skill import generate_voice_clone
    _SELFTEST_OUT.mkdir(parents=True, exist_ok=True)
    m4a = _SELFTEST_OUT / "c9_ref.m4a"
    if not m4a.exists():
        subprocess.run(
            [ffmpeg, "-y", "-v", "error", "-f", "lavfi",
             "-i", "sine=frequency=440:duration=0.5", "-b:a", "64k", str(m4a)],
            check=True)
    out = _SELFTEST_OUT / "clone_m4a.wav"
    paths = generate_voice_clone(_TEXT_A, ref_audio=str(m4a), x_vector_only=True,
                                 output=str(out))
    assert paths[0].exists()
    return _wav_ok(paths[0])


GPU_CASES = [d1, d2, d3, d4, d5, d6, d7, d8, d9, d10, d11, d12, d13]


# ============================================================================
# 汇总
# ============================================================================

def summarize() -> int:
    print("\n" + "=" * 72)
    print("测试汇总")
    print("=" * 72)
    n_pass = sum(1 for r in RESULTS if r["status"] == "PASS")
    n_fail = sum(1 for r in RESULTS if r["status"] == "FAIL")
    n_skip = sum(1 for r in RESULTS if r["status"] == "SKIP")
    for r in RESULTS:
        mark = {"PASS": "  ✓ ", "FAIL": "  ✗ ", "SKIP": "  - "}[r["status"]]
        print(f"{mark}{r['name']}" + (f"  [{r['detail']}]" if r["detail"] and r["status"] == "FAIL" else ""))
    print("-" * 72)
    print(f"PASS {n_pass} / FAIL {n_fail} / SKIP {n_skip} / 共 {len(RESULTS)}")
    if n_fail:
        print("失败用例:")
        for r in RESULTS:
            if r["status"] == "FAIL":
                print(f"  ✗ {r['name']}: {r['detail']}")
    print(f"显存状态: {_vram_info()}")
    return 1 if n_fail else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Qwen3-TTS 技能综合测试")
    parser.add_argument("--fast", action="store_true", help="仅静态+CLI+策略单元（不加载模型）")
    parser.add_argument("--gpu-only", action="store_true", help="仅 GPU 端到端")
    parser.add_argument("--keep", action="store_true",
                        help="保留测试产物 <cwd>/ae/qwen3-tts/tmp/selftest/（默认清理）")
    args = parser.parse_args()

    t0 = time.time()
    print(f"Qwen3-TTS 技能测试  skill={SKILL_DIR}")
    print(f"GPU: {'可用' if _gpu_available() else '不可用（GPU 用例将 SKIP）'}\n")

    # 每轮从干净产物目录开始（上一轮 --keep 残留会触发输出覆盖保护）
    shutil.rmtree(_SELFTEST_OUT, ignore_errors=True)

    from qwen_tts_skill import (  # noqa: F401  提前失败比子进程更清晰
        generate_custom_voice, generate_voice_clone, generate_voice_design)

    if not args.gpu_only:
        for fn in (a1, a2, a3, a4, b1, b2, b3, b4, b5, b6, b7, b8, b9, b10, b11, b12, b13,
                   c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11):
            fn()
    if not args.fast:
        print(f"\n--- GPU 端到端 ({_vram_info()}) ---")
        for fn in GPU_CASES:
            fn()

    rc = summarize()
    print(f"总耗时 {time.time() - t0:.1f}s")
    if not args.keep:
        shutil.rmtree(_SELFTEST_OUT, ignore_errors=True)
    return rc


if __name__ == "__main__":
    sys.exit(main())
