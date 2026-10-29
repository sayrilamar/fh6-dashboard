---
id: FH6-2
title: Move handlingDeltas out of Sessions.tsx into a pure module
type: chore
labels: [refactor, testability, toe]
modules: [client/src/components/Sessions.tsx, client/src/handling.ts]
depends_on: []
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate:
  id: 27d76875-0cc2-4f9a-b9b0-de421a4a2d6b
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-2 — Move `handlingDeltas` out of `Sessions.tsx` into a pure module

As the developer, I want the toe-sign logic in a module a unit test can
import, so that the sign that shipped wrong three times can be pinned by a
test (FH6-3).

Split from seam 1b ("move the toe-sign logic out and test it"). This is the
move only; the tests are FH6-3.

## Acceptance criteria

- **AC-1** `handlingDeltas` (`Sessions.tsx`, lines 161–232) moves into
  `client/src/handling.ts` and is exported; `Sessions.tsx` imports it.
- **AC-2** The function body is unchanged: `git diff --color-moved` shows the
  block as moved, with only the export and import lines added.
- **AC-3** `handling.ts` imports types only, with nothing from React, the
  store or components.
- **AC-4** `npm --prefix client run build` passes.

## Notes

- No dependency on the test harness. This is the agreed starting point.
- `collectCandidates` stays where it is; moving it is not needed for the toe
  tests.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1): an
edit confined to two files of existing code, in the same module
(`Sessions.tsx`).

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | Modifies `Sessions.tsx`, the top-churn file (5 of 12 commits in 90 days; hotspot registry missing, so churn is the fallback). |
| Protection | WEAK | `Sessions.tsx` has no tests; until FH6-3 lands, only the type check and the diff guard the move. |
| Trust | UNGRADED | `flake_history_unavailable`. |
| Outcome | WEAK | The toe sign shipped inverted three times (2026-08-28, 2026-08-30, and the stale strings fixed 2026-10-29). |

Team fit: dev. Bus factor: one deep slot on `client/src/components`.

## Done (2026-10-29)

- `handlingDeltas` and its explanatory comment moved to `client/src/handling.ts`
  as an export. `Sessions.tsx` imports it, and all four call sites are unchanged.
- AC-2 was verified against `HEAD`: the 81 moved lines are byte-identical
  except for the `export` keyword.
- AC-3: the new module's only import is `import type { SessionAnalytics }`.
- AC-4: `npm --prefix client run build` passes, and the rebuilt dashboard
  loads with no console errors.
- `points` is still unset; the team picks it from the 1–8 range.
