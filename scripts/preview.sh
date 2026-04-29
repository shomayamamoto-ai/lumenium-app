#!/bin/bash
# AdvoVisions — Mac local preview (INSTANT version)
# Pulls source branch directly — no waiting for gh-pages CDN.
#
# Usage from Mac terminal:
#   bash <(curl -sL https://raw.githubusercontent.com/shomayamamoto-ai/lumenium-app/claude/company-homepage-design-m2cXU/scripts/preview.sh)

set -e

PORT=8765
DIR=/tmp/advo-fresh
URL="http://localhost:$PORT/"
BRANCH="claude/company-homepage-design-m2cXU"
TARBALL="https://github.com/shomayamamoto-ai/lumenium-app/archive/refs/heads/${BRANCH}.tar.gz"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  AdvoVisions  —  Instant Local Preview   ║"
echo "║  Source branch (no gh-pages wait)         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1) Free port
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
  [ -n "$PIDS" ] && echo "[1/4] Stopping previous server (PID $PIDS)…" && (echo "$PIDS" | xargs kill -9 2>/dev/null || true) || echo "[1/4] Port $PORT free."
fi

# 2) Fresh download from SOURCE branch (instant — no deploy wait)
echo "[2/4] Downloading source branch (latest commits)…"
rm -rf "$DIR"
mkdir -p "$DIR"
cd "$DIR"
curl -sL "$TARBALL" | tar -xz --strip-components=1

# 3) Quick verification
echo ""
echo "[3/4] Content check:"
echo "      about.html   : $(wc -c < about.html 2>/dev/null) bytes"
echo "      Filmography  : $(grep -c "ぞくり\|ゆとりフォーム\|CH.UNKNOWN\|バズ酒場\|頂上めし\|全ラ飯\|おひとり様" about.html) hits"
echo "      Talents      : $(grep -o "data-count=\"[0-9]*\"" index.html | head -1)"
echo "      Distribution : $(grep -o "SEQ=\[[^]]\{0,30\}" assets/js/members-data.js | head -1)..."
echo "      CSS version  : $(grep -o "style.css?v=[0-9]*" index.html | head -1)"

# 4) Start server + open browser
echo ""
echo "[4/4] Starting server on port $PORT…"
python3 -m http.server $PORT >/dev/null 2>&1 &
sleep 1

# Open in default browser (Mac)
if command -v open >/dev/null 2>&1; then
  open "$URL"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║  ✓ Open: $URL"
echo "║                                          ║"
echo "║  Stop server later:                       ║"
echo "║    lsof -ti:$PORT | xargs kill -9          ║"
echo "║                                          ║"
echo "║  Re-run anytime to fetch newest commits   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
