---
id: FH6-26
title: Stop steering tire pressure by temperature; show tire temperatures as information
type: bug
labels: [tuning-report, tires]
modules: [server/analytics.js, client/src/components/Sessions.tsx, client/src/plan.ts, tests/unit]
depends_on: [FH6-23, FH6-27]
created: 2026-10-29
started: null
completed: null
points: null
estimate: null        # not run through /estimate-story
---

# FH6-26 — Stop steering tire pressure by temperature; show tire temperatures as information

As the driver, I want the report never to change my tire pressures to chase a
temperature that pressure can't move.

> **Waits on FH6-27.** The case for this change rests on one measurement:
> pressure barely moves temperature (2026-08-03). Given how the toe sign went
> (FH6-17), confirm it on tarmac before changing behaviour. If FH6-27 finds that
> pressure *does* move temperature on tarmac, rewrite this story around a
> surface-aware window instead.

## Investigation (2026-10-29)

**Context from the driver:** every recording on 2026-10-29 was a **rally car
(car #634) in a dirt race**. Every finding below is scoped to that.

**Why the tire section never renders on these runs.** `buildTirePressure`
(`server/analytics.js`) counts a tire only once it reaches `TIRE_COLD_F` =
140 °F, and needs 50 such frames. No frame in any of the nine dirt races
reached 140 °F, so `analytics.tires` is null and the Tires card never renders.

| Run (UTC) | Median after warm-up, front / rear (°F) | Peak (°F) | Frames ≥ 140 °F |
|---|---|---|---|
| 20:49 | 86 / 96 | 103 | 0 |
| 21:12 | 79 / 93 | 128 | 0 |
| 21:21 | 75 / 82 | 103 | 0 |
| 21:26 | 72 / 83 | 105 | 0 |
| 21:31 | 73 / 82 | 109 | 0 |
| 21:37 | 82 / 94 | 104 | 0 |
| 21:42 | 73 / 85 | 110 | 0 |
| 23:03 | 81 / 89 | 134 | 0 |
| 23:09 (the 6:09 PM run) | 73 / 83 | 103 | 0 |

"After warm-up" is the last two-thirds of each run's on-track frames.

**What the dirt course does to temperature.** About 20 s into the race the car
crosses water (`puddle` > 0 in about 1% of frames). Front-left temperature
drops about 45 °F in 5 seconds, from 82 °F to 34 °F. After that, dry running
warms the tires about 2 °F every 5 seconds until the finish.

| Run | 5 s blocks with water | Dry 5 s blocks |
|---|---|---|
| 21:12 | −12.6 °F on average | +2.6 °F |
| 23:09 | −8.5 °F on average | +1.8 °F |

A race about 3 minutes long spends most of its time recovering from that soak,
which is why it never reaches 140 °F.

- **Retracted from the first draft:** "temperature follows speed, not grip"
  (r ≈ +0.4 with speed, −0.2 to −0.3 with slip). The water crossing comes early
  at lower speed and the tires warm through the faster later sections, so time
  and water confound both correlations.
- **Not established:** whether 140 °F, or the 175 °F ideal, is wrong on
  **tarmac**. Dirt with a water crossing can't answer that.

**FH6 reports one rear temperature for both wheels** on this car. Rear-left
equals rear-right in 100% of frames (5,492 / 5,492 and 5,453 / 5,453). The
parser reads four separate offsets (268 / 272 / 276 / 280), so the duplication
is in the game's data. It is not yet checked on other cars.

**The case against steering pressure by temperature.** On 2026-08-03 (three
runs, same car and route, surface not recorded), front pressure
32 → 43.5 → 49.5 psi moved the mean front-left temperature
155.6 → 155.7 → 156.1 °F. That is +0.5 °F for +17.5 psi, inside the
run-to-run noise.

If that holds, any loop that steers pressure toward a temperature can't
converge. It will push pressure one way every run. The report's `tireDeltas`
and the planner's `tireTemp` symptom (levers `frontPsi`/`rearPsi`, judged by
`tempErrF`/`tempErrR`) are both that loop. On dirt the 140 °F floor happens to
keep it switched off. Lowering the floor on dirt temperatures (about 80–90 °F
against 175 °F) would advise the maximum −3 psi every run toward the 15 psi
rail.

## Acceptance criteria

- **AC-1** No pressure recommendation comes from tire temperature:
  - `tireDeltas` holds both pressures.
  - The planner no longer has a `tireTemp` symptom with pressure levers.
- **AC-2** The Tires card renders whenever a run has tire temperatures, with
  no 140 °F floor. It shows front and rear temperature as information: the
  median over the last two-thirds of the run, and the peak. Frames in water
  (`puddle` > 0) are left out of both. It notes when FH6 reported one rear
  temperature for both wheels.
- **AC-3** The pressure rows keep working as entry fields with MIN/MAX marks,
  and show "hold" until a measured signal (FH6-27) drives them.
- **AC-4** Unit tests cover these, and restoring the temperature rule fails
  them:
  - `tireDeltas` holds pressure for cold, ideal and hot temperatures
  - the planner offers no pressure candidate for tire temperature
  - tire analytics are built for a dirt run peaking at 102.8 °F, with its
    water frames excluded
- **AC-5** On the 6:09 PM run of 2026-10-29, the Tires card appears with
  front and rear temperatures, and both pressures read "hold".

## Notes

- **Do not simply lower `TIRE_COLD_F`.** On dirt it would turn on the −3 psi
  march above.
- The reference hot pressures from the 2026-08-03 notes (about 26–28 psi for
  stock, street or **rally** tires; 30–33 psi for semi-slick, slick or drift)
  could appear as static guidance, not as a closed loop.
