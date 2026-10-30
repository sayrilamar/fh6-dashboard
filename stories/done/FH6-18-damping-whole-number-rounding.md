---
id: FH6-18
title: Stop the Damping section rounding targets to whole numbers
type: bug
labels: [escape, tuning-report]
modules: [client/src/damping.ts, client/src/components/Sessions.tsx, tests/unit/damping.test.ts]
depends_on: [FH6-1]
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate: null        # not run through /estimate-story
---

# FH6-18 — Stop the Damping section rounding targets to whole numbers

As the driver, I want a damper row that says "hold" to leave my setting
alone, so that the report never asks me to change something it has no
reason to change.

## What happened (escape, found 2026-10-29)

FH6 damper settings have 0.1 resolution. The tune confirmed before the 6:09 PM
run on car #634 had front rebound 8.7, rear rebound 10, front bump 5.4 and
rear bump 7.2. The Damping section computes every target as
`Math.round(base + d)`, which rounds to a whole number. That happens in
`dampingTarget()` and again in the row render in
`client/src/components/Sessions.tsx`.

So on rows whose logic said "hold" (`d = 0`), the report suggested a change
anyway and printed the raw floating-point difference:

| Row | Logic | Shown |
|---|---|---|
| Front · Rebound | hold | 8.7 → **9**, **+0.3000000000000007** |
| Front · Bump | hold | 5.4 → **5**, **−0.40000000000000036** |
| Rear · Bump | hold | 7.2 → **7**, **−0.20000000000000018** |

`dampingTarget()` also feeds the forward simulation that pre-fills the next
run's boxes, and the per-car saved tune. So an unconfirmed run would inherit
the rounded values as if they had been applied.

## Acceptance criteria

- **AC-1** A row whose delta is 0 targets the driver's current value exactly
  and shows "hold" (8.7 stays 8.7).
- **AC-2** A real change lands on 0.1 resolution, within the 1–20 damper
  range: 8.7 + 2 → 10.7 and 19.5 + 3 → 20.
- **AC-3** The displayed change is a clean number. That includes a planner
  target, as with 10 → 8.5 showing −1.5. No float noise appears.
- **AC-4** The row render and `dampingTarget()` share one function, so the
  report and the pre-fill chain can't disagree.
- **AC-5** `npm run test:unit` passes, and putting `Math.round` back fails
  the new tests.

## Done (2026-10-29)

- **New pure module `client/src/damping.ts`** with `damperMove(base, d, planned)`.
  It carries a `qi-trace` marker for FH6-18.
  - A zero delta returns the current value exactly (AC-1).
  - A real change rounds to 0.1 inside the 1–20 range (AC-2).
  - The returned delta is rounded to 0.1, including when the target comes
    from the planner (AC-3).
- **`client/src/components/Sessions.tsx`:** `dampingTarget()` and the Damping
  row render both call `damperMove()` (AC-4). `DAMP_MIN` and `DAMP_MAX` moved
  into the module.
- **`tests/unit/damping.test.ts`:** 8 tests built from the 6:09 PM tune.
  - Suite: 50/50.
  - With `Math.round(base + d)` and the raw delta put back, 6 of the 8 fail
    (AC-5). The other two, holding 10 and the range clamp, don't depend on
    the rounding.
- **Live check:** the 6:09 PM run's Damping rows now read:
  - front rebound 8.7 → hold
  - rear rebound → 8.5, −1.5 (queued)
  - front bump 5.4 → hold
  - rear bump 7.2 → hold

  No number on the page shows float noise.

### Scope notes

- **Not fixed here:** the Alignment, ARB & Springs rows (`abs` mode) compute
  their change label from the symptom's own step. They swap in the planner's
  target afterwards without recomputing the label. So on the same run, rear
  toe reads "→ −0.3°  −0.1" and front ARB reads "→ 40  +1.7". This is a
  separate bug.
