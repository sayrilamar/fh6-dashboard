---
id: FH6-15
title: Keep recording through the race start after Confirm and Record
type: bug
labels: [escape, recorder]
modules: [server/recorder.js, server/capture-gate.js, tests/unit/capture-gate.test.ts]
depends_on: [FH6-1]
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate: null        # not run through /estimate-story
---

# FH6-15 — Keep recording through the race start after Confirm and Record

As the driver, I want a recording I start before a race to run until the
finish, so that I don't have to press RECORD again mid-race and lose the
launch and the opening corners.

## What happened (escape, found 2026-10-29)

Pressing **Confirm and Record** on the pre-race screen started a recording,
which then stopped itself the moment the race began. The driver had to press
RECORD again mid-race to capture anything. Three runs on 2026-10-29 show it:

| Session | Frames | What it holds |
|---|---|---|
| `2026-10-29T20-42-28-365Z` | 174 (6 s) | pre-race screen only |
| `2026-10-29T20-47-48-635Z` | 115 (4 s) | pre-race screen only |
| `2026-10-29T20-49-29-608Z` | 3,095 (103 s) | the race, from the manual re-press at race time 87 s to the finish |

On the pre-race screen FH6 reports `isRaceOn = true` and the real car, with
speed 0, race position 0, and odometer 0. **The race clock is already
running**: 153 s in one run, 38 s in the other. The recorder:

1. **Began capturing there,** because the arming check only waits for
   `isRaceOn` and a non-zero car ordinal.
2. **Decided it was already in a race** (`sawRace`), because the clock was past
   5 s, and kept the clock's high-water mark.
3. **Stopped at the green light,** when the clock dropped back toward zero and
   the "clock reset means a new event began" check fired. Both stops were
   written 10 s after the last pre-race frame, matching the loading gap. The
   manual run's clock puts the green light at 20:48:02.66, and the second
   auto-stop was written at 20:48:02.659.

Introduced by `2de054d` (2026-08-30, the race auto-stop). It survived
`de877f1`, which proved the clock doesn't reset at a finish but kept the
clock-reset stop and the clock-based race test.

## Acceptance criteria

- **AC-1** A recording armed on the stationary pre-race screen doesn't begin
  until the car holds a race position or moves. Pre-race frames never land in
  the session.
- **AC-2** The race clock is never treated as proof of a race, and the clock
  dropping back at the green light never stops a recording.
- **AC-3** The finish still auto-stops on the odometer reset (5950 → 249 m). A
  38 s mid-race pause doesn't stop the recording; 60 s without gameplay does.
- **AC-4** A free-roam capture (no race position) never auto-stops; it stays
  under manual control.
- **AC-5** Unit tests replay the measured frame pattern, and
  `npm run test:unit` passes.

## Notes

- **Telemetry contract:** the memory entry still says a capture proves it is a
  race by "race clock past 5 s, or a grid position". The clock half is wrong,
  so the next `/dream` pass should correct it.
- **Assumption:** a race event reports a race position above 0 once it is
  underway. The simulator always reports 1. An event that reports position 0
  throughout would now record until stopped by hand rather than stopping
  early.

## Done (2026-10-29)

- **The decision moved into a pure module, `server/capture-gate.js`**
  (`shouldBegin`, `freshRaceTracker`, `trackFrame`), the same pattern FH6-2
  used, so it's testable without touching `sessions/`. `recorder.js` calls it
  and keeps all the file I/O.
- **AC-1:** an armed recording begins once the real car holds a race position
  or moves faster than 0.5 m/s (about 1 mph). The parked pre-race screen no
  longer starts it. Launch analysis starts at 4 mph, so nothing is lost.
- **AC-2:** only a race position proves a race, and the odometer high-water
  mark counts from that point. The clock-reset stop is gone: it never caught
  a real finish, and the odometer reset already covers a new event starting.
- **AC-3 / AC-4:** the odometer finish, the 60 s idle timeout and free roam's
  manual stop are unchanged and covered by tests.
- **AC-5:** `tests/unit/capture-gate.test.ts` has 12 tests built from the
  measured values. The suite is 38/38.
- **Mutation check:** five deliberate regressions each fail the new tests:
  - the clock proving a race (the original bug)
  - capture beginning on the pre-race screen
  - the odometer counted before the event
  - the idle stop arming without a race
  - the odometer finish removed
- **Replay through the real `Recorder` class,** using isolated copies:
  - **Frames:** run 2's pre-race frames, a 10 s loading gap, run 3's race
    frames re-based to start at the green light, and the measured finish.
  - **Old recorder:** it auto-stopped on the first race frame with 115 frames,
    reproducing run 2 exactly.
  - **Fixed recorder:** it skipped the pre-race screen, captured the race
    (3,096 frames), and stopped on the finish frame, with race time 103.3 s
    from the race's own clock.
- **Visible change:** after Confirm and Record on the pre-race screen, the
  dashboard shows *armed* until the race starts, then *recording*.
