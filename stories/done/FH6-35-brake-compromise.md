---
id: FH6-35
title: Settle brake balance at its compromise, and stop raising pressure on a front-heavy split
type: bug
labels: [escape, planner, tuning-report, brakes]
modules: [client/src/rows.ts, client/src/plan.ts, client/src/components/Sessions.tsx, tests/unit]
depends_on: [FH6-32]
created: 2026-10-30
started: 2026-10-30
completed: 2026-10-30
points: null
estimate: null        # not run through /estimate-story
---

# FH6-35 — Settle brake balance at its compromise, and stop raising pressure on a front-heavy split

As the driver, I want the braking advice to settle where the car brakes best
without the rear stepping out, so that the report stops pushing pressure and
balance in directions my runs have already shown to be worse.

## Why (measured 2026-10-30, car #1335, Mazda 787B)

| Balance / pressure | Runs | Brake slip F / R (typical) | Trail-brake slides /1k |
|---|---|---|---|
| 67 % / 115 % | 10 | ~90 % / 21 % | ~0.4 |
| 61 % / 115 % | 2 | 85 % / 26 % | 0.4 |
| 58 % / 115 % | 2 | 80.5 % / 28.5 % | 0.45 |
| 58 % / 105 % | 1 | 78 % / 26 % | 1.2 |
| 52 % / 115 % | 2 | 79 % / 37 % | 2.6 |
| 52 % / 130 % | 1 | 85 % / 46 % | 2.6 |

- **58 % is the compromise.** Front slip is as low as at 52 %, with the rear
  as stable as at 61–67 %.
- **Below about 55 % the rear steps out** when braking into a corner. The
  FH6-30 validation's 55 → 41 made it 232 % worse.
- **The front still slips more than the rear at every balance tried**, so
  the app's "front-lock" flag (front slip over 1.3× the rear in more than 15 %
  of braking frames) is set at all of them.

What the report did wrong:

1. **It asked for more pressure on a front-heavy split.** It suggested
   115 → 121–124 % at 80 % / 29 % ("just under the limit — a touch more
   pressure"). Extra pressure only pushes the busy axle toward lockup: the
   52 % / 130 % run moved front slip 76 → 85 % and trail-brake slides
   0.9 → 2.6.
2. **A blocked lever showed a stray target.** The brake balance row read
   "→ 40 %" or "→ 34 %, blocked", the bisection's target, though the planner
   would not move it.
3. **The balance row claimed balance.** At 78 % / 26 % it said "both axles
   reach the limit together — balance looks right".
4. **From 52 % it had no way back.** Moving rearward was blocked, and nothing
   offered returning to safer ground.

**Considered and not done:** lowering pressure as a front-lock lever. At
58 %, 105 % versus 115 % moved front slip 80.5 → 78 % in one run, within
noise.

## Acceptance criteria

- **AC-1** With a front/rear split of more than 15 points, pressure rises only
  while the busier axle is well under the limit (below 70 %). Otherwise it
  holds and says why. The 15:02 and 15:05 runs hold pressure at 115 %.
- **AC-2** A lever the planner blocks keeps its current value as the plan's
  target, so its row reads "hold", never a stray bisection target.
- **AC-3** When neither axle is near the limit, the balance row says so
  instead of "both axles reach the limit together".
- **AC-4** When the current value sits past where a backfired change started,
  in the direction that backfired, the planner offers going back to that
  start. Brake balance 52 after 55 → 41 backfired → back to 55. This extends
  the existing recovery, which only covered values at or past where the
  change ended.
- **AC-5** Unit tests cover AC-1 to AC-4. Restoring the old pressure rule,
  the stray target, the "reach the limit together" text, or the old recovery
  range must fail them.
- **AC-6** Live, on the 2026-10-30 runs of car #1335:
  - The 15:05 run holds brake pressure at 115 % and brake balance at 58 %
    (blocked as the compromise).
  - The 14:49 run (52 %) offers going back to 55 %.

## Done (2026-10-30)

- **The brake advice moved** from `Sessions.tsx` into
  `brakeAdvice()` in `client/src/rows.ts`, so it is unit-tested.
- **AC-1:** with a front/rear split over 15 points, pressure rises only while
  the busier axle is under 70 %. Otherwise it holds: "the front does most of
  the braking (81% vs 28%) — more pressure would only push it toward
  lockup; that's a balance split, not a pressure problem".
- **AC-2:** `decorate()` sets a blocked lever's target to its current value,
  so its row reads "hold". FH6-25 already did this for marked limits.
- **AC-3:** with neither axle near the limit (under 80 %), the balance row
  says "neither axle is near the limit on typical braking (78% / 26%) —
  balance holds".
- **AC-4:** the recovery now covers values past where a backfired change
  started, in the backfired direction, not only those at or past where it
  ended. Brake balance 52 after 55 → 41 → back to 55.
- **Found while checking:**
  - **Way back listed twice.** The validation ran 55 → 41 twice, so the
    way back appeared twice: in this run and in the queue. Recoveries are
    now one per lever.
  - **Status chip order.** A lever blocked in one direction showed
    "blocked" though this run's change was its way back. The status chip
    now shows this run's change first.
  - **Row text.** On a way-back row, the brake row now gives the planner's
    reason ("going down to 41 made the rear-slide-under-braking rate 232%
    worse — 55 measured better, go back to it"), not "shift balance
    REARWARD".
- **AC-5:** `tests/unit/brake-compromise.test.ts` has 10 tests. The suite is
  171/171, and the client type-check and build pass. Seven mutants each fail
  a test:
  - pressure raised on a split again
  - a split never raised, even well under
  - "reach the limit together" at 78/26
  - the stray target on a blocked lever
  - the old recovery range
  - recovery offered from anywhere
  - a duplicate way back
- **AC-6, live on car #1335's runs:**

  | Run | Brake balance | Brake pressure | Remaining change |
  |---|---|---|---|
  | 15:05 (58 / 115) | 58 % hold (blocked: the compromise) | 115 % hold | front downforce 414 → 402 |
  | 15:08 | 58 % hold, "neither axle is near the limit" | 105 % hold | (not recorded) |
  | 14:49 (52 %) | 52 → 55 %, "← change this run", listed once | (not recorded) | (not recorded) |

  - **The 15:05 downforce change** is optional, from the A/B history: 414
    made the speed-dependent balance shift worse.
  - No console errors.
- **Not done (see Why):** lowering pressure as a front-lock lever.
- **Notes:**
  - **The "fronts lock under braking" flag** (front slip over 1.3× the rear
    in more than 15 % of braking frames) fires at every balance this car
    ran. So once the downforce question is settled, the report will say
    "Best tune for this build" with that symptom, which matches the
    measurements.
  - **Gap:** `Sessions.tsx` (the status chip and the row text) has no unit
    test; the live check covers it.
