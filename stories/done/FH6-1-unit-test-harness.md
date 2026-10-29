---
id: FH6-1
title: Unit-test harness, plus tests for the tuning code that is already testable
type: story
labels: [testing, unit, tooling]
modules: [package.json, tests/unit, client/src/bisect.ts, client/src/plan.ts, client/src/gearing.ts, server/parser.js]
depends_on: []
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate:
  id: 64542423-48ac-44ef-8cd6-74f1cddfe32a
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "2de054d+de877f1 (2)"
---

# FH6-1 — Unit-test harness, plus tests for the tuning code that is already testable

As the developer, I want the tuning maths that is already pure pinned by fast
unit tests, so that a change can't silently re-break the bisection guards, the
one-lever rule, the gear solver or packet parsing.

Split from "Unit tests for the tuning logic" (seam 1a). **No production code
changes.**

## Acceptance criteria

- **AC-1** `npm run test:unit` at the repo root runs Vitest over
  `tests/unit/**` and exits non-zero if any test fails.
- **AC-2** Bisection (`bracketFor`, `client/src/bisect.ts`): tests reproduce
  the brake-balance narrowing `81 → 41 → 61 → 51 → 56`, and prove three
  guards: a step never moves against the advice; one run's move is capped at
  3× the advised step (`MOVE_CAP`); when bounds contradict, the newer run's
  bound wins.
- **AC-3** Planner (`buildPlan`, `client/src/plan.ts`): given several
  candidate changes, the plan picks exactly one channel.
- **AC-4** Gearing (`client/src/gearing.ts`):
  - `solveGearing` returns `null` when first gear is not above top gear, or
    when there are fewer than 3 gears.
  - For a fixture power band, it returns ratios that strictly decrease from
    1st to top.
  - `finalDriveAdvice` with no ratios or context falls back to the RPM rule
    (`solved: false`, `scale = 1 + pct / 100`).
- **AC-5** Parser (`parsePacket`, `server/parser.js`): decodes a 324-byte
  packet with tire wear absent and a 339-byte packet with wear present, and
  reads `carOrdinal` as a signed 32-bit integer.
- **AC-6** Test data is built in the tests or committed under
  `tests/fixtures/`, with no randomness and no wall clock. Every test file
  passes when run on its own.
- **AC-7** The diff touches only tests, fixtures, test config and package
  files.

## Notes

- Put the fixture builders under `tests/fixtures/`, so later unit stories
  (FH6-3, FH6-5, FH6-6, FH6-7) can reuse them.
- The final-drive feedback-loop regression is **not** testable here: the bug
  lived in `PreRunTune.tsx`. It is covered by FH6-4 and FH6-5.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `2de054d+de877f1`
(2): new tooling across about 7 files, proven by running it. No production
logic, so not the gear solver.

| Layer | State | Why |
|---|---|---|
| Change risk | STRONG | Only new test files, config and a devDependency; no production module modified. |
| Protection | WEAK | Builds the harness from nothing: Vitest config, fixture builders, four test areas. |
| Trust | UNGRADED | `flake_history_unavailable`: no test has run yet. |
| Outcome | WEAK | Bisection escape cluster in project memory: brake-balance ping-pong, spring oscillation, toe ratchet. |

Team fit: dev, plus QA (no QA slot; the dev seat absorbs it). Bus factor: one
deep slot on every module.

## Done (2026-10-29)

- **AC-1:** `npm run test:unit` runs Vitest 4.1.12 over `tests/unit/**`
  (`vitest.config.ts`). Vitest 4 rather than 5: 5.x declares no support for
  Node 25, which this machine runs.
- **AC-2:** `tests/unit/bisect.test.ts` reproduces `81 → 41 → 61 → 51 → 56`
  with an advised step large enough that the cap doesn't bind. It also covers:
  - the 3× cap (rear toe 2.7 → 3.3)
  - the cap overriding the first jump on a small step (81 → 72)
  - a stale bound dropping to the rail
  - a never-against-the-advice grid of more than 1,000 cases
- **AC-3:** `tests/unit/plan.test.ts` covers one primary, no channel offered
  twice, worst symptom first, duplicate collapse, and nothing offered on a
  clean run.
- **AC-4:** `tests/unit/gearing.test.ts` covers the null cases, a solved
  strictly descending box with anchors held, the no-telemetry fallback, and
  both final-drive fallback directions.
- **AC-5:** `tests/unit/parser.test.ts` covers short-packet rejection,
  324 bytes without wear, 339 bytes with wear, and the signed ordinal
  (including the old simulator ID wrapping negative).
- **AC-6:** fixtures are built in code (`tests/fixtures/sessions.ts`), and
  each of the five files passes alone.
- **AC-7:** the diff touches no production module; `bisect`, `plan`,
  `gearing`, `tune` and `parser` all match `HEAD`.
- **Mutation check:** five deliberate regressions were each caught:
  - cap 3 → 30
  - stale bound kept
  - midpoint off by one
  - primary also queued
  - ordinal read unsigned

  Removing only the final "never against the advice" safety net is *not*
  caught. The bracket logic alone already satisfies the grid, so that guard
  is redundant for every case tested. Removing both layers is caught.
- `npm audit` flags `shell-quote` via the existing `concurrently`
  dependency, not via Vitest. That fix is tracked as a separate task.
- `points` is still unset; the team picks it from the 1–8 range.
