---
id: FH6-33
title: Say clearly at the top of the report when a car has reached its best tune
type: story
labels: [tuning-report, planner]
modules: [client/src/plan.ts, client/src/components/Sessions.tsx, tests/unit]
depends_on: [FH6-32]
created: 2026-10-30
started: 2026-10-30
completed: 2026-10-30
points: null
estimate: null        # not run through /estimate-story
---

# FH6-33 — Say clearly at the top of the report when a car has reached its best tune

As the driver, I want the top of the Tuning Report to say plainly when a car
has reached its best tune for its current build, so that I know when to stop
tuning and start racing, or change the build.

## Why

The driver asked for it on 2026-10-30, after tuning the Mazda 787B: "make sure
the top of the tuning report clearly says so anytime I've reached optimal
tuning on any given car."

Today the planner's verdict is buried inside the Next Change card:
- "dialled in": nothing left worth changing
- "out of levers": a symptom remains, but every lever for it is used up

FH6-32 makes "out of levers" trustworthy first.

## Acceptance criteria

- **AC-1** When the plan offers no change, a banner sits at the top of the
  run's report, above everything else, for any car. It says one of two
  things:
  - **"Optimal tune reached"**: no measured symptom is worth chasing.
  - **"Best tune for this build"**: a symptom remains, but every lever for
    it is at its limit or measured not to help. The banner names that
    symptom and its used-up levers.

  Either way it says that further gains need build changes: tires, weight or
  power.
- **AC-2** The banner says whether it is confirmed.
  - **Confirmed:** the previous comparable run with the same tune reached
    the same conclusion.
  - **Otherwise:** it asks for one more run with no changes to confirm.
- **AC-3** The banner never shows while the plan offers a change.
- **AC-4** Unit tests cover the verdict and the confirmation rule. Showing
  the banner while a change is offered, or confirming from a run with a
  different tune, must fail them.
- **AC-5** Live:
  - no banner on a run that still has a change
  - the banner on a run whose plan offers none

## Done (2026-10-30)

- **AC-1:** `tuneVerdict(s, plan, previous)` in `client/src/plan.ts` returns
  one of two verdicts, or none:
  - **"optimal"** when the plan is dialled in.
  - **"build-limit"** when it is out of levers, naming the remaining symptom
    and only that symptom's blocked levers.
  - **None** while a change is offered, or when the run has no cornering
    data.
  - `TuneVerdictBanner` puts it first in the report, above the Event row and
    Next Change, for any car:
    - green "✓ Optimal tune reached for this build"
    - amber "Best tune for this build — the levers are used up"

    Both say that further gains need build changes: tires, weight or power.
- **Found while checking:** two 4–6 s, 0 hp captures from 2026-10-29 (no
  cornering data) read "dialled in", so the first build showed "Optimal tune
  reached" on them. A verdict now requires real cornering data on the run
  and on the run that confirms it.
- **AC-2:** `previousSameTune()` takes the comparable run just before this
  one, but only if every setting matches.
  - **Confirmed:** that run reached the same verdict.
  - **Otherwise:** the banner asks for one more run with no changes.
- **AC-3:** `tuneVerdict` returns nothing while the plan offers a change.
- **AC-4:** `tests/unit/tune-verdict.test.ts` has 9 tests. The suite is
  155/155, and the client type-check and build pass. Eight mutants each fail
  a test:
  - the banner shown while a change is offered
  - confirmation by any earlier verdict
  - the tune not compared
  - any earlier same-tune run confirming
  - other cars counted
  - every blocked lever listed
  - a verdict without cornering data
  - a parked run confirming
- **AC-5, live:**
  - **The driver's dashboard:** no banner on any of the 40 runs. Every real
    run still offers a change, and the two 0 hp captures are excluded.
  - **The banner:** checked on an isolated server copy with two synthetic
    runs. They copy the 14:09 run of car #1335 with its symptoms cleared, on
    the same tune, in a scratch folder.
    - The newer run shows "✓ Optimal tune reached for this build … Confirmed:
      the previous run on this same tune reached the same verdict".
    - The earlier one shows "Not confirmed yet — run it once more without
      changing anything".
  - No console errors.
- **Gap:** the banner component itself has no unit test; `Sessions.tsx` is
  not imported by the suite. Its rule is unit-tested, and the rendering was
  checked live.
