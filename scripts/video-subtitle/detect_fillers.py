#!/usr/bin/env python3
"""Detect fillers, stutters and long silences from Whisper word timestamps.

Reads ``<base>.words.json`` (written by transcribe.py) and emits
``<base>.cuts.json``: every range we propose to remove from the video, with
the reason and surrounding text so a human can review.

Defaults are conservative — only unambiguous JA fillers ("えー" / "えーと" /
"あー" / "うー" / "えっと"). The aggressive set ("あの" / "まあ" / "なんか" /
"ちょっと") is opt-in via --aggressive because those words have meaning in
context and over-cutting was the original Premiere pain.

Stdlib only.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import asdict, dataclass

CONSERVATIVE_FILLERS = {
    "えー", "えーっ", "えーと", "えっと", "あー", "あーっ",
    "うー", "うーん", "んー", "んーと",
}

AGGRESSIVE_FILLERS = CONSERVATIVE_FILLERS | {
    "あの", "あのー", "あのう",
    "まあ", "まぁ",
    "なんか",
    "ちょっと",
    "その", "そのー",
}

# Surrounding-pad applied to every cut so we don't clip the leading consonant
# of the next word or the trailing tail of the previous one.
HEAD_PAD = 0.04  # seconds
TAIL_PAD = 0.04  # seconds

STUTTER_GAP = 0.6   # max silence between repeats counted as a stutter
LONG_SILENCE_KEEP = 0.3  # how much silence to keep when trimming a long pause


@dataclass
class Cut:
    start: float
    end: float
    reason: str  # "filler" | "stutter" | "long_silence"
    text: str
    context: str  # ~30 chars around the cut for human review


def _normalise(word: str) -> str:
    # Strip trailing punctuation Whisper sometimes attaches and squash
    # the long-vowel mark variants so "えー" / "えーっ" / "ええ" all match.
    s = re.sub(r"[、。.,!?！？\s]+$", "", word.strip())
    s = s.replace("ー", "").replace("っ", "").replace("ぁ", "あ").replace("ぃ", "い")
    s = s.replace("ぅ", "う").replace("ぇ", "え").replace("ぉ", "お")
    return s


def _matches_filler(word: str, dictionary: set[str]) -> bool:
    if word in dictionary:
        return True
    return _normalise(word) in {_normalise(w) for w in dictionary}


def _ctx(words: list[dict], i: int, span: int = 4) -> str:
    lo, hi = max(0, i - span), min(len(words), i + span + 1)
    parts = []
    for j in range(lo, hi):
        token = words[j].get("word", "")
        parts.append(f"[{token}]" if j == i else token)
    return "".join(parts).strip()


def detect(words: list[dict], *,
           dictionary: set[str],
           detect_stutters: bool = True,
           silence_threshold: float | None = None) -> list[Cut]:
    cuts: list[Cut] = []

    # Pass 1: filler words.
    for i, w in enumerate(words):
        token = (w.get("word") or "").strip()
        if not token:
            continue
        if _matches_filler(token, dictionary):
            cuts.append(Cut(
                start=max(0.0, float(w["start"]) - HEAD_PAD),
                end=float(w["end"]) + TAIL_PAD,
                reason="filler",
                text=token,
                context=_ctx(words, i),
            ))

    # Pass 2: stutter — same normalised word repeated 3+ times within
    # STUTTER_GAP seconds of each other. Cut all but the last occurrence,
    # so "あの あの あの 始めます" keeps the final "あの 始めます".
    if detect_stutters:
        run_start = 0
        for i in range(1, len(words) + 1):
            same_run = (
                i < len(words)
                and _normalise(words[i].get("word", "")) ==
                    _normalise(words[i - 1].get("word", ""))
                and float(words[i]["start"]) - float(words[i - 1]["end"]) <= STUTTER_GAP
                and _normalise(words[i].get("word", "")) != ""
            )
            if not same_run:
                run_len = i - run_start
                if run_len >= 3:
                    # Drop everything from run_start up to (not including) the
                    # last occurrence at i - 1.
                    drop_end = i - 1
                    for j in range(run_start, drop_end):
                        cuts.append(Cut(
                            start=max(0.0, float(words[j]["start"]) - HEAD_PAD),
                            end=float(words[j]["end"]) + TAIL_PAD,
                            reason="stutter",
                            text=words[j].get("word", ""),
                            context=_ctx(words, j),
                        ))
                run_start = i

    # Pass 3: long silences (opt-in via threshold). Trim down to LONG_SILENCE_KEEP
    # so the output doesn't sound clipped.
    if silence_threshold is not None and silence_threshold > 0:
        for i in range(1, len(words)):
            gap = float(words[i]["start"]) - float(words[i - 1]["end"])
            if gap > silence_threshold:
                trim = gap - LONG_SILENCE_KEEP
                cut_start = float(words[i - 1]["end"]) + LONG_SILENCE_KEEP / 2
                cut_end = cut_start + trim
                cuts.append(Cut(
                    start=cut_start,
                    end=cut_end,
                    reason="long_silence",
                    text=f"[silence {gap:.2f}s]",
                    context=_ctx(words, i),
                ))

    cuts.sort(key=lambda c: c.start)
    return _merge_overlaps(cuts)


def _merge_overlaps(cuts: list[Cut]) -> list[Cut]:
    if not cuts:
        return []
    out = [cuts[0]]
    for c in cuts[1:]:
        prev = out[-1]
        if c.start <= prev.end:
            out[-1] = Cut(
                start=prev.start,
                end=max(prev.end, c.end),
                reason=prev.reason if prev.reason == c.reason else "merged",
                text=(prev.text + " " + c.text).strip(),
                context=prev.context,
            )
        else:
            out.append(c)
    return out


def apply_excludes(cuts: list[Cut], excludes: list[tuple[float, float]]) -> list[Cut]:
    """Drop any cut whose midpoint falls inside an excluded range."""
    if not excludes:
        return cuts
    kept = []
    for c in cuts:
        mid = (c.start + c.end) / 2
        if not any(s <= mid <= e for s, e in excludes):
            kept.append(c)
    return kept


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("words_json")
    ap.add_argument("cuts_json")
    ap.add_argument("--aggressive", action="store_true",
                    help="Include 'あの', 'まあ', 'なんか', 'ちょっと' in the filler set")
    ap.add_argument("--no-stutters", action="store_true")
    ap.add_argument("--silence-threshold", type=float, default=None,
                    help="Trim silences longer than N seconds down to ~0.3s "
                         "(off by default)")
    ap.add_argument("--exclude", action="append", default=[],
                    help="Time range to never cut, format start-end in seconds. "
                         "Repeatable.")
    args = ap.parse_args()

    with open(args.words_json, encoding="utf-8") as f:
        words = json.load(f)
    if not words:
        print("no words to process", file=sys.stderr)
        with open(args.cuts_json, "w", encoding="utf-8") as f:
            json.dump({"cuts": [], "excluded": []}, f, ensure_ascii=False, indent=2)
        return 0

    excludes: list[tuple[float, float]] = []
    for e in args.exclude:
        s, _, end = e.partition("-")
        excludes.append((float(s), float(end)))

    dictionary = AGGRESSIVE_FILLERS if args.aggressive else CONSERVATIVE_FILLERS
    cuts = detect(
        words,
        dictionary=dictionary,
        detect_stutters=not args.no_stutters,
        silence_threshold=args.silence_threshold,
    )
    cuts = apply_excludes(cuts, excludes)

    payload = {
        "cuts": [asdict(c) for c in cuts],
        "excluded": [{"start": s, "end": e} for s, e in excludes],
        "summary": {
            "total": len(cuts),
            "filler": sum(1 for c in cuts if c.reason == "filler"),
            "stutter": sum(1 for c in cuts if c.reason == "stutter"),
            "long_silence": sum(1 for c in cuts if c.reason == "long_silence"),
            "total_duration_seconds": round(sum(c.end - c.start for c in cuts), 3),
        },
    }
    with open(args.cuts_json, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"detect_fillers: {payload['summary']['total']} cuts "
          f"({payload['summary']['filler']} filler, "
          f"{payload['summary']['stutter']} stutter, "
          f"{payload['summary']['long_silence']} silence) "
          f"= {payload['summary']['total_duration_seconds']}s",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
