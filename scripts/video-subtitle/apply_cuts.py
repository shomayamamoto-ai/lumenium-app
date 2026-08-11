#!/usr/bin/env python3
"""Apply cuts.json to a video + SRT.

Outputs:
  - <base>.cut.mp4 — video with cut ranges removed, audio re-encoded with
    short fades at boundaries to prevent clicks
  - <base>.cut.srt — SRT with timestamps shifted to match the cut video,
    cues fully inside cuts dropped, partially-overlapping cues trimmed
  - <base>.review.md — human-readable summary of what was cut

Stdlib only for the SRT side; subprocess + ffmpeg for the video side.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import shlex
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import clean_srt  # noqa: E402

AUDIO_FADE = 0.012  # seconds of fade-in/out per kept segment edge


def keep_ranges(cuts: list[dict], duration: float) -> list[tuple[float, float]]:
    """Inverse of cuts: ranges we keep, in order, clamped to [0, duration]."""
    intervals = sorted(((float(c["start"]), float(c["end"])) for c in cuts),
                       key=lambda x: x[0])
    out: list[tuple[float, float]] = []
    cursor = 0.0
    for s, e in intervals:
        s = max(0.0, s)
        e = min(duration, e)
        if s > cursor:
            out.append((cursor, s))
        cursor = max(cursor, e)
    if cursor < duration:
        out.append((cursor, duration))
    return [(s, e) for s, e in out if e - s > 0.01]


def shift_srt(cues: list[clean_srt.Cue],
              keeps: list[tuple[float, float]]) -> list[clean_srt.Cue]:
    """Map original-timeline cues onto the cut timeline.

    A cue that lies entirely inside a removed gap is dropped. A cue that
    straddles a cut is trimmed to the kept side(s); we don't try to split
    one cue into two — a presenter speaking across a cut would read very
    oddly anyway, so we keep whichever side has more text.
    """
    if not keeps:
        return list(cues)

    # Build a piecewise-linear map: original_time -> new_time.
    # For t inside keep[i] = (s, e), new_t = sum(prev keep durations) + (t - s).
    new_starts = []
    acc = 0.0
    for s, e in keeps:
        new_starts.append(acc - s)  # offset such that new_t = t + offset
        acc += e - s

    def map_time(t: float) -> float | None:
        for (s, e), off in zip(keeps, new_starts):
            if s <= t <= e:
                return t + off
        return None

    out: list[clean_srt.Cue] = []
    for cue in cues:
        # Find the keep range that contains the majority of the cue.
        best: tuple[float, float, float] | None = None  # (overlap, s, e)
        for s, e in keeps:
            ov = max(0.0, min(cue.end, e) - max(cue.start, s))
            if ov > 0 and (best is None or ov > best[0]):
                best = (ov, s, e)
        if best is None:
            continue
        _, ks, ke = best
        clipped_start = max(cue.start, ks)
        clipped_end = min(cue.end, ke)
        if clipped_end - clipped_start < 0.15:
            continue
        ns = map_time(clipped_start)
        ne = map_time(clipped_end)
        if ns is None or ne is None:
            continue
        out.append(clean_srt.Cue(len(out) + 1, ns, ne, cue.text))
    return out


def build_filter_complex(keeps: list[tuple[float, float]]) -> str:
    parts = []
    labels = []
    for i, (s, e) in enumerate(keeps):
        d = e - s
        fade = min(AUDIO_FADE, d / 4)
        parts.append(
            f"[0:v]trim=start={s:.3f}:end={e:.3f},setpts=PTS-STARTPTS[v{i}];"
            f"[0:a]atrim=start={s:.3f}:end={e:.3f},asetpts=PTS-STARTPTS,"
            f"afade=t=in:st=0:d={fade:.3f},"
            f"afade=t=out:st={max(0, d - fade):.3f}:d={fade:.3f}[a{i}]"
        )
        labels.append(f"[v{i}][a{i}]")
    parts.append(f"{''.join(labels)}concat=n={len(keeps)}:v=1:a=1[outv][outa]")
    return ";".join(parts)


def write_review_md(cuts: list[dict], summary: dict, dst: pathlib.Path) -> None:
    lines = ["# video-subtitle review", "",
             f"Total cuts: **{summary['total']}** "
             f"(filler {summary['filler']}, "
             f"stutter {summary['stutter']}, "
             f"silence {summary['long_silence']})",
             "",
             f"Total time removed: **{summary['total_duration_seconds']:.2f}s**",
             "",
             "If a cut is wrong, copy its `start-end` (in seconds) and re-run with",
             "`run.sh ... --exclude-cut START-END`. The other steps are cached so",
             "only the cut/burn-in passes will re-run.",
             "",
             "| # | Time | Reason | Text | Context |",
             "|---|------|--------|------|---------|"]
    for i, c in enumerate(cuts, 1):
        lines.append(f"| {i} | {c['start']:.2f}-{c['end']:.2f} | "
                     f"{c['reason']} | `{c['text']}` | {c['context']} |")
    dst.write_text("\n".join(lines) + "\n", encoding="utf-8")


def ffprobe_duration(video: pathlib.Path) -> float:
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", str(video),
    ], text=True).strip()
    return float(out)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("srt")
    ap.add_argument("cuts_json")
    ap.add_argument("out_video")
    ap.add_argument("out_srt")
    ap.add_argument("--review-md")
    ap.add_argument("--crf", type=int, default=17)
    ap.add_argument("--preset", default="slow")
    args = ap.parse_args()

    with open(args.cuts_json, encoding="utf-8") as f:
        payload = json.load(f)
    cuts = payload.get("cuts", [])

    video = pathlib.Path(args.video)
    duration = ffprobe_duration(video)
    keeps = keep_ranges(cuts, duration)

    if args.review_md and cuts:
        write_review_md(cuts, payload.get("summary", {}),
                        pathlib.Path(args.review_md))

    # Shift SRT on the original video's timeline -> cut timeline.
    with open(args.srt, encoding="utf-8") as f:
        cues = clean_srt.parse_srt(f.read())
    new_cues = shift_srt(cues, keeps) if cuts else cues
    new_cues = clean_srt.reindex(new_cues)
    with open(args.out_srt, "w", encoding="utf-8") as f:
        f.write(clean_srt.emit(new_cues))

    if not cuts:
        # No-op: copy through losslessly.
        subprocess.check_call([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(video),
            "-c", "copy", "-movflags", "+faststart", args.out_video,
        ])
        print("apply_cuts: nothing to cut, copied through", file=sys.stderr)
        return 0

    filter_complex = build_filter_complex(keeps)
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(video),
        "-filter_complex", filter_complex,
        "-map", "[outv]", "-map", "[outa]",
        "-c:v", "libx264", "-crf", str(args.crf), "-preset", args.preset,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-movflags", "+faststart",
        args.out_video,
    ]
    print(f"apply_cuts: {len(cuts)} cuts, {len(keeps)} keep-ranges",
          file=sys.stderr)
    print(f"  ffmpeg: {' '.join(shlex.quote(c) for c in cmd[:8])} ...",
          file=sys.stderr)
    subprocess.check_call(cmd)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
