---
id: FH6-24
title: Give the diff and brake rows one rule each, with limits defined once
type: chore
labels: [refactor, testability, tuning-report]
modules: [client/src/components/Sessions.tsx, tests/unit]
depends_on: [FH6-19]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: 1aa495a9-3624-4d03-99da-2934b36cde03
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-24 — Give the diff and brake rows one rule each, with limits defined once

As the developer, I want the diff and brake targets computed once, by tested
functions with their limits in one place, so that the row and the pre-fill
can't drift apart.

Split from FH6-21 (seam 3 of 3).

## Why

These rows already label from the final target, and their settings are whole
numbers, so there is no known defect. The risk is duplication
([[recurring-defects]] § parallel code paths). Each rule is written twice, in
`Sessions.tsx` at `c80e1a3`:

- **Diff:** `diffTarget` (~415) and the `DiffRecommendation` row (~468) both
  compute `Math.round(base + d)` clamped to 0–100.
- **Brakes:** `brakeTarget` (~631) hard-codes balance 0–100 and pressure
  50–200, and the `BrakeRec` rows (~670) declare the same limits again as
  `lo` / `hi`.

The brake section already escaped twice through drift between surfaces:

- balance showed 41% in the report and 75% in the pre-run popup
- a `brakeBalance` key silently missed the planner

## Acceptance criteria

- **AC-1** One pure function computes the target, label, hold state and
  direction for these whole-number rows, with each section's limits defined
  once. `diffTarget`, `DiffRecommendation`, `brakeTarget` and `BrakeRec` call
  it.
- **AC-2** A row with no delta and no plan keeps the entered value. A planned
  target wins and is labelled as the move to it. This is today's behaviour,
  now pinned by tests.
- **AC-3** The rounding and limits are unchanged: whole numbers; diff 0–100;
  brake balance 0–100; brake pressure 50–200.
- **AC-4** Unit tests cover the function, built from the 2026-10-29 tune
  (balance 41, pressure 100, accel 32, decel 100). Changing a limit or
  restoring the inline math fails them.
- **AC-5** On the 6:09 PM run, the diff and brake rows show the same targets
  as before: brake balance 50 (+9, queued), pressure 102 (+2), rear accel 32
  (hold), rear decel 100 (hold).

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1): two sections of `Sessions.tsx` plus one shared whole-number row function.

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | Modifies `Sessions.tsx` (V=10, top of the watchlist at `c80e1a3`). |
| Protection | WEAK | The section has no tests in place; the new function needs its own tests. |
| Trust | UNGRADED | `flake_history_unavailable`. ACs have Minor issues only: AC-5 relies on a machine-local recording. |
| Outcome | WEAK | Escape cluster on `Sessions.tsx` (FH6-17, 18 and 19); `history_insufficient`. |

**QA / test effort:** Unit tests pinning today's behaviour: the limits (diff 0–100, balance 0–100, pressure 50–200), holds and planned targets, from the 2026-10-29 tune. Plus a mutation check that changes a limit. About 6–8 tests.

Team fit: dev, plus QA (no QA slot). Bus factor: one deep slot on
`client/src/components`. Full report: `story-estimate.md`.
