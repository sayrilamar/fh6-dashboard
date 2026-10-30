---
id: FH6-24
title: Give the diff and brake rows one rule each, with limits defined once
type: chore
labels: [refactor, testability, tuning-report]
modules: [client/src/rows.ts, client/src/handling.ts, client/src/components/Sessions.tsx, tests/unit]
depends_on: [FH6-19]
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
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

## Done (2026-10-29)

- **New pure module `client/src/rows.ts`** defines each section's rounding,
  limits and baseline once (AC-1, AC-3). It carries a `qi-trace` marker.
  - `diffMove(f)`: whole percent, 0–100, the field's baseline.
  - `brakeMove(k, dt)`: balance 0–100% front with `brakeBalBase(dt)`
    (moved here) as its baseline; pressure 50–200% with a baseline of 100.
    Both are whole percent.
- **`Sessions.tsx`:** `diffTarget`, `DiffRecommendation`, `brakeTarget` and
  `BrakeRec` all call `handlingMove()` with those descriptors (AC-1).
  - The brake rows no longer declare their own `lo`/`hi`/`base`.
  - Labels and colours come from the final target. A hold keeps the entered
    value, and a planned target is labelled as the move (AC-2).
  - MIN/MAX marks (FH6-25) still apply.
- **`handlingMove`** gets an FH6-24 `qi-trace` line and a tidied header
  comment. Its behaviour is unchanged; it already took a `step` from FH6-23.
- **`tests/unit/diff-brake-rows.test.ts`:** 7 tests from the 2026-10-29 tune
  (balance 41, pressure 100, rear accel 32, rear decel 100). They import the
  real descriptors from `rows.ts` (AC-4).
  - Suite: 98/98; build passes.
  - Five mutants each fail a test: pressure max 200 → 150, diff max
    100 → 99, RWD balance baseline 58 → 60, whole percent → tenths, and
    rounding a hold (the old inline behaviour).
- **Live check, 6:09 PM run (AC-5):**

  | Row | Target | Label |
  |---|---|---|
  | Brake balance | 50 | +9, queued |
  | Pressure | 102 | +2 |
  | Rear accel | 32 | hold |
  | Rear decel | 100 | hold |

  The baselines (58 / 100 / 50 / 15) and the saved next-run values
  (`{balance: 50, pressure: 102}`, `{rearAccel: 32, rearDecel: 100}`) are
  unchanged, and the page shows no float noise.
- **Only behaviour change:** a non-whole entry such as 32.5 is now held
  exactly. Before, it was rounded to 33 and shown as "+0.5".

