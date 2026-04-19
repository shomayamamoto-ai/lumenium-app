#!/usr/bin/env bash
# video-subtitle pipeline:
#   ffmpeg(extract+loudnorm) -> faster-whisper(+VAD) -> clean SRT -> (optional) burn-in
# See .claude/skills/video-subtitle/SKILL.md for usage.

set -euo pipefail

LANG_CODE="ja"
MODEL="medium"
BURN=1
PREVIEW=0
NORMALIZE=1
case "$(uname -s)" in
  Darwin) FONT="Hiragino Sans" ;;
  *)      FONT="Noto Sans CJK JP" ;;
esac
FONTSIZE=0  # 0 = auto from video height
OUT_DIR=""
INPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang) LANG_CODE="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --no-burn) BURN=0; shift ;;
    --preview) PREVIEW=1; shift ;;
    --no-normalize) NORMALIZE=0; shift ;;
    --font) FONT="$2"; shift 2 ;;
    --fontsize) FONTSIZE="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,50p' "$(dirname "$0")/../../.claude/skills/video-subtitle/SKILL.md"
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
  cat >&2 <<'USAGE'
usage: run.sh <input-video> [options]
  --lang <code>        ja|en|... (default ja)
  --model <name>       tiny|base|small|medium|large-v3 (default medium)
  --preview            use tiny model + skip burn, for a fast text pass
  --no-burn            emit cleaned .srt only; skip burn-in
  --no-normalize       skip loudnorm audio pre-processing
  --font <name>        burn-in font family
  --fontsize <n>       burn-in font size (0 = auto from video height)
  --out <dir>          output directory (default: input dir)
USAGE
  exit 2
fi

if [[ ! -f "$INPUT" ]]; then
  echo "input not found: $INPUT" >&2; exit 1
fi

if [[ "$PREVIEW" -eq 1 ]]; then
  MODEL="tiny"
  BURN=0
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"

# Bootstrap missing deps once; idempotent.
need_bootstrap=0
for bin in ffmpeg ffprobe; do
  command -v "$bin" >/dev/null 2>&1 || need_bootstrap=1
done
python3 -c "import faster_whisper" >/dev/null 2>&1 || need_bootstrap=1
if [[ "$need_bootstrap" -eq 1 ]]; then
  echo "[0/5] bootstrapping dependencies"
  bash "$script_dir/bootstrap.sh"
fi

abs_input="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
base="$(basename "${INPUT%.*}")"
dir="${OUT_DIR:-$(dirname "$abs_input")}"
mkdir -p "$dir"

wav="$dir/$base.wav"
raw_srt="$dir/$base.raw.srt"
clean_srt="$dir/$base.srt"
out_mp4="$dir/$base.subtitled.mp4"

echo "[1/5] extracting + normalising audio -> $wav"
if [[ ! -f "$wav" ]]; then
  # High-pass removes rumble below 80 Hz; loudnorm targets -16 LUFS
  # (typical streaming target). Single-pass is slightly less accurate than
  # two-pass but cuts total runtime in half — "as fast as possible" wins.
  audio_filter="highpass=f=80"
  if [[ "$NORMALIZE" -eq 1 ]]; then
    audio_filter="$audio_filter,loudnorm=I=-16:LRA=11:TP=-1.5"
  fi
  ffmpeg -y -loglevel error -i "$abs_input" \
    -vn -ac 1 -ar 16000 -af "$audio_filter" -c:a pcm_s16le "$wav"
else
  echo "  (already exists, skipping — delete $wav to re-extract)"
fi

echo "[2/5] faster-whisper ($MODEL, lang=$LANG_CODE, VAD on) -> $raw_srt"
if [[ ! -f "$raw_srt" ]]; then
  python3 "$script_dir/transcribe.py" \
    --lang "$LANG_CODE" --model "$MODEL" "$wav" "$raw_srt"
else
  echo "  (already exists, skipping — delete $raw_srt to re-transcribe)"
fi

echo "[3/5] cleaning SRT -> $clean_srt"
python3 "$script_dir/clean_srt.py" --lang "$LANG_CODE" "$raw_srt" "$clean_srt"

if [[ "$BURN" -eq 0 ]]; then
  echo "[4/5] --no-burn specified, skipping burn-in"
  echo "[5/5] done. srt: $clean_srt"
  exit 0
fi

# Responsive font size: ~4% of video height. 1080p -> 43px, 720p -> 29px, 2160p -> 86px.
if [[ "$FONTSIZE" -eq 0 ]]; then
  vheight=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=height -of default=nw=1:nk=1 "$abs_input" 2>/dev/null || echo 1080)
  FONTSIZE=$(python3 -c "print(max(24, round(${vheight:-1080} * 0.04)))")
fi
# MarginV ~= fontsize so captions sit in the YouTube-safe area.
margin_v=$(( FONTSIZE ))

echo "[4/5] burning subtitles -> $out_mp4 (font=$FONT size=$FONTSIZE)"
# subtitles filter needs the path escaped for ffmpeg's filtergraph parser.
escaped_srt="$(printf '%s' "$clean_srt" | sed -e 's/:/\\:/g' -e "s/'/\\\\'/g")"
ffmpeg -y -loglevel error \
  -i "$abs_input" \
  -vf "subtitles='$escaped_srt':force_style='FontName=$FONT,FontSize=$FONTSIZE,Outline=3,Shadow=0,BorderStyle=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,MarginV=$margin_v,WrapStyle=2'" \
  -c:a copy \
  -movflags +faststart \
  "$out_mp4"

src_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$abs_input")
dst_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out_mp4")
diff=$(python3 -c "print(abs(float('$src_dur') - float('$dst_dur')))")
if python3 -c "import sys; sys.exit(0 if float('$diff') > 0.5 else 1)"; then
  echo "warning: duration mismatch src=${src_dur}s dst=${dst_dur}s (diff=${diff}s)" >&2
fi

echo "[5/5] done."
echo "  srt:       $clean_srt"
echo "  burned-in: $out_mp4"
