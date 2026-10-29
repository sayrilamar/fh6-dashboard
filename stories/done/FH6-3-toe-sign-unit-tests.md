---
id: FH6-3
title: Unit tests that pin the toe sign
type: story
labels: [testing, unit, toe]
modules: [tests/unit, client/src/handling.ts]
depends_on: [FH6-1, FH6-2]
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate:
  id: d59297f0-a680-4082-ba7a-cfb07e394703
  date: 2026-10-29
  range: "1-3"
  confidence: medium
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-3 — Unit tests that pin the toe sign

As the developer, I want tests that fail the moment the toe sign flips, so
that "POSITIVE = toe-IN, NEGATIVE = toe-OUT" can't regress a fourth time.

Split from seam 1b. Needs the harness (FH6-1) and the extracted module
(FH6-2).

## Acceptance criteria

- **AC-1** A loose-rear fixture (rear-slide rate above the threshold)
  produces a **positive** `rearToe` change.
- **AC-2** An understeer fixture produces a **negative** `frontToe` change.
- **AC-3** A neutral fixture produces `0` for both, with the "hold" reasons.
- **AC-4** Strong persistent push (understeer severity above 0.6) with a
  stable rear trims rear toe by `−0.1`.
- **AC-5** Fixtures are partial `SessionAnalytics` objects, built in the test
  or committed under `tests/fixtures/`.

## Estimate (2026-10-29)

Range **1–3** · confidence medium · verdict estimable · anchor `5cf8628`
(1): a single test file.

| Layer | State | Why |
|---|---|---|
| Change risk | STRONG | Test files only. |
| Protection | STRONG | The harness exists after FH6-1, and the module is pure after FH6-2; this only extends them. |
| Trust | UNGRADED | `flake_history_unavailable`. |
| Outcome | WEAK | Toe-sign escape cluster: shipped inverted three times. |

Team fit: dev, plus QA (no QA slot). Bus factor: one deep slot on `tests`.

## Done (2026-10-29)

- `tests/unit/handling.test.ts` has 7 tests:
  - positive rear toe for power, trail-brake and rear-loose braking (AC-1)
  - negative front toe for understeer (AC-2)
  - both held on a neutral run, with "hold" reasons (AC-3)
  - a −0.1 rear trim for a strong push (AC-4)
  - a loose rear outranking the push trim
- Fixtures are a complete `handling` block built in the test (AC-5).
- **The tests catch the regression.** With the old inverted signs put back
  temporarily, 5 of the 7 fail. The other two (neutral and push trim) don't
  depend on those signs.
- `npm run test:unit` → 7 passed. The runner (Vitest 4.1.12, chosen over 5.x
  because 5.x doesn't support Node 25) was set up here as FH6-1's AC-1.
- `points` is still unset; the team picks it from the 1–3 range.
