"""Transcribe audio with faster-whisper + Silero VAD and emit a raw SRT.

Invoked as:
    python3 transcribe.py --lang ja --model medium in.wav out.raw.srt

Reuses clean_srt.fmt_time/emit for SRT serialization so there is one
canonical formatter in the repo.
"""
from __future__ import annotations

import argparse
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import clean_srt  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--lang", default="ja")
    ap.add_argument("--model", default="medium",
                    help="tiny|base|small|medium|large-v3 or HF repo id")
    ap.add_argument("--device", default="auto",
                    help="auto|cpu|cuda")
    ap.add_argument("--no-vad", action="store_true",
                    help="Disable Silero VAD (use when audio is already tight)")
    args = ap.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper not installed; run scripts/video-subtitle/bootstrap.sh",
              file=sys.stderr)
        return 127

    device = args.device
    compute_type = "int8"
    if device == "auto":
        try:
            import torch  # type: ignore
            if torch.cuda.is_available():
                device, compute_type = "cuda", "float16"
            else:
                device = "cpu"
        except ImportError:
            device = "cpu"

    print(f"transcribe: model={args.model} device={device} lang={args.lang}",
          file=sys.stderr)
    model = WhisperModel(args.model, device=device, compute_type=compute_type)

    segments, info = model.transcribe(
        args.src,
        language=args.lang,
        beam_size=5,
        vad_filter=not args.no_vad,
        vad_parameters=dict(min_silence_duration_ms=500),
        condition_on_previous_text=False,  # reduces hallucination runs
    )

    cues: list[clean_srt.Cue] = []
    for i, seg in enumerate(segments, 1):
        text = (seg.text or "").strip()
        if not text:
            continue
        cues.append(clean_srt.Cue(i, float(seg.start), float(seg.end), text))

    with open(args.dst, "w", encoding="utf-8") as f:
        f.write(clean_srt.emit(cues))

    dur = info.duration if info else 0.0
    print(f"transcribe: wrote {len(cues)} cues covering ~{dur:.1f}s of audio",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
