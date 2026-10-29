---
id: FH6-10
title: Test hooks on the three places a recommendation appears
type: chore
labels: [testability, ui]
modules: [client/src/components/Sessions.tsx, client/src/components/PreRunTune.tsx]
depends_on: [FH6-9]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: 40391d46-4941-48a7-a9bf-49e0183cc7fa
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-10 — Test hooks on the three places a recommendation appears

As the developer, I want each recommendation surface to expose its channel
and target in a stable way, so that a test can compare them without scraping
prose.

Split from seam 2b.

## Acceptance criteria

- **AC-1** The "Next Change" headline, the matching section in the report
  body, and the pre-run "Confirm the tune" popup each expose the recommended
  channel and target value through `data-testid` attributes, for example
  `rec-headline-channel` and `rec-headline-target`.
- **AC-2** Visible text and layout are unchanged.
- **AC-3** On the loose-rear run from FH6-9, all six hooks are present
  (checked in the browser).

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1):
edits to the same two files that story touched.

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | Modifies `Sessions.tsx` (top churn) and `PreRunTune.tsx` (4 of 12 commits). |
| Protection | WEAK | Neither component has tests until FH6-11. |
| Trust | UNGRADED | `flake_history_unavailable`. |
| Outcome | WEAK | 5+ "parallel code paths drift" escapes across these exact three surfaces. |

Team fit: dev. Bus factor: one deep slot on `client/src/components`.
