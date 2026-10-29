---
id: FH6-7
title: Deterministic simulator mode (seed and frame count)
type: story
labels: [testability, simulator]
modules: [server/simulator.js, tests/unit]
depends_on: [FH6-1]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: be5775e1-141a-49fe-b1ef-553a3d237517
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-7 — Deterministic simulator mode (seed and frame count)

As the developer, I want the simulator to send the same packets every run,
so that end-to-end tests built on it pass or fail for a reason.

Split from seam 2a. Today `server/simulator.js:130` uses `Math.random()`, and
the simulator runs until it is killed.

## Acceptance criteria

- **AC-1** With `SIM_SEED` set, a seeded generator replaces `Math.random()`.
  Two runs with the same seed emit byte-identical packets.
- **AC-2** With `SIM_FRAMES=N` set, the simulator sends exactly N packets and
  exits with code 0.
- **AC-3** Without either variable, behavior is unchanged: `npm run sim` runs
  until stopped.
- **AC-4** A test runs the simulator twice with the same seed and frame
  count, against a UDP socket on a free port, and compares the packets.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1): a
small edit to existing code plus one test.

| Layer | State | Why |
|---|---|---|
| Change risk | UNGRADED | `hotspot_registry_missing`; `simulator.js` can't be tiered from churn alone. |
| Protection | WEAK | `simulator.js` has no tests. |
| Trust | UNGRADED | `flake_history_unavailable`. |
| Outcome | UNGRADED | `escape_source_unconfigured`; only one recorded simulator defect (the car-ID overflow, 2026-10-29). |

Team fit: dev. Bus factor: one deep slot on `server`.
