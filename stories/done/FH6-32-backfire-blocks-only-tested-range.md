---
id: FH6-32
title: A backfired change blocks only the range it tested, not the whole direction
type: bug
labels: [escape, planner, tuning-report]
modules: [client/src/plan.ts, client/src/rows.ts, client/src/components/Sessions.tsx, tests/unit]
depends_on: []
created: 2026-10-30
started: 2026-10-30
completed: 2026-10-30
points: null
estimate: null        # not run through /estimate-story
---

# FH6-32 — A backfired change blocks only the range it tested, not the whole direction

As the driver, I want the report to call a car "out of levers" only when it
really is, so that I don't stop tuning with an obvious change left.

## Why (found 2026-10-30)

The 14:09 run of car #1335 (Mazda 787B) read "Out of levers — this is a build
limit". The report's own braking section disagreed: it wanted brake balance
67 → 61 %, and blocked that move.

- **The front was doing almost all the braking:** front brake slip 90 %,
  rear 21 %.
- **The block came from an unrelated range.** It cited the FH6-30
  validation, where 55 → 41 made the rear step out 232 % more. That proves
  "below 55 is worse". It says nothing about 61, which sits between 55
  (rear steps out) and 67 (fronts lock). It is exactly where the bisection
  points.

Two messages on the same screen were also wrong:
- "All 3 levers that could fix it" counted the ride heights marked at their
  minimum. Those target bottoming, not front lock.
- The braking summary called a 90 % / 21 % split "near the limit, balanced".

## Acceptance criteria

- **AC-1** A backfired change blocks a move in the same direction only when
  the move's target reaches the value that change started from. After
  55 → 41 backfired:
  - from 67, a move to 61 is offered
  - a move from 55 or below toward 41 stays blocked
  - a move without a captured value stays blocked by direction, as today
- **AC-2** "Out of levers" counts only the blocked levers for the symptom it
  names.
- **AC-3** The braking summary names a wide split. When one axle is near the
  limit and the other far below it, it says which end is doing the work, not
  "balanced".
- **AC-4** Unit tests cover AC-1 to AC-3. Restoring the direction-wide block,
  the all-levers count or the "balanced" wording must fail them.
- **AC-5** Live, on the 14:09 run of car #1335:
  - Next Change offers brake balance 67 → 61 %.
  - The braking summary describes the front-heavy split.

## Done (2026-10-30)

- **AC-1:** `decorate()` (`client/src/plan.ts`) blocks a move after a
  backfire only when the move's target reaches the backfired change's
  starting value, in the same direction.
  - With no captured value there is no target, and the direction stays
    blocked.
  - Recoveries and the wrong-lever check are unchanged.
- **AC-2:** `status.blockedLevers` counts only the worst symptom's blocked
  levers.
  - "Limited" (out of levers) now needs at least one of those.
  - Ride heights marked at their minimum no longer count as brake levers.
- **AC-3:** the braking summary moved into `brakeDiagnosis()` in
  `client/src/rows.ts`, so it is unit-tested. It now names a wide split with
  no lockup: "Front-heavy braking — the front is near the limit while the
  rear does little" (or rear-heavy).
- **Also:** with grouped changes on and only one change available, the Next
  Change footer says "This is the only change worth making this run — no
  other lever group has one". It used to give the one-change-per-run warning.
- **AC-4:** `tests/unit/backfire-range.test.ts` has 6 tests. The suite is
  146/146, and the client type-check and build pass. Five mutants each fail
  a test:
  - the direction-wide block restored
  - an uncaptured value no longer blocked
  - every blocked lever counted
  - the wide split called "balanced"
  - front and rear swapped in the split wording
- **AC-5, live on the 14:09 run of car #1335:**
  - Next Change offers brake balance 67 % → 61 %, "bracketed between 55 and
    67 … about 4 more runs".
  - The row reads "← change this one".
  - The braking summary reads "Front-heavy braking … (front 90% / rear 21%)".
