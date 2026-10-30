# Tuning-engine conventions (user-corrected)

_Layer: Outcome evidence. Every entry below came from the user overruling the
app's behavior, or from recorded runs proving the app wrong. These are the
highest-value facts in the store — the app has been wrong on each one at least
once._

## In-game sign conventions

- **Toe: NEGATIVE = toe-IN (stability), POSITIVE = toe-OUT (turn-in), front
  and rear, exactly as FH6's tuning menu labels it.** MEASURED 2026-10-29 from
  telemetry, not inferred:
  - The test: front and rear toe set to +1.0, the car driven straight in free
    roam (car #634, 778 straight-line frames).
  - The readings: slip angle FL/FR −0.122/+0.121 and RL/RR −0.108/+0.108, with
    the same signs on every frame. At toe 0 the same car reads 0.000 ± 0.01.
  - Why that means toe-out: a wheel aimed right of its travel reads positive
    (see [[fh6-telemetry-contract]] § axes). So +1.0 splays both axles
    outward.

  So a loose rear wants a NEGATIVE change, and an understeering front wants a
  POSITIVE one.
- **History:** the sign flipped on 2026-08-28, on 2026-08-30, and back on
  2026-10-29.
  - The 2026-08-30 flip (`e943fee`) came from a 14-run correlation
    (r = −0.67). Those runs moved up to 15 channels each, so toe's own effect
    couldn't be isolated. It also rested on a belief that the menu's In/Out
    labels were swapped. The measurement disproved both.
  - The 2026-10-29 fix is FH6-17 (`443ab76`, merged via PR #3). It covers the
    `handlingDeltas` logic, the `Sessions.tsx` help strings and convention
    comment, and the Rear · Toe baseline (`-0.1`, mild toe-in), and
    `tests/unit/handling.test.ts` pins it.
  - **Change the sign only with a measurement like the one above.** See
    [[recurring-defects]] § sign regressions.

## Setting resolution

- FH6's alignment (toe, camber, caster), ARB and damper settings move in
  **0.1 steps**. A confirmed tune on 2026-10-29 read ARB 34.3 / 35.3, rebound
  8.7 / 10, and bump 5.4 / 7.2.
- A target must keep those tenths. A row that says "hold" must return the
  driver's entered value untouched. Fixed for the damper rows by FH6-18
  (`damperMove()`) and for the alignment/ARB/spring rows by FH6-19
  (`handlingMove()`), 2026-10-29. See [[recurring-defects]] § rounding.
- Open question (2026-10-29, FH6-16): should a consistent but tiny move near
  a metric's floor count as "backfired"? Rear rebound 11.6 → 10 moved its
  balance error 0.03 → 0.06 and now blocks softening. Undecided.

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
  recommended" and moved 7–15 channels per run, which is how rear toe marched
  to −4.8 against its rail unchecked (fixed 2026-08-30, `e943fee`).
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
