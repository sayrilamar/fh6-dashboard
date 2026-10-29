---
id: FH6-6
title: Let an environment variable redirect the sessions folder
type: story
labels: [testability, server]
modules: [server/recorder.js, tests/unit]
depends_on: [FH6-1]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: ac92841e-67fa-4cfa-8669-2f03b8388511
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-6 — Let an environment variable redirect the sessions folder

As the developer, I want tests to record into a throwaway folder, so that a
test run can never write into, or delete from, the real `sessions/` folder.

Split from seam 2a. The folder is hard-coded today (`server/recorder.js:12`).

## Acceptance criteria

- **AC-1** When `FH6_SESSIONS_DIR` is set, the recorder writes, lists and
  deletes runs in that folder. When it is unset, the recorder uses `sessions/`
  exactly as today.
- **AC-2** The folder is created if it doesn't exist.
- **AC-3** A unit test points the variable at a temp folder, records a short
  run through the recorder, and finds the run files there and none in
  `sessions/`.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1): a
small edit to existing code plus one test. It is smaller than the race-end
story, even though it shares the module.

| Layer | State | Why |
|---|---|---|
| Change risk | UNGRADED | `hotspot_registry_missing`: `recorder.js` has 3 commits in 90 days, which the churn fallback can't place in a tier. |
| Protection | WEAK | `recorder.js` has no tests. |
| Trust | UNGRADED | `flake_history_unavailable`. |
| Outcome | WEAK | Recorder escapes: race-end markers never fired, menus inflated a run's duration, and garbage speed frames needed a guard. |

Team fit: dev. Bus factor: one deep slot on `server`.
