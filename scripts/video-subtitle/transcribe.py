"""Transcribe audio with faster-whisper (quality-first) and emit a raw SRT.

Defaults:
  - Full precision (float32 on CPU, float16 on CUDA). No int8 quantisation
    so nothing is given up at the encoder level.
  - beam_size=10 for better search (Whisper's own paper uses 5; we go higher
    because we cache the result anyway — accuracy wins twice).
  - condition_on_previous_text=True (Whisper's default). Keeps long-form
    coherence. Loop hallucinations are caught by clean_srt's loop collapser.
  - word_timestamps=True enables pause-aware re-segmentation: a long
    Whisper chunk is split at >=PAUSE_THRESHOLD silence between words so the
    output SRT breaks at natural speech boundaries, not arbitrary 30s
    offsets.
  - Silero VAD on (can disable with --no-vad).

Invoked as:
    python3 transcribe.py --lang ja --model large-v3 in.wav out.raw.srt
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import clean_srt  # noqa: E402


PAUSE_THRESHOLD = 0.6  # seconds of silence between words that triggers a cue break
MAX_CUE_DURATION = 6.0  # seconds; segments longer than this are re-split by pause


def _process_segments(segments):
    """Collect cues (re-segmented at natural pauses) and word-level timing.

    Returns (cues, words). ``words`` is a flat list of ``{start, end, word,
    probability}`` dicts suitable for json.dump — used downstream by
    detect_fillers.py.
    """
    cues: list[clean_srt.Cue] = []
    words_out: list[dict] = []
    for seg in segments:
        seg_text = (seg.text or "").strip()
        if not seg_text:
            continue
        words = [w for w in (seg.words or []) if (w.word or "").strip()]
        for w in words:
            words_out.append({
                "start": float(w.start),
                "end": float(w.end),
                "word": (w.word or "").strip(),
                "probability": float(getattr(w, "probability", 0.0) or 0.0),
            })
        if not words or (seg.end - seg.start) <= MAX_CUE_DURATION:
            cues.append(clean_srt.Cue(
                len(cues) + 1, float(seg.start), float(seg.end), seg_text))
            continue

        # Group consecutive words, starting a new cue after a long pause or
        # once the current cue would exceed MAX_CUE_DURATION.
        group_start = float(words[0].start)
        group_words: list[str] = []
        last_end = group_start
        for w in words:
            pause = float(w.start) - last_end
            group_dur = float(w.end) - group_start
            if group_words and (pause >= PAUSE_THRESHOLD or group_dur >= MAX_CUE_DURATION):
                cues.append(clean_srt.Cue(
                    len(cues) + 1, group_start, last_end,
                    "".join(group_words).strip()))
                group_start = float(w.start)
                group_words = []
            group_words.append(w.word or "")
            last_end = float(w.end)
        if group_words:
            cues.append(clean_srt.Cue(
                len(cues) + 1, group_start, last_end,
                "".join(group_words).strip()))
    return cues, words_out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--lang", default="ja")
    ap.add_argument("--model", default="large-v3",
                    help="tiny|base|small|medium|large-v3 or HF repo id "
                         "(default large-v3 for best accuracy)")
    ap.add_argument("--device", default="auto",
                    help="auto|cpu|cuda")
    ap.add_argument("--beam-size", type=int, default=10,
                    help="higher = more thorough search, slower (default 10)")
    ap.add_argument("--no-vad", action="store_true",
                    help="Disable Silero VAD (use when audio is already tight)")
    ap.add_argument("--prompt", default="",
                    help="initial_prompt — nudges vocabulary toward given terms")
    ap.add_argument("--words-json", default="",
                    help="If set, also write the per-word timing list to this path "
                         "(consumed by detect_fillers.py)")
    args = ap.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("faster-whisper not installed; run scripts/video-subtitle/bootstrap.sh",
              file=sys.stderr)
        return 127

    device = args.device
    # Quality-first compute types. Never int8.
    if device == "auto":
        try:
            import torch  # type: ignore
            device = "cuda" if torch.cuda.is_available() else "cpu"
        except ImportError:
            device = "cpu"
    compute_type = "float16" if device == "cuda" else "float32"

    print(f"transcribe: model={args.model} device={device} compute={compute_type} "
          f"lang={args.lang} beam={args.beam_size}", file=sys.stderr)
    model = WhisperModel(args.model, device=device, compute_type=compute_type)

    transcribe_kwargs = dict(
        language=args.lang,
        beam_size=args.beam_size,
        vad_filter=not args.no_vad,
        vad_parameters=dict(min_silence_duration_ms=500),
        # Whisper's own coherence-preserving default. Loops are post-cleaned.
        condition_on_previous_text=True,
        # Built-in temperature fallback lets the decoder escape bad runs.
        temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
        compression_ratio_threshold=2.4,
        log_prob_threshold=-1.0,
        no_speech_threshold=0.6,
        word_timestamps=True,
    )
    if args.prompt:
        transcribe_kwargs["initial_prompt"] = args.prompt

    segments, info = model.transcribe(args.src, **transcribe_kwargs)
    cues, words = _process_segments(segments)

    with open(args.dst, "w", encoding="utf-8") as f:
        f.write(clean_srt.emit(cues))

    if args.words_json:
        with open(args.words_json, "w", encoding="utf-8") as f:
            json.dump(words, f, ensure_ascii=False, indent=2)

    dur = info.duration if info else 0.0
    print(f"transcribe: wrote {len(cues)} cues, {len(words)} words "
          f"covering ~{dur:.1f}s of audio", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
