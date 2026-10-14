#!/bin/bash
# Waits for the performer's beat recordings, then splits them into lines and converts the chosen takes.
#
#   scripts/takes-overnight.sh fifteen-days [~/snowmoon-takes/full] [quiet-minutes]
#
# Starts once beat-<n> files are in the folder and none has changed for quiet-minutes (default 30),
# so a recording still being copied isn't read half-written. Split: scripts/split-takes.py (Whisper,
# local). Convert: scripts/convert-voice.py --batch (Chatterbox, local, CPU). Raw takes stay in the
# folder, outside the repository; converted lines go to scenes-out/<seed>/lines/ (gitignored).
# The log, with every flag, is <folder>/takes/overnight.log.
set -euo pipefail
SEED=${1:?seed}
DIR=${2:-$HOME/snowmoon-takes/full}
QUIET=${3:-30}
ROOT=$(cd "$(dirname "$0")/.." && pwd)
PY=/Users/nathan/snowmoon/.venv-voice/bin/python
TEST=${STAND_IN:+--stand-in}  # STAND_IN=1 for a test with synthetic voices
mkdir -p "$DIR"
until ls "$DIR"/beat-* >/dev/null 2>&1 && [ -z "$(find "$DIR" -maxdepth 1 -name 'beat-*' -mmin -"$QUIET")" ]; do sleep 60; done
mkdir -p "$DIR/takes"
LOG="$DIR/takes/overnight.log"
{
  echo "== $(date) split"
  cd "$ROOT"
  python3 scripts/recording-sheet.py "$SEED"
  "$PY" scripts/split-takes.py "$SEED" --dir "$DIR" $TEST
  echo "== $(date) convert"
  "$PY" scripts/convert-voice.py "$SEED" --batch "$DIR/takes/jobs.json" $TEST 2>&1 | grep -v -i "warn\|deprecat"
  echo "== $(date) done"
} > "$LOG" 2>&1
grep -E "^FLAG|lines matched|^\[[0-9]+/[0-9]+\]|^== " "$LOG" | grep -v "^\[" ; grep -c "^\[" "$LOG" | sed 's/$/ lines converted/'
