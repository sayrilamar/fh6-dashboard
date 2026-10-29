# Recurring defect patterns

_Layer: Signal trustworthiness. Failure clusters seen more than once — check
these first when a symptom looks familiar._

## 1. Recommendation desync across surfaces (recurring, ≥3 occurrences)

The same tuning recommendation is rendered in **three** places, and they drift
out of sync with each other:

1. the **"Next Change" headline** at the top of the tuning report,
2. the per-section body of the tuning report
   (e.g. "Braking — pressure & balance"),
3. the **"Confirm the tune on the car" popup** shown when recording starts.

Observed instances, all 2026-08-28: rear accel lock stuck at "lower by 12%"
after the bisection refactor; brake balance showing **41% in the report headline
but 75% in the record popup** simultaneously.

**Root cause pattern:** a refactor lands in the plan/bisection layer but one
render path still derives its own number — typically a stale *proportional
delta* (`+9%`, `dd.d}%`) sitting next to a bisection-derived absolute target.

**Rule:** any change to recommendation logic must be verified in **all three**
surfaces before it is called done. Grep `Sessions.tsx` for `.delta` and
`dd.d}%` renderings; a percentage label beside a bisection target is the tell.

## 2. Stale browser bundle after a rebuild

Screenshots showed the old °C / kph / mm UI after the imperial conversion had
already shipped — the browser tab was running the pre-rebuild JS bundle.
**Fix: hard-refresh (Cmd+Shift+R).** Rule out before investigating a "the fix
didn't work" report; it has already cost one false bug hunt (2026-08-28).

## 3. Speed glitches in recorded sessions

`server/recorder.js` guards against implausible speed jumps with an
acceleration sanity check (`Δspeed / Δt < 50 m/s²`) before feeding
max/avg speed aggregates. Telemetry does occasionally emit garbage frames;
new aggregates over raw speed need the same guard.

See also: [[tuning-engine-conventions]], [[fh6-telemetry-contract]]
