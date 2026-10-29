---
id: FH6-11
title: End-to-end test that the three recommendation surfaces agree
type: story
labels: [testing, e2e]
modules: [tests/e2e]
depends_on: [FH6-9, FH6-10]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: 7a7de728-8fcb-4b25-a382-4106ea948ce7
  date: 2026-10-29
  range: "1-3"
  confidence: medium
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-11 — End-to-end test that the three recommendation surfaces agree

As the developer, I want a test that fails when the headline, the report body
and the pre-run popup disagree, so that the most frequent defect in this
project (5+ occurrences) gets caught automatically.

Split from seam 2b.

## Acceptance criteria

- **AC-1** For the loose-rear run (FH6-9), an end-to-end test reads the
  channel and target from the headline, the report section and the pre-run
  popup, and fails if they differ.
- **AC-2** The failure message names the surface that disagrees, and shows
  both values.
- **AC-3** The test waits on the hooks from FH6-10, never on a fixed sleep.

## Estimate (2026-10-29)

Range **1–3** · confidence medium · verdict estimable · anchor `5cf8628` (1):
a single test file.

| Layer | State | Why |
|---|---|---|
| Change risk | STRONG | Test files only. |
| Protection | STRONG | Harness, run and hooks exist after FH6-8, FH6-9 and FH6-10. |
| Trust | WEAK | End-to-end across three screens of the real-time UI. |
| Outcome | WEAK | The drift escape cluster this test targets. |

Team fit: dev, plus QA (no QA slot). Bus factor: one deep slot on `tests`.
