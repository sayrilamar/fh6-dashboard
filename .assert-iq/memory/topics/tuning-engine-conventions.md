# Tuning-engine conventions (user-corrected)

_Layer: Outcome evidence. Every entry below came from the user overruling the
app's behavior, or from recorded runs proving the app wrong. These are the
highest-value facts in the store — the app has been wrong on each one at least
once._

## In-game sign conventions

- **Toe: POSITIVE = toe-IN (stability), NEGATIVE = toe-OUT (turn-in) — front
  and rear.** Corrected 2026-08-30 (commit `e943fee`), confirmed by two
  independent sources and the user's own telemetry: across 14 recorded runs,
  rear toe vs power-oversteer rate correlated **r = −0.67**. So a loose rear
  wants a POSITIVE change; an understeering front wants a NEGATIVE one.
- **Do not trust the in-game slider labels for this.** Forza's tuning UI has a
  known bug with the In/Out labels on the wrong sides. Reading those labels is
  how the store and the app both recorded the inverted convention on
  2026-08-28, which then walked rear toe +0.4 → −4.8 against the −5.0 rail
  while believing it was adding toe-in.
- Code status (2026-10-29): the advice logic in `handlingDeltas`, the
  convention comment at `Sessions.tsx:136`, every toe advice string, and the
  Rear · Toe baseline default (`base: 0.1`, mild toe-in) now all carry the
  corrected sign. The strings and the default were fixed 2026-10-29 in the
  working tree, not yet committed at that day's dream. See
  [[recurring-defects]] § sign regressions.

## What counts as a tuning signal

- **Never use lap times, track times, or the clock as a tuning signal.**
  Decided 2026-08-28, verbatim: _"I don't want anything to be about the clock,
  lap times, or track times; Keep everything based on the performance of the
  car."_ Rationale given: the user drives on a **controller** and can be
  distracted on any given run, so elapsed time is not reliable enough to
  attribute a change to. Judge changes by car-performance measurements only.
- Related and independently measured: judge launch quality by **longitudinal g**,
  not Forza's slip-ratio field, which is noise at low speed.
- **Severity comes from the rate, never from a single-frame classification.**
  Understeer/oversteer frame counts often run 0 or 1 out of ~2,900 cornering
  frames, so an `overall` label flips on one frame. A floor on that label put
  five front levers on the table from one frame in three thousand (removed
  2026-08-30, `f094163`).

## One lever per run

- The planner's **single pick** is the run's change. Attribution depends on it:
  `experiments()` only mines a pair of runs when **exactly one** channel moved,
  and backfire detection (`reviewChange()` → `decorate()`) only works on mined
  pairs. The pre-run screen once bypassed the planner with "Apply all
  recommended" and moved 7–15 channels per run, which is how the inverted toe
  marched to its rail unchecked (fixed 2026-08-30, `e943fee`).
- User requirement (2026-08-30): the pre-run "Confirm & Record" screen must not
  depend on the user opening the Tuning Report first.

## Bisection stepping — the user's specified algorithm

Adopted 2026-08-28 to cut a tune from 6–10 runs to ~2. Maintain a bracket of
`x = last known min adjustment`, `y = last known max adjustment`:

- If the app recommends **lowering** a value after an initial halving/doubling
  has already been made → `((y - x) / 2) + x`
- If the app recommends **raising** a value after an initial halving/doubling
  has already been made → `y - ((y - x) / 2) + x`

Worked example the user gave for brake balance, as the expected narrowing:
`81 → 41 → 61 → 51 → 56`. The bug observed instead was **ping-ponging**
(`81 → 41 → 71 → 36 → 68`) and, separately, rear springs oscillating
`444 ↔ 493` every couple of runs — both symptoms of the bracket not being
carried forward between runs.

Guards added on top of the formula (2026-08-29/30, verified on recorded runs):

- **Contradictory bounds resolve by recency** (`778a87a`). Symptom advice
  genuinely flips run to run, so a newer run's bound wins and the stale one
  drops back to the in-game rail.
- **The step never moves against the advice** — a hard invariant.
- **One run's move is capped at 3× the advised step** (`f094163`). Without it
  rear toe advised +0.2 moved +1.2 (the midpoint of a wide rail) and ratcheted
  toward the rail.
- **Explicit carve-out: do NOT apply bisection to gearing.**

## Gearing

- Gear ratios are **solved for minimum time against the car's measured power
  band** (`client/src/gearing.ts`, adopted 2026-08-29, `63edab0`), not spaced
  geometrically for even RPM landings — geometric spacing never won in
  simulation. The user A/B-tested both on track (same car and circuit,
  alternating A|B|A|B runs, ratios entered by hand): _"It seems the Box B
  (solver) was slightly faster, and I like that approach a lot better."_
- Final drive is solved as a **scale relative to the recorded run's final
  drive** — see [[recurring-defects]] § feedback loops.

## Pressure, temperature, and lever exhaustion

- **Tire pressure is a grip / response lever, not a temperature lever.**
  Measured directly: **+17.5 psi moved tire temp only +0.5 °F.** Any advice of
  the form "raise pressure to bring temperature up" is unsound on FH6, and the
  app's direction here was inverted. Confirmed across multiple sessions.
- When the app declares _"Every lever for this symptom is used up"_, verify the
  lever list is actually complete before believing it. The user caught
  **brake pressure and brake force** missing from the braking-symptom lever set
  (2026-08-28).

Telemetry facts these rules rest on: [[fh6-telemetry-contract]]
