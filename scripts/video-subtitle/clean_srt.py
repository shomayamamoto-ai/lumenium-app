#!/usr/bin/env python3
"""Clean Whisper-generated SRT files.

- Removes well-known trailing hallucinations (JA/EN).
- Deduplicates consecutive identical cues.
- Merges cues shorter than MIN_DURATION into their neighbours.
- Splits cues longer than MAX_CHARS on punctuation.
- Normalises whitespace (incl. full-width spaces).

Stdlib only; no pysrt/pydub dependency.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass

MIN_DURATION = 0.4  # seconds
MAX_CHARS = 42  # per line (CJK counted as-is)

HALLUCINATION_PATTERNS = {
    "ja": [
        r"^ご(視聴|清聴).*(ありがとう).*$",
        r"^(最後|本日)までご視聴.*$",
        r"^チャンネル登録.*お願い(します|いたします).?$",
        r"^(いいね|高評価).*お願い(します|いたします).?$",
        r"^次回もお楽しみに.?$",
        r"^また(次回|お会いしましょう).?$",
        r"^それでは(皆さん|また).*$",
        r"^字幕.*(提供|作成|by|By|BY).*$",
        r"^提供[:：].*$",
        r"^おわり。?$",
        r"^(以上|終わり)(です|でした)?。?$",
    ],
    "en": [
        r"^thanks? for watching[\.!]*$",
        r"^thank you for watching[\.!]*$",
        r"^(please )?(like (and )?)?subscribe.*$",
        r"^don'?t forget to (like|subscribe).*$",
        r"^subtitles? by .*$",
        r"^captions? by .*$",
        r"^\[(music|applause|laughter)\]$",
        r"^\(.*(music|applause)\).*$",
    ],
}

# Matches "ABC" followed by at least 2 more repeats of the same 2-40 char run,
# with optional whitespace/punctuation between. Catches Whisper's loop-mode
# hallucinations like "ありがとうございましたありがとうございましたありがとうございました".
_LOOP_RE = re.compile(r"(.{2,40}?)(?:[\s、。.,]*\1){2,}", re.DOTALL)


@dataclass
class Cue:
    index: int
    start: float
    end: float
    text: str

    @property
    def duration(self) -> float:
        return self.end - self.start


TIME_RE = re.compile(r"(\d{2}):(\d{2}):(\d{2})[,.](\d{3})")


def parse_time(s: str) -> float:
    m = TIME_RE.match(s.strip())
    if not m:
        raise ValueError(f"bad timestamp: {s!r}")
    h, mi, se, ms = map(int, m.groups())
    return h * 3600 + mi * 60 + se + ms / 1000.0


def fmt_time(t: float) -> str:
    if t < 0:
        t = 0.0
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    if ms == 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def parse_srt(text: str) -> list[Cue]:
    # Normalise newlines and strip BOM.
    text = text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n{2,}", text.strip())
    cues: list[Cue] = []
    for block in blocks:
        lines = [ln for ln in block.split("\n") if ln.strip() != ""]
        if len(lines) < 2:
            continue
        idx_line = lines[0].strip()
        time_line = lines[1] if "-->" in lines[1] else None
        if time_line is None:
            # Some exporters drop the numeric index line.
            if "-->" in lines[0]:
                time_line = lines[0]
                body = lines[1:]
                idx_line = str(len(cues) + 1)
            else:
                continue
        else:
            body = lines[2:]
        try:
            idx = int(idx_line)
        except ValueError:
            idx = len(cues) + 1
        try:
            start_s, end_s = [p.strip() for p in time_line.split("-->")]
            start = parse_time(start_s)
            end = parse_time(end_s)
        except ValueError:
            continue
        cues.append(Cue(idx, start, end, "\n".join(body).strip()))
    return cues


def normalise_text(s: str) -> str:
    s = s.replace("\u3000", " ")  # full-width space
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" *\n *", "\n", s)
    return s.strip()


def strip_hallucinations(cues: list[Cue], lang: str) -> list[Cue]:
    patterns = [re.compile(p, re.IGNORECASE) for p in HALLUCINATION_PATTERNS.get(lang, [])]
    if not patterns:
        return cues
    cleaned: list[Cue] = []
    for cue in cues:
        stripped_body = "\n".join(
            line for line in cue.text.split("\n")
            if not any(p.match(line.strip()) for p in patterns)
        ).strip()
        if stripped_body:
            cleaned.append(Cue(cue.index, cue.start, cue.end, stripped_body))
    # Trim a trailing hallucination-only cue (common Whisper artefact).
    while cleaned and cleaned[-1].text == "":
        cleaned.pop()
    return cleaned


def collapse_repetition_loops(text: str) -> str:
    """Collapse 3+ consecutive repeats of any 2-40 char substring down to one.

    Whisper occasionally gets stuck in a decoding loop, producing output like
    "ありがとうございましたありがとうございましたありがとうございました". This is
    distinct from a presenter actually saying something three times — those
    usually have different surrounding context and varied spacing, so the
    strict >=3 threshold avoids false positives on legitimate repetition.
    """
    prev = None
    while text != prev:
        prev = text
        text = _LOOP_RE.sub(r"\1", text)
    return text


def collapse_loops_in_cues(cues: list[Cue]) -> list[Cue]:
    out: list[Cue] = []
    for cue in cues:
        collapsed = collapse_repetition_loops(cue.text).strip()
        if collapsed:
            out.append(Cue(cue.index, cue.start, cue.end, collapsed))
    return out


def dedupe_consecutive(cues: list[Cue]) -> list[Cue]:
    out: list[Cue] = []
    for cue in cues:
        if out and out[-1].text == cue.text and cue.start - out[-1].end < 0.5:
            out[-1] = Cue(out[-1].index, out[-1].start, cue.end, cue.text)
        else:
            out.append(cue)
    return out


def merge_too_short(cues: list[Cue]) -> list[Cue]:
    # First pass: merge into the previous cue when possible.
    out: list[Cue] = []
    pending: Cue | None = None
    for cue in cues:
        if cue.duration < MIN_DURATION:
            if out:
                prev = out[-1]
                out[-1] = Cue(prev.index, prev.start, max(prev.end, cue.end),
                              (prev.text + " " + cue.text).strip())
            else:
                # No previous cue yet; carry forward to merge with the next one.
                pending = cue if pending is None else Cue(
                    pending.index, pending.start, cue.end,
                    (pending.text + " " + cue.text).strip())
        else:
            if pending is not None:
                cue = Cue(pending.index, pending.start, cue.end,
                          (pending.text + " " + cue.text).strip())
                pending = None
            out.append(cue)
    if pending is not None:
        out.append(pending)
    return out


def split_too_long(cues: list[Cue]) -> list[Cue]:
    out: list[Cue] = []
    for cue in cues:
        lines = cue.text.split("\n")
        if all(len(line) <= MAX_CHARS for line in lines):
            out.append(cue)
            continue
        # Split on sentence-ish punctuation while keeping timing proportional to char count.
        flat = cue.text.replace("\n", " ")
        parts = re.split(r"(?<=[。．.!?！？])\s*", flat)
        parts = [p for p in (p.strip() for p in parts) if p]
        if len(parts) <= 1:
            out.append(cue)
            continue
        total_chars = sum(len(p) for p in parts)
        if total_chars == 0:
            out.append(cue)
            continue
        t = cue.start
        for p in parts:
            frac = len(p) / total_chars
            end = t + cue.duration * frac
            out.append(Cue(cue.index, t, end, p))
            t = end
        # Guarantee the final chunk ends exactly at cue.end to avoid drift.
        if out and out[-1].start < cue.end:
            out[-1] = Cue(out[-1].index, out[-1].start, cue.end, out[-1].text)
    return out


def reindex(cues: list[Cue]) -> list[Cue]:
    return [Cue(i + 1, c.start, c.end, c.text) for i, c in enumerate(cues)]


def emit(cues: list[Cue]) -> str:
    chunks = []
    for c in cues:
        chunks.append(f"{c.index}\n{fmt_time(c.start)} --> {fmt_time(c.end)}\n{c.text}\n")
    return "\n".join(chunks) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--lang", default="ja")
    args = ap.parse_args()

    with open(args.src, encoding="utf-8") as f:
        cues = parse_srt(f.read())
    if not cues:
        print(f"no cues parsed from {args.src}", file=sys.stderr)
        return 1

    cues = [Cue(c.index, c.start, c.end, normalise_text(c.text)) for c in cues]
    cues = collapse_loops_in_cues(cues)
    cues = strip_hallucinations(cues, args.lang)
    cues = dedupe_consecutive(cues)
    cues = merge_too_short(cues)
    cues = split_too_long(cues)
    cues = reindex(cues)

    with open(args.dst, "w", encoding="utf-8") as f:
        f.write(emit(cues))
    print(f"wrote {len(cues)} cues -> {args.dst}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
