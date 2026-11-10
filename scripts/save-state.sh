#!/usr/bin/env bash
# Commits data/ in an instance repo and pushes it, surviving a concurrent push from another writer
# (the laptop app writes data/user-state.json; the daily run writes data/state.json and llm-cache.json).
set -euo pipefail

mkdir -p data
git config user.name "chaijobs"
git config user.email "chaijobs@users.noreply.github.com"
git add data/
if git diff --cached --quiet; then
  echo "save-state: nothing to save"
  exit 0
fi
git commit --quiet -m "chore: daily run $(date -u +%F)"

branch="$(git rev-parse --abbrev-ref HEAD)"
for attempt in 1 2 3; do
  # The writers touch different files, so the rebase is always clean.
  if git pull --rebase --quiet origin "$branch" && git push --quiet origin "HEAD:$branch"; then
    echo "save-state: pushed on attempt $attempt"
    exit 0
  fi
  sleep $((attempt * 5))
done
echo "save-state: push failed after 3 attempts" >&2
exit 1
