#!/usr/bin/env bash
# Install everything video-subtitle/run.sh needs. Safe to re-run.
# Supported: Ubuntu/Debian (apt) and macOS (brew). Elsewhere: prints guidance.

set -euo pipefail

need_install=()
for bin in ffmpeg ffprobe; do
  command -v "$bin" >/dev/null 2>&1 || need_install+=("$bin")
done

have_fw=0
python3 -c "import faster_whisper" >/dev/null 2>&1 && have_fw=1

if [[ ${#need_install[@]} -eq 0 && $have_fw -eq 1 ]]; then
  echo "bootstrap: all dependencies already present"
  exit 0
fi

os="$(uname -s)"
case "$os" in
  Linux)
    if ! command -v apt-get >/dev/null 2>&1; then
      echo "bootstrap: apt-get not available; install ffmpeg + 'pip install faster-whisper' manually" >&2
      exit 1
    fi
    SUDO=""
    if [[ $EUID -ne 0 ]]; then
      if command -v sudo >/dev/null 2>&1; then SUDO="sudo"; else
        echo "bootstrap: need root or sudo to apt-get install" >&2; exit 1
      fi
    fi
    if [[ ${#need_install[@]} -gt 0 ]]; then
      echo "bootstrap: installing ffmpeg + fonts-noto-cjk via apt"
      $SUDO apt-get update -qq
      $SUDO apt-get install -y -qq ffmpeg fonts-noto-cjk
    fi
    ;;
  Darwin)
    if ! command -v brew >/dev/null 2>&1; then
      echo "bootstrap: Homebrew not found; install from https://brew.sh first" >&2
      exit 1
    fi
    if [[ ${#need_install[@]} -gt 0 ]]; then
      echo "bootstrap: installing ffmpeg via brew"
      brew install ffmpeg >/dev/null
    fi
    ;;
  *)
    echo "bootstrap: unsupported OS $os; install ffmpeg + 'pip install faster-whisper' manually" >&2
    exit 1 ;;
esac

if [[ $have_fw -eq 0 ]]; then
  echo "bootstrap: installing faster-whisper"
  # PEP 668: Ubuntu 24.04's system python is marked externally-managed.
  # Prefer pipx if available, else fall through with --break-system-packages.
  if command -v pipx >/dev/null 2>&1; then
    pipx install --include-deps faster-whisper >/dev/null 2>&1 || \
      python3 -m pip install --user --break-system-packages faster-whisper
  else
    python3 -m pip install --user --break-system-packages faster-whisper
  fi
fi

echo "bootstrap: done"
