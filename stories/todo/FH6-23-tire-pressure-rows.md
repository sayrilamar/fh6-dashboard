---
id: FH6-23
title: Give the tire-pressure row and its pre-fill one rule
type: story
labels: [refactor, testability, tuning-report]
modules: [client/src/components/Sessions.tsx, tests/unit]
depends_on: [FH6-19]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: 724a2222-7b08-40b2-813b-8276f49e21b3
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-23 — Give the tire-pressure row and its pre-fill one rule

As the developer, I want the tire-pressure target computed once, by a tested
function, so that the row and the next run's pre-fill can't disagree.

Split from FH6-21 (seam 2 of 3).

## What's wrong (latent, found in review 2026-10-29)

`tireTarget` (the pre-fill) and the `TirePressure` row (`Sessions.tsx`, around
lines 1589–1650 at `c80e1a3`) both clamp `base + d` to `PSI_MIN`–`PSI_MAX` and
round it to 0.5 psi. They disagree on a hold:

- **The pre-fill** skips a zero delta and keeps the entered value.
- **The row** rounds it anyway.

So an entered 29.3 psi stays 29.3 in the pre-fill. The row shows "→ 29.5", but
because its delta rounds to 0 it is labelled "hold". The row's label is
otherwise already derived from the final target.

Whether this can happen depends on FH6's pressure step, which is not
confirmed. Every pressure recorded so far is on the 0.5 grid (29 / 32 on
2026-10-29).

## Acceptance criteria

- **AC-1** One pure function computes the target, label, hold state and
  direction for a pressure row. Both `tireTarget` and `TirePressure` call it,
  and `PSI_MIN` / `PSI_MAX` are defined once.
- **AC-2** A row with no delta and no plan keeps the entered value exactly. A
  planned target wins and is labelled as the move to it, never "hold".
- **AC-3** Pressure keeps 0.5 psi rounding. **Evidence that would change it:**
  one confirmed in-game tune with a pressure off the 0.5 grid (e.g. 29.3). If
  that turns up during the story, switch to 0.1 and record the tune in the
  story.
- **AC-4** Unit tests cover the function, built from a recorded tune's values,
  and putting the old inline math back fails them.
- **AC-5** On the 6:09 PM run of 2026-10-29, both pressure rows show the same
  targets as before, and the page shows no float noise.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1): one section of `Sessions.tsx` plus a small pure function, the shape of FH6-18.

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | Modifies `Sessions.tsx` (V=10, top of the watchlist at `c80e1a3`). |
| Protection | WEAK | The section has no tests in place; the new function needs its own tests. |
| Trust | UNGRADED | `flake_history_unavailable`. ACs have Minor issues only: AC-5 relies on a machine-local recording. AC-3 now names its evidence bar. |
| Outcome | WEAK | Escape cluster on `Sessions.tsx` (FH6-17, 18 and 19); `history_insufficient`. |

**QA / test effort:** Unit tests for the pressure function: an exact hold for off-grid values, planned targets, the 0.5 rounding and the `PSI_MIN`/`PSI_MAX` clamp. Plus a before/after check and a mutation check. About 6–8 tests, like FH6-18.

Team fit: dev, plus QA (no QA slot). Bus factor: one deep slot on
`client/src/components`. Full report: `story-estimate.md`.
