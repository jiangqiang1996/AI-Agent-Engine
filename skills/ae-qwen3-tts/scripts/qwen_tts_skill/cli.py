"""CLI: 解析参数并分发到生成接口。"""

from __future__ import annotations

import argparse
import json
import sys

from .config import (
    resolve_attn_impl,
    resolve_default_output,
    resolve_device_setting,
    resolve_dtype_setting,
)
from .constants import (
    ATTN_IMPLEMENTATIONS,
    DEFAULT_SPEAKER,
    DTYPES,
    SUPPORTED_LANGUAGES,
    SUPPORTED_SPEAKERS,
)
from .devices import DevicePolicyError
from .generation import (
    OutputConflictError,
    generate_custom_voice,
    generate_voice_clone,
    generate_voice_design,
)
from .records import write_run_record


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description="Qwen3-TTS 文字转音频（GPU 优先）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
模式说明:
  custom_voice  预置音色 + 情感指令（默认，0.6B/1.7B）
  voice_design  自然语言描述音色（需 1.7B 模型）
  voice_clone   参考音频克隆（需 Base 模型）

设备策略: 优先使用 GPU；仅当没有 GPU 或 PyTorch 不支持 GPU 时使用 CPU；
检测到可用 GPU 时禁止 --device cpu，GPU 加载失败也不会回退 CPU。

模型目录: 默认放在技能子目录 models/（自动下载），可用 ae.jsonc 的 modelRoot 覆盖。

默认输出: <cwd>/ae/<skill-slug>/output.wav（可用 ae.jsonc 的 outputDir 覆盖）。

生成参数留空时使用模型 generate_config.json 默认（无则用库默认:
do_sample=True, temperature=0.9, top_k=50, top_p=1.0,
repetition_penalty=1.05, max_new_tokens=2048）。

示例:
  python tts.py "你好世界"
  python tts.py "Hello" -s Ryan -l English -i "Very happy" -o hello.wav
  python tts.py "你好" -m voice_design -i "带四川成都口音的年轻女声" --model-name 1.7b
  python tts.py "你好" -m voice_clone --ref-audio ref.wav --ref-text "参考文本"
  python tts.py -f script.txt -o output_dir/ -s Serena
  python tts.py -f script.txt -o "out/chapter-{i}.wav" -s Serena   # 批量按模板命名
  python tts.py "测试" --device cuda:0 --dtype bfloat16 --attn-impl sdpa --seed 42
""",
    )

    # 输入
    g_input = p.add_argument_group("输入")
    g_input.add_argument("text", nargs="?", help="要转换的文字")
    g_input.add_argument("-f", "--file", help="从文件读取文字（每行一条）")

    # 模式与模型
    g_model = p.add_argument_group("模式与模型")
    g_model.add_argument("-m", "--mode", default="custom_voice",
                         choices=["custom_voice", "voice_design", "voice_clone"],
                         help="生成模式 (默认: custom_voice)")
    g_model.add_argument("--model-name", default="0.6b",
                         choices=["0.6b", "1.7b"],
                         help="模型规模 (默认: 0.6b，voice_design 强制 1.7b)")
    g_model.add_argument("--model-kwargs", default="{}",
                         help='JSON: 额外传给 from_pretrained 的参数，'
                              '如 \'{"low_cpu_mem_usage": true}\''
                              "（不得含 device_map/dtype/attn_implementation）")

    # 音色与语言
    g_voice = p.add_argument_group("音色与语言")
    g_voice.add_argument("-s", "--speaker", default=DEFAULT_SPEAKER,
                         help=f"音色名称 (默认: {DEFAULT_SPEAKER}，成都口音；"
                              f"可选: {', '.join(SUPPORTED_SPEAKERS)})")
    g_voice.add_argument("-l", "--language",
                         help="语言 (默认: custom_voice/voice_design 用 Chinese，"
                              "voice_clone 用 Auto；可选: "
                              f"{', '.join(SUPPORTED_LANGUAGES + ['Auto'])})")
    g_voice.add_argument("-i", "--instruct", default="",
                         help='情感/风格指令或音色描述，如 "带四川成都口音的年轻女声"'
                              "（0.6B CustomVoice 忽略）")

    # 参考音频（voice_clone 模式）
    g_clone = p.add_argument_group("语音克隆（voice_clone 模式）")
    g_clone.add_argument("--ref-audio", help="参考音频路径（本地文件 / URL / base64）")
    g_clone.add_argument("--ref-text", default="", help="参考音频的文本内容")
    g_clone.add_argument("--xvec-only", action="store_true",
                         help="仅使用声纹向量（不使用 ICL 上下文，可省略 --ref-text）")

    # 输出
    g_out = p.add_argument_group("输出")
    g_out.add_argument("-o", "--output", default=str(resolve_default_output()),
                       help="输出路径: 单条→文件；批量→目录 / 含 {i} 的文件名模板 / "
                            "音频扩展名前缀（如 out/chapter-{i}.wav、out/speech.wav、"
                            "out_dir/；无扩展名自动补 .wav，格式跟随扩展名；"
                            "默认: <cwd>/ae/<skill-slug>/output.wav)")
    g_out.add_argument("--overwrite", action="store_true",
                       help="允许覆盖已存在的输出文件（默认拒绝覆盖，保护用户文件；"
                            "批量模式会覆盖目录内同名文件）")
    g_out.add_argument("--list-speakers", action="store_true",
                       help="列出支持的音色")
    g_out.add_argument("--list-languages", action="store_true",
                       help="列出支持的语言")

    # 生成参数
    g_gen = p.add_argument_group("生成参数（留空 = 模型 generate_config.json 默认）")
    g_gen.add_argument("--max-new-tokens", type=int,
                       help="最大生成 codec token 数 (库默认: 2048)")
    g_gen.add_argument("--temperature", type=float,
                       help="采样温度 (库默认: 0.9)")
    g_gen.add_argument("--top-k", type=int,
                       help="top-k 采样 (库默认: 50)")
    g_gen.add_argument("--top-p", type=float,
                       help="nucleus 采样 (库默认: 1.0)")
    g_gen.add_argument("--repetition-penalty", type=float,
                       help="重复惩罚 (库默认: 1.05)")
    g_gen.add_argument("--eos-token-id", type=int,
                       help="提前终止 token id (默认: 模型配置的 codec_eos_token_id)")
    g_gen.add_argument("--no-sample", dest="do_sample", action="store_false",
                       help="关闭采样，使用确定性生成（同时关闭子 talker 采样）")
    g_gen.add_argument("--subtalker-dosample", type=int, choices=[0, 1],
                       help="子 talker 是否采样 (12Hz tokenizer，库默认: 1)")
    g_gen.add_argument("--subtalker-temperature", type=float,
                       help="子 talker 采样温度 (库默认: 0.9)")
    g_gen.add_argument("--subtalker-top-k", type=int,
                       help="子 talker top-k (库默认: 50)")
    g_gen.add_argument("--subtalker-top-p", type=float,
                       help="子 talker top-p (库默认: 1.0)")
    g_gen.add_argument("--non-streaming", default="auto", choices=["auto", "on", "off"],
                       help="非流式文本输入 (默认: auto=custom_voice/voice_design 开、"
                            "voice_clone 关)")
    g_gen.add_argument("--seed", type=int,
                       help="随机种子（固定后可复现）")
    g_gen.add_argument("--generation-kwargs", default="{}",
                       help="JSON: 额外透传给底层 generate() 的参数，覆盖同名项")

    # 运行时
    g_run = p.add_argument_group("运行时（GPU 优先）")
    g_run.add_argument("--device", default=resolve_device_setting(),
                       help="设备 (默认: auto=自动选空闲显存最大的 GPU；也可 cuda:N；"
                            "有可用 GPU 时禁止 cpu)")
    g_run.add_argument("--dtype", default=resolve_dtype_setting(),
                       choices=DTYPES,
                       help="精度 (默认: auto=GPU 用 bf16、CPU 用 float32)")
    g_run.add_argument("--attn-impl", default=resolve_attn_impl(),
                       choices=ATTN_IMPLEMENTATIONS,
                       help="注意力实现 (默认: auto=库默认 sdpa；"
                            "flash_attention_2 需安装 flash-attn)")

    return p


def _parse_json_object(value: str, name: str) -> dict:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError(f"{name} 必须是 JSON 对象: {error}") from error
    if not isinstance(parsed, dict):
        raise ValueError(f"{name} 必须是 JSON 对象")
    return parsed


def main(argv: list[str] | None = None):
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.list_speakers:
        print("支持的音色:")
        for s in SUPPORTED_SPEAKERS:
            print(f"  - {s}")
        return

    if args.list_languages:
        print("支持的语言:")
        for lang in SUPPORTED_LANGUAGES:
            print(f"  - {lang}")
        return

    # 输入
    if args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            lines = [line.strip() for line in f if line.strip()]
        if not lines:
            print("[tts] 错误: 文件为空", file=sys.stderr)
            sys.exit(1)
        text = lines
    elif args.text:
        text = args.text
    else:
        parser.error("请提供文字内容（位置参数或 -f 文件）")

    mode = args.mode
    model_name = "1.7b" if mode == "voice_design" else args.model_name
    language = args.language or ("Auto" if mode == "voice_clone" else "Chinese")

    # 配置里的默认值同样要校验（argparse 只校验显式传入的值）
    if args.dtype not in DTYPES:
        parser.error(f"非法精度: {args.dtype}（可选: {', '.join(DTYPES)}）")
    if args.attn_impl not in ATTN_IMPLEMENTATIONS:
        parser.error(f"非法注意力实现: {args.attn_impl}"
                     f"（可选: {', '.join(ATTN_IMPLEMENTATIONS)}）")

    if mode == "voice_clone" and not args.ref_audio:
        parser.error("voice_clone 模式需要 --ref-audio 参数")
    if mode == "voice_clone" and not args.ref_text and not args.xvec_only:
        parser.error("voice_clone 模式需要 --ref-text（ICL 模式）或 --xvec-only（仅声纹模式）")
    if mode == "voice_design" and not args.instruct:
        parser.error("voice_design 模式需要 -i/--instruct 描述目标音色")

    try:
        model_kwargs = _parse_json_object(args.model_kwargs, "--model-kwargs")
        generation_kwargs = _parse_json_object(args.generation_kwargs, "--generation-kwargs")
    except ValueError as error:
        parser.error(str(error))
    if {"device_map", "dtype", "attn_implementation"} & model_kwargs.keys():
        parser.error("--model-kwargs 不得覆盖 --device/--dtype/--attn-impl，请使用专用参数")

    gen_kwargs = dict(
        generation_kwargs=generation_kwargs,
        seed=args.seed,
        non_streaming=args.non_streaming,
        max_new_tokens=args.max_new_tokens,
        temperature=args.temperature,
        top_k=args.top_k,
        top_p=args.top_p,
        repetition_penalty=args.repetition_penalty,
        do_sample=args.do_sample,
        subtalker_dosample=(
            bool(args.subtalker_dosample) if args.subtalker_dosample is not None
            else (False if not args.do_sample else None)
        ),
        subtalker_top_k=args.subtalker_top_k,
        subtalker_top_p=args.subtalker_top_p,
        subtalker_temperature=args.subtalker_temperature,
        eos_token_id=args.eos_token_id,
    )

    common = dict(
        output=args.output,
        overwrite=args.overwrite,
        device=args.device,
        dtype=args.dtype,
        attn_implementation=args.attn_impl,
        model_kwargs=model_kwargs,
    )

    try:
        if mode == "custom_voice":
            result = generate_custom_voice(
                text=text, speaker=args.speaker, language=language,
                instruct=args.instruct, model_name=model_name,
                **common, **gen_kwargs,
            )
        elif mode == "voice_design":
            result = generate_voice_design(
                text=text, instruct=args.instruct, language=language,
                **common, **gen_kwargs,
            )
        elif mode == "voice_clone":
            result = generate_voice_clone(
                text=text, ref_audio=args.ref_audio, ref_text=args.ref_text,
                language=language, model_name=model_name,
                x_vector_only=args.xvec_only,
                **common, **gen_kwargs,
            )
        else:
            parser.error(f"未知模式: {mode}")
    except DevicePolicyError as error:
        print(f"[tts] 设备策略错误: {error}", file=sys.stderr)
        sys.exit(2)
    except OutputConflictError as error:
        print(f"[tts] 错误: {error}", file=sys.stderr)
        sys.exit(1)
    except ValueError as error:
        print(f"[tts] 错误: {error}", file=sys.stderr)
        sys.exit(1)

    outputs = [str(p) for p in (result or [])]
    record = write_run_record({
        "mode": mode,
        "model": model_name,
        "speaker": args.speaker,
        "language": language,
        "instruct": args.instruct,
        "refAudio": args.ref_audio,
        "textCount": len(text) if isinstance(text, list) else 1,
        "device": args.device,
        "dtype": args.dtype,
        "attnImpl": args.attn_impl,
        "seed": args.seed,
        "outputs": outputs,
    })
    if record is not None:
        print(f"[tts] 生成记录: {record}")

    print(f"\n[tts] 完成: {result}")


if __name__ == "__main__":
    main()
