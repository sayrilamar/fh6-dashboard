---
id: FH6-4
title: Move the final-drive target calculation out of PreRunTune
type: chore
labels: [refactor, testability, gearing]
modules: [client/src/components/PreRunTune.tsx, client/src/gearing.ts]
depends_on: []
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: ed7a1327-e6e0-4bbe-8f4a-277d2fa4f2d2
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-4 — Move the final-drive target calculation out of `PreRunTune`

As the developer, I want the final-drive target computed by a pure function,
so that the 4.07 → 5.57 feedback loop (fixed in `5cf8628`) can be pinned by a
unit test (FH6-5).

Split out of the original Story 1, whose gearing criterion assumed this was
already testable. It isn't: `finalDriveAdvice` never sees the live value, and
the loop lived in the pre-run screen's `useMemo`.

## Acceptance criteria

- **AC-1** The block in `PreRunTune.tsx` (around lines 132–158) moves into an
  exported function in `client/src/gearing.ts`, for example
  `finalDriveTarget(runTune, analytics, fallbackRatios)`. That block turns the
  recorded run's final drive and the solved scale into `out.finalDrive`.
- **AC-2** The function's inputs are the recorded run's tune, the analytics,
  and the fallback ratios the block uses today. No form value for the final
  drive is an input.
- **AC-3** `PreRunTune` calls the function, and the diff shows only the moved
  block replaced by the call. The explanatory comment moves with the code.
- **AC-4** `npm --prefix client run build` passes.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1): a
two-file edit to existing code, which also overlaps the very fix it protects.

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | Modifies `PreRunTune.tsx` (4 of 12 commits in 90 days; churn fallback). |
| Protection | WEAK | `PreRunTune.tsx` has no tests. |
| Trust | UNGRADED | `flake_history_unavailable`. |
| Outcome | WEAK | Pre-run screen escapes: the final-drive loop, the 41 % vs 75 % brake-balance mismatch, and the planner bypass. |

Team fit: dev. Bus factor: one deep slot on `client/src/components`.
