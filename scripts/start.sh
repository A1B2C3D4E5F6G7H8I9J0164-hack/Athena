#!/usr/bin/env bash
# Start Athena backend + frontend dev servers
set -e
cd "$(dirname "$0")/.."

echo "Starting Athena API on :8000..."
source .venv/bin/activate 2>/dev/null || true
athena-serve &
API_PID=$!

echo "Starting Athena UI on :5173..."
cd frontend && npm run dev &
UI_PID=$!

trap "kill $API_PID $UI_PID 2>/dev/null" EXIT
echo "Athena running — API: http://localhost:8000  UI: http://localhost:5173"
wait
