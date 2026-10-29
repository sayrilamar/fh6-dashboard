#!/bin/bash
# Session start: if the dual gate is met (>= min_hours AND >= min_sessions
# since the last dream), surface a nudge to run /dream. Never blocks.
set +e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/dream-utils.sh
. "$SCRIPT_DIR/lib/dream-utils.sh"

trap 'aiq_emit_continue' EXIT
aiq_enabled || exit 0

MINH="$(aiq_gate_min_hours)"; MINS="$(aiq_gate_min_sessions)"
if ! aiq_resolve_python; then
  aiq_breadcrumb "dream-gate: no working python3 (tried python3, python, py -3); gate skipped"
  exit 0
fi
NUDGE="$($AIQ_PY - "$AIQ_DREAM_STATE" "$MINH" "$MINS" <<'PY' 2>/dev/null
import json, sys
from datetime import datetime, timezone, timedelta
state_path, min_h, min_s = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
try:
    st = json.load(open(state_path))
except Exception:
    st = {}
sessions = int(st.get("sessions_since_dream", 0))
last = st.get("last_dream_utc")
sessions_ok = sessions >= min_s
if last is None:
    time_ok = True
else:
    try:
        time_ok = (datetime.now(timezone.utc) - datetime.fromisoformat(last)) >= timedelta(hours=min_h)
    except Exception:
        time_ok = True
if sessions_ok and time_ok:
    print(f"Assert.IQ Dreaming: {sessions} sessions since the last consolidation "
          f"(gate: {min_s} sessions AND {min_h}h). Consider running /dream to consolidate memory.")
PY
)"

if [ -n "$NUDGE" ]; then
  $AIQ_PY -c "import json,sys; print(json.dumps({'continue':True,'systemMessage':sys.argv[1]}))" "$NUDGE"
  trap - EXIT
fi
exit 0
