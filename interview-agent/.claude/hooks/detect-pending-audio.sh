#!/usr/bin/env bash
# detect-pending-audio.sh — SessionStart hook.
#
# Prints a brief notice to stdout when any candidate folder contains an audio
# file without a corresponding transcript.md, so the operator is reminded to
# run /transcribe. No side effects beyond stdout — safe to run repeatedly.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PENDING=()
while IFS= read -r -d '' audio; do
    dir="$(dirname "$audio")"
    if [ ! -f "$dir/transcript.md" ]; then
        PENDING+=("$dir/$(basename "$audio")")
    fi
done < <(find candidates -maxdepth 2 -type f \
    \( -name 'raw-audio.*' -o -name '*.m4a' -o -name '*.mp3' -o -name '*.wav' \) \
    -print0 2>/dev/null || true)

if [ ${#PENDING[@]} -gt 0 ]; then
    echo ""
    echo "🎙️  未処理の音声ファイルが ${#PENDING[@]} 件あります:"
    for p in "${PENDING[@]}"; do
        slug="$(basename "$(dirname "$p")")"
        echo "  - $slug  ($(basename "$p"))"
    done
    echo ""
    echo "  → 文字起こしするには: /transcribe <slug>"
    echo ""
fi
