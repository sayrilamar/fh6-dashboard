# Tuning-engine conventions (user-corrected)

_Layer: Outcome evidence. Every entry below came from the user overruling the
app's behavior against what the game actually does. These are the highest-value
facts in the store — the app has been wrong on each one at least once._

## In-game sign conventions

- **Toe: negative is toe-IN, positive is toe-OUT — for both front and rear.**
  Recorded verbatim 2026-08-28: _"Negative is toe-IN; Positive is toe-OUT"_.
  The app had this backwards and recommended "+0.2 rear toe-in", which is
  actually toe-**out** in FH6. Any new toe logic must be checked against this.

## What counts as a tuning signal

- **Never use lap times, track times, or the clock as a tuning signal.**
  Decided 2026-08-28, verbatim: _"I don't want anything to be about the clock,
  lap times, or track times; Keep everything based on the performance of the
  car."_ Rationale given: the user drives on a **controller** and can be
  distracted on any given run, so elapsed time is not reliable enough to
  attribute a change to. Judge changes by car-performance measurements only.
- Related and independently measured: judge launch quality by **longitudinal g**,
  not Forza's slip-ratio field, which is noise at low speed.

## Bisection stepping — the user's specified algorithm

Adopted 2026-08-28 to cut a tune from 6–10 runs to ~2. Maintain a bracket of
`x = last known min adjustment`, `y = last known max adjustment`:

- If the app recommends **lowering** a value after an initial halving/doubling
  has already been made → `((y - x) / 2) + x`
- If the app recommends **raising** a value after an initial halving/doubling
  has already been made → `y - ((y - x) / 2) + x`

Worked example the user gave for brake balance, as the expected narrowing:
`81 → 41 → 61 → 51 → 56`. The bug observed instead was **ping-ponging**
(`81 → 41 → 71 → 36 → 68`) and, separately, rear springs oscillating
`444 ↔ 493` every couple of runs — both symptoms of the bracket not being
carried forward between runs.

- **Explicit carve-out: do NOT apply bisection to gearing.**

## Pressure, temperature, and lever exhaustion

- **Tire pressure is a grip / response lever, not a temperature lever.**
  Measured directly: **+17.5 psi moved tire temp only +0.5 °F.** Any advice of
  the form "raise pressure to bring temperature up" is unsound on FH6, and the
  app's direction here was inverted. Confirmed across multiple sessions.
- When the app declares _"Every lever for this symptom is used up"_, verify the
  lever list is actually complete before believing it. The user caught
  **brake pressure and brake force** missing from the braking-symptom lever set
  (2026-08-28).

See also: [[fh6-telemetry-contract]], [[recurring-defects]]
