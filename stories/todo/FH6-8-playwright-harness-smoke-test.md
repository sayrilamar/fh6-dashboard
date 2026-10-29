---
id: FH6-8
title: Playwright harness and a first smoke test
type: story
labels: [testing, e2e, tooling]
modules: [package.json, playwright.config.ts, tests/e2e]
depends_on: [FH6-6, FH6-7]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: b218bb58-ba2d-4f65-b68d-b4a5c1ce6728
  date: 2026-10-29
  range: "2-8"
  confidence: low
  verdict: estimable
  anchor: "2de054d+de877f1 (2)"
---

# FH6-8 — Playwright harness and a first smoke test

As the developer, I want one end-to-end test that records a simulated run
through the real server and UI, so that the recording flow is checked the way
it is actually used.

Split from seam 2a.

## Acceptance criteria

- **AC-1** `npm run test:e2e` builds the client and starts the server on
  non-default HTTP and UDP ports, with `FH6_SESSIONS_DIR` pointing at a temp
  folder. It then runs Playwright (Chromium only) over `tests/e2e/**`, and
  exits non-zero on failure.
- **AC-2** The smoke test starts a recording from the UI *before* the
  simulator starts, so the recorder arms and captures every frame. It then
  runs the simulator with `SIM_SEED` and `SIM_FRAMES`, and stops the
  recording once the simulator has exited.
- **AC-3** The run appears in the run list, and the Tuning Report shows car
  #999999 and the expected frame count.
- **AC-4** Elements are selected by role or visible text. No test asserts
  canvas pixels, and nothing waits on a fixed sleep.

## Estimate (2026-10-29)

Range **2–8** · confidence low · verdict estimable · anchor `2de054d+de877f1`
(2): new tooling across about 4 files, proven against the running server.

| Layer | State | Why |
|---|---|---|
| Change risk | STRONG | No production code; FH6-6 and FH6-7 carry the server changes. |
| Protection | WEAK | Builds the end-to-end harness from nothing: config, server launcher, simulator driver. |
| Trust | WEAK | Known flake sources: real-time recording and 60 Hz readouts. AC-4 exists to contain them. |
| Outcome | WEAK | Recording-flow escapes (see FH6-6). |

Team fit: dev, plus QA (no QA slot). Bus factor: one deep slot on `tests`.
The first run downloads browser binaries.
