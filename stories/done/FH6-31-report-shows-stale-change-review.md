---
id: FH6-31
title: Show the newest run's report, and review only that run's own changes
type: bug
labels: [escape, planner, tuning-report]
modules: [client/src/plan.ts, client/src/components/Sessions.tsx, tests/unit]
depends_on: [FH6-30]
created: 2026-10-30
started: 2026-10-30
completed: 2026-10-30
points: null
estimate: null        # not run through /estimate-story
---

# FH6-31 — Show the newest run's report, and review only that run's own changes

As the driver, I want the Tuning Report to open on the run I just recorded and
judge exactly the changes I made before it, so that a verdict from an older run
never looks like news.

## Why (found 2026-10-30)

Three runs after the driver set brake balance to 67, Next Change still read
"That change worked — Brake balance 41 → 55 (4+5 runs pooled)". The saved
tunes were right. Three bugs combined:

1. **The report kept showing an older run.** Once a run is clicked in the
   list, the report stays on it, even after new recordings. `selected` prefers
   the clicked run over `meta.lastSession`. The 41 → 55 verdict belongs to the
   13:22 run, the only run whose previous change was that one. This predates
   FH6-30.
2. **A previous change's verdict repeated** (escaped from FH6-30). Each run
   looks up the change that led to it by from/to values, across all of
   history. FH6-30 turned the single `find` into a `filter`. The 2×2
   validation had made 41 → 55 three times, so the 13:22 report listed that
   verdict four times.
3. **A double gearing change lost the whole run's verdicts** (escaped from
   FH6-30). From 13:26 to 13:30 the driver applied the solved gear ratios and
   final drive (both Gearing), plus rear accel 16 → 8 and rear toe 0.2 → −0.1.
   FH6-30's rule skipped any pair with two changes in one group, which threw
   away the rear accel and rear toe verdicts too.

## Acceptance criteria

- **AC-1** When a new run is recorded, the Tuning Report shows it, even if
  another run was picked in the list. Picking a run still works until the
  next recording.
- **AC-2** A run's report reviews only the changes between the previous
  comparable run and that run, each once. The 13:22 run shows brake balance
  41 → 55 once.
- **AC-3** In a run pair, a lever that is the only change in its group is
  mined and reviewed, even when another group has two changes. Only levers
  that share a group with another changed lever are skipped. From 13:26 to
  13:30, rear accel 16 → 8 and rear toe 0.2 → −0.1 are reviewed; the gearbox
  and final drive are not.
- **AC-4** Unit tests cover AC-2 and AC-3. Restoring the from/to lookup or
  the whole-pair skip must fail them.
- **AC-5** Live check on the 2026-10-30 runs of car #1335: AC-2 and AC-3 as
  above, and the 13:34 run reviews rear accel 8 → 5. Then record a new run
  while an older run is picked, and confirm the report switches to the new
  run (AC-1).

## Done (2026-10-30)

- **AC-1:** `Engineer` (`client/src/components/Sessions.tsx`) clears the
  picked run whenever a new run is saved (`meta.lastSession` changes id).
  Picking a run in the list still holds until the next recording.
- **AC-2:** `experiments()` tags each mined change with the run it led to
  (`afterId`). `lastChanges` takes exactly those for this run, instead of
  matching from/to values across all history.
- **AC-3:** `experiments()` counts changed levers per group, and mines every
  lever that is the only change in its group. Only levers sharing a group are
  skipped (a confounded set).
- **AC-4:** `tests/unit/change-review.test.ts` has 4 tests. The suite is
  140/140, and the client type-check and build pass. Four mutants each fail a
  test:
  - the from/to lookup restored
  - the whole-pair skip restored
  - confounded levers mined
  - a change tagged with the wrong run
- **AC-5, live on the driver's dashboard:**

  | Run | Before | After |
  |---|---|---|
  | 13:22 | brake balance 41 → 55 worked, ×4 | the same verdict, once |
  | 13:30 | no review | rear toe 0.2 → −0.1 and rear accel 16 → 8 reviewed, both inconclusive |
  | 13:34 | rear accel 8 → 5 inconclusive | unchanged |

  - **The jump (AC-1):** checked on an isolated copy of the server, with its
    own empty sessions folder, fed by the simulator. Picking the older of two
    runs showed it (1:42:13 PM). Recording a third run switched the report to
    it (1:42:52 PM). Picking the older run again still worked.
  - No console errors. The driver's server and sessions folder were not
    touched.
- **Gap:** the report jump has no unit test; `Sessions.tsx` is not imported
  by the suite. The live check covers it.
