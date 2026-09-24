#!/usr/bin/env bash
# Start frontend and backend dev servers together. Ctrl+C stops both.
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"

for dir in backend frontend; do
  if [ ! -d "$ROOT/$dir/node_modules" ]; then
    echo "Installing $dir dependencies..."
    (cd "$ROOT/$dir" && npm install)
  fi
done

trap 'kill 0' EXIT

(cd "$ROOT/backend" && npm run dev) &
(cd "$ROOT/frontend" && npm run dev) &

wait
