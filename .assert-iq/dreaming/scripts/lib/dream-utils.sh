#!/usr/bin/env bash
# Shared helpers for the Assert.IQ Dreaming waking loop (bash side).
# Sourced by dream-record-session.sh and dream-gate.sh; not run directly.

# Pack root is injected by session-events.template.json / .claude/settings.json
# (CLAUDE_PLUGIN_ROOT wins at runtime under Claude Code; the baked __PACK_ROOT__
# is the fallback for VS Code Copilot). Default to four levels up from this lib
# dir (…/.assert-iq/dreaming/scripts/lib → repo root).
if [ -z "${AIQ_PACK_ROOT:-}" ]; then
  AIQ_PACK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
fi
AIQ_MEMORY_DIR="${AIQ_MEMORY_DIR:-$AIQ_PACK_ROOT/.assert-iq/memory}"
AIQ_DREAM_STATE="$AIQ_MEMORY_DIR/.dream/state.json"
AIQ_DREAM_LOCK="$AIQ_MEMORY_DIR/.dream/state.lock"
# Overridable like AIQ_MEMORY_DIR above, so the gate can be exercised against
# a fixture config (unit-dreaming-gate.sh) instead of only the live one.
AIQ_CONFIG="${AIQ_CONFIG:-$AIQ_PACK_ROOT/.assert-iq/config.yaml}"
export AIQ_PACK_ROOT AIQ_MEMORY_DIR AIQ_DREAM_STATE AIQ_DREAM_LOCK AIQ_CONFIG

mkdir -p "$AIQ_MEMORY_DIR/.dream" "$AIQ_MEMORY_DIR/logs" 2>/dev/null

# Always emit continue so the agent is never blocked.
aiq_emit_continue() { echo '{"continue":true}'; }

# Resolve a working Python 3 into AIQ_PY. `python3` is not a reliable name:
# Windows ships a Microsoft Store STUB called python3 that resolves on PATH and
# then fails on invocation, and the python.org installer provides python.exe with
# no python3.exe at all. Probe by EXECUTING each candidate.
AIQ_PY=""
aiq_resolve_python() {
  [ -n "$AIQ_PY" ] && return 0
  local c
  for c in python3 python; do
    command -v "$c" >/dev/null 2>&1 || continue
    if "$c" -c 'import sys; sys.exit(0 if sys.version_info[0]==3 else 1)' >/dev/null 2>&1; then
      AIQ_PY="$c"; return 0
    fi
  done
  if command -v py >/dev/null 2>&1 && py -3 -c 'import sys' >/dev/null 2>&1; then
    AIQ_PY="py -3"; return 0
  fi
  return 1
}

# Leave a breadcrumb when the bash path cannot run. The original failure mode
# was a SILENT exit 0 that looked identical to success: dreaming appeared to
# work while writing nothing at all, for weeks. Never fail quietly again.
aiq_breadcrumb() {
  local msg="$1"
  local f="$AIQ_MEMORY_DIR/logs/dreaming-errors.log"
  mkdir -p "$(dirname "$f")" 2>/dev/null
  printf '%s %s
' "$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)" "$msg" >> "$f" 2>/dev/null
}

# Kill-switch (env) + dreaming.enabled in config (default true).
aiq_enabled() {
  [ "${AIQ_DREAMING_DISABLED:-0}" = "1" ] && return 1
  # Parsed with awk, not python. This gate previously ran a python3 snippet and
  # returned ITS exit status, so a missing or stubbed interpreter was
  # indistinguishable from `dreaming.enabled: false` -- the hook exited 0,
  # emitted {"continue":true}, and wrote nothing. awk is in POSIX and is present
  # everywhere bash is, so the gate now reflects config only.
  #
  # Semantics: look inside the top-level `dreaming:` block only, so an
  # `enabled:` key belonging to some other section cannot switch dreaming off.
  # Default is enabled (opt-out feature).
  [ -f "$AIQ_CONFIG" ] || return 0
  # Only the FIRST `enabled:` inside the block counts -- the same semantics the
  # previous python implementation had. The shipped config.yaml contains a
  # NESTED `enabled: false` for the optional background dreamer service, and a
  # match-any-depth rule reads that as "dreaming off" and disables the feature
  # for everyone. Verified by unit-dreaming-gate.sh.
  awk '
    /^dreaming:[[:space:]]*$/ { inblock = 1; next }
    inblock && /^[^[:space:]#]/ { inblock = 0 }
    inblock && !seen && match($0, /^[[:space:]]+enabled:[[:space:]]*(true|false)/) {
      seen = 1
      val = substr($0, RSTART, RLENGTH)
      if (val ~ /false$/) found = 1
    }
    END { exit (found ? 1 : 0) }
  ' "$AIQ_CONFIG" 2>/dev/null
}

# Gate values: env override wins, else best-effort read from config, else default.
aiq_gate_min_hours() {
  if [ -n "${AIQ_DREAM_MIN_HOURS:-}" ]; then printf '%s' "$AIQ_DREAM_MIN_HOURS"; return; fi
  local v; v=$(sed -n 's/.*min_hours_between_dreams:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$AIQ_CONFIG" 2>/dev/null | head -n1)
  printf '%s' "${v:-24}"
}
aiq_gate_min_sessions() {
  if [ -n "${AIQ_DREAM_MIN_SESSIONS:-}" ]; then printf '%s' "$AIQ_DREAM_MIN_SESSIONS"; return; fi
  local v; v=$(sed -n 's/.*min_sessions_between_dreams:[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$AIQ_CONFIG" 2>/dev/null | head -n1)
  printf '%s' "${v:-5}"
}

# Run python under an exclusive flock on the dream state lock.
aiq_with_state_lock() {
  local code="$1"
  if ! aiq_resolve_python; then
    aiq_breadcrumb "aiq_with_state_lock: no working python3 (tried python3, python, py -3); state not updated"
    return 1
  fi
  $AIQ_PY - "$AIQ_DREAM_STATE" "$AIQ_DREAM_LOCK" "$code" <<'PY'
import sys, os
# fcntl is POSIX-only. On Windows this bash path is not used (the installers
# wire Claude Code to the PowerShell handlers), but degrade to no locking rather
# than crashing if it ever is.
try:
    import fcntl
except ImportError:
    fcntl = None
state_path, lock_path, code = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(os.path.dirname(state_path), exist_ok=True)
_lf = open(lock_path, "a+")
if fcntl is not None:
    fcntl.flock(_lf.fileno(), fcntl.LOCK_EX)
exec(code, {"__name__": "__locked__", "state_path": state_path})
PY
}

# Read stdin envelope (Claude Code passes a JSON envelope; may be empty).
aiq_read_stdin() {
  local __var="$1"; local __data=""
  if [ ! -t 0 ]; then __data="$(cat 2>/dev/null)"; fi
  printf -v "$__var" '%s' "$__data"
}

aiq_session_id() {
  aiq_resolve_python || { printf 'unknown'; return 0; }
  $AIQ_PY -c "import json,sys
try: d=json.loads(sys.argv[1] or '{}'); print(d.get('session_id') or d.get('sessionId') or 'unknown')
except: print('unknown')" "$1" 2>/dev/null
}

aiq_transcript_path() {
  aiq_resolve_python || { printf ''; return 0; }
  $AIQ_PY -c "import json,sys
try: d=json.loads(sys.argv[1] or '{}'); print(d.get('transcript_path') or d.get('transcriptPath') or '')
except: print('')" "$1" 2>/dev/null
}
