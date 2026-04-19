#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(pwd)}"

if [ -f package-lock.json ]; then
  npm install --no-audit --no-fund --prefer-offline
elif [ -f package.json ]; then
  npm install --no-audit --no-fund
fi

for f in scripts/nightly/run.mjs scripts/nightly/cleanup.mjs; do
  [ -f "$f" ] && node --check "$f"
done
