#!/bin/bash
# Idempotently install/update the companiesmarketcap cron entry into the current
# user's crontab, WITHOUT disturbing other projects' entries. The Hetzner VM's
# crontab is shared (e.g. with foliotracker), so we manage only the block
# delimited by the markers below: strip any prior copy of that block, then append
# the fragment from scripts/crontab. Safe to re-run; run it after editing
# scripts/crontab to apply the change on the VM.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRAGMENT="$SCRIPT_DIR/crontab"
BEGIN='# >>> companiesmarketcap (managed by scripts/install-cron.sh) >>>'
END='# <<< companiesmarketcap (managed by scripts/install-cron.sh) <<<'

if [ ! -f "$FRAGMENT" ]; then
  echo "error: $FRAGMENT not found" >&2
  exit 1
fi

# Read the live crontab (empty if none yet) and drop our entry, preserving every
# other line (other projects' jobs, blank lines, comments). We remove three
# things so first-time migration from a hand-written entry is also clean:
#   1. any prior managed block (between the markers),
#   2. a legacy bare job line referencing this project's refresh.sh,
#   3. a legacy comment line mentioning companiesmarketcap.
existing="$(crontab -l 2>/dev/null || true)"
cleaned="$(printf '%s\n' "$existing" | awk -v b="$BEGIN" -v e="$END" '
  $0==b {skip=1; next}
  $0==e {skip=0; next}
  skip {next}
  index($0, "companiesmarketcap/scripts/refresh.sh") {next}
  /^[[:space:]]*#/ && index($0, "companiesmarketcap") {next}
  {print}
')"

# Append only the managed block from the fragment (the leading human-readable
# header comments are skipped — they live in the file for editors, not the crontab).
block="$(awk -v b="$BEGIN" -v e="$END" '
  $0==b {keep=1}
  keep {print}
  $0==e {keep=0}
' "$FRAGMENT")"

if [ -z "$block" ]; then
  echo "error: managed block markers not found in $FRAGMENT" >&2
  exit 1
fi

printf '%s\n%s\n' "$cleaned" "$block" | cat -s | crontab -

echo "✓ companiesmarketcap cron entry installed/updated. Current crontab:"
crontab -l
