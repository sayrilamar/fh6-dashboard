// qi-trace work-item: FH6-15
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4, AC-5
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// The values below are measured, not invented. The pre-race screen and the race frames
// come from three runs on 2026-10-29: 2026-10-29T20-42-28-365Z, 2026-10-29T20-47-48-635Z
// and 2026-10-29T20-49-29-608Z. The finish (odometer 5950 -> 249) and the 38 s pause
// come from the recording behind de877f1.

import { describe, expect, it } from 'vitest';
import {
  AUTO_STOP_IDLE_MS,
  freshRaceTracker,
  shouldBegin,
  trackFrame,
} from '../../server/capture-gate.js';

const FRAME_MS = 33; // ~30 Hz, as recorded
// Frame timestamps are epoch ms. A real one, not 0: the tracker reads a zero "last
// gameplay" time as "none yet", which would let the idle-timeout tests pass vacuously.
const T0 = 1_793_306_548_369; // first frame of 2026-10-29T20-42-28-365Z

interface T {
  isRaceOn: boolean;
  carOrdinal: number;
  speed: number;
  racePosition: number;
  distanceTraveled: number;
  currentRaceTime: number;
}

const t = (over: Partial<T> = {}): T => ({
  isRaceOn: true,
  carOrdinal: 634,
  speed: 0,
  racePosition: 0,
  distanceTraveled: 0,
  currentRaceTime: 0,
  ...over,
});

// FH6's pre-race screen: the real car, parked, no position, no distance, clock running.
const preRace = (clock: number) => t({ currentRaceTime: clock });
// Racing: a grid position, the car moving, the event's own clock and odometer.
const racing = (clock: number, dist: number) =>
  t({ currentRaceTime: clock, distanceTraveled: dist, racePosition: 5, speed: 30 });
const noGameplay = () => t({ isRaceOn: false });

// Feed frames through one tracker; returns each frame's verdict.
function run(frames: T[], start = T0) {
  const r = freshRaceTracker();
  return frames.map((f, i) => trackFrame(r, f, start + i * FRAME_MS));
}

describe('shouldBegin: when an armed recording starts capturing (AC-1)', () => {
  it('waits on the pre-race screen, even with the race clock running', () => {
    expect(shouldBegin(preRace(153.02))).toBe(false);
    expect(shouldBegin(preRace(37.84))).toBe(false);
  });

  it('waits through the grid placeholder car and while gameplay is stopped', () => {
    expect(shouldBegin(t({ carOrdinal: 0, racePosition: 3 }))).toBe(false);
    expect(shouldBegin(noGameplay())).toBe(false);
  });

  it('begins once the car holds a race position, even standing still for the launch', () => {
    expect(shouldBegin(t({ racePosition: 5, distanceTraveled: -12 }))).toBe(true);
  });

  it('begins in free roam as soon as the car moves', () => {
    expect(shouldBegin(t({ speed: 0.3 }))).toBe(false);
    expect(shouldBegin(t({ speed: 12 }))).toBe(true);
  });
});

describe('trackFrame: the race start never ends a recording (AC-2)', () => {
  it('keeps capturing when the clock drops back at the green light', () => {
    // A capture that began before the event (free roam, clock already at 153 s), then
    // the ~10 s loading gap, then the race with its clock starting again from zero.
    const frames = [
      t({ currentRaceTime: 153.02, speed: 8 }),
      t({ currentRaceTime: 158.79, speed: 8 }),
      ...Array.from({ length: 300 }, noGameplay),
      racing(0.03, 1),
      racing(0.07, 2),
      racing(5.5, 40),
    ];
    const verdicts = run(frames);
    expect(verdicts).not.toContain('stop');
    expect(verdicts.slice(-3)).toEqual(['capture', 'capture', 'capture']);
  });

  it('ignores an odometer carried in from before the event', () => {
    const verdicts = run([
      t({ distanceTraveled: 3000, speed: 20 }),
      t({ distanceTraveled: 3010, speed: 20 }),
      racing(0.03, 0),
      racing(1, 20),
    ]);
    expect(verdicts).not.toContain('stop');
  });

  it('never treats the race clock alone as a race', () => {
    // Clock well past 5 s but no position: the idle timeout must not arm.
    const verdicts = run([preRace(158), ...Array.from({ length: 2000 }, noGameplay)]);
    expect(verdicts).not.toContain('stop');
  });
});

describe('trackFrame: a race still ends itself (AC-3)', () => {
  it('stops on the odometer reset at the finish, without capturing that frame', () => {
    const verdicts = run([racing(110, 5940), racing(113.38, 5950), racing(126.31, 249)]);
    expect(verdicts).toEqual(['capture', 'capture', 'stop']);
  });

  it('rides through a rewind and the negative grid distance', () => {
    const verdicts = run([racing(0, -12), racing(60, 3000), racing(61, 2700), racing(62, 2750)]);
    expect(verdicts).not.toContain('stop');
  });

  it('survives a 38 s mid-race pause', () => {
    const r = freshRaceTracker();
    expect(trackFrame(r, racing(50, 2000), T0)).toBe('capture');
    expect(trackFrame(r, noGameplay(), T0 + 38_000)).toBe('skip');
    expect(trackFrame(r, racing(50.1, 2002), T0 + 38_033)).toBe('capture');
  });

  it('stops once gameplay has been gone for the idle timeout', () => {
    const r = freshRaceTracker();
    trackFrame(r, racing(50, 2000), T0);
    expect(trackFrame(r, noGameplay(), T0 + AUTO_STOP_IDLE_MS - 1)).toBe('skip');
    expect(trackFrame(r, noGameplay(), T0 + AUTO_STOP_IDLE_MS)).toBe('stop');
  });
});

describe('trackFrame: free roam stays under manual control (AC-4)', () => {
  it('never auto-stops a capture with no race position', () => {
    const r = freshRaceTracker();
    expect(trackFrame(r, t({ speed: 25, distanceTraveled: 4000, currentRaceTime: 300 }), T0)).toBe('capture');
    expect(trackFrame(r, t({ speed: 25, distanceTraveled: 10, currentRaceTime: 2 }), T0 + 33)).toBe('capture');
    expect(trackFrame(r, noGameplay(), T0 + 10 * AUTO_STOP_IDLE_MS)).toBe('skip');
  });
});
