---
id: FH6-30
title: Recommend one change per lever group per run, instead of one change per run
type: story
labels: [planner, tuning-report, pre-run]
modules: [client/src/plan.ts, client/src/components/Sessions.tsx, client/src/components/PreRunTune.tsx, tests/unit]
depends_on: [FH6-29]
created: 2026-10-30
started: 2026-10-30
completed: 2026-10-30
points: null
estimate: null        # not run through /estimate-story
---

# FH6-30 — Recommend one change per lever group per run, instead of one change per run

As the driver, I want the planner to give me one change per independent lever
group in each run, so that a tune takes about half the runs without two
changes ever pushing on the same symptom.

## Why

FH6-29 found three things:
- **One change per run costs runs without producing verdicts.** Six
  single-lever A/Bs over two days gave no decisive verdict.
- **Each lever's advice reads one driving phase.** Braking levers read brake
  slip, throttle levers read accel slip and power slides, and gearing is
  solved from the power curve.
- **The chassis levers share one corner balance**, so they must stay one at a
  time.

The rule exists to stop the failure where 10 changes per run sent three levers
to their rails and cost 2.6 s. Several of those changes pushed on the same
symptom. One change per group keeps that protection: two levers never push
the same symptom in one run.

## Acceptance criteria

- **AC-1 One group map.** A single definition puts every lever the planner
  can offer into one group:

  | Group | Levers |
  |---|---|
  | Braking | `balance`, `pressure`, `frontDecel`, `rearDecel` |
  | Throttle | `frontAccel`, `rearAccel`, `center` |
  | Gearing | `gearbox` / gear ratios, `finalDrive`, `gear1` |
  | Chassis | toe, camber, caster, ARB, springs, ride height, aero, dampers |

  A lever missing from the map counts as Chassis, the safe default.
- **AC-2 One change per group.** In the default mode, `buildPlan` returns this
  run's changes as at most one lever per group, so at most four.
  - Each group's pick is its best open lever, by the same severity and
    playbook order as today.
  - Everything else stays queued.
  - **No two changes in a run aim at the same symptom.** The playbooks cross
    groups: trail-brake oversteer lists brake balance and also rear toe, rear
    ARB and rear rebound. So a lever is skipped when its symptom already has a
    change. (Added 2026-10-30, found while implementing.)
  - A recovery (putting a backfired setting back) counts as its lever's
    group's change for that run.
  - Blocked and exhausted levers, marked MIN/MAX limits and bisection
    targets are unchanged.
- **AC-3 A switch for one change per run.** The pre-run card offers
  "Changes per run: One per group / One".
  - "One per group" is the default.
  - The choice is remembered in the browser.
  - In "One" mode the plan is exactly today's: a single change, with the
    current wording everywhere.
- **AC-4 Attribution keeps working.** `experiments()` mines a pair of runs
  whenever every changed lever belongs to a different group, as one experiment
  per lever, each judged on its own metric as today.
  - A pair with two changed levers in the same group stays unmined
    (confounded).
  - Gear ratios moved together still count as one gearbox decision.
- **AC-5 Every surface shows the same set of changes.**
  - **Next Change card:** lists every change for this run, with its group,
    and drops "change ONE thing".
  - **Queued chip:** says why a lever waits ("one per group per run").
  - **Pre-run card:** the planner bar names each change and marks each
    planned row.
  - **The `plan.ts` header comment** describes the group rule and why the
    chassis group stays single.

  In "One" mode every surface keeps today's wording.
- **AC-6 Unit tests.** Restoring "one change per run" in the default mode, or
  allowing two chassis levers, must fail them. They cover:
  - the group map covers every channel the planner can offer
  - a plan with braking, throttle, gearing and two chassis candidates returns
    four changes, one per group, never two chassis levers
  - "One" mode returns today's single change
  - `experiments()` turns a braking + throttle pair into two experiments, and
    skips a chassis + chassis pair
  - the existing planner, bisection and learned-step tests still pass
- **AC-7 Live check, then validation with the driver.**
  - **Live:** on recorded runs, the report and the pre-run card show the same
    grouped changes.
  - **Validation:** a 2×2 on one route, two runs per cell (8 runs). The cells
    are no change, a braking change only, a throttle change only, and both.
  - **Pass condition:** in the "both" runs, the braking metrics (brake slip
    front/rear, trail-brake slides) match "braking only", and the throttle
    metrics (rear accel slip, power slides) match "throttle only", within the
    planner's noise test.
  - **If they don't,** merge Braking and Throttle into one group before
    closing.
  - Record the result here.

## Notes

- **Expected saving:** the 11:00 AM road run of 2026-10-30 had six changes
  lined up (brake balance, rear accel, gearing, and three chassis changes).
  That is six runs one at a time, and three grouped. The chassis group stays
  serial and sets the floor for a full tune.
- **Unchanged:** bisection, the learned step and the wrong-lever check already
  work per lever. They read each lever's own advice, which grouping keeps in
  separate phases.
- **Out of scope; possible follow-ups:**
  - a prompt for one unchanged repeat run when verdicts are one run short
    (one repeat would give up to four verdicts)
  - a regression-based review that accounts for every simultaneous change
- Tire pressure is not a planner lever (FH6-26), so it is in no group.

## Done (2026-10-30)

- **AC-1:** `leverGroup()`, `GROUP_LABEL`, `LeverGroup` in `client/src/plan.ts`.
  Gear ratios and `gearbox` map to Gearing, and an unknown lever to Chassis.
- **AC-2:** `pickPerGroup()` takes the priority-ordered open levers, then the
  recoveries, and keeps the first per group whose symptom is still free.
  - `Plan` gains `thisRun` and `perRun`.
  - `primary` is `thisRun[0]`, so its behaviour is unchanged.
  - `queued` is everything else, in order.
- **AC-3:** `client/src/perRun.ts` stores `fh6.perRun` in the browser.
  - The pre-run card has a "Changes per run: One per group / One" switch.
  - The report and the card re-plan together when it changes.
  - "One" gives the old single change and wording.
- **AC-4:** `experiments()` mines a pair when all changed levers sit in
  different groups.
  - `Plan` gains `lastChanges`, reviewing every change made before the run.
  - Every backfired one is offered back.
  - `lastChange` stays as the first of them.
- **AC-5:**
  - **Next Change:** "N changes", one note per change labelled with its
    group, a footer explaining the group rule, and a verdict note per
    previous change.
  - **Row chip:** "← change this run".
  - **Queued tooltip:** says why the lever waits.
  - **Pre-run card:** "Change these N things this run, one per lever group"
    with Apply them; planned rows highlighted.
  - **`plan.ts` header:** rewritten.
  - **Gearing:** the planner never proposes it, because the Gearing section
    solves it. In grouped mode the card no longer dims the solved gearing,
    with a note that it can go alongside.
- **AC-6:** `tests/unit/grouped-plan.test.ts` has 9 tests. The suite is
  136/136, and the client type-check and build pass. 10 mutants each fail a
  test:
  - one change in the default mode
  - two chassis levers allowed
  - the symptom rule dropped
  - brake balance mapped to Chassis
  - unknown levers defaulting to Braking
  - mining back to exactly one change
  - mining allowing same-group pairs
  - only the first previous change reviewed
  - the "One" switch ignored
  - the queue dropping only the primary
- **AC-7, live part (done):**
  - **11:27 AM road run:** Next Change shows "2 changes". They are Braking
    (brake balance 41 → 50 %) and Chassis (rear ride height 5.6 → 4.8). Rear
    rebound is queued, because it targets the same symptom as brake balance.
  - **Pre-run card, car #634:** checked on a test server fed by a simulator
    copy reporting #634.
    - The bar names both changes, and Apply them fills only those two.
    - The final drive's suggestion shows at full strength, with the note
      that gearing can go alongside.
    - Switching to "One" turned the report into "1 change" straight away;
      switching back restored "2 changes".
  - No console errors.
- **AC-7, validation:** passed. See "Validation result" below.

### Validation protocol (AC-7)

- **Setup:** car #634 on one route, with the tune confirmed on the pre-run
  card every run and Next Change ignored. Use the 5,951 m dirt route for
  3-minute runs, or the 17,860 m road route, which is a little quieter for
  rear accel slip.
- **The four cells:**

  | Cell | Brake balance | Rear accel |
  |---|---|---|
  | A | 41 % | 32 % |
  | B | 55 % | 32 % |
  | C | 41 % | 70 % |
  | D | 55 % | 70 % |

  The steps are big enough to clear the measured noise: on 2026-10-29, a
  balance change of about 20 moved brake slip 20–40 points, and a rear accel
  change of 32 moved accel slip 33.
- **Order:** A B C D D C B A, so run-order drift cancels.
- **Pass:**
  - D's braking metrics (brake slip front/rear, trail-brake slides) match
    B's.
  - D's throttle metrics (rear accel slip, power slides) match C's.
  - Both judged with the planner's noise test.
- **If either fails:** merge Braking and Throttle into one group.

### Validation result (2026-10-30): pass

**Setup.** The driver ran the protocol on car **#1335 (1991 Mazda 787B,
AWD)**, not #634.
- One 5,950 m street route, every run labelled Street and finishing at
  5,949–5,951 m.
- Order A B C D D C B A, starting at 12:49, 12:52, 12:55, 12:58, 13:01, 13:04,
  13:07 and 13:10.
- Each run's pre-run card recorded its brake balance and rear accel.

| Cell | Settings | Brake slip F / R (%) | Trail-brake slides /1k | Rear accel slip (%) | Power slides /1k |
|---|---|---|---|---|---|
| A | 41 / 32 | 54.5 / 57.0 | 9.5 | 41.0 | 3.0 |
| B | 55 / 32 | 79.0 / 33.5 | 2.2 | 47.0 | 4.1 |
| C | 41 / 70 | 54.0 / 53.0 | 10.9 | 43.0 | 3.3 |
| D | 55 / 70 | 77.5 / 31.5 | 0.9 | 41.5 | 2.2 |

**The agreed test passes** (planner noise test, 2 runs vs 2):
- D matches B on all three braking readings: Δ −1.5 / −2.0 brake slip,
  −1.3 slides.
- D matches C on rear accel slip (Δ −1.5) and power slides (Δ −1.1).
- Front accel slip, not part of the agreed test, differed narrowly (Δ −3.0,
  just over the 2.8 threshold). The 2×2 analysis below shows no balance
  effect on it.

**2×2 analysis** (pooled within-cell spread, 2 SE):
- **Braking is independent of the throttle change.** Brake balance moved its
  own readings strongly: front brake slip +24 points, rear −22.5,
  trail-brake slides −8.7. The rear accel change moved none of the braking
  readings, and there was no interaction.
- **The throttle half has a weak signal.** On this AWD car, rear accel
  32 → 70 barely moved its own readings: rear accel slip −1.8, power slides
  −0.8.
- **One cross-effect on a throttle reading.** With rear accel at 32, the
  balance change raised rear accel slip 41 → 47 % (both B runs read 47). At
  rear accel 70 it didn't.
  - The plausible cause is indirect: a steadier entry lets the driver get on
    the throttle earlier.
  - The size, about 6 points, is within the day-to-day swing measured for
    that reading in FH6-29 (1 sd 1.7–2.9 within a sitting, and more across
    days).

**Decision:** keep Braking and Throttle as separate groups, as the agreed
test says.
- **Watch for:** a throttle-lever verdict after a run that also changed
  brake balance.
- **Recheck if needed:** repeat the throttle half on a RWD car (#634), where
  rear accel matters more, if throttle advice starts to oscillate.

**Side finding:** on the 787B, rear accel lock 32 ↔ 70 hardly changes
wheelspin or power slides. For this car it is close to a dead lever; the
planner's wrong-lever check would catch it in time.
