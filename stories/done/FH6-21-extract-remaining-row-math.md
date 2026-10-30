---
id: FH6-21
title: Move the remaining Tuning Report row math out of Sessions.tsx
type: story
labels: [refactor, testability, tuning-report]
modules: [client/src/components/Sessions.tsx, tests/unit]
depends_on: [FH6-19]
created: 2026-10-29
started: null
completed: null
points: null
split_into: [FH6-22, FH6-23, FH6-24]
estimate:
  id: bc26a7fb-4f08-43b5-8d8b-7ddbf2946de8
  date: 2026-10-29
  range: "5-21"
  confidence: low
  verdict: split
  anchor: "63edab0 (5)"
---

> **Split on 2026-10-29, not delivered.** `/estimate-story` sized this story 5–21 and
> returned **Split**, so it was split into:
> [FH6-22](../todo/FH6-22-ride-height-aero-rows.md) (ride height + aero),
> [FH6-23](../todo/FH6-23-tire-pressure-rows.md) (tire pressure) and
> [FH6-24](../todo/FH6-24-diff-and-brake-rows.md) (diff + brakes).
> It sits in `done/` per `stories/README.md`'s split rule; it has no `points` or
> `completed`, so it adds nothing to delivery history.

# FH6-21 — Move the remaining Tuning Report row math out of `Sessions.tsx`

As the developer, I want every Tuning Report row's target and label computed
by a pure, tested function, so that the report's hottest file stops being
the place where tuning bugs escape.

## Why

`Sessions.tsx` is the top hotspot (V=10 in the 2026-10-30 registry), and
three of the five escapes on 2026-10-29 touched it (FH6-17, FH6-18,
FH6-19). FH6-18 and FH6-19 moved the damper and alignment/ARB/spring row
math into `damperMove()` and `handlingMove()`. Five sections still keep
their math inline, each written twice: once in the row render and once in
the section's `*Target()` pre-fill function. Line numbers below are at
`c80e1a3`.

| Section | Pre-fill | Row render | Rule today |
|---|---|---|---|
| Diff | `diffTarget` (~423) | `DiffRecommendation` (~468) | `Math.round(base + d)`, 0–100 |
| Brakes | `brakeTarget` (~631) | `BrakeRec` (~694) | `Math.round(base + d)`, per-row `lo`/`hi` |
| Ride height | `rideHeightTarget` (~1472) | `RideHeight` (~1516) | `base × (1 + d%)`, 0.1 |
| Tire pressure | `tireTarget` (~1597) | `TirePressure` (~1644) | `base + d`, 0.5 psi, `PSI_MIN`–`PSI_MAX` |
| Aero | `aeroTarget` (~1724) | `AeroBalance` (~1769) | `base × (1 + d%)`, whole number |

Known defect: the **ride-height and aero rows take "hold" from the symptom's
own delta** (`held = dd.d === 0`) before swapping in the planner's target. A
planned move on a row whose own delta is 0 would read "hold" (noted in
FH6-19).

## Acceptance criteria

- **AC-1** For each of the five sections, the target and label math moves
  into a pure exported function. The row render and that section's
  `*Target()` function both call it. Reuse the `damperMove()` /
  `handlingMove()` shape where it fits.
- **AC-2** The label, hold state and colour come from the final target, the
  planner's when there is one. A planned move is never labelled "hold", and
  a row with no delta and no plan keeps the entered value exactly.
- **AC-3** Each section keeps today's rounding unless a confirmed tune shows
  FH6 uses a finer step for that setting. FH6-18 found exactly that for the
  dampers. Every displayed change is a clean number.
- **AC-4** Unit tests cover each function, built from a recorded tune's
  values, and putting the old inline math back fails them.
- **AC-5** On the 6:09 PM run of 2026-10-29, every row in these sections
  shows the same target as before. Only labels that AC-2 corrects may
  change, and the rendered report shows no float noise.

## Notes

- Large for one story: five sections, ten call sites. If `/estimate-story`
  says split, a natural cut is one story per section, or ride height + aero
  first, since they carry the known "hold" defect.
- Out of scope: the launch (`launchTarget`) and gear (`gearTarget`)
  sections, which follow different rules, and the final drive, which is
  FH6-20.

## Estimate (2026-10-29)

Range **5–21** · confidence low · verdict **split** · anchor `63edab0` (5): a new module
of production logic across five sections.

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | Five sections of `Sessions.tsx` (V=10). |
| Protection | WEAK | None of the five sections is tested in place. |
| Trust | WEAK | Two Major AC issues: AC-1 is compound (five sections), and AC-3's step check has no evidence bar. Also `flake_history_unavailable`. |
| Outcome | WEAK | Escape cluster on `Sessions.tsx`; `history_insufficient`. |

**Suggested split:**
1. **Ride height + aero.** Both are `pct` rows with the known "hold" defect. It is a bug,
   so do it first.
2. **Tire pressure.** The 0.5 psi step question in AC-3 applies here.
3. **Diff + brakes.** Integer rows; the lowest risk.

Each child keeps AC-1 to AC-5 for its sections. Re-estimate after writing them. Full
report: `story-estimate.md`.
