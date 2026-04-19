#!/usr/bin/env bash
# video-subtitle pipeline (quality-first):
#   ffmpeg extract -> 2-pass loudnorm -> faster-whisper (full precision, VAD,
#   word timestamps) -> clean SRT -> visually-lossless burn-in
# See .claude/skills/video-subtitle/SKILL.md for usage.

set -euo pipefail

LANG_CODE="ja"
MODEL="large-v3"      # best Japanese accuracy available in faster-whisper
BEAM=10
BURN=1
PREVIEW=0
NORMALIZE=1
PROMPT=""
CRF=17                # visually lossless range for libx264
PRESET="slow"         # better compression at same visual quality
case "$(uname -s)" in
  Darwin) FONT="Hiragino Sans" ;;
  *)      FONT="Noto Sans CJK JP" ;;
esac
FONTSIZE=0            # 0 = auto from video height
OUT_DIR=""
INPUT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lang) LANG_CODE="$2"; shift 2 ;;
    --model) MODEL="$2"; shift 2 ;;
    --beam) BEAM="$2"; shift 2 ;;
    --no-burn) BURN=0; shift ;;
    --preview) PREVIEW=1; shift ;;
    --no-normalize) NORMALIZE=0; shift ;;
    --prompt) PROMPT="$2"; shift 2 ;;
    --crf) CRF="$2"; shift 2 ;;
    --preset) PRESET="$2"; shift 2 ;;
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
  --model <name>       tiny|base|small|medium|large-v3 (default large-v3)
  --beam <n>           beam_size for Whisper (default 10)
  --prompt <text>      initial_prompt — nudge vocabulary toward given terms
  --preview            tiny model + skip burn, for a fast text pass
  --no-burn            emit cleaned .srt only; skip burn-in
  --no-normalize       skip 2-pass loudnorm audio pre-processing
  --crf <n>            libx264 CRF for burn-in (default 17 = visually lossless)
  --preset <name>      libx264 preset (default slow)
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
  # Preview is explicitly the "just verify the text" mode; we acknowledge
  # the quality trade and keep it opt-in only.
  MODEL="tiny"
  BEAM=5
  BURN=0
  NORMALIZE=0
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

raw_wav="$dir/$base.raw.wav"
wav="$dir/$base.wav"
raw_srt="$dir/$base.raw.srt"
clean_srt_out="$dir/$base.srt"
out_mp4="$dir/$base.subtitled.mp4"

echo "[1/5] extracting audio -> $raw_wav"
if [[ ! -f "$raw_wav" ]]; then
  ffmpeg -y -loglevel error -i "$abs_input" \
    -vn -ac 1 -ar 16000 -af "highpass=f=80" -c:a pcm_s16le "$raw_wav"
else
  echo "  (already exists, skipping — delete $raw_wav to re-extract)"
fi

echo "[2/5] loudness normalisation -> $wav"
if [[ ! -f "$wav" ]]; then
  if [[ "$NORMALIZE" -eq 1 ]]; then
    echo "  pass 1/2: measuring integrated loudness"
    measure_json=$(ffmpeg -hide_banner -nostats -i "$raw_wav" \
      -af "loudnorm=I=-16:LRA=11:TP=-1.5:print_format=json" \
      -f null - 2>&1 | awk '/^\{$/,/^\}$/')
    if [[ -z "$measure_json" ]]; then
      echo "  loudnorm measurement failed; falling back to single-pass" >&2
      ffmpeg -y -loglevel error -i "$raw_wav" \
        -af "loudnorm=I=-16:LRA=11:TP=-1.5" \
        -ar 16000 -ac 1 -c:a pcm_s16le "$wav"
    else
      read measured_I measured_LRA measured_TP measured_thresh offset < <(
        python3 - "$measure_json" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
# "offset" can exceed ffmpeg's ±99 range; clamp defensively.
off = float(d.get("target_offset", 0.0))
off = max(min(off, 99.0), -99.0)
print(d["input_i"], d["input_lra"], d["input_tp"], d["input_thresh"], off)
PY
      )
      echo "  pass 2/2: applying measured=$measured_I LUFS -> target -16 LUFS"
      ffmpeg -y -loglevel error -i "$raw_wav" \
        -af "loudnorm=I=-16:LRA=11:TP=-1.5:\
measured_I=$measured_I:measured_LRA=$measured_LRA:\
measured_TP=$measured_TP:measured_thresh=$measured_thresh:\
offset=$offset:linear=true:print_format=summary" \
        -ar 16000 -ac 1 -c:a pcm_s16le "$wav"
    fi
  else
    # No normalisation — just copy through so downstream caching works uniformly.
    cp "$raw_wav" "$wav"
  fi
else
  echo "  (already exists, skipping — delete $wav to re-normalise)"
fi

echo "[3/5] faster-whisper ($MODEL, lang=$LANG_CODE, beam=$BEAM) -> $raw_srt"
if [[ ! -f "$raw_srt" ]]; then
  prompt_args=()
  if [[ -n "$PROMPT" ]]; then
    prompt_args=(--prompt "$PROMPT")
  fi
  python3 "$script_dir/transcribe.py" \
    --lang "$LANG_CODE" --model "$MODEL" --beam-size "$BEAM" \
    "${prompt_args[@]}" "$wav" "$raw_srt"
else
  echo "  (already exists, skipping — delete $raw_srt to re-transcribe)"
fi

echo "[4/5] cleaning SRT -> $clean_srt_out"
python3 "$script_dir/clean_srt.py" --lang "$LANG_CODE" "$raw_srt" "$clean_srt_out"

if [[ "$BURN" -eq 0 ]]; then
  echo "[5/5] --no-burn specified, skipping burn-in"
  echo "done. srt: $clean_srt_out"
  exit 0
fi

# Responsive font size: ~4% of video height. 1080p->43 / 720p->29 / 4K->86.
if [[ "$FONTSIZE" -eq 0 ]]; then
  vheight=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=height -of default=nw=1:nk=1 "$abs_input" 2>/dev/null || echo 1080)
  FONTSIZE=$(python3 -c "print(max(24, round(${vheight:-1080} * 0.04)))")
fi
margin_v=$(( FONTSIZE ))

echo "[5/5] burning subtitles -> $out_mp4 (font=$FONT size=$FONTSIZE crf=$CRF preset=$PRESET)"
# subtitles filter needs the path escaped for ffmpeg's filtergraph parser.
escaped_srt="$(printf '%s' "$clean_srt_out" | sed -e 's/:/\\:/g' -e "s/'/\\\\'/g")"
# -c:a copy preserves the original soundtrack bit-for-bit.
# Video is re-encoded (required for burn-in) at CRF 17 slow — visually
# lossless range; nothing is given up vs the source.
ffmpeg -y -loglevel error \
  -i "$abs_input" \
  -vf "subtitles='$escaped_srt':force_style='FontName=$FONT,FontSize=$FONTSIZE,Outline=3,Shadow=0,BorderStyle=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,MarginV=$margin_v,WrapStyle=2'" \
  -c:v libx264 -crf "$CRF" -preset "$PRESET" -pix_fmt yuv420p \
  -c:a copy \
  -movflags +faststart \
  "$out_mp4"

src_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$abs_input")
dst_dur=$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$out_mp4")
diff=$(python3 -c "print(abs(float('$src_dur') - float('$dst_dur')))")
if python3 -c "import sys; sys.exit(0 if float('$diff') > 0.5 else 1)"; then
  echo "warning: duration mismatch src=${src_dur}s dst=${dst_dur}s (diff=${diff}s)" >&2
fi

echo "done."
echo "  srt:       $clean_srt_out"
echo "  burned-in: $out_mp4"
