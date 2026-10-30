---
id: FH6-22
title: Make the ride-height and aero rows label the move to their actual target
type: bug
labels: [tuning-report, testability]
modules: [client/src/components/Sessions.tsx, client/src/handling.ts, tests/unit]
depends_on: [FH6-19]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: fba12bda-6aad-40b7-9690-7c7ffa6db4da
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-22 — Make the ride-height and aero rows label the move to their actual target

As the driver, I want the ride-height and downforce rows to say exactly the move
their target asks for, so that a planned change is never shown as "hold".

Split from FH6-21 (seam 1 of 3).

## What's wrong (latent, found in review 2026-10-29)

Both sections move a setting by a percentage of the current value. Each writes
its rule twice: in `rideHeightTarget`/`aeroTarget` (the pre-fill) and in the
`RideHeight`/`AeroBalance` row render (`Sessions.tsx`, around lines 1463–1530
and 1715–1790 at `c80e1a3`). The rows have three problems:

- **"Hold" comes from the symptom's own delta** (`held = dd.d === 0`), worked
  out before the planner's target is swapped in. A planned move on a row whose
  own delta is 0 reads "hold" and is drawn muted. FH6-19 fixed this same bug for
  springs.
- **The aero row never shows a decrease as one.** Its colour is blue whenever it
  isn't holding.
- **A target past a limit you marked.** On the 6:09 PM run of 2026-10-29, Front ·
  Downforce showed "→ 138, +15%" beside "blocked · you've marked this at its
  maximum (120)".

Not yet seen as a wrong "hold" on a recorded run.

## Acceptance criteria

- **AC-1** One pure function computes the target, label, hold state and
  direction for these `pct` rows. For example, extend `handlingMove()`'s `pct`
  mode with a rounding step. `rideHeightTarget`, `aeroTarget`, `RideHeight` and
  `AeroBalance` all call it.
- **AC-2** The label, hold state and colour come from the final target, the
  planner's when there is one:
  - A planned move is never labelled "hold".
  - An aero decrease is drawn as a decrease.
  - A row with no delta and no plan keeps the entered value exactly.
- **AC-3** Ride height keeps 0.1 resolution and downforce keeps whole numbers.
  Both match the 2026-10-29 confirmed tune: heights 5.3 / 5.6, downforce
  120 / 225.
- **AC-4** Unit tests cover the function, built from that tune's values, and
  putting the old inline math back fails them.
- **AC-5** On the 6:09 PM run the targets stay as they are: front height 4.5
  (−15%), rear 4.8 (−14%), front downforce 138, rear downforce 225 (hold). Only
  labels and colours may change, and the page shows no float noise.

## Notes

- **Decide in refinement:** should a row whose lever is blocked at a marked
  limit show a target past it (the 138 vs 120 above)? It is out of these ACs;
  if the answer is no, it becomes AC-6 or its own story.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1): two sections of `Sessions.tsx` plus an extension of `handling.ts` (`handlingMove`), the shape of FH6-19.

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | Modifies `Sessions.tsx` (V=10, top of the watchlist at `c80e1a3`). |
| Protection | WEAK | The section has no tests in place; the new function needs its own tests. |
| Trust | UNGRADED | `flake_history_unavailable`. ACs have Minor issues only: AC-2 bundles three facets of one rule, and AC-5 relies on a machine-local recording. |
| Outcome | WEAK | Escape cluster on `Sessions.tsx` (FH6-17, 18 and 19); `history_insufficient`. |

**QA / test effort:** Unit tests for the `pct` row function: ride height at 0.1, downforce whole; a planned move is never "hold"; aero decreases; exact holds. Plus a before/after check on the 6:09 PM run and a mutation check. About 8–10 tests, like FH6-19.

Team fit: dev, plus QA (no QA slot). Bus factor: one deep slot on
`client/src/components`. Full report: `story-estimate.md`.
