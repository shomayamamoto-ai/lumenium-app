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

RULE="--------------------------------------------------"

echo ""
echo "$RULE"
echo "  AdvoVisions  -  Instant Local Preview"
echo "  Source branch (no gh-pages wait)"
echo "$RULE"
echo ""

# 1) Free port
if command -v lsof >/dev/null 2>&1; then
  PIDS=$(lsof -ti:$PORT 2>/dev/null || true)
  if [ -n "$PIDS" ]; then
    echo "[1/4] Stopping previous server (PID $PIDS)..."
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
  else
    echo "[1/4] Port $PORT free."
  fi
fi

# 2) Fresh download from SOURCE branch (instant — no deploy wait)
echo "[2/4] Downloading source branch (latest commits)..."
rm -rf "$DIR"
mkdir -p "$DIR"
cd "$DIR"
curl -sL "$TARBALL" | tar -xz --strip-components=1

# 3) Quick verification
echo ""
echo "[3/4] Content check:"
printf "      %-15s : %s bytes\n" "about.html"   "$(wc -c < about.html 2>/dev/null)"
printf "      %-15s : %s hits\n"  "Filmography"  "$(grep -c "ぞくり\|CH.UNKNOWN\|全ラ飯\|おひとり様" about.html)"
printf "      %-15s : %s\n"       "Talents"     "$(grep -o "data-count=\"[0-9]*\"" index.html | head -1)"
printf "      %-15s : %s\n"       "CSS version" "$(grep -o "style.css?v=[0-9]*" index.html | head -1)"
printf "      %-15s : process=%s manifesto=%s faq=%s\n" "New sections" \
  "$(grep -c 'id="process"' index.html)" \
  "$(grep -c 'id="manifesto"' index.html)" \
  "$(grep -c 'id="faq"' index.html)"
printf "      %-15s : %s SNS URLs / talent\n" "Sample SNS" "$(grep -oc 'instagram\|tiktok\|youtube\|twitter' assets/js/members-data.js)"

# 4) Start server + open browser
echo ""
echo "[4/4] Starting server on port $PORT..."
python3 -m http.server $PORT >/dev/null 2>&1 &
sleep 1

if command -v open >/dev/null 2>&1; then
  open "$URL"
fi

echo ""
echo "$RULE"
echo "  Server running"
echo "  Open:       $URL"
echo ""
echo "  Stop later:"
echo "    lsof -ti:$PORT | xargs kill -9"
echo ""
echo "  Re-run this command anytime to fetch newest commits."
echo "$RULE"
echo ""
