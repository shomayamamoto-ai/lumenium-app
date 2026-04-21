#!/usr/bin/env python3
"""redact-pii.py — Scrub common PII from a transcript.

Reads a Markdown transcript, replaces phone numbers and email addresses with
placeholders, and writes the redacted version. The original (un-redacted) text
is preserved at `<output>.raw` so the operator can diff if needed.

Usage:
    python3 redact-pii.py <input.md> <output.md>
"""
import re
import sys
import shutil
from pathlib import Path

PATTERNS = [
    # Japanese mobile/landline with hyphens: 080-1234-5678, 03-1234-5678
    (re.compile(r"(?<!\d)(?:0\d{1,4}[-\s]?\d{2,4}[-\s]?\d{3,4})(?!\d)"), "[電話番号]"),
    # International format: +81 80 1234 5678 / +81-80-1234-5678
    (re.compile(r"\+81[-\s]?\d{1,4}[-\s]?\d{2,4}[-\s]?\d{3,4}"), "[電話番号]"),
    # Email
    (re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"), "[メールアドレス]"),
    # 16-digit credit-card-ish sequences
    (re.compile(r"(?<!\d)\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}(?!\d)"), "[カード番号]"),
    # Japanese postal code: 123-4567
    (re.compile(r"(?<!\d)\d{3}-\d{4}(?!\d)"), "[郵便番号]"),
]


def redact(text: str) -> tuple[str, dict]:
    counts = {}
    for pat, repl in PATTERNS:
        n = 0

        def _sub(_m, _repl=repl):
            nonlocal n
            n += 1
            return _repl

        text = pat.sub(_sub, text)
        if n:
            counts[repl] = counts.get(repl, 0) + n
    return text, counts


def main():
    if len(sys.argv) != 3:
        print("Usage: redact-pii.py <input.md> <output.md>", file=sys.stderr)
        sys.exit(2)
    inp = Path(sys.argv[1])
    outp = Path(sys.argv[2])
    raw = inp.read_text(encoding="utf-8")
    redacted, counts = redact(raw)
    outp.write_text(redacted, encoding="utf-8")
    # Preserve raw alongside (user can delete after review)
    shutil.copy2(inp, outp.with_suffix(outp.suffix + ".raw"))
    if counts:
        summary = ", ".join(f"{k}×{v}" for k, v in counts.items())
        print(f"[redact] Redacted: {summary}", file=sys.stderr)
    else:
        print("[redact] No PII detected.", file=sys.stderr)


if __name__ == "__main__":
    main()
