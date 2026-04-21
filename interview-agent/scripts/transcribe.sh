#!/usr/bin/env bash
# transcribe.sh — Transcribe an audio file to a structured Markdown transcript.
#
# Usage:
#   scripts/transcribe.sh <audio-in> <markdown-out> [--no-redact] [--model large-v3]
#
# Selects a backend automatically (in priority order):
#   1. faster-whisper   (local, pip install faster-whisper)
#   2. whisper          (local, pip install openai-whisper)
#   3. whisper.cpp      (local, CLI: `whisper-cpp` or `main`)
#   4. OPENAI_API_KEY   (cloud Whisper API)
#
# Output: Markdown file at <markdown-out> with timestamped segments and metadata.

set -euo pipefail

AUDIO="${1:-}"
OUT="${2:-}"
REDACT=1
MODEL="large-v3"

shift 2 || true
while [ $# -gt 0 ]; do
    case "$1" in
        --no-redact) REDACT=0 ;;
        --model)     MODEL="$2"; shift ;;
        *) echo "Unknown arg: $1" >&2; exit 2 ;;
    esac
    shift
done

if [ -z "$AUDIO" ] || [ -z "$OUT" ]; then
    echo "Usage: $0 <audio-in> <markdown-out> [--no-redact] [--model MODEL]" >&2
    exit 2
fi

if [ ! -f "$AUDIO" ]; then
    echo "Audio file not found: $AUDIO" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# ------------------------------------------------------------------
# Backend detection
# ------------------------------------------------------------------
detect_backend() {
    if command -v faster-whisper >/dev/null 2>&1; then echo "faster-whisper"; return; fi
    if python3 -c "import faster_whisper" >/dev/null 2>&1; then echo "faster-whisper-py"; return; fi
    if command -v whisper >/dev/null 2>&1; then echo "whisper-cli"; return; fi
    if python3 -c "import whisper" >/dev/null 2>&1; then echo "whisper-py"; return; fi
    if command -v whisper-cpp >/dev/null 2>&1; then echo "whisper-cpp"; return; fi
    if [ -n "${OPENAI_API_KEY:-}" ]; then echo "openai-api"; return; fi
    echo "none"
}

BACKEND="$(detect_backend)"

if [ "$BACKEND" = "none" ]; then
    cat >&2 <<'EOF'
No transcription backend available.

Install one of the following:
  - faster-whisper (recommended, local):
      pip install faster-whisper
  - OpenAI Whisper (local):
      pip install openai-whisper
  - OpenAI API:
      export OPENAI_API_KEY=sk-...

See TRANSCRIPTION-SETUP.md for details.
EOF
    exit 1
fi

echo "[transcribe] Backend: $BACKEND, model: $MODEL, audio: $AUDIO" >&2

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

JSON_FILE="$TMPDIR/segments.json"

# ------------------------------------------------------------------
# Run backend → JSON
# ------------------------------------------------------------------
case "$BACKEND" in
    faster-whisper)
        faster-whisper "$AUDIO" --language ja --model "$MODEL" \
            --output_format json --output_dir "$TMPDIR" >&2
        cp "$TMPDIR"/*.json "$JSON_FILE"
        ;;
    faster-whisper-py)
        python3 - <<PY
import json, sys
from faster_whisper import WhisperModel
model = WhisperModel("$MODEL", device="auto")
segments, info = model.transcribe("$AUDIO", language="ja", vad_filter=True)
out = {"segments": [{"start": s.start, "end": s.end, "text": s.text, "avg_logprob": s.avg_logprob} for s in segments], "language": info.language, "duration": info.duration}
open("$JSON_FILE", "w").write(json.dumps(out, ensure_ascii=False))
PY
        ;;
    whisper-cli|whisper-py)
        whisper "$AUDIO" --language ja --model "$MODEL" \
            --output_format json --output_dir "$TMPDIR" >&2
        cp "$TMPDIR"/*.json "$JSON_FILE"
        ;;
    whisper-cpp)
        whisper-cpp -l ja -m "$MODEL" -f "$AUDIO" --output-json-full --output-file "$TMPDIR/out" >&2
        cp "$TMPDIR/out.json" "$JSON_FILE"
        ;;
    openai-api)
        SIZE=$(stat -c%s "$AUDIO" 2>/dev/null || stat -f%z "$AUDIO")
        if [ "$SIZE" -gt 26214400 ]; then
            echo "[warn] File >25MB; OpenAI API will reject. Consider local backend or split." >&2
        fi
        curl -sS https://api.openai.com/v1/audio/transcriptions \
            -H "Authorization: Bearer $OPENAI_API_KEY" \
            -F model=whisper-1 \
            -F "file=@$AUDIO" \
            -F response_format=verbose_json \
            -F language=ja \
            > "$JSON_FILE"
        ;;
esac

# ------------------------------------------------------------------
# JSON → Markdown
# ------------------------------------------------------------------
MD_RAW="$TMPDIR/transcript.md"

python3 - "$JSON_FILE" "$AUDIO" "$BACKEND" "$MODEL" > "$MD_RAW" <<'PYEOF'
import json, sys, os
from datetime import datetime

json_file, audio_path, backend, model = sys.argv[1:5]
data = json.load(open(json_file))
segments = data.get("segments", [])

def fmt_ts(sec):
    sec = float(sec or 0)
    h, rem = divmod(int(sec), 3600)
    m, s = divmod(rem, 60)
    return f"{h:02d}:{m:02d}:{s:02d}"

duration = data.get("duration") or (segments[-1]["end"] if segments else 0)

mtime = os.path.getmtime(audio_path)
recorded = datetime.fromtimestamp(mtime).strftime("%Y-%m-%d %H:%M")
generated = datetime.now().strftime("%Y-%m-%d %H:%M")

# Average confidence (if provided)
confidences = [s.get("avg_logprob") for s in segments if s.get("avg_logprob") is not None]
if confidences:
    avg = sum(confidences) / len(confidences)
    conf = "高" if avg > -0.4 else ("中" if avg > -0.8 else "低")
else:
    conf = "不明"

print(f"# 文字起こし: {os.path.basename(audio_path)}")
print()
print(f"- 音声ファイル: `{audio_path}`")
print(f"- 録音日時（推定）: {recorded}")
print(f"- 所要: {fmt_ts(duration)}")
print(f"- 文字起こしエンジン: {backend} / {model}")
print(f"- 生成日時: {generated}")
print(f"- セグメント数: {len(segments)}")
print(f"- 平均信頼度: {conf}")
print()
print("## セグメント")
print()
for s in segments:
    text = (s.get("text") or "").strip()
    if not text:
        continue
    start = fmt_ts(s.get("start", 0))
    end = fmt_ts(s.get("end", 0))
    print(f"### [{start} → {end}]")
    print(text)
    print()
PYEOF

# ------------------------------------------------------------------
# Optional PII redaction
# ------------------------------------------------------------------
if [ "$REDACT" = "1" ] && [ -x "$SCRIPT_DIR/redact-pii.py" ]; then
    python3 "$SCRIPT_DIR/redact-pii.py" "$MD_RAW" "$OUT"
else
    cp "$MD_RAW" "$OUT"
fi

echo "[transcribe] Done: $OUT" >&2
