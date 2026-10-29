---
id: FH6-12
title: GitHub Actions workflow that runs both suites and emits the QI outcome payload
type: story
labels: [ci, tooling, qi]
modules: [.github/workflows, package.json, .assert-iq/signal-schema.json]
depends_on: [FH6-1, FH6-8]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: 7ee40ff7-8ce9-4e08-90fa-6f50c8e2d46e
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "2de054d+de877f1 (2)"
---

# FH6-12 — GitHub Actions workflow that runs both suites and emits the QI outcome payload

As the developer, I want every push and pull request to run both suites in
GitHub Actions and publish a QI outcome payload, so that regressions are
caught without a local run and the QI layers get real signals.

The original Story 3, unchanged. It was already estimable, so it was not split.

## Acceptance criteria

- **AC-1** A workflow runs on every push to `main` and every pull request. It
  installs root and client dependencies from the lockfiles, builds, runs
  `test:unit` and `test:e2e`, and fails if either fails.
- **AC-2** When the end-to-end job fails, Playwright's HTML report and traces
  are uploaded as run artifacts.
- **AC-3** A final step writes a QI outcome payload that validates against
  `.assert-iq/signal-schema.json`, and uploads it as an artifact. Fields with
  no source in this repo (escapes, telemetry alerts, environment uptime) are
  emitted as `null` under partial-signal mode. The step never fails the build.
  A unit test checks a sample payload against the schema's required fields.
- **AC-4** A second run on an unchanged lockfile restores Playwright browsers
  from cache instead of downloading them.
- **AC-5** The workflow needs no secrets. It uses only the default
  `GITHUB_TOKEN`, with read-only permissions.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `2de054d+de877f1`
(2), matched on type only. No reference story touches CI; this one, like the
race-end story, has to be iterated against a system that can't be fully
simulated locally.

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | New contract: the QI outcome payload required by `qi-signal-emission`. |
| Protection | STRONG | Both suites exist after FH6-1 and FH6-8; the payload writer ships with its own unit test. |
| Trust | UNGRADED | `flake_history_unavailable`: nothing has run on a CI runner yet. |
| Outcome | UNGRADED | `escape_source_unconfigured`; this is a new area. |

Team fit: dev, plus SRE/platform (no SRE slot). Bus factor: one deep slot on
`.github/workflows`. Each CI iteration needs a push. The agent's pushes are
blocked by auto mode, so every iteration waits on a manual `git push`.
