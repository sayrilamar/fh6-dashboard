---
id: FH6-28
title: Record the event type with each run, and compare only like-for-like runs
type: story
labels: [tuning-report, planner, pre-run]
modules: [client/src/components/PreRunTune.tsx, client/src/components/Sessions.tsx, client/src/plan.ts, client/src/types.ts, server/recorder.js, server/parser.js, tests/unit]
depends_on: []
created: 2026-10-29
started: null
completed: null
points: null
estimate: null        # not run through /estimate-story
---

# FH6-28 — Record the event type with each run, and compare only like-for-like runs

As the driver, I want the app to know whether a run was a road race, a dirt
race, a drag run or free roam, so that its recommendations are judged against
runs of the same kind and use rules that fit the surface.

## Why (found 2026-10-29)

The tire-temperature investigation (FH6-26, FH6-27) went wrong for a while
because the app couldn't know that every run that day was a **rally car in a
dirt race**. A water crossing about 20 s in cools the tires about 45 °F, which
looked like a model fault until the driver said what the event was.

**What the telemetry can and can't tell:**

- **No field the app reads names the event type, surface or track.** Packets
  are 324 bytes. The app ignores the 12-byte "Horizon placeholder" (offsets
  232–243) and the one trailing byte (323), and recordings keep only parsed
  fields, so whether those bytes carry anything about the event is unknown.
  One byte is too small for a real track ID.
- **Surface hints are weak.**
  - Water depth (`puddle`) is useful.
  - Surface rumble read 0 for an entire dirt race, so it is not.
  - Bumpiness (vertical accel median 0.9, p95 4.7 m/s²) and slip (combined
    slip median 0.23) can't be judged without tarmac runs to compare against.
- **The planner already fingerprints a route** by finish distance.
  `comparable()` in `plan.ts` treats runs as like-for-like when the car
  matches and the finish distances agree within 5%. All nine dirt races
  finished at 5,950–5,951 m. But:
  - it can't tell a dirt route from a tarmac route of similar length
  - a run with **no** finish distance (free roam, or a run stopped early)
    counts as comparable with every race of that car
  - bisection and the pre-fills group runs by car only

## Acceptance criteria

- **AC-1** The pre-run card asks for the event type: Road, Street, Dirt,
  Cross Country, Drag, Drift or Free roam. It is one tap, pre-filled with the
  last choice for this car. The choice is saved with the run, next to the tune
  and the MIN/MAX marks.
- **AC-2** The Tuning Report shows each run's event type, and lets the driver
  set it on a past run. Runs recorded before this story are "unknown" until
  then.
- **AC-3** `comparable()` requires matching event types when both runs have
  one, and never pairs a race with a free-roam run. The finish-distance check
  stays. Bisection history and the next-run pre-fill use the same rule.
- **AC-4** Each section can read the run's event type, and any rule measured
  on one surface applies only to that surface. The first user is the tire
  section: FH6-26/27's findings are scoped per surface, and the 140–230 °F
  window is never applied to a Dirt run until FH6-27 measures dirt.
- **AC-5** Recordings keep the 12 placeholder bytes and the trailing byte raw,
  so a later check can tell whether FH6 encodes the event, track or surface
  there. This is research only; no behaviour depends on it.
- **AC-6** Unit tests cover `comparable()` with matching, mismatched and
  missing event types, and with free roam against a race. They also cover the
  pre-run card's default choice.

## Notes

- Asking beats guessing. The driver knows the event, and the card already
  asks for the tune. A telemetry-based guess could later pre-select the
  choice, once tarmac recordings exist to check it against.
- Surface-specific tuning rules for ride height, damping and ARB on dirt
  aren't measured yet and are out of scope. This story only makes them
  possible.
