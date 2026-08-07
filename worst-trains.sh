#!/usr/bin/env bash
set -euo pipefail

# Fetch performance profile and print the train with the worst on-time performance.
# Usage: ./worst-trains.sh [API_URL]

URLS=()
if [ -n "${1:-}" ]; then
  URLS=("${1}")
else
  # Probe candidate endpoints: PWA dev server, Wrangler dev server, fallback live deployment
  URLS=(
    "http://localhost:5173/api/performance"
    "http://localhost:8787/api/performance"
    "https://transit.rolandd.dev/api/performance"
  )
fi

DATA=""
SUCCESS_URL=""

for url in "${URLS[@]}"; do
  if DATA=$(curl -sS --fail --max-time 3 "${url}" 2>/dev/null); then
    SUCCESS_URL="${url}"
    break
  fi
done

if [ -z "${DATA}" ]; then
  echo "Error: Could not fetch /api/performance from any endpoint." >&2
  echo "Make sure your local dev server is running ('npm run dev'), or specify a URL: ./worst-trains.sh <URL>" >&2
  exit 1
fi

echo "Fetched performance data from ${SUCCESS_URL}:" >&2
echo "" >&2

echo "${DATA}" | jq '
  .trips
  | to_entries
  | map({
      train: .key,
      max_p50_delay_sec: ([.value.stops[].p50Delay] | max),
      max_p50_delay_min: ((([.value.stops[].p50Delay] | max) / 60 * 10) | round / 10),
      max_p90_delay_sec: ([.value.stops[].p90Delay] | max)
    })
  | sort_by(.max_p50_delay_sec)
  | reverse[:5]
'
