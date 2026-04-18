#!/bin/bash
# Weekly FMP data refresh, triggered by cron on the DigitalOcean VM.
#
# Runs `npm run scrape` which pulls fresh data from the Financial Modeling Prep
# API, writes `data/companies.json`, and uploads the JSON to Vercel Blob so that
# production reads pick it up on the next cache expiry.
#
# Required env (from .env.local): FMP_API_KEY, BLOB_READ_WRITE_TOKEN.
# Required on PATH: node, npm.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

set -a
# shellcheck source=/dev/null
source "$PROJECT_DIR/.env.local"
set +a

LOG_FILE="$PROJECT_DIR/scripts/refresh.log"

echo "[$(date -u +%FT%TZ)] refresh: starting" >> "$LOG_FILE"

# Self-sync with main so scraper edits propagate without manual SSH.
# Non-fatal: on pull failure, proceed with the current checkout.
if git pull --ff-only origin main >> "$LOG_FILE" 2>&1; then
  echo "[$(date -u +%FT%TZ)] refresh: git pull OK at $(git rev-parse --short HEAD)" >> "$LOG_FILE"
else
  echo "[$(date -u +%FT%TZ)] refresh: git pull FAILED at $(git rev-parse --short HEAD); proceeding" >> "$LOG_FILE"
fi

npm run scrape >> "$LOG_FILE" 2>&1

echo "[$(date -u +%FT%TZ)] refresh: done" >> "$LOG_FILE"
