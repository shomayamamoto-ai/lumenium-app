#!/usr/bin/env bash
# video-subtitle pipeline: ffmpeg -> whisper -> clean srt -> (optional) burn-in
# See .claude/skills/video-subtitle/SKILL.md for usage.

set -euo pipefail

LANG_CODE="ja"
MODEL="medium"
BURN=1
FONT="Hiragino Sans"
FONTSIZE=42
OUT_DIR=""
INPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang) LANG_CODE="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --no-burn) BURN=0; shift ;;
    --font) FONT="$2"; shift 2 ;;
    --fontsize) FONTSIZE="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,40p' "$(dirname "$0")/../../.claude/skills/video-subtitle/SKILL.md"
      exit 0 ;;
    -*)
      echo "unknown option: $1" >&2; exit 2 ;;
    *)
      if [[ -z "$INPUT" ]]; then INPUT="$1"; else
        echo "multiple inputs not supported: $1" >&2; exit 2
      fi
      shift ;;
  esac
done

if [[ -z "$INPUT" ]]; then
  echo "usage: run.sh <input-video> [--lang ja] [--model medium] [--no-burn] [--font ...] [--fontsize 42] [--out dir]" >&2
  exit 2
fi

if [[ ! -f "$INPUT" ]]; then
  echo "input not found: $INPUT" >&2; exit 1
fi

for bin in ffmpeg ffprobe whisper python3; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "required binary missing: $bin" >&2
    exit 127
  fi
done

abs_input="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
base="$(basename "${INPUT%.*}")"
dir="${OUT_DIR:-$(dirname "$abs_input")}"
mkdir -p "$dir"

wav="$dir/$base.wav"
raw_srt="$dir/$base.raw.srt"
clean_srt="$dir/$base.srt"
out_mp4="$dir/$base.subtitled.mp4"

script_dir="$(cd "$(dirname "$0")" && pwd)"

echo "[1/4] extracting audio -> $wav"
if [[ ! -f "$wav" ]]; then
  ffmpeg -y -loglevel error -i "$abs_input" -vn -ac 1 -ar 16000 -c:a pcm_s16le "$wav"
else
  echo "  (already exists, skipping)"
fi

echo "[2/4] whisper ($MODEL, lang=$LANG_CODE) -> $raw_srt"
if [[ ! -f "$raw_srt" ]]; then
  tmp_out="$(mktemp -d)"
  whisper "$wav" \
    --model "$MODEL" \
    --language "$LANG_CODE" \
    --output_format srt \
    --output_dir "$tmp_out" \
    --verbose False
  mv "$tmp_out/$base.srt" "$raw_srt"
  rm -rf "$tmp_out"
else
  echo "  (already exists, skipping - delete $raw_srt to re-run)"
fi

echo "[3/4] cleaning SRT -> $clean_srt"
python3 "$script_dir/clean_srt.py" --lang "$LANG_CODE" "$raw_srt" "$clean_srt"

if [[ "$BURN" -eq 0 ]]; then
  echo "[4/4] --no-burn specified, skipping burn-in"
  echo "done. srt: $clean_srt"
  exit 0
fi

echo "[4/4] burning subtitles -> $out_mp4"
# subtitles filter needs the path relative-escaped; use absolute with escaped colon on macOS/Linux
escaped_srt="$(printf '%s' "$clean_srt" | sed -e 's/:/\\:/g' -e "s/'/\\\\'/g")"
ffmpeg -y -loglevel error \
  -i "$abs_input" \
  -vf "subtitles='$escaped_srt':force_style='FontName=$FONT,FontSize=$FONTSIZE,Outline=2,Shadow=0,BorderStyle=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000'" \
  -c:a copy \
  "$out_mp4"

src_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$abs_input")
dst_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out_mp4")
diff=$(python3 -c "print(abs(float('$src_dur') - float('$dst_dur')))")
if python3 -c "import sys; sys.exit(0 if float('$diff') > 0.5 else 1)"; then
  echo "warning: duration mismatch src=${src_dur}s dst=${dst_dur}s (diff=${diff}s)" >&2
fi

echo "done."
echo "  srt:       $clean_srt"
echo "  burned-in: $out_mp4"
