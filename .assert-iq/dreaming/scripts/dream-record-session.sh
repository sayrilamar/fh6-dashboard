#!/bin/bash
# Waking loop (session end): increment the session counter and append a
# one-line, dated note to today's daily log. Never blocks the agent.
set +e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/dream-utils.sh
. "$SCRIPT_DIR/lib/dream-utils.sh"

trap 'aiq_emit_continue' EXIT
aiq_enabled || exit 0

aiq_read_stdin RAW
SID="$(aiq_session_id "$RAW")"
TRANSCRIPT="$(aiq_transcript_path "$RAW")"

aiq_with_state_lock '
import json
try:
    st = json.load(open(state_path))
except Exception:
    st = {"last_dream_utc": None, "sessions_since_dream": 0}
st["sessions_since_dream"] = int(st.get("sessions_since_dream", 0)) + 1
json.dump(st, open(state_path, "w"), indent=2)
'

DAY="$(date -u +%F)"; Y="$(date -u +%Y)"; M="$(date -u +%m)"
LOGDIR="$AIQ_MEMORY_DIR/logs/$Y/$M"; LOGFILE="$LOGDIR/$DAY.md"
mkdir -p "$LOGDIR" 2>/dev/null
[ -f "$LOGFILE" ] || printf '# Daily log %s\n\n' "$DAY" > "$LOGFILE"
if [ -n "$TRANSCRIPT" ]; then
  printf -- '- %sZ session %s ended (transcript: %s)\n' "$(date -u +%FT%T)" "$SID" "$TRANSCRIPT" >> "$LOGFILE"
else
  printf -- '- %sZ session %s ended\n' "$(date -u +%FT%T)" "$SID" >> "$LOGFILE"
fi
exit 0
