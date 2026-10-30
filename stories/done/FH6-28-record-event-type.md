---
id: FH6-28
title: Record the event type with each run, and compare only like-for-like runs
type: story
labels: [tuning-report, planner, pre-run]
modules: [client/src/events.ts, client/src/tires.ts, client/src/components/PreRunTune.tsx, client/src/components/Sessions.tsx, client/src/components/TopBar.tsx, client/src/plan.ts, client/src/bisect.ts, client/src/tune.ts, client/src/types.ts, server/event-types.js, server/recorder.js, server/index.js, server/parser.js, tests/unit]
depends_on: []
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-30
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

## Done (2026-10-30)

- **Event types (AC-1, AC-2).**
  - **Type list.** `client/src/events.ts` holds it: Road, Street, Dirt,
    Cross Country, Drag, Drift and Free roam. Dirt and Cross Country are
    loose surfaces. `server/event-types.js` holds the same keys, and a test
    checks the two lists agree.
  - **Pre-run card.** It has a one-tap event row, pre-selected with this
    car's last labelled event (`defaultEventType`). Skip & record keeps the
    choice too. `TopBar` sends it with `record-start`.
  - **Saving.** The recorder accepts only known keys and writes the type into
    the `session-meta` header and the summary. A summary rebuilt from the
    `.jsonl` keeps it.
  - **Tuning Report.** An Event row sets or clears a past run's type
    (`session-set-event`), and the run list shows it. The selected run is
    re-read from the live list, so a relabel shows at once.
- **Like-for-like (AC-3).** `sameEventType` treats unlabelled runs as
  matching anything, so history recorded before this story still counts.
  `comparableRuns` adds it to the car and route-length checks. These now use
  it:
  - the planner's A/B reviews (`comparable` in `plan.ts`)
  - bisection history
  - the next-run pre-fill chain
  - the race-time comparison
- **Found during verification:** five more history pools grouped runs by car
  only. Each now also requires the same event type:
  - the learned step (`learnGain` in `tune.ts`)
  - the wrong-lever check (`unresponsive` in `plan.ts`)
  - pooled symptoms, damping and ride height (`Sessions.tsx`)
- **Tires (AC-4).** The temperature rule moved to `client/src/tires.ts` so it
  can be unit-tested.
  - On a Dirt or Cross Country run both pressures hold, with the reason shown.
  - The bisection lookup passes each past run's type, so a dirt run reads as
    the hold it was given.
- **Raw bytes (AC-5).** Each recorded frame keeps `rawPlaceholder` (offsets
  232–243, hex) and `rawTail` (anything past the base packet and tire-wear
  block). Nothing reads them yet.
- **Tests (AC-6).** `tests/unit/events.test.ts` has 18 tests. The suite is
  116/116, and the client type-check and build pass.
  - 16 mutants each fail a test. They cover: unlabelled no longer matching,
    the type ignored, each `comparableRuns` check, the default's ordering and
    car filter, dirt not loose, the bisection, planner A/B, wrong-lever and
    learned-step filters, the tire hold, the server accepting any string, and
    both raw-byte slices.
  - **Gap:** the three pooled filters and the pre-fill chain live in
    `Sessions.tsx`, which no unit test imports. The live check covers them
    only indirectly.
- **Live check.** It ran on a second copy of the new server (port 8091) beside
  the driver's own, because stopping theirs was refused.
  - **Labelling.** All 12 runs from 2026-10-29 are labelled Dirt: one through
    the report's Event row, the rest by the same command. Nine are races
    finishing at 5,950–5,951 m. Three have no finish distance: 3:42 PM,
    3:47 PM and the 39 s 6:24 PM run. The driver said every run that day was
    a dirt race. An unknown type ("moon") was refused and changed nothing.
  - **Comparisons follow the label.** Labelling the 6:03 PM run Road changed
    the 6:09 PM Dirt report:
    - "vs previous run" moved from 2:55.543 (6:03) to 3:04.586 (4:42).
    - The 6:03 → 6:09 rear-accel review dropped out.
    - The next change switched.
    Restoring Dirt brought all three back.
  - **Pre-run card.** It opened with Dirt pre-selected and closed with Cancel.
    The Event row was flush with the card's left edge; it now lines up with
    the header.
  - **Recording**, on an isolated copy of the server with its own sessions
    folder, fed by the simulator:
    - A run started as Dirt saved `eventType: "dirt"` in the header and the
      summary.
    - A run started as "moon" saved no type.
    - Deleting the Dirt summary and recovering it from the `.jsonl` kept the
      type.
- **Not verified.** No real FH6 run has been recorded with the new server.
  The driver's `npm start` still runs the old server code. The raw bytes from
  a live 324-byte packet are unknown until then; the simulator sends zeros.
