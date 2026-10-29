# Recurring defect patterns

_Layer: Signal trustworthiness. Failure clusters seen more than once — check
these first when a symptom looks familiar._

## 1. Parallel code paths drift apart (recurring, ≥5 occurrences)

The same recommendation or rule lives in more than one code path, a fix lands
in one, and the others keep the old behavior.

- **Recommendation desync across three surfaces** — the **"Next Change"
  headline**, the per-section body of the tuning report, and the **"Confirm the
  tune on the car" pre-run popup**. Observed 2026-08-28: rear accel lock stuck at
  "lower by 12%" after the bisection refactor; brake balance showing **41% in the
  report headline but 75% in the popup** at the same time.
- **Pre-run screen bypassed the planner** — `PreRunTune` never called
  `buildPlan` and applied every section's recommendation at once (2026-08-30,
  `e943fee`).
- **A removed severity floor survived in a duplicate** — `collectCandidates`
  had already dropped it; the copy in `handlingDeltas` had not (2026-08-30,
  `f094163`).

**Typical tell:** a relative number sitting beside an absolute one — a stale
*proportional delta* (`+9%`, `dd.d}%`) next to a bisection-derived absolute
target. Grep `Sessions.tsx` for `.delta` and `dd.d}%`.

**Rule:** any change to recommendation logic must be verified in **all three**
surfaces before it is called done, and searched for duplicate copies.

## 2. Recommendations that feed back into their own input

Pressing "rec" for the final drive on the pre-run screen applied a value and
immediately suggested a new one, forever: `4.07 → 4.33 → 4.61 → 4.91 → 5.23 →
5.57 …` (2026-08-30, fixed in `5cf8628`). `solveFinalDrive` returns a **scale**
that is only meaningful against the final drive the analysed run was recorded
at; the screen applied it to the live input box, and the memo re-ran on every
keystroke.

**Rule:** derive targets from the **recorded run's** values, never from an
editable field. Anything that returns a scale must be applied to the value it
was computed against. (Gear ratios were immune because `solveGearing` returns
absolute ratios.)

## 3. Sign-convention regressions — toe has flipped twice

The app recorded toe with the wrong sign on 2026-08-28, and it was found
inverted again on 2026-08-30. The correct convention is POSITIVE = toe-IN; the
full detail lives in tuning-engine-conventions.md.

The 2026-08-30 fix changed the advice logic only. The old sign survived in
four more places, all in `Sessions.tsx`, until they were fixed together on
2026-10-29 (working tree, not yet committed at that day's dream):

- the convention comment at line 136
- five advice strings saying "add rear Toe-in (−0.1°, toe-in is negative)"
- one understeer string saying "toward +, i.e. toe-out"
- the **Rear · Toe baseline default** (`base: -0.1` → `0.1`), which is the
  value the plan assumes when the user leaves the field blank

So a sign convention lives in help text and field defaults as well as in the
logic, which makes this another case of § 1. **When touching toe, grep the
whole file for `toe-in is`, `TOE SIGN`, `Toe-in`, and the `frontToe` /
`rearToe` field definitions, and fix every copy together.**

## 4. Stale browser bundle after a rebuild

Screenshots showed the old °C / kph / mm UI after the imperial conversion had
already shipped — the browser tab was running the pre-rebuild JS bundle.
**Fix: hard-refresh (Cmd+Shift+R).** Rule out before investigating a "the fix
didn't work" report; it has already cost one false bug hunt (2026-08-28).

## 5. Speed glitches in recorded sessions

`server/recorder.js` guards against implausible speed jumps with an
acceleration sanity check (`Δspeed / Δt < 50 m/s²`) before feeding
max/avg speed aggregates. Telemetry does occasionally emit garbage frames;
new aggregates over raw speed need the same guard.

Telemetry facts behind these: [[fh6-telemetry-contract]]
