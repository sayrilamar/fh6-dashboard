---
id: FH6-16
title: Stop the tuning report going blank when a change backfired from a near-zero baseline
type: bug
labels: [escape, tuning-report]
modules: [client/src/plan.ts, tests/unit/plan-backfired.test.ts]
depends_on: [FH6-1]
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate: null        # not run through /estimate-story
---

# FH6-16 — Stop the tuning report going blank when a change backfired from a near-zero baseline

As the driver, I want every recorded run's tuning report to open, so that one
odd reading in my history doesn't lock me out of my latest runs.

## What happened (escape, found 2026-10-29)

Opening the two most recent runs (4:37 and 4:42 PM, 1980 Renault 5 Turbo,
car #634) in the Tuning Report blanked the whole page. The other seven runs
opened normally. The browser logged
`TypeError: Cannot read properties of null (reading 'toFixed')`, and React
unmounted the app.

- **The change involved:** between the 4:31 and 4:37 PM runs, rear rebound
  moved 11.6 → 10. Pooled across runs, its symptom ("rear rebound/bump balance
  error") went 0.03 → 0.06. That clears the planner's 2-standard-error test,
  so `reviewChange()` judged it `backfired`.
- **Why the percentage was missing:** `reviewChange()` only computes
  `symptomDeltaPct` when the baseline is above 0.05 (a percentage from about
  zero means nothing), so a backfired review can carry
  `symptomDeltaPct: null`.
- **Where it crashed:** `buildPlan()` writes "got N% worse — proven wrong way"
  with `rv.symptomDeltaPct!.toFixed(0)`. The `!` asserted a value that can be
  null. Only runs that have this change in their history (4:37 and 4:42 PM)
  hit it.
- **A second message lied quietly:** the "go back to it" recovery advice reads
  the same field as `symptomDeltaPct ?? 0`, so it would have said "0% worse".

## Acceptance criteria

- **AC-1** A run whose history holds a backfired change with no percentage
  opens normally. `buildPlan()` doesn't throw.
- **AC-2** When the percentage exists, both messages still say "N% worse".
  When it doesn't, they show the measured readings instead ("worse
  (0.03 → 0.075)"), never "0%" or "null".
- **AC-3** A regression test in `tests/unit` rebuilds the case from the
  measured shape, and `npm run test:unit` passes.

## Notes

- **Not changed: whether 0.03 → 0.06 should count as backfired at all.** It's
  a statistically clear but tiny move near the metric's floor, and it now
  blocks rear-rebound softening. That's a tuning-logic decision, so it's left
  open for a separate story rather than changed inside a crash fix.
- **The verdict rests on real races.** The five runs pooled at 11.6 read
  0.049, 0.028, 0.025, 0.024 and 0.035 (mean 0.032), and the two at 10 read
  0.055 and 0.057. The two parked pre-race runs from FH6-15 have no damping
  data, so they're excluded and play no part in it.

## Done (2026-10-29)

- **AC-1 / AC-2:** a private `worseBy()` in `plan.ts` writes "N% worse" when
  the percentage exists, and "worse (before → after)" when it doesn't. Both
  messages use it: the blocked lever ("proven wrong way") and the recovery
  ("go back to it").
- **AC-3:** `tests/unit/plan-backfired.test.ts` adds 3 tests, and the suite is
  41/41.
  - **Shape:** they rebuild the measured case (two runs at 11.6 and two at 10)
    and check that the review is `backfired` with a null percentage, so the
    fixture really reproduces the trigger.
  - **Mutation check:** the original `!.toFixed` makes 2 tests fail, and the
    original `?? 0` ("0% worse") makes 1 fail.
- **In the dashboard:** the rebuilt client opens the 4:42 and 4:37 PM runs
  with no errors. The 4:37 PM report reads "Rear rebound — tried this
  direction (11.6→10) and the rear rebound/bump balance error got worse
  (0.03 → 0.06) — proven wrong way, don't repeat".
