#!/usr/bin/env bash
# Persist bundle-history.txt to the `nightly-data` branch so section D has a
# stable historical baseline. This branch exists only to store append-only
# telemetry; it never merges into main.
set -euo pipefail

if [[ ! -f bundle-history.txt ]]; then
  echo "No bundle-history.txt to persist; skipping."
  exit 0
fi

BRANCH="nightly-data"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

git config user.name "nightly-bot"
git config user.email "nightly-bot@users.noreply.github.com"

REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"

git clone --depth=1 --branch "$BRANCH" --single-branch "$REMOTE_URL" "$WORK" 2>/dev/null || {
  echo "Branch $BRANCH does not exist yet; creating orphan branch."
  git clone --depth=1 "$REMOTE_URL" "$WORK"
  ( cd "$WORK" && git checkout --orphan "$BRANCH" && git rm -rf . >/dev/null 2>&1 || true )
}

cp bundle-history.txt "$WORK/bundle-history.txt"

cd "$WORK"
git add bundle-history.txt
if git diff --cached --quiet; then
  echo "No history changes to commit."
  exit 0
fi

git commit -m "nightly: append bundle size for $(date -u +%Y-%m-%d)"
git push origin "$BRANCH"
