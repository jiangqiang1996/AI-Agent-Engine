"""生成接口: 预置音色 / 音色设计 / 语音克隆。

生成参数语义: 命名参数传 None 时不透传 → 由模型目录中的
generate_config.json（若有）或 qwen_tts 库默认值决定。库默认:
do_sample=True, temperature=0.9, top_k=50, top_p=1.0,
repetition_penalty=1.05, subtalker_* 同上, max_new_tokens=2048。
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

from .devices import seed_everything
from .config import resolve_default_output
from .constants import AUDIO_SUFFIXES, DEFAULT_SPEAKER
from .runtime import get_model


def resolve_output_path(output: str | Path | None) -> Path:
    """输出路径：None → 默认 <cwd>/ae/<skill-slug>/output.wav。"""
    if output is None:
        return resolve_default_output()
    return Path(output)


def build_generation_kwargs(
    *,
    max_new_tokens: int | None = None,
    do_sample: bool | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    repetition_penalty: float | None = None,
    subtalker_dosample: bool | None = None,
    subtalker_top_k: int | None = None,
    subtalker_top_p: float | None = None,
    subtalker_temperature: float | None = None,
    eos_token_id: int | None = None,
    extra: dict | None = None,
) -> dict:
    """组装传给 qwen_tts generate_* 的参数；None 项不透传。extra 可覆盖同名项。"""
    gen: dict = {}
    optional = {
        "max_new_tokens": max_new_tokens,
        "do_sample": do_sample,
        "temperature": temperature,
        "top_k": top_k,
        "top_p": top_p,
        "repetition_penalty": repetition_penalty,
        "subtalker_dosample": subtalker_dosample,
        "subtalker_top_k": subtalker_top_k,
        "subtalker_top_p": subtalker_top_p,
        "subtalker_temperature": subtalker_temperature,
        "eos_token_id": eos_token_id,
    }
    for key, value in optional.items():
        if value is not None:
            gen[key] = value
    gen.update(extra or {})
    return gen


def resolve_non_streaming(non_streaming: str | None) -> bool | None:
    """auto → 不透传（custom_voice/voice_design 库默认 True，voice_clone 默认 False）。"""
    if non_streaming in (None, "auto"):
        return None
    if non_streaming == "on":
        return True
    if non_streaming == "off":
        return False
    raise ValueError(f"非法 non_streaming 值: {non_streaming}（可选: auto/on/off）")


def ensure_decodable_ref_audio(ref: str | Path) -> str:
    """参考音频解码保障。

    本地文件若 soundfile（libsndfile）无法解码（m4a/aac/mp4 等容器），
    用 ffmpeg 转为 24kHz 单声道 wav 后返回新路径；转换结果按
    "源路径+大小+修改时间" 哈希缓存在系统临时目录，跨运行复用。
    URL / base64 原样透传给底层库；带扩展名的本地路径不存在时快速报错。
    """
    import soundfile as sf

    p = Path(ref)
    if "://" in str(ref) or not p.suffix:  # URL / base64 / 无扩展名 → 交由底层库
        return str(ref)
    if not p.is_file():
        raise ValueError(f"参考音频文件不存在: {p.resolve()}（请检查路径或文件名）")
    try:
        sf.info(str(p))
        return str(ref)
    except Exception:
        pass
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise ValueError(
            f"参考音频 {p.name}（{p.suffix or '无扩展名'}）soundfile 无法解码，"
            "且系统未安装 ffmpeg。请安装 ffmpeg，或先手动转换为 wav/flac。"
        )
    stat = p.stat()
    digest = hashlib.md5(f"{p.resolve()}|{stat.st_size}|{stat.st_mtime_ns}".encode()).hexdigest()[:12]
    out = Path(tempfile.gettempdir()) / f"qwen_tts_ref_{digest}.wav"
    if not out.is_file():
        print(f"[tts] 参考音频 {p.name} 无法被 soundfile 解码，使用 ffmpeg 转为 wav ...")
        subprocess.run(
            [ffmpeg, "-y", "-v", "error", "-i", str(p),
             "-ac", "1", "-ar", "24000", str(out)],
            check=True,
        )
    sf.info(str(out))  # 转换结果必须可解码
    return str(out)


def _save_wavs(wavs: list, sr: int, output: str | Path, is_batch: bool) -> list[Path]:
    """保存音频。output 语义:

    - 单条: 文件路径（任意相对/绝对路径，父目录自动创建，无扩展名自动补 .wav）。
    - 批量: 文件名含 {i} → 文件名模板（out/chapter-{i}.wav → chapter-000.wav…）；
            扩展名为音频格式 → 文件名前缀（out/speech.wav → speech-000.wav…）；
            其余 → 目录（out/ → out/000.wav…）。
    音频格式跟随扩展名（wav/flac/ogg/mp3 等，由 libsndfile 推断）。
    """
    import soundfile as sf

    out = resolve_output_path(output)
    paths: list[Path] = []

    def _write(p: Path, wav) -> None:
        if not p.suffix:
            p = p.with_name(p.name + ".wav")
        p.parent.mkdir(parents=True, exist_ok=True)
        sf.write(str(p), wav, sr)
        paths.append(p)
        print(f"[tts] 保存: {p}")

    if is_batch:
        if "{i}" in str(out):
            for i, wav in enumerate(wavs):
                _write(Path(str(out).replace("{i}", f"{i:03d}")), wav)
        elif out.suffix.lower() in AUDIO_SUFFIXES:
            for i, wav in enumerate(wavs):
                _write(out.parent / f"{out.stem}-{i:03d}{out.suffix}", wav)
        else:
            for i, wav in enumerate(wavs):
                _write(out / f"{i:03d}.wav", wav)
    else:
        _write(out, wavs[0])

    return paths


def _pad(value, n: int):
    return value if isinstance(value, list) else [value] * n


def _prepare(registry_key: str, *, device, dtype, attn_implementation,
             model_kwargs, seed, non_streaming):
    model = get_model(registry_key, device, dtype, attn_implementation, model_kwargs)
    seed_everything(seed)
    return model, resolve_non_streaming(non_streaming)


def generate_custom_voice(
    text: str | list[str],
    speaker: str | list[str] = DEFAULT_SPEAKER,
    language: str | list[str] = "Chinese",
    instruct: str | list[str] = "",
    output: str | Path | None = None,
    model_name: str = "0.6b",
    *,
    device: str = "auto",
    dtype: str = "auto",
    attn_implementation: str = "auto",
    model_kwargs: dict | None = None,
    generation_kwargs: dict | None = None,
    seed: int | None = None,
    non_streaming: str | None = "auto",
    max_new_tokens: int | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    repetition_penalty: float | None = None,
    do_sample: bool | None = None,
    subtalker_dosample: bool | None = None,
    subtalker_top_k: int | None = None,
    subtalker_top_p: float | None = None,
    subtalker_temperature: float | None = None,
    eos_token_id: int | None = None,
) -> list[Path]:
    """预置音色生成（0.6B / 1.7B CustomVoice 模型）。

    Args:
        text: 单条或批量文本。
        speaker: 音色名或音色列表。
        language: 语言或语言列表。
        instruct: 情感/风格指令（0.6B 模型忽略）。
        output: 输出路径（单条=文件；批量=目录/含 {i} 模板/音频扩展名前缀；
            None=默认 <cwd>/ae/<skill-slug>/output.wav）。
        model_name: 模型规模（0.6b / 1.7b）。
        device/dtype/attn_implementation/model_kwargs: 模型加载配置。
        generation_kwargs: 额外透传给底层 generate() 的参数（覆盖同名项）。
        seed: 随机种子。
        non_streaming: auto/on/off。
        其余生成参数: None → 使用模型 generate_config.json 或库默认。

    Returns:
        输出文件路径列表。
    """
    registry_key = "custom_voice_1.7b" if model_name == "1.7b" else "custom_voice"
    model, ns = _prepare(registry_key, device=device, dtype=dtype,
                         attn_implementation=attn_implementation,
                         model_kwargs=model_kwargs, seed=seed,
                         non_streaming=non_streaming)

    is_batch = isinstance(text, list)
    texts = text if is_batch else [text]
    n = len(texts)

    if instruct and model_name == "0.6b":
        print("[tts] 注意: 0.6B CustomVoice 模型不支持 instruct，将忽略该参数")

    gen = build_generation_kwargs(
        max_new_tokens=max_new_tokens, do_sample=do_sample, temperature=temperature,
        top_k=top_k, top_p=top_p, repetition_penalty=repetition_penalty,
        subtalker_dosample=subtalker_dosample, subtalker_top_k=subtalker_top_k,
        subtalker_top_p=subtalker_top_p, subtalker_temperature=subtalker_temperature,
        eos_token_id=eos_token_id, extra=generation_kwargs)

    print(f"[tts] 生成 {n} 条语音 (custom_voice) ...")
    t0 = time.time()
    kwargs = {} if ns is None else {"non_streaming_mode": ns}
    wavs, sr = model.generate_custom_voice(
        text=texts, language=_pad(language, n),
        speaker=_pad(speaker, n), instruct=_pad(instruct, n),
        **kwargs, **gen,
    )
    print(f"[tts] 生成完成 ({time.time() - t0:.1f}s)")
    return _save_wavs(wavs, sr, output, is_batch)


def generate_voice_design(
    text: str | list[str],
    instruct: str | list[str] = "",
    language: str | list[str] = "Chinese",
    output: str | Path | None = None,
    *,
    device: str = "auto",
    dtype: str = "auto",
    attn_implementation: str = "auto",
    model_kwargs: dict | None = None,
    generation_kwargs: dict | None = None,
    seed: int | None = None,
    non_streaming: str | None = "auto",
    max_new_tokens: int | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    repetition_penalty: float | None = None,
    do_sample: bool | None = None,
    subtalker_dosample: bool | None = None,
    subtalker_top_k: int | None = None,
    subtalker_top_p: float | None = None,
    subtalker_temperature: float | None = None,
    eos_token_id: int | None = None,
) -> list[Path]:
    """自然语言描述音色生成（需要 1.7B-VoiceDesign 模型）。

    Args:
        text: 单条或批量文本。
        instruct: 音色描述（如 "低沉成熟的男声"）。
        language: 语言或语言列表。
        output: 输出路径。
        其余参数同 generate_custom_voice。

    Returns:
        输出文件路径列表。
    """
    model, ns = _prepare("voice_design", device=device, dtype=dtype,
                         attn_implementation=attn_implementation,
                         model_kwargs=model_kwargs, seed=seed,
                         non_streaming=non_streaming)

    is_batch = isinstance(text, list)
    texts = text if is_batch else [text]
    n = len(texts)

    gen = build_generation_kwargs(
        max_new_tokens=max_new_tokens, do_sample=do_sample, temperature=temperature,
        top_k=top_k, top_p=top_p, repetition_penalty=repetition_penalty,
        subtalker_dosample=subtalker_dosample, subtalker_top_k=subtalker_top_k,
        subtalker_top_p=subtalker_top_p, subtalker_temperature=subtalker_temperature,
        eos_token_id=eos_token_id, extra=generation_kwargs)

    print(f"[tts] 生成 {n} 条语音 (voice_design) ...")
    t0 = time.time()
    kwargs = {} if ns is None else {"non_streaming_mode": ns}
    wavs, sr = model.generate_voice_design(
        text=texts, language=_pad(language, n), instruct=_pad(instruct, n),
        **kwargs, **gen,
    )
    print(f"[tts] 生成完成 ({time.time() - t0:.1f}s)")
    return _save_wavs(wavs, sr, output, is_batch)


def generate_voice_clone(
    text: str | list[str],
    ref_audio: str | list[str],
    ref_text: str | list[str],
    language: str | list[str] = "Auto",
    output: str | Path | None = None,
    *,
    model_name: str = "0.6b",
    x_vector_only: bool | list[bool] = False,
    device: str = "auto",
    dtype: str = "auto",
    attn_implementation: str = "auto",
    model_kwargs: dict | None = None,
    generation_kwargs: dict | None = None,
    seed: int | None = None,
    non_streaming: str | None = "auto",
    max_new_tokens: int | None = None,
    temperature: float | None = None,
    top_k: int | None = None,
    top_p: float | None = None,
    repetition_penalty: float | None = None,
    do_sample: bool | None = None,
    subtalker_dosample: bool | None = None,
    subtalker_top_k: int | None = None,
    subtalker_top_p: float | None = None,
    subtalker_temperature: float | None = None,
    eos_token_id: int | None = None,
) -> list[Path]:
    """基于参考音频的语音克隆（需要 Base 模型）。

    Args:
        text: 要合成的文本。
        ref_audio: 参考音频（本地路径 / URL / base64）。
        ref_text: 参考音频文本（x_vector_only=True 时可省略）。
        language: 目标语言，默认 "Auto" 自动判断。
        output: 输出路径。
        model_name: 模型规模（0.6b / 1.7b）。
        x_vector_only: 仅使用声纹向量。
        其余参数同 generate_custom_voice。

    Returns:
        输出文件路径列表。
    """
    if isinstance(ref_audio, list):
        ref_audio = [ensure_decodable_ref_audio(r) for r in ref_audio]
    else:
        ref_audio = ensure_decodable_ref_audio(ref_audio)

    registry_key = "voice_clone_1.7b" if model_name == "1.7b" else "voice_clone"
    model, ns = _prepare(registry_key, device=device, dtype=dtype,
                         attn_implementation=attn_implementation,
                         model_kwargs=model_kwargs, seed=seed,
                         non_streaming=non_streaming)

    is_batch = isinstance(text, list)
    texts = text if is_batch else [text]
    n = len(texts)

    gen = build_generation_kwargs(
        max_new_tokens=max_new_tokens, do_sample=do_sample, temperature=temperature,
        top_k=top_k, top_p=top_p, repetition_penalty=repetition_penalty,
        subtalker_dosample=subtalker_dosample, subtalker_top_k=subtalker_top_k,
        subtalker_top_p=subtalker_top_p, subtalker_temperature=subtalker_temperature,
        eos_token_id=eos_token_id, extra=generation_kwargs)

    print(f"[tts] 生成 {n} 条语音 (voice_clone) ...")
    t0 = time.time()
    kwargs = {} if ns is None else {"non_streaming_mode": ns}
    wavs, sr = model.generate_voice_clone(
        text=texts, language=_pad(language, n),
        ref_audio=_pad(ref_audio, n), ref_text=_pad(ref_text, n),
        x_vector_only_mode=_pad(x_vector_only, n),
        **kwargs, **gen,
    )
    print(f"[tts] 生成完成 ({time.time() - t0:.1f}s)")
    return _save_wavs(wavs, sr, output, is_batch)
