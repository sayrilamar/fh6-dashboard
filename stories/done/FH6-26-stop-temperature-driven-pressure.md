---
id: FH6-26
title: Stop steering tire pressure by temperature; show tire temperatures as information
type: bug
labels: [tuning-report, tires]
modules: [server/analytics.js, server/recorder.js, server/metrics.js, client/src/tires.ts, client/src/types.ts, client/src/components/Sessions.tsx, client/src/plan.ts, tests/unit]
depends_on: [FH6-23, FH6-27]
created: 2026-10-29
started: 2026-10-30
completed: 2026-10-30
points: null
estimate: null        # not run through /estimate-story
---

# FH6-26 — Stop steering tire pressure by temperature; show tire temperatures as information

As the driver, I want the report never to change my tire pressures to chase a
temperature that pressure can't move.

> **Ready (FH6-27 done, 2026-10-30): the premise holds on tarmac and dirt.**
> Car #634 ran front 26 | 34 | 26 | 34 psi on one road route and on one dirt
> route.
> - **Temperature:** the front's last-30-s temperature moved +0.2 °F on tarmac
>   and −0.03 °F on dirt, both inside the noise.
> - **Grip:** no grip metric moved, so nothing replaces the temperature rule.
>   Pressure stays manual.
> - **Today's rule is wrong on tarmac:** it called the tires cold on every road
>   run and advised −2 to −2.5 psi front, at both pressures.

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
- **Tarmac (FH6-27, 2026-10-30).** On a road route the same car's fronts
  averaged about 133 °F, with peaks of 142–179 °F.
  - The app averages only frames at or above 140 °F (3–17% of the run) and
    reads 141–146 °F. Against the 175 °F ideal that is "cold, lower
    pressure" on every run.
  - Neither 26 nor 34 psi changed it, so no pressure gets there. The Mazda
    787B was told the same.

**FH6 reports one rear temperature for both wheels** on this car. Rear-left
equals rear-right in 100% of frames (5,492 / 5,492 and 5,453 / 5,453). The
parser reads four separate offsets (268 / 272 / 276 / 280), so the duplication
is in the game's data. FH6-27 found the same on a 1991 Mazda 787B (AWD),
whose fronts differ by 2.7 °F on average.

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
  and show "hold". FH6-27 found no grip metric that pressure moves, so no
  signal drives them.
- **AC-4** Unit tests cover these, and restoring the temperature rule fails
  them:
  - `tireDeltas` holds pressure for cold, ideal and hot temperatures
  - the planner offers no pressure candidate for tire temperature
  - tire analytics are built for a dirt run peaking at 102.8 °F, with its
    water frames excluded
- **AC-5** In the live report, both pressures read "hold" and the Tires card
  shows front and rear temperatures, on:
  - the 6:09 PM dirt run of 2026-10-29
  - the 11:00 AM road run of 2026-10-30, which today advises front −2 psi

## Notes

- **Do not simply lower `TIRE_COLD_F`.** On dirt it would turn on the −3 psi
  march above.
- The reference hot pressures from the 2026-08-03 notes (about 26–28 psi for
  stock, street or **rally** tires; 30–33 psi for semi-slick, slick or drift)
  could appear as static guidance, not as a closed loop.

## Done (2026-10-30)

- **No pressure advice from temperature (AC-1).**
  - `tireDeltas` (`client/src/tires.ts`) holds both pressures, with the reason.
  - The planner has no `tireTemp` symptom: it is gone from the playbook, the
    labels and the A/B metrics (`tempErrF`/`tempErrR`).
  - `buildPlan` drops `frontPsi`/`rearPsi` candidates (`MANUAL_ONLY`).
    `collectCandidates` no longer emits them, and their bisection lookups are
    gone, including FH6-28's event-type special case.
  - The same advice also lived in three places the ACs didn't name. None of
    them mentions pressure now:
    - the live engineer notes (`server/metrics.js`)
    - the three tire-temperature issue fixes in the report
    - the "fronts hotter" fix
  - Older runs stored their triggers with "— raise pressure …", so the report
    shows only the reading.
- **Temperatures as information (AC-2).** `server/analytics.js`
  `buildTireTemps`, with no 140 °F floor:
  - the median over the last two-thirds of the run, and the peak
  - water frames (`puddle` > 0) left out of both
  - `rearShared` when FH6 sent one rear temperature
  - at least 50 dry frames required
  - **Older runs:** at startup the recorder rebuilds just this block from each
    run's recording, keeping the rest of the summary, event types included.
    All 21 runs were rebuilt.
  - **The card** is now "Tires — temperatures, and the pressures you run",
    marked as information.
- **Pressure rows (AC-3).** They stay entry fields with MIN/MAX marks, read
  "hold" with the reason, and pre-fill the next run with what was entered. The
  card adds the reference starting points: 26–28 psi street/rally, 30–33 psi
  slick/drift.
- **Tests (AC-4).** `tests/unit/tire-temps.test.ts` has 12 tests. The suite is
  127/127, and the client type-check and build pass.
  - 11 mutants each fail a test:
    - the window rule restored in `tireDeltas`
    - pressure candidates allowed back into the planner
    - a metric for pressure A/Bs
    - the 140 °F floor
    - water frames counted
    - a whole-run median
    - `rearShared` set from any one frame
    - menu frames counted
    - the 50-frame minimum lowered
    - pressure advice in a live note
    - the rebuild failing on a bad line
  - **Traceability change:** FH6-28's two tire tests in `events.test.ts`
    expected the temperature rule on tarmac. This story supersedes them, so
    they moved here. The `qi-trace` on `tireDeltas` changed from FH6-28 AC-4
    to FH6-26 AC-1/AC-3.
- **Live check (AC-5),** on a second server at port 8091.
  - **6:09 PM dirt run of 2026-10-29.** The Tires card now appears: front
    74 / 90 °F, rear 83 / 103 °F (typical / peak), with the rear-shared note.
    Pressures read 29 hold and 32 hold. Before this story the run had no tire
    data at all.
  - **11:00 AM road run of 2026-10-30.**
    - **Tires:** front 137 / 179 °F, rear 145 / 214 °F; pressures 26 hold
      and 32 hold. This run used to say "lower 2 psi".
    - **Next Change:** brake balance, with no pressure change queued.
    - **"Tires cool" issue:** information only, its trigger reading "FL tire
      cold (134F)".
  - No console errors.
- **Found and fixed during verification.** The front/rear temperature issue
  picked its wording with `/Fronts/i`, and "Rears 22F hotter than fronts"
  contains "fronts". So a run with hotter rears was labelled "Fronts hotter
  than rears", with the front fix. The match is now anchored (`/^Fronts/`),
  and the road run reads "Rears hotter than fronts".
- **Left as is.** The wheelspin fix still suggests dropping rear pressure
  1–2 psi "for a bigger patch". That advice isn't temperature-driven, and
  FH6-27 only tested front pressure.
- **Gaps.** No unit test covers:
  - the Tires card, the issue texts and the removed candidates, all in
    `Sessions.tsx`
  - `recorder.refreshTireTemps`, which needs FH6-6's sessions-folder override
  The live check covers all three.
