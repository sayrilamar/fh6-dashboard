---
id: FH6-17
title: Put the toe sign on FH6's measured convention (negative = toe-in)
type: bug
labels: [escape, tuning-report]
modules: [client/src/handling.ts, client/src/components/Sessions.tsx, client/src/bisect.ts, client/src/plan.ts, tests/unit/handling.test.ts, tests/unit/bisect.test.ts]
depends_on: [FH6-3]
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate: null        # not run through /estimate-story
---

# FH6-17 — Put the toe sign on FH6's measured convention (negative = toe-in)

As the driver, I want toe advice that moves the wheels the way it says, so
that "add rear toe-in" steadies a loose rear instead of loosening it further.

## What happened (escape, found 2026-10-29)

On car #634 the Tuning Report advised **rear toe 0° → +0.3°** and called it
"more rear toe-IN (toward +)". The game's tuning menu labels + as toe-out.
Since `e943fee` (2026-08-30) the app has assumed the opposite: + = toe-in,
with the claim that Forza draws the menu's In/Out labels on the wrong sides.
`f5f6c47` spread that convention to the help strings and the Rear · Toe
baseline, and FH6-3 pinned it with tests.

The evidence behind `e943fee` was a correlation across 14 runs, r = −0.67.
Up to 15 channels moved per run and rear toe reached −4.8°, so it could not
isolate what toe did.

## Measurement (2026-10-29)

Toe shows up directly in telemetry. A toed wheel rolling straight carries a
steady slip angle, and the two wheels on an axle carry opposite signs.

- **Which way is positive.** These conventions come from 11 race recordings of car #634:
  - `accel.x > 0` frames are right turns. The left wheels compress more
    (+0.12 front, +0.14 rear) and steer is positive.
  - All four slip angles read positive in right turns (+0.33 to +0.37 mean)
    and negative in left turns.
  - So a wheel pointing right of its travel reads positive.
- **Zero line.** At toe 0, straight-line slip angles read 0.000 ± 0.01 per frame.
- **Test.** Front and rear toe were set to +1.0 in the menu, then the car was
  driven straight in free roam (recording `2026-10-29T23-24-29-557Z`, 778
  straight-line frames at 15–50 m/s):

  | Wheel | Mean slip angle | Positive frames |
  |---|---|---|
  | Front left | −0.122 | 0 / 778 |
  | Front right | +0.121 | 778 / 778 |
  | Rear left | −0.108 | 0 / 778 |
  | Rear right | +0.108 | 778 / 778 |

At +1.0 the left wheels point left and the right wheels point right, on both
axles. **Positive toe is toe-OUT, and negative toe is toe-IN.** The menu's
labels are correct.

The cost: the app advised toe-out for a loose rear, which loosens it further.
For understeer it advised front toe-in, which adds push. Every run recorded on
2026-10-29 had both toe settings at 0, so none of today's tuning history was
affected.

## Acceptance criteria

- **AC-1** A loose rear is advised a **negative** `rearToe` change, worded as
  toe-IN (toward −). The loose rear can come from power, trail-braking, or
  rear-loose braking. A strong push with a stable rear trims rear toe by **+0.1**
  (less toe-in).
- **AC-2** Understeer is advised a **positive** `frontToe` change, worded as
  toe-OUT (toward +).
- **AC-3** Every help string, convention comment and the Rear · Toe baseline
  agree that negative is toe-in. The baseline is −0.1, mild toe-in. Nothing in
  the client still claims the menu's labels are swapped.
- **AC-4** The bisection rationale prints its move cap as a clean number:
  "Capped to 0.3", not "Capped to 0.30000000000000004".
- **AC-5** `npm run test:unit` passes, and putting the old signs back fails
  the toe tests.

## Notes

- FH6-3's AC-1, AC-2 and AC-4 pinned the old, wrong signs. This story
  reverses them. FH6-3's tests are rewritten, not removed.
- The repo's QI memory (`.assert-iq/memory/topics/tuning-engine-conventions.md`
  and `recurring-defects.md`) states the old convention. It can only change
  through `/dream`, so it is left for the next dream pass.
- `plan.ts` keeps one historical note: "rear toe −0.2 → −0.4 made
  rear-looseness 68% worse". Under the measured convention that move was
  *more* toe-in. It is one noisy A/B result, recorded as it happened, and
  not a convention claim.

## Done (2026-10-29)

- **`client/src/handling.ts`** (AC-1, AC-2):
  - A loose rear now gets a negative `rearToe` change, worded "toe-IN (toward −)".
  - The push trim is +0.1.
  - Understeer gets a positive `frontToe` change, worded "toe-OUT (toward +)".
  - The convention comment now cites the measurement, and `handlingDeltas`
    carries a `qi-trace` marker for FH6-17.
- **`client/src/components/Sessions.tsx`** (AC-3):
  - The five rear help strings say "−0.1°, toe-in is negative".
  - The front string says "toward +, i.e. toe-out".
  - The convention comment no longer claims the menu labels are swapped.
  - The Rear · Toe baseline is −0.1.
- **Comments in `client/src/plan.ts` and `client/src/bisect.ts`** that
  labelled the August runs by the wrong convention are now sign-neutral.
- **`client/src/bisect.ts`** (AC-4) rounds the move cap the way `snap()`
  does. The report reads "Capped to 0.3 this run".
- **Tests** (AC-5):
  - `tests/unit/handling.test.ts` is rewritten to the measured signs. The
    FH6-3 trace is kept and FH6-17 added.
  - `tests/unit/bisect.test.ts` gains a clean-number test for the
    2026-10-29 case and a clean-number check on the existing cap test.
  - Suite: 42/42.
  - With the old signs and the raw cap put back, 8 tests fail: all 6
    sign-dependent toe tests and both cap tests.
- **Live check:** the 6:09 PM race (car #634) now reads "Rear toe 0° → −0.3°
  … more rear toe-IN (toward −) steadies it", "bracketed between −5 and 0",
  and "Capped to 0.3 this run".

### Scope notes

- **Not fixed here:** the Damping section rounds its targets to whole
  numbers (`Math.round(base + dd.d)` in `Sessions.tsx`). A "hold" row
  therefore shows a phantom change, such as front rebound 8.7 → 9 printed
  as "+0.3000000000000007". This is a separate bug.
- **Not changed:** the QI memory still states the old convention, and
  updating it needs `/dream`.
