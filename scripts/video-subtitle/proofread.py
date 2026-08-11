#!/usr/bin/env python3
"""Proofread a cleaned SRT via Claude (Sonnet 4.6) with prompt caching.

Splits the SRT into 40-cue chunks. For each chunk, sends a system prompt
plus glossary as a cached prefix and the chunk-as-JSON as the user message.
Receives structured edits {cue_index, original, corrected, reason} and
applies them in place. Writes ``<base>.proofread.srt`` plus a
``<base>.proofread.diff`` showing every change.

The first chunk pays the full cost; subsequent chunks read the cached
glossary + instructions and only pay for the chunk itself. Verify with
the cache_read_input_tokens line printed at the end.

Quality knobs we deliberately *don't* relax:
  - We never alter timestamps. Timing is the cut/Whisper layer's job.
  - We never delete a cue. If the model proposes ``corrected: ""`` we ignore it.
  - We never rewrite — the prompt asks for minimal local edits only.
"""
from __future__ import annotations

import argparse
import difflib
import json
import os
import pathlib
import sys
from typing import List, Optional

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import clean_srt  # noqa: E402

CHUNK_SIZE = 40

INSTRUCTIONS = """You are a Japanese video subtitle proofreader.

Your job is to apply minimal local edits to a Whisper-generated transcript:
correct typos, restore proper nouns and product names, fix kana/kanji
confusions, and normalise punctuation. Do NOT rewrite for style or fluency.
Do NOT shorten, expand, or rephrase. Preserve speaker meaning verbatim.

Input is a JSON array of subtitle cues:
  [{"index": 7, "text": "..."}, ...]

Return JSON matching the schema you've been given. Include an entry only
when you are *changing* the text. If no changes are needed, return
{"edits": []}.

Style rules:
- Use 全角 punctuation (、。「」) consistently.
- Keep contractions and spoken style intact ("やってる" stays "やってる").
- For ambiguous proper nouns, prefer the spelling in the GLOSSARY block.
- Never delete a cue (corrected text must be non-empty).
- Never merge cues (one cue index per edit).
"""


def load_glossary(path: pathlib.Path) -> str:
    if not path.exists():
        return "(no glossary file provided)"
    terms = []
    for line in path.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        terms.append(s)
    if not terms:
        return "(empty glossary)"
    body = "\n".join(f"- {t}" for t in terms)
    return f"GLOSSARY (canonical spellings — prefer these over Whisper's output):\n{body}"


def chunked(cues: list[clean_srt.Cue], size: int):
    for i in range(0, len(cues), size):
        yield cues[i:i + size]


def build_diff(orig: list[clean_srt.Cue], new: list[clean_srt.Cue]) -> str:
    o_lines = [f"{c.index}: {c.text}" for c in orig]
    n_lines = [f"{c.index}: {c.text}" for c in new]
    return "\n".join(difflib.unified_diff(
        o_lines, n_lines, fromfile="original", tofile="proofread", lineterm=""))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--glossary", required=True)
    ap.add_argument("--diff")
    ap.add_argument("--model", default="claude-sonnet-4-6")
    ap.add_argument("--cache-ttl", default="5m", choices=["5m", "1h"])
    args = ap.parse_args()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("proofread: ANTHROPIC_API_KEY not set; skipping (copying input through)",
              file=sys.stderr)
        pathlib.Path(args.dst).write_text(
            pathlib.Path(args.src).read_text(encoding="utf-8"), encoding="utf-8")
        return 0

    try:
        import anthropic  # type: ignore
        from pydantic import BaseModel, Field  # type: ignore
    except ImportError:
        print("proofread: anthropic + pydantic not installed; "
              "run scripts/video-subtitle/bootstrap.sh", file=sys.stderr)
        return 127

    class Edit(BaseModel):
        cue_index: int = Field(..., description="The 'index' field from the input cue")
        original: str = Field(..., description="The cue text as received")
        corrected: str = Field(..., description="The corrected cue text (non-empty)")
        reason: str = Field(..., description="One of: typo, terminology, punctuation, kana_kanji")

    class ProofreadResult(BaseModel):
        edits: List[Edit] = Field(default_factory=list)

    glossary_text = load_glossary(pathlib.Path(args.glossary))

    client = anthropic.Anthropic()
    cues = clean_srt.parse_srt(pathlib.Path(args.src).read_text(encoding="utf-8"))
    if not cues:
        pathlib.Path(args.dst).write_text("", encoding="utf-8")
        return 0

    edited: dict[int, str] = {}
    total_in = total_out = total_cached_read = total_cached_write = 0

    cache_ctrl = {"type": "ephemeral"}
    if args.cache_ttl == "1h":
        cache_ctrl["ttl"] = "1h"

    chunks = list(chunked(cues, CHUNK_SIZE))
    for n, chunk in enumerate(chunks, 1):
        payload = json.dumps(
            [{"index": c.index, "text": c.text} for c in chunk],
            ensure_ascii=False,
        )
        try:
            resp = client.messages.parse(
                model=args.model,
                max_tokens=8192,
                system=[
                    {"type": "text", "text": INSTRUCTIONS},
                    # cache_control on the LAST system block caches tools+system
                    # together — both INSTRUCTIONS and the glossary stay warm.
                    {"type": "text", "text": glossary_text, "cache_control": cache_ctrl},
                ],
                messages=[{"role": "user",
                           "content": f"Proofread these cues:\n\n{payload}"}],
                output_format=ProofreadResult,
            )
        except anthropic.APIStatusError as e:
            print(f"proofread: API error on chunk {n}/{len(chunks)} "
                  f"(status {e.status_code}); skipping this chunk", file=sys.stderr)
            continue

        result: ProofreadResult = resp.parsed_output
        for edit in result.edits:
            if not edit.corrected.strip():
                continue
            if edit.corrected == edit.original:
                continue
            edited[edit.cue_index] = edit.corrected

        u = resp.usage
        total_in += u.input_tokens
        total_out += u.output_tokens
        total_cached_read += getattr(u, "cache_read_input_tokens", 0) or 0
        total_cached_write += getattr(u, "cache_creation_input_tokens", 0) or 0
        print(f"proofread: chunk {n}/{len(chunks)} "
              f"in={u.input_tokens} out={u.output_tokens} "
              f"cache_read={getattr(u, 'cache_read_input_tokens', 0) or 0} "
              f"edits={len(result.edits)}", file=sys.stderr)

    new_cues = [
        clean_srt.Cue(c.index, c.start, c.end, edited.get(c.index, c.text))
        for c in cues
    ]
    pathlib.Path(args.dst).write_text(clean_srt.emit(new_cues), encoding="utf-8")

    if args.diff:
        pathlib.Path(args.diff).write_text(build_diff(cues, new_cues), encoding="utf-8")

    print(f"proofread: applied {len(edited)} edits across {len(cues)} cues",
          file=sys.stderr)
    print(f"proofread: tokens in={total_in} out={total_out} "
          f"cache_read={total_cached_read} cache_write={total_cached_write}",
          file=sys.stderr)
    if total_cached_write > 0 and total_cached_read == 0 and len(chunks) > 1:
        print("proofread: WARNING — cache wrote but never read; check that "
              "the glossary file is large enough to cross the cacheable "
              "prefix threshold (Sonnet 4.6 = 2048 tokens).", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
