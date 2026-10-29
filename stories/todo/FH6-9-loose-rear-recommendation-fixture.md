---
id: FH6-9
title: Loose-rear simulator profile that produces a known recommendation
type: story
labels: [testing, e2e, simulator, toe]
modules: [server/simulator.js, tests/unit, tests/e2e]
depends_on: [FH6-7, FH6-8]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: 822b7965-6011-4594-8c34-c56deb7a0d15
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "2de054d+de877f1 (2)"
---

# FH6-9 — Loose-rear simulator profile that produces a known recommendation

As the developer, I want a repeatable simulated run that is guaranteed to
produce handling advice, so that the recommendation surfaces have something
to agree on (FH6-10, FH6-11).

Split from seam 2b. The default simulated car handles neutrally, so its runs
don't reliably produce handling advice.

## Acceptance criteria

- **AC-1** `SIM_PROFILE=loose-rear` makes the simulated rear slide on power
  and on corner entry, with clearly more rear slip than the default profile.
  The default profile is unchanged.
- **AC-2** The run is generated at test time from fixed `SIM_PROFILE`,
  `SIM_SEED` and `SIM_FRAMES` values. Nothing large is committed: recorded
  runs are tens of MB, which is why `sessions/` is git-ignored.
- **AC-3** An end-to-end test records that run and asserts that the Tuning
  Report shows a "Next Change", and that its handling advice is a
  **positive** rear-toe change.
- **AC-4** The simulator's determinism test (FH6-7) also covers the new
  profile.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `2de054d+de877f1`
(2): about 3 files written by hand, proven against the running app.

| Layer | State | Why |
|---|---|---|
| Change risk | UNGRADED | `hotspot_registry_missing` (`simulator.js`). |
| Protection | STRONG | The determinism test and the end-to-end harness exist after FH6-7 and FH6-8; this only extends them. |
| Trust | WEAK | End-to-end against the real-time UI. |
| Outcome | WEAK | The check reads toe advice (toe-sign escape cluster). |

Team fit: dev, plus QA (no QA slot). Bus factor: one deep slot on `server`
and on `tests`.
