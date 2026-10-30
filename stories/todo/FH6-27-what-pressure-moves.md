---
id: FH6-27
title: Measure what tire pressure moves in FH6, on tarmac and on dirt
type: spike
labels: [tires, measurement]
modules: [sessions, tests/unit]
depends_on: []        # FH6-28 (event type) makes the per-surface split automatic, but isn't required
created: 2026-10-29
started: null
completed: null
points: null
estimate: null        # not run through /estimate-story
---

# FH6-27 — Measure what tire pressure moves in FH6, on tarmac and on dirt

As the driver, I want pressure advice built only on what pressure measurably
changes, on the surface I'm racing, so that the report can tune pressure
without chasing noise.

## Why

FH6-26 would stop steering pressure by tire temperature. That rests on one
test: on 2026-08-03, +17.5 psi moved the front-left temperature +0.5 °F, and
the surface wasn't recorded. Every recording from 2026-10-29 is a rally car on
dirt with a water crossing (see FH6-26), and that can't show how tires behave
on tarmac. So this spike runs first, and it decides FH6-26's final form.

The 2026-08-03 notes call pressure a contact-patch and response lever: lower
psi gives a bigger patch and more grip with slower response, higher psi gives
sharper turn-in with less total grip. That hasn't been measured with this
app.

## Acceptance criteria

- **AC-1** On one car and one **tarmac** route, record at least two A/B pairs,
  alternating a low and a high front pressure (A | B | A | B). The gap must be
  wide enough to matter, for example 26 vs 34 psi, with everything else
  unchanged. Repeat on the **dirt** event, with the same car if it suits both.
- **AC-2** For each surface, compare these metrics between A and B using the
  planner's noise test (the gap must clear 2 standard errors across runs):
  - tire temperature, with water frames (`puddle` > 0) left out
  - understeer rate
  - front slip angle at the cornering peak
  - peak lateral g
  - front/rear balance
  - turn-in response (yaw rate per steering input)
- **AC-3** Record the result here, per surface:
  - **Temperature.** Does pressure move tire temperature? This confirms or
    overturns the 2026-08-03 test, and with it FH6-26's premise.
  - **Grip metrics.** Which one pressure moves, by how much per psi, and in
    which direction. If none clears the noise, pressure stays manual, with
    the reference ranges as guidance.
  - **Temperatures reached on tarmac,** as evidence for or against the
    140 °F / 175 °F window.
  - **Rear temperatures.** Do rear-left and rear-right still read
    identically on another car?
- **AC-4** Update FH6-26 to match the result. If a grip metric qualifies,
  write the follow-up story that wires it into the tire section and the
  planner.

## Notes

- This needs the driver: the recordings come from the console. The analysis
  can reuse the planner's `reviewChange()` pooling, as the FH6-17 toe test
  reused telemetry slip angles.
- Hold the rear pressure fixed during the front test, then repeat for the
  rear if the front shows a signal.
