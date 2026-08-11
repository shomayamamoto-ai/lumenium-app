#!/usr/bin/env bash
# video-subtitle full pipeline (quality-first):
#   ffmpeg extract -> 2-pass loudnorm -> faster-whisper (full precision, VAD,
#   word timestamps) -> clean SRT -> Claude proofread (cached glossary) ->
#   filler/stutter detection -> ffmpeg cuts (audio fades) -> visually-lossless
#   burn-in
#
# Every step's output is cached on disk; rerun the same command to resume,
# or delete a specific intermediate to force one stage to recompute.
# See .claude/skills/video-subtitle/SKILL.md for usage.

set -euo pipefail

LANG_CODE="ja"
MODEL="large-v3"
BEAM=10
BURN=1
PREVIEW=0
NORMALIZE=1
PROOFREAD=1
CUT=1
AGGRESSIVE_FILLERS=0
SILENCE_THRESHOLD=""
EXCLUDE_CUTS=()
PROMPT=""
GLOSSARY=""
CRF=17
PRESET="slow"
case "$(uname -s)" in
  Darwin) FONT="Hiragino Sans" ;;
  *)      FONT="Noto Sans CJK JP" ;;
esac
FONTSIZE=0
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
    --no-proofread) PROOFREAD=0; shift ;;
    --no-cut) CUT=0; shift ;;
    --aggressive-fillers) AGGRESSIVE_FILLERS=1; shift ;;
    --silence-threshold) SILENCE_THRESHOLD="$2"; shift 2 ;;
    --exclude-cut) EXCLUDE_CUTS+=("$2"); shift 2 ;;
    --prompt) PROMPT="$2"; shift 2 ;;
    --glossary) GLOSSARY="$2"; shift 2 ;;
    --crf) CRF="$2"; shift 2 ;;
    --preset) PRESET="$2"; shift 2 ;;
    --font) FONT="$2"; shift 2 ;;
    --fontsize) FONTSIZE="$2"; shift 2 ;;
    --out) OUT_DIR="$2"; shift 2 ;;
    -h|--help)
      sed -n '1,80p' "$(dirname "$0")/../../.claude/skills/video-subtitle/SKILL.md"
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
  --lang <code>             ja|en|... (default ja)
  --model <name>            tiny|base|small|medium|large-v3 (default large-v3)
  --beam <n>                beam_size for Whisper (default 10)
  --prompt <text>           initial_prompt for Whisper
  --glossary <path>         glossary file for Whisper + Claude (default: scripts/video-subtitle/glossary.txt)
  --no-proofread            skip Claude SRT proofreading step
  --no-cut                  skip filler/stutter detection and cutting
  --aggressive-fillers      include 'あの', 'まあ', 'なんか', 'ちょっと'
  --silence-threshold <n>   trim silences longer than N seconds (off by default)
  --exclude-cut START-END   protect a time range from being cut (repeatable)
  --preview                 tiny model + skip burn/loudnorm/cut/proofread (text preview)
  --no-burn                 emit cleaned/proofread SRT only; skip burn-in
  --no-normalize            skip 2-pass loudnorm
  --crf <n>                 libx264 CRF for burn-in (default 17 = visually lossless)
  --preset <name>           libx264 preset (default slow)
  --font <name>             burn-in font family
  --fontsize <n>            burn-in font size (0 = auto from video height)
  --out <dir>               output directory (default: input dir)
USAGE
  exit 2
fi

if [[ ! -f "$INPUT" ]]; then
  echo "input not found: $INPUT" >&2; exit 1
fi

if [[ "$PREVIEW" -eq 1 ]]; then
  MODEL="tiny"
  BEAM=5
  BURN=0
  NORMALIZE=0
  PROOFREAD=0
  CUT=0
fi

script_dir="$(cd "$(dirname "$0")" && pwd)"
[[ -z "$GLOSSARY" ]] && GLOSSARY="$script_dir/glossary.txt"

# Bootstrap once.
need_bootstrap=0
for bin in ffmpeg ffprobe; do
  command -v "$bin" >/dev/null 2>&1 || need_bootstrap=1
done
python3 -c "import faster_whisper" >/dev/null 2>&1 || need_bootstrap=1
if [[ "$PROOFREAD" -eq 1 ]]; then
  python3 -c "import anthropic, pydantic" >/dev/null 2>&1 || need_bootstrap=1
fi
if [[ "$need_bootstrap" -eq 1 ]]; then
  echo "[0/8] bootstrapping dependencies"
  bash "$script_dir/bootstrap.sh"
fi

abs_input="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
base="$(basename "${INPUT%.*}")"
dir="${OUT_DIR:-$(dirname "$abs_input")}"
mkdir -p "$dir"

raw_wav="$dir/$base.raw.wav"
wav="$dir/$base.wav"
raw_srt="$dir/$base.raw.srt"
words_json="$dir/$base.words.json"
clean_srt_out="$dir/$base.clean.srt"
proofread_srt="$dir/$base.proofread.srt"
proofread_diff="$dir/$base.proofread.diff"
final_srt="$dir/$base.srt"           # final pre-cut SRT (proofread or clean)
cuts_json="$dir/$base.cuts.json"
review_md="$dir/$base.review.md"
cut_video="$dir/$base.cut.mp4"
cut_srt="$dir/$base.cut.srt"
out_mp4="$dir/$base.subtitled.mp4"

# If a glossary is configured, prepend its content to the Whisper prompt
# so terminology lands right at recognition time, before proofread fixes it.
prompt_text="$PROMPT"
if [[ -f "$GLOSSARY" ]]; then
  glossary_terms="$(grep -v '^#' "$GLOSSARY" | grep -v '^[[:space:]]*$' | tr '\n' ' ')"
  if [[ -n "$prompt_text" ]]; then
    prompt_text="$prompt_text $glossary_terms"
  else
    prompt_text="$glossary_terms"
  fi
fi

# ────────────────── [1] extract audio ──────────────────
echo "[1/8] extracting audio -> $raw_wav"
if [[ ! -f "$raw_wav" ]]; then
  ffmpeg -y -loglevel error -i "$abs_input" \
    -vn -ac 1 -ar 16000 -af "highpass=f=80" -c:a pcm_s16le "$raw_wav"
else
  echo "  (cached, skipping)"
fi

# ────────────────── [2] loudness normalisation ──────────────────
echo "[2/8] loudness normalisation -> $wav"
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
    cp "$raw_wav" "$wav"
  fi
else
  echo "  (cached, skipping)"
fi

# ────────────────── [3] faster-whisper ──────────────────
echo "[3/8] faster-whisper ($MODEL, lang=$LANG_CODE, beam=$BEAM) -> $raw_srt + $words_json"
if [[ ! -f "$raw_srt" || ! -f "$words_json" ]]; then
  prompt_args=()
  [[ -n "$prompt_text" ]] && prompt_args=(--prompt "$prompt_text")
  python3 "$script_dir/transcribe.py" \
    --lang "$LANG_CODE" --model "$MODEL" --beam-size "$BEAM" \
    --words-json "$words_json" \
    "${prompt_args[@]}" "$wav" "$raw_srt"
else
  echo "  (cached, skipping)"
fi

# ────────────────── [4] cleaner ──────────────────
echo "[4/8] cleaning SRT -> $clean_srt_out"
python3 "$script_dir/clean_srt.py" --lang "$LANG_CODE" "$raw_srt" "$clean_srt_out"

# ────────────────── [5] Claude proofread ──────────────────
if [[ "$PROOFREAD" -eq 1 ]]; then
  echo "[5/8] Claude proofread -> $proofread_srt"
  if [[ ! -f "$proofread_srt" ]]; then
    python3 "$script_dir/proofread.py" \
      --glossary "$GLOSSARY" \
      --diff "$proofread_diff" \
      "$clean_srt_out" "$proofread_srt"
  else
    echo "  (cached, skipping — delete $proofread_srt to re-run)"
  fi
  cp "$proofread_srt" "$final_srt"
else
  echo "[5/8] proofread disabled, copying clean -> final"
  cp "$clean_srt_out" "$final_srt"
fi

# ────────────────── [6] filler / stutter detection ──────────────────
if [[ "$CUT" -eq 1 ]]; then
  echo "[6/8] filler/stutter detection -> $cuts_json"
  detect_args=("$words_json" "$cuts_json")
  [[ "$AGGRESSIVE_FILLERS" -eq 1 ]] && detect_args+=(--aggressive)
  [[ -n "$SILENCE_THRESHOLD" ]] && detect_args+=(--silence-threshold "$SILENCE_THRESHOLD")
  for ex in "${EXCLUDE_CUTS[@]}"; do
    detect_args+=(--exclude "$ex")
  done
  python3 "$script_dir/detect_fillers.py" "${detect_args[@]}"
else
  echo "[6/8] cuts disabled, no cuts.json generated"
  echo '{"cuts":[],"summary":{"total":0,"filler":0,"stutter":0,"long_silence":0,"total_duration_seconds":0}}' \
    > "$cuts_json"
fi

# ────────────────── [7] apply cuts ──────────────────
if [[ "$CUT" -eq 1 ]] && python3 -c "
import json, sys
sys.exit(0 if json.load(open('$cuts_json'))['cuts'] else 1)
" 2>/dev/null; then
  echo "[7/8] applying cuts -> $cut_video + $cut_srt"
  python3 "$script_dir/apply_cuts.py" \
    --crf "$CRF" --preset "$PRESET" --review-md "$review_md" \
    "$abs_input" "$final_srt" "$cuts_json" "$cut_video" "$cut_srt"
  burn_video="$cut_video"
  burn_srt="$cut_srt"
else
  echo "[7/8] no cuts to apply, using original video + SRT for burn-in"
  burn_video="$abs_input"
  burn_srt="$final_srt"
fi

if [[ "$BURN" -eq 0 ]]; then
  echo "[8/8] --no-burn specified, skipping burn-in"
  echo
  echo "outputs:"
  echo "  srt:   $final_srt"
  [[ "$CUT" -eq 1 ]] && echo "  cuts: $cuts_json"
  [[ -f "$review_md" ]] && echo "  review: $review_md"
  [[ -f "$cut_srt" ]] && echo "  cut srt: $cut_srt"
  [[ -f "$proofread_diff" ]] && echo "  diff:  $proofread_diff"
  exit 0
fi

# ────────────────── [8] burn-in ──────────────────
if [[ "$FONTSIZE" -eq 0 ]]; then
  vheight=$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=height -of default=nw=1:nk=1 "$burn_video" 2>/dev/null || echo 1080)
  FONTSIZE=$(python3 -c "print(max(24, round(${vheight:-1080} * 0.04)))")
fi
margin_v=$(( FONTSIZE ))

echo "[8/8] burning subtitles -> $out_mp4 (font=$FONT size=$FONTSIZE crf=$CRF preset=$PRESET)"
escaped_srt="$(printf '%s' "$burn_srt" | sed -e 's/:/\\:/g' -e "s/'/\\\\'/g")"
ffmpeg -y -loglevel error \
  -i "$burn_video" \
  -vf "subtitles='$escaped_srt':force_style='FontName=$FONT,FontSize=$FONTSIZE,Outline=3,Shadow=0,BorderStyle=1,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,MarginV=$margin_v,WrapStyle=2'" \
  -c:v libx264 -crf "$CRF" -preset "$PRESET" -pix_fmt yuv420p \
  -c:a copy \
  -movflags +faststart \
  "$out_mp4"

echo
echo "done."
echo "outputs:"
echo "  srt:           $final_srt"
[[ -f "$proofread_diff" ]] && echo "  proofread diff: $proofread_diff"
[[ -f "$cuts_json" ]] && echo "  cuts:          $cuts_json"
[[ -f "$review_md" ]] && echo "  review:        $review_md"
[[ -f "$cut_video" ]] && echo "  cut video:     $cut_video"
[[ -f "$cut_srt" ]] && echo "  cut srt:       $cut_srt"
echo "  burned-in:     $out_mp4"
