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
  - **Change the sign only with a measurement like the one above.** The
    failure history is in recurring-defects.md § 3.

## Setting resolution

- FH6's alignment (toe, camber, caster), ARB and damper settings move in
  **0.1 steps**. A confirmed tune on 2026-10-29 read ARB 34.3 / 35.3, rebound
  8.7 / 10, and bump 5.4 / 7.2.
- A target must keep those tenths. A row that says "hold" must return the
  driver's entered value untouched.
- **Every Tuning Report row now goes through one tested function,** shared
  with its next-run pre-fill (2026-10-29/30):
  - `damperMove()` for the dampers (FH6-18)
  - `handlingMove()` for everything else, given a field descriptor (mode,
    base, min, max, step):
    - alignment, ARB and springs (FH6-19)
    - ride height and aero (FH6-22)
    - tire pressure (FH6-23)
    - diff and brakes (FH6-24); their limits live once in `client/src/rows.ts`

  A planned target is labelled as the move to it. The rounding history is in
  recurring-defects.md § 6.

## Marked limits (MIN/MAX)

- **A marked MIN or MAX is a hard threshold for every target** (FH6-25,
  2026-10-29). The user's decision, after the downforce row showed 138 while
  its marked maximum was 120: _"whatever is set as maximum should be the
  threshhold. The same goes for when minimum is marked."_
- `markedLimit` / `clampToLimit` (`client/src/limits.ts`) clamp the target.
  When a mark blocks a lever, the planner sets `to = from`.
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

## Like-for-like runs: the event type

- **Compare only runs of the same kind of event** (FH6-28, 2026-10-30). The
  telemetry can't tell a dirt race from a road race. The user raised it after
  a dirt-race analysis went wrong: _"is there a way for the app to know which
  type of race is being recorded so that the tuning recommendations are more
  accurate?"_
- **The driver labels each run:** Road, Street, Dirt, Cross Country, Drag,
  Drift or Free roam.
  - The pre-run card asks, defaulting to this car's last labelled event.
  - The Tuning Report's Event row relabels a past run.
- **The rule:** `sameEventType()` in `client/src/events.ts`. An unlabelled run
  matches anything, so old history still counts.
- **Every history pool must apply it, not just the planner's `comparable()`.**
  That means bisection, the next-run pre-fill, the race-time comparison, the
  learned step (`learnGain`), the wrong-lever check, and pooled symptoms,
  damping and ride height. Five of these were found still grouping by car
  only after the first fix.
- **Labels so far:** all 2026-10-29 runs are Dirt. On 2026-10-30 there are
  five Dirt runs, four Road runs (car #634) and one Road run (Mazda 787B).

## Measuring whether a lever does anything

The method that settled tire pressure (FH6-27, 2026-10-30) and gear spacing
(2026-08-29):

- **Alternate A|B|A|B** on one car and one route, changing only that lever.
  Alternating exposes run-order drift: turn-in gain fell 14.1 → 10.4 across
  four runs whatever the pressure.
- **Judge it with the planner's noise test.** Pool the runs at each setting;
  the gap must clear 2 standard errors. With 2+2 runs only large effects show.
- **Use the untouched axle as a control.** If its metric moves too, the run
  changed, not the lever.
- **Compare at matched conditions,** for example slip at the same lateral g,
  not at "the limit".
- **Confirm the tune on the pre-run card,** so each run records its own
  settings ("Skip & record" saves none).

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
  drive**; recurring-defects.md § 2 has the feedback loop this prevents. The
  pure target function is `finalDriveTarget()` in `client/src/gearing.ts`
  (FH6-4, 2026-10-29).

## Tire pressure and temperature

- **In FH6, tire pressure moves neither tire temperature nor any measured grip
  signal.** Measured on car #634 at front 26 | 34 | 26 | 34 psi with the rear
  at 32 (FH6-27, 2026-10-30):
  - **Tarmac:** the late-race front temperature moved +0.2 °F.
  - **Dirt:** it moved −0.03 °F.
  - **Grip:** understeer, balance, peak and p95 lateral g, grip μ, and slip
    at matched lateral g did not move on either surface.
  - **Earlier test:** this confirms 2026-08-03, when +17.5 psi moved the
    temperature +0.5 °F.
  - The older belief that pressure is "a grip / response lever" is not
    supported by any measurement, and is dropped.
- **Decision (FH6-26, 2026-10-30):**
  - Pressure is manual and always holds, and the report shows tire
    temperatures as information only.
  - The planner never offers `frontPsi` / `rearPsi` (`MANUAL_ONLY` in
    `client/src/plan.ts`).
  - Do not reintroduce a temperature → pressure loop. The old one told every
    road run "cold, lower 2 psi", which would have walked pressure to the
    15 psi floor.
- **Still unmeasured:** rear pressure's effect on traction. The wheelspin fix
  text still suggests −1 to −2 psi rear.

## Lever exhaustion

- When the app declares _"Every lever for this symptom is used up"_, verify the
  lever list is actually complete before believing it. The user caught
  **brake pressure and brake force** missing from the braking-symptom lever set
  (2026-08-28).

Telemetry facts these rules rest on: [[fh6-telemetry-contract]]
