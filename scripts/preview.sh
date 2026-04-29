#!/bin/bash
# AdvoVisions — Mac local preview launcher
# Usage:  bash <(curl -sL https://raw.githubusercontent.com/shomayamamoto-ai/lumenium-app/claude/company-homepage-design-m2cXU/scripts/preview.sh)
#
# Downloads the latest deployed gh-pages branch into /tmp/advo-fresh,
# spins up a local HTTP server on port 8765, and opens it in the
# default browser. Bypasses every browser/CDN/SW cache layer.

set -e

PORT=8765
DIR=/tmp/advo-fresh
URL="http://localhost:$PORT/"
TARBALL="https://github.com/shomayamamoto-ai/lumenium-app/archive/refs/heads/gh-pages.tar.gz"

echo ""
echo "=========================================="
echo "  AdvoVisions  —  Local Preview Launcher  "
echo "=========================================="
echo ""

# 1) Free the port if something is on it
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "[1/4] Releasing port $PORT (was used by PID $PIDS)…"
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
  else
    echo "[1/4] Port $PORT is free."
  fi
fi

# 2) Fresh download
echo "[2/4] Downloading latest production build from gh-pages…"
rm -rf "$DIR"
mkdir -p "$DIR"
cd "$DIR"
curl -sL "$TARBALL" | tar -xz --strip-components=1

# 3) Sanity check — show key files and key counts
echo ""
echo "[3/4] Verifying deployed content…"
echo "      about.html          : $([ -f about.html ] && wc -c < about.html || echo MISSING) bytes"
echo "      Filmography hits    : $(grep -c "ぞくり\|ゆとりフォーム\|CH.UNKNOWN\|バズ酒場\|頂上めし\|全ラ飯\|おひとり様" about.html 2>/dev/null || echo 0)"
echo "      Talents (data-count): $(grep -o "data-count=\"[0-9]*\"" index.html | head -1)"
echo "      CSS version         : $(grep -o "style.css?v=[0-9]*" index.html | head -1)"

# 4) Start server and open browser
echo ""
echo "[4/4] Starting local server on port $PORT…"
python3 -m http.server $PORT >/dev/null 2>&1 &
SERVER_PID=$!
sleep 1

if [ -f /usr/bin/open ] || command -v open >/dev/null 2>&1; then
  open "$URL"
fi

echo ""
echo "=========================================="
echo "  ✓ Ready at $URL"
echo "    Server PID: $SERVER_PID"
echo ""
echo "  To stop the server:"
echo "    lsof -ti:$PORT | xargs kill -9"
echo "=========================================="
echo ""
