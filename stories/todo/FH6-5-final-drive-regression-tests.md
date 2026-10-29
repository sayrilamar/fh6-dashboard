---
id: FH6-5
title: Unit tests that pin the final-drive target to the recorded run
type: story
labels: [testing, unit, gearing]
modules: [tests/unit, client/src/gearing.ts]
depends_on: [FH6-1, FH6-4]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: 5c65b02a-4495-4671-a0e6-59361e40c253
  date: 2026-10-29
  range: "1-3"
  confidence: medium
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-5 — Unit tests that pin the final-drive target to the recorded run

As the developer, I want the final-drive target's behavior pinned, so that
the recommendation can't start chasing its own output again.

## Acceptance criteria

- **AC-1** For a fixture run recorded at final drive 4.07, the target equals
  4.07 × the solved scale, rounded to 2 decimals.
- **AC-2** There is no target when the advice is 0 %, or when the run has no
  recorded final drive.
- **AC-3** The recorded run's ratios are used when it has 2 or more;
  otherwise the fallback ratios are.

## Estimate (2026-10-29)

Range **1–3** · confidence medium · verdict estimable · anchor `5cf8628`
(1): a single test file.

| Layer | State | Why |
|---|---|---|
| Change risk | STRONG | Test files only. |
| Protection | STRONG | Harness and pure function exist after FH6-1 and FH6-4. |
| Trust | UNGRADED | `flake_history_unavailable`. |
| Outcome | WEAK | Pre-run screen escape cluster, including this exact loop. |

Team fit: dev, plus QA (no QA slot). Bus factor: one deep slot on `tests`.
