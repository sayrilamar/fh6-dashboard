---
id: FH6-29
title: Can the planner recommend several changes per run without losing accuracy?
type: spike
labels: [planner, tuning-report, measurement]
modules: [client/src/plan.ts, client/src/components/Sessions.tsx, client/src/components/PreRunTune.tsx]
depends_on: []
created: 2026-10-30
started: 2026-10-30
completed: 2026-10-30
points: null
estimate: null        # not run through /estimate-story
---

# FH6-29 — Can the planner recommend several changes per run without losing accuracy?

As the driver, I want to make more than one tuning change per run when the
changes don't interfere, so that tuning a car takes far fewer runs without
making the recommendations worse.

## Why

The planner offers one change per run. Tuning a car can take hours. The driver
asked whether the app can now tell which changes are independent enough to
make together.

**Why the rule exists** (`client/src/plan.ts` header). A measured 12-run
session moved up to 10 levers per run, several aimed at the same symptom:
- Rear camber ran −1.4° → −4.2°.
- Front ARB ran 34 → 65 and rear ARB 26 → 1, both onto their rails.
- Rear toe ran onto its rail at 1.0.
- The car ended 2.6 s slower than the untouched baseline.

The rule protects two things:
1. **No over-correction.** Several levers on one symptom pile up.
2. **Attribution.** A/B verdicts (`experiments()`) and the learned step
   (`learnGain`) only use run pairs where exactly one lever moved.

## Findings (2026-10-30)

Data: car #634 on the 5,951 m dirt route, plus the 17,860 m road route.

**1. The one-change rule is costing runs without producing verdicts.**
- Over two days the planner mined six single-lever A/B pairs: brake balance
  ×2, rear rebound, rear accel ×2, and front aero.
- Five ended "unclear" and one "no effect". None was a decisive "worked" or
  "backfired".
- `reviewChange()` needs at least two runs at each setting to give a verdict,
  and one change per run with no repeats almost never provides that.
- So today the tuning moves forward on each run's symptom-driven bisection,
  not on verified A/Bs.

**2. Run-to-run noise is the real limit, and it is larger across sessions.**
- *Within one sitting:* with the tune fixed (FH6-27's four dirt and four road
  runs, where only front pressure changed), most metrics are tight.

  | Metric | Spread (1 sd) at a fixed tune |
  |---|---|
  | Bump travel used | 0.005–0.01 |
  | Balance Δslip | 0.007 |
  | Grip μ | 0.02 |
  | Accel slip, rear | 2.4 % |
  | Brake slip, front / rear | 3.0 % / 7.2 % |
  | Slide rates | 0.3–1.3 per 1k frames |

- *Across sessions:* on 2026-10-29, almost every single-lever change moved
  metrics it has no mechanism to touch, by 3–8 of those spreads:
  - rear **accel** diff 100 → 64 moved rear **braking** slip 59 → 98 %
  - front aero 110 → 120 moved the front/rear brake slip by 20–40 points and
    rear accel slip by 27
- So a single run can't confirm even one change. Bisection, which acts on
  each run's direction of advice, is what actually converges the tune.

**3. Each lever's advice comes from one driving phase.** This is what makes
grouping possible.

| Group | Levers | Advice reads |
|---|---|---|
| Braking | brake balance, brake pressure, rear decel | brake slip front/rear (`brakeAdvice`, `diffDeltas`) |
| Throttle | rear accel, centre diff | accel slip and power slides (`diffDeltas`) |
| Gearing | gear ratios, final drive | the measured power curve (solver; no bisection) |
| Chassis | ARB, springs, camber, toe, caster, ride height, aero, dampers | corner balance, slide rates, bump travel, damper velocities |

- The chassis levers all act on the same corner balance and grip, so they
  must stay one at a time. That is exactly the failure the rule was built to
  stop.
- Braking, throttle and gearing read separate phases of the lap. Their
  independence is a physical argument from what each advice reads; the
  cross-session noise in finding 2 means the existing data can't prove or
  disprove it.

**4. What it would save.** The 11:00 AM road run of 2026-10-30 had six
changes lined up:
- brake balance (braking)
- rear accel (throttle)
- the gearbox spacing and final drive (gearing)
- rear rebound, rear ride height and rear toe (chassis)

One at a time that is six runs. With one change per group per run it is three,
because the three chassis changes go one per run. Over a full tune the saving
depends on how much of the work is chassis, which stays serial.

## Recommendation

**Move to one change per group per run, at most four changes, and keep
everything else the same.**
- Within a group, the planner still picks only its single best lever, so two
  levers never push the same symptom.
- Bisection, the learned step and the wrong-lever check work per lever, so
  they carry over unchanged.
- `experiments()` would mine a run pair whenever every changed lever belongs
  to a different group, and judge each lever on its own group's metric.

**Validate the grouping once, the way FH6-27 settled pressure.** Run a 2×2 on
one route, two runs per cell (8 runs):
- baseline
- braking change only
- throttle change only
- both

If the "both" runs don't match the sum of the two single changes within the
noise test, merge those groups.

**Make verdicts reachable with repeat runs.** One unchanged repeat run after a
grouped change gives every lever in it its second run, so that run can serve
up to four verdicts.

**Keep a "one change per run" switch** for careful tuning, for example while a
new car's balance is still far off.

**Not recommended:**
- Letting several chassis levers move together.
- Deciding "similar or different" per run from the data. With today's noise
  and history, such a decision would be guessing.

## Proposed follow-up

**FH6-30 — One change per group per run** (written 2026-10-30, in
`stories/done/FH6-30-one-change-per-group.md`):
- `buildPlan` returns the best lever per group.
- `experiments()` mines group-disjoint pairs.
- Every "change one thing" string changes:
  - the plan header
  - the Next Change card
  - the queued chip
  - the pre-run card
- A switch on the pre-run card.
- Unit tests.
- The 2×2 validation as its live check.

Could follow:
- a repeat-run prompt when a verdict is one run short
- a regression-based review that accounts for every simultaneous change

## Notes

- The analysis scripts are not in the repo. The verdict replay ran
  `experiments()` over the real recordings in a temporary test file, which was
  then deleted.
- Tire pressure is no longer a planner lever (FH6-26), so it is in no group.
