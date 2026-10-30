---
id: FH6-36
title: Give the best-tune banner the right reason, and stop rows advising changes the planner never weighed
type: bug
labels: [escape, planner, tuning-report, differential, gearing, ride-height]
modules: [client/src/plan.ts, client/src/gearing.ts, client/src/components/Sessions.tsx, client/src/components/PreRunTune.tsx, tests/unit]
depends_on: [FH6-33, FH6-35]
created: 2026-10-30
started: 2026-10-30
completed: 2026-10-30
points: null
estimate: null        # not run through /estimate-story
---

# FH6-36 — Give the best-tune banner the right reason, and stop rows advising changes the planner never weighed

As the driver, I want the "best tune" banner to name what really limits the
car, and every row of the report to agree with it, so that I can trust
"the levers are used up" without second-guessing rows that still show a
change.

## Why (measured 2026-10-30, car #1335, Mazda 787B)

The 15:19 and 15:22 runs (brake balance 58 %, pressure 105 %, front
downforce 402) showed "Best tune for this build — the levers are used up",
confirmed. The tune is done, but:

1. **The banner named the wrong symptom.** It said the car "still shows
   suspension bottoming out". Both runs had 0 % bottoming, with about 70 %
   of the bump travel used. The ride-height rows want to *lower* the car for
   a lower centre of gravity, and both heights are marked at the game's
   minimum (2.8). The planner tags every ride-height move "bottoming", so a
   lowering it can't make read as a bottoming problem it can't fix.
2. **Front Accel showed 41 → 38 %, though the planner never considered it.**
   The planner doesn't collect front accel lock at all, so its row is an
   open-loop nudge that fires whenever typical front wheelspin is over about
   29 %. It has been 39–46 % on every run of this car. The one time it was
   lowered (44 → 41 before the 14:34 run), front wheelspin stayed about the
   same: 11 runs at 44 averaged about 42 %, 10 runs at 41 about 44 %.
3. **The gear rows showed targets worth nothing.** The solver asked for
   2.42 → 2.48, 1.82 → 1.87, 1.45 → 1.48 and 1.19 → 1.20 ("up to 3 % off").
   Simulated on each run's own power curve, that box saves 0.012 s (15:19)
   and 0.006 s (15:22) per full pull through the gears. The solved targets
   themselves move more between those two runs than the change they ask for
   (2nd gear: 2.54, then 2.48). The section's own badge said OPTIMAL.

## Acceptance criteria

- **AC-1** Lowering the ride height while the car isn't bottoming is a
  refinement, not the bottoming symptom. When its levers are used up (marked
  at the minimum), it doesn't make the car "out of levers" and the banner
  never names it. A ride-height *raise* for real bottoming is unchanged.
- **AC-2** Front accel lock is a planner lever for front wheelspin under
  power (or a push on exit), judged on the front wheelspin it is meant to
  reduce. Like every other lever, a change that didn't move it is blocked,
  and its row then reads "hold". The symptom's severity uses the median over
  recent runs, like the slide rates, so the banner doesn't flip run to run.
- **AC-3** When re-spacing the gearbox to the solved box saves less than a
  set floor per full pull through the gears, the gear rows hold the current
  ratios and say the box is solved. The pre-run card doesn't offer those
  ratios either.
- **AC-4** A best-tune verdict is confirmed when the run before, on the same
  tune, also had nothing left to change. Whether the remaining symptom counts
  as mild ("optimal") or not ("levers used up") is a threshold, and on this
  car front wheelspin sits on it: its 5-run median is 43 % at the 15:19 run
  and 45 % at the 15:22 run, either side of the line. Requiring the same kind
  would never confirm.
- **AC-5** Unit tests cover AC-1 to AC-4. Each of these must fail them:
  - restoring the old ride-height tag
  - dropping front accel's candidate or its metric
  - removing the gear floor
  - requiring the same kind to confirm
- **AC-6** Live, on the 2026-10-30 runs of car #1335, the 15:22 run:
  - The banner no longer names bottoming, and is confirmed.
  - The Front Accel row holds at 41 % and shows why.
  - The gear rows hold the current ratios.

## Done (2026-10-30)

- **AC-1:** `rideHeightTag()` in `client/src/rows.ts` tags a lowering as
  `lowerCG` ("room to lower the car"), and only a raise as bottoming. In
  `client/src/plan.ts`, `REFINEMENTS` keeps a finished refinement out of the
  "out of levers" check, so the banner never names it. A lowering is still
  offered while the car can go lower.
- **AC-2:** front accel lock is a planner lever for front wheelspin under
  power:
  - **Code moved for testing.** `diffDeltas()` moved from `Sessions.tsx` to
    `rows.ts`. `frontAccelCandidate()` and `frontSpinSeverity()` are new, so
    the row and the planner share one rule.
  - **Judged on front wheelspin.** `SYMPTOM_METRIC.frontAccel` reviews the
    lever on front wheelspin. The 44 → 41 change now reviews as "no effect
    beyond noise across 11+9 pooled runs".
  - **Blocked.** The lever is blocked as "moved across several runs without
    the symptom improving".
  - **Scored on the 5-run median.** The symptom's severity uses the median
    over recent runs, like the slide rates.
- **AC-3:** `solveGearing()` now also reports what re-spacing would save
  against the box as entered. `recommendedBox()` holds the entered box when
  that is under `GEARBOX_MIN_GAIN_PCT` (0.25 % of the time through the box).
  The report's gear rows, the next-run pre-fill and the pre-run card all use
  it.
- **AC-4:** a verdict is confirmed when the run before, on the same tune, also
  had nothing left to change. The banner now says "Confirmed: the previous run
  on this same tune had nothing left to change either."
- **AC-5:** `tests/unit/best-tune-reason.test.ts` has 13 tests:
  - The gearbox tests use the 15:22 run's measured power curve.
  - The suite is 184/184. The client type-check and build pass.
  - Eight mutants each fail a test:
    - the old ride-height tag
    - refinements counted as limits
    - no front accel metric
    - no front accel candidate
    - the candidate ignoring the median
    - no gear floor
    - a held box returning the solved one
    - the same kind required to confirm
- **AC-6, live on car #1335's runs** (an isolated server copy with the
  recorded summaries):

  | Run | Banner | Front Accel | Gear rows |
  |---|---|---|---|
  | 15:22 | "Best tune for this build — the levers are used up": front wheelspin under power, Front accel lock used up. Confirmed. | 41 % hold, "blocked · moved across several runs without the symptom improving" | Hold at 2.42 / 1.82 / 1.45 / 1.19, "on arc". "Within 0.006s per full pull (0.04%)" |
  | 15:19 | "✓ Optimal tune reached for this build". Not confirmed: the run before ran front downforce 414. | 41 % hold | Within 0.012 s (0.07 %), held |

  - **The pre-run card** shows every gear "on rec", and Front Accel and both
    ride heights "blocked".
  - No console errors.
- **Found while checking:** the Next Change card said "all 1 lever that could
  fix it are". It now says "the one lever that could fix it is" when there is
  one lever.
- **Notes:**
  - **Gap:** `collectCandidates()` and `pooledSymptoms()` in `Sessions.tsx`
    have no unit test. The live check covers them.
  - **A blocked row still shows its reading.** The Front Accel row still
    shows "front pushing / spinning (46%) — lower front lock" under its
    "blocked" chip, as the ride-height rows always have.
  - **The red "bogs" label on Gear 2 stays.** It marks the 1 → 2 shift
    landing below peak torque. That drop is deliberate (the section says a
    low 1 → 2 landing costs a fraction of a second), and the box is judged
    on shifts into 3rd and up.
  - **The center diff is not yet a front-wheelspin lever.** Its move toward
    the rear, when the front spins more than 10 points over the rear, is
    still filed under power oversteer. On this car front and rear spin are
    within 10 points, so it holds.
