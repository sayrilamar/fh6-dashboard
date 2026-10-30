# Recurring defect patterns

_Layer: Signal trustworthiness. Failure clusters seen more than once — check
these first when a symptom looks familiar._

## 1. Parallel code paths drift apart (recurring, ≥6 occurrences)

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

- **A row's label described a different move from its target** (2026-10-29,
  FH6-19). The Alignment, ARB & Springs rows labelled the symptom's own step,
  then swapped in the planner's target, so they showed:
  - rear toe "→ −0.3°" beside "−0.1"
  - front ARB "→ 40" beside "+1.7"

  `handlingMove()` (rows plus `handlingTarget()`) and `damperMove()` (damper
  rows plus `dampingTarget()`) now make each report row and its pre-fill share
  one function. The Ride Height and Aero rows still take "hold" from the
  symptom's delta.

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

## 3. Sign-convention regressions — the toe sign flipped on reasoning alone

The toe sign changed on 2026-08-28, again on 2026-08-30 (`e943fee`), and back
on 2026-10-29 (FH6-17, `443ab76`). The 2026-08-30 flip rested on two things,
and both were wrong:

- a cross-run correlation over runs that each moved up to 15 channels
- a belief that the game's In/Out labels were swapped

A straight-line telemetry test settled it: **NEGATIVE = toe-IN**. The detail
is in [[tuning-engine-conventions]].

- **Tests inherit their source's errors.** FH6-3 (2026-10-29) pinned the
  wrong sign with unit tests that passed. A test that pins a convention is
  only as good as the evidence behind it.
- **A sign lives in more than the logic.** `f5f6c47` (2026-10-29) found the
  then-current sign still unapplied in four places in `Sessions.tsx`:
  - the convention comment
  - five advice strings
  - one understeer string
  - the Rear · Toe baseline default

  That makes this another case of § 1.

**Rules:**
- Settle a sign convention by direct measurement, never by correlation or by
  a theory about the UI.
- Cite the measurement in the code comment and the test header.
- When touching toe, grep the whole file for `toe-in is`, `TOE SIGN`, `Toe-in`
  and the `frontToe` / `rearToe` field definitions, and fix every copy
  together.

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

## 6. Rounding and float noise in tuning targets (3 occurrences, 2026-10-29)

FH6 settings have 0.1 resolution ([[tuning-engine-conventions]] § setting
resolution). Code that rounds or subtracts them carelessly fails two ways:

- **Phantom moves.** Rounding to whole numbers changed values on rows whose
  logic said "hold":
  - damper rebound 8.7 → "9", bump 5.4 → "5" (FH6-18)
  - ARB 34.3 → "34" (FH6-19)

  The same rounding fed the pre-fill chain, so the next run inherited changes
  nobody made.
- **Float noise in the UI.** Raw arithmetic printed numbers like these:
  - "Capped to 0.30000000000000004" (bisection move cap, FH6-17)
  - "+0.3000000000000007" (damper delta, FH6-18)

**Rules:**
- A hold returns the entered value untouched.
- Round targets to 0.1, and round every displayed delta.
- After a change, check the rendered report text for `\d\.\d{6,}`.

Telemetry facts behind these: [[fh6-telemetry-contract]]
