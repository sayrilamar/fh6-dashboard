// qi-trace: work-item="FH6-15" acceptance-criteria="AC-1, AC-2, AC-3, AC-4" risk-tier="high" test-coverage="tests/unit/capture-gate.test.ts"
//
// Capture gate: decides, frame by frame, when an armed recording begins and when a race
// recording has ended. Pure (no I/O), so the unit suite can drive it with frames.
//
// ---- When a capture begins ---------------------------------------------------------
// RECORD arms the recorder; capture waits for a frame that belongs to the run. FH6's
// pre-race screen already reports isRaceOn with the REAL car (#634, not the "#0 / FWD /
// 0cyl" grid placeholder), parked: speed 0, race position 0, odometer 0. Capture used to
// begin there, so the run opened with seconds of a stationary car and the loading gap.
// It now begins once the car holds a race position (the grid or green light) or moves
// (free roam). Launch analysis starts at 4 mph, so the first ~1 mph costs nothing.
//
// ---- When a race capture ends ------------------------------------------------------
// A race capture ends itself; a free-roam capture does not, because free roam has no end.
//
//   * The odometer resetting is the finish. Measured at a real FH6 finish:
//     distanceTraveled went 5950 -> 249 while lapNumber ticked 0 -> 1 and lastLap filled
//     in with the finishing time. It only goes backwards like this when the event ends
//     and the game drops you back out, so it is the definitive marker. Requiring a
//     substantial high-water mark AND a fall to under half of it keeps rewind (a few
//     hundred metres at most) from tripping it, and skips the negative distance the
//     packet reports on the grid before the lights go out.
//   * isRaceOn dropping for a long time is the fallback. It drops on pause, menus AND
//     the results screen, and cannot tell them apart; one recorded run sat paused 38 s
//     mid-race, so the timeout is generous. Frames with isRaceOn false are never
//     captured anyway, so the only cost of a late stop is a stale REC light.
//
// THE RACE CLOCK IS NOT A RACE SIGNAL. currentRaceTime runs on the pre-race screen
// (153 s and 38 s in two runs on 2026-10-29) and drops back at the green light. Treating
// "clock past 5 s" as proof of a race, and "clock went backwards" as a new event, stopped
// every recording armed before a race at the moment the race began. The clock does not
// reset at a finish either (113.38 -> 126.31 across one), so the odometer covers both of
// the jobs the clock was given. A capture proves it is a race by holding a race position.

export const AUTO_STOP_IDLE_MS = 60000; // gameplay gone this long => the run is over
export const DIST_MIN_M = 500;          // odometer must pass this before a reset can count
export const DIST_RESET_FRACTION = 0.5; // ...and fall below this share of its high-water mark
export const BEGIN_MIN_SPEED_MS = 0.5;  // ~1 mph: "the car is moving", not sensor jitter

// Should an armed recording begin on this frame?
export function shouldBegin(t) {
  if (!t.isRaceOn || !(t.carOrdinal > 0)) return false;
  return t.racePosition > 0 || t.speed > BEGIN_MIN_SPEED_MS;
}

export function freshRaceTracker() {
  return {
    lastRaceOnTs: 0,   // last frame with gameplay actually running
    maxDistance: 0,    // odometer high-water mark, measured from the event's start
    sawRace: false,    // this capture is a race, not free roam
  };
}

// Classify one frame of an active capture: 'capture' it, 'skip' it (no gameplay), or
// 'stop' because the run is over. A 'stop' frame is the aftermath, so it is not written.
export function trackFrame(r, t, ts) {
  if (!t.isRaceOn) {
    if (r.sawRace && r.lastRaceOnTs && ts - r.lastRaceOnTs >= AUTO_STOP_IDLE_MS) return 'stop';
    return 'skip';
  }
  if (r.sawRace && r.maxDistance > DIST_MIN_M && t.distanceTraveled < r.maxDistance * DIST_RESET_FRACTION) {
    return 'stop';
  }
  r.lastRaceOnTs = ts;
  if (t.racePosition > 0) r.sawRace = true;
  // The high-water mark counts from the event's start; whatever the odometer showed
  // before it belongs to free roam.
  if (r.sawRace && t.distanceTraveled > r.maxDistance) r.maxDistance = t.distanceTraveled;
  return 'capture';
}
