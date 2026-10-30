---
id: FH6-27
title: Measure what tire pressure moves in FH6, on tarmac and on dirt
type: spike
labels: [tires, measurement]
modules: [sessions, tests/unit]
depends_on: []        # FH6-28 (event type) makes the per-surface split automatic, but isn't required
created: 2026-10-29
started: 2026-10-30
completed: 2026-10-30
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

## Results — dirt (2026-10-30)

**Setup.** Car #634 (1980 Renault 5 Turbo, rally) on the 5,951 m dirt route
from 2026-10-29. Every run is labelled Dirt and finished at 5,951–5,952 m.
- Four runs alternated front pressure: 10:21 at 26 psi, 10:26 at 34, 10:31 at
  26, 10:35 at 34. The driver says rear stayed at 32 psi and nothing else
  changed.
- The pre-run card's tune wasn't confirmed for these runs, so the pressures
  come from the driver, not the recordings.
- Each run crosses water three times, in about 1% of frames, which are left
  out below.
- The analysis script is not in the repo.

**Noise test.** As the planner's `reviewChange()` does: pool the runs at each
pressure and take the larger spread of the two settings. With two runs a side
the standard error equals that spread, and a gap must exceed twice it.
- **Caveat:** a spread taken from two runs is itself rough. A gap that clears
  only narrowly is weak evidence.

| Metric (26 → 34 psi) | 26 psi | 34 psi | Gap | 2 SE | Clears? |
|---|---|---|---|---|---|
| Front tire temp, dry mean | 70.3 °F | 70.2 °F | −0.2 | 1.4 | no |
| Front tire temp, last 30 s | 90.45 °F | 90.42 °F | −0.03 | 0.21 | no |
| Front − rear temp (rear held) | −7.2 °F | −6.9 °F | +0.3 | 0.9 | no |
| Understeer frames (app) | 0 | 0 | — | — | flat, no information |
| Front slip at the limit (app) | 0.475 | 0.435 | −0.040 | 0.014 | yes, but see below |
| Balance Δslip (app) | 0.070 | 0.065 | −0.005 | 0.028 | no |
| Peak lateral g | 1.645 | 1.595 | −0.05 | 0.07 | no |
| p95 lateral g | 1.353 | 1.326 | −0.027 | 0.019 | narrowly |
| Lateral grip μ (app) | 1.265 | 1.265 | 0 | 0.042 | no |
| Turn-in yaw gain | 12.5 | 11.6 | −0.9 | 4.3 | no |
| Race time | 182.2 s | 181.4 s | −0.8 | 3.2 | no |

Turn-in response is yaw rate per unit of steering per m/s. It is measured
while the steering winds on below 0.6 g, ×1000 for readability.

**Temperature (AC-3).** On dirt, pressure doesn't move tire temperature.
- An 8 psi change moved the front by 0.03 °F over the last 30 s. The run-to-run
  spread there is only about 0.1 °F, so any effect above about 0.2 °F would
  have shown.
- This agrees with the 2026-08-03 test (+17.5 psi, +0.5 °F), and with it
  FH6-26's premise.

**Grip metrics (AC-3).** None qualifies on dirt, so pressure stays manual
there, with the reference ranges as guidance.
- **Front slip at the limit is cornering intensity, not the tire.** It clears,
  but the rear's slip fell by a similar amount although the rear wasn't
  touched. Compared at the same lateral g (0.6–1.4 g in four bands), front slip
  at 34 psi matches 26 psi within noise in every band, with mixed signs.
- **p95 lateral g is unconfirmed.** It is 2% lower at 34 psi and clears only
  narrowly. Peak lateral g, the app's grip μ (identical) and time spent at
  ≥1.2 g (9.6/9.4% vs 8.9/9.4%) don't back it up. It needs more runs before
  anything is built on it.
- **Turn-in response drifts with run order** (14.1 → 12.8 → 11.0 → 10.4), not
  pressure. The A|B|A|B order is what exposes this.

**Temperatures reached on dirt.**
- Fronts averaged about 70 °F dry and 90 °F over the last 30 s, peaking at
  99–125 °F.
- None reached the 140 °F floor, so the Tires card stays empty on this route.
- The 2026-08-03 runs averaged 155.6 °F, above anything seen on dirt in 13
  runs. That suggests, without proving, that they were not on dirt.

**Rear temperatures.** On this car, rear-left still equals rear-right in 100%
of frames. Whether another car does the same is still open.

## Results — tarmac (2026-10-30)

**Setup.** The same car on one 17,860 m road route, two laps per race. Every
run is labelled Road.
- Four runs at front 26 | 34 | 26 | 34 psi, starting 11:00, 11:09, 11:19 and
  11:27.
- The tune was confirmed on the pre-run card, so the recordings themselves
  show front pressure as the only setting that changed, with the rear at
  32 psi.
- No water frames. The same noise test as the dirt half.

| Metric (26 → 34 psi) | 26 psi | 34 psi | Gap | 2 SE | Clears? |
|---|---|---|---|---|---|
| Front tire temp, dry mean | 134.5 °F | 133.5 °F | −1.0 | 5.2 | no |
| Front tire temp, last 30 s | 134.1 °F | 134.3 °F | +0.2 | 0.3 | no |
| Front − rear temp (rear held) | −9.5 °F | −8.3 °F | +1.2 | 3.7 | no |
| Understeer frames (app) | 0 | 0 | — | — | flat, no information |
| Front slip at the limit (app) | 0.555 | 0.545 | −0.010 | 0.042 | no |
| Balance Δslip (app) | 0.110 | 0.110 | 0 | 0 | identical in all four runs |
| Peak lateral g | 1.78 | 1.75 | −0.03 | 0.17 | no |
| p95 lateral g | 1.597 | 1.579 | −0.019 | 0.069 | no |
| Lateral grip μ (app) | 1.575 | 1.565 | −0.010 | 0.071 | no |
| Race time | 354.6 s | 354.7 s | +0.2 | 9.2 | no |

- **Slip at the same lateral g:** front and rear slip match within noise in all
  five bands from 0.6 to 1.6 g.
- **Turn-in yaw gain isn't measurable on this route.** Only 20–99 qualifying
  samples per run, and values from 9.7 to 55.5 that jump between the first and
  second pairs. No conclusion.
- **Temperatures drift with run order on both axles,** not with pressure:
  front 136 → 134 → 133 → 132 °F, rear 147 → 142 → 141 → 141 °F.

## Done (2026-10-30)

**Temperature (AC-3).** Pressure doesn't move tire temperature in FH6, on
tarmac or on dirt.
- An 8 psi change moved the front's last-30-s temperature by +0.2 °F on tarmac
  and −0.03 °F on dirt. Neither clears the noise.
- This confirms the 2026-08-03 test (+17.5 psi, +0.5 °F) and FH6-26's premise
  on both surfaces.

**Grip metrics (AC-3).** None qualifies on either surface, so pressure stays
manual, with the reference ranges as guidance.
- Understeer frames are flat at 0, and the balance doesn't move.
- Peak and p95 lateral g, grip μ and slip at matched lateral g show nothing.
- Dirt's "front slip at the limit" and narrow p95 gaps didn't hold up
  (above), and tarmac shows neither.
- So no follow-up story is needed (AC-4).

**Temperatures reached on tarmac, against the 140/175 °F window.**

| | Front | Rear |
|---|---|---|
| Dry mean | ~133 °F | ~143 °F |
| Last 30 s (front) | ~134 °F | |
| Peaks (front) | 142–179 °F | |

- The app's Tires card averages only frames at or above 140 °F, 3–17% of each
  run, and reads 141–146 °F front.
- **The current rule called the tires cold and advised lowering pressure on
  every road run:** front −2 to −2.5 psi and rear −1.5 to −2 psi, at 26 psi as
  much as at 34. It did the same for the Mazda 787B (front −1.5, rear −2.5).
  That never converges, and would walk pressure to the 15 psi rail.
- On dirt the fronts averaged about 70 °F and never reached 140 °F.

**Rear temperatures.** FH6 sends one rear temperature for both rear wheels on
every car checked.
- Car #634 (RWD) on dirt and tarmac, and a 1991 Mazda 787B (AWD) on the same
  road route, all show rear-left equal to rear-right in 100% of frames.
- The fronts differ (Mazda: 2.7 °F on average), so the parser's four offsets
  are fine.

**FH6-26 (AC-4)** is updated with both results and is ready to start.

**Notes.**
- Surface rumble read 0 on tarmac too, so it is no surface signal.
- The 10:03 dirt run and the road route both finish at about 17,860 m but are
  about 7 km apart, a coincidence.
- The analysis scripts are not in the repo. They follow the planner's
  `reviewChange()` noise test on per-run metrics.
