---
id: FH6-5
title: Unit tests that pin the final-drive target to the recorded run
type: story
labels: [testing, unit, gearing]
modules: [tests/unit, client/src/gearing.ts]
depends_on: [FH6-1, FH6-4]
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
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

## Done (2026-10-29)

- **`tests/unit/final-drive-target.test.ts`** has 8 tests against
  `finalDriveTarget()` (FH6-4). The fixture is the simulator's torque-bell
  engine from `gearing.test.ts`, at three top-gear rpm readings: 6,630 (the
  solve lengthens 9.5%), 6,200 (the solve holds) and 7,700 (the rev-limit
  rule holds).
  - **AC-1:** a run recorded at 4.07 gets `round(4.07 × scale, 2)` = 3.68.
    Replaying the `5cf8628` loop five times returns 3.68 every time, and a
    run recorded at 4.33 gets 3.92.
  - **AC-2:** no target when either hold path says 0%, when the final drive
    is missing or 0, when no tune was confirmed, or when there are no
    gearing analytics.
  - **AC-3:**
    - Recorded six-speed: 3.68 whatever the fallback.
    - Exactly two recorded gears: 4.27, the boundary.
    - One or zero recorded gears: the fallback is used (3.89 with a
      three-speed, 3.68 with a six-speed).
- **Suite:** 67/67.
- **Mutation check:** six deliberate regressions to `finalDriveTarget`. Each
  fails at least one test:
  - always using the fallback ratios
  - requiring 3 recorded gears
  - accepting 1 recorded gear
  - emitting a target on a 0% hold
  - dropping the rounding
  - guessing a final drive when none was recorded
- **Traceability:** the FH6-4 marker on `finalDriveTarget` now names
  `tests/unit/final-drive-target.test.ts` instead of the TODO.
