// qi-trace work-item: FH6-5
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium
//
// Pins the pre-run screen's final-drive target (finalDriveTarget, FH6-4) to the RECORDED
// run. The escape it guards (5cf8628): the screen scaled whatever was typed in the box,
// so applying the advice moved the advice, 4.07 → 4.33 → 4.61 → 4.91 → 5.23 → 5.57 …
//
// The engine is the simulator's torque bell from gearing.test.ts. With top gear reaching
// 6,630 of 7,800 rpm the solver lengthens the drive 9.5% (scale 0.905); at 6,200 rpm it
// holds; at 7,700 rpm the speed range is too narrow to solve and the rev-limit rule holds.

import { describe, expect, it } from 'vitest';
import { contextFromAnalytics, finalDriveAdvice, finalDriveTarget } from '../../client/src/gearing';
import type { GearRatios, PowerPoint } from '../../client/src/gearing';

const powerBand: PowerPoint[] = [];
for (let rpm = 2000; rpm <= 7800; rpm += 400) {
  const torqueNm = 480 * Math.exp(-(((rpm - 4800) / 2600) ** 2)) + 120;
  powerBand.push({ rpm, hp: (torqueNm * rpm) / 7120.9 });
}

// A recorded run's analytics, keyed by how far top gear revved on the straight.
const analyticsAt = (topGearMaxRpm: number) => ({
  gearing: {
    powerBand,
    topSpeedMs: 75,
    finalDrive: { limiterPct: 0, topGearRpmPct: Math.round((topGearMaxRpm / 7800) * 100), topGearMaxRpm, redlineRpm: 7800 },
  },
  cdA: { value: 0.7 },
});
const moves = analyticsAt(6630);   // solved: lengthen 9.5%
const holdsSolved = analyticsAt(6200);
const holdsByRpm = analyticsAt(7700);

const sixSpeed: GearRatios = { 1: 3.2, 2: 2.3, 3: 1.75, 4: 1.38, 5: 1.1, 6: 0.82 };
const threeSpeed: GearRatios = { 1: 3.2, 2: 1.6, 3: 0.82 };
const twoSpeed: GearRatios = { 1: 3.2, 2: 0.82 };

// The tune confirmed before a run, as the recorder stores it.
const runTune = (finalDrive: number | undefined, box: GearRatios): Record<string, number> => {
  const t: Record<string, number> = {};
  if (finalDrive !== undefined) t.finalDrive = finalDrive;
  for (const [g, r] of Object.entries(box)) t[`gear${g}`] = r;
  return t;
};

describe('finalDriveTarget: the recorded final drive × the solved scale (AC-1)', () => {
  it('scales a run recorded at 4.07 by the solved scale, rounded to 2 decimals', () => {
    const adv = finalDriveAdvice(moves.gearing.finalDrive, sixSpeed, contextFromAnalytics(moves));
    expect(adv.solved, 'the fixture solves against the power band').toBe(true);
    expect(adv.pct, 'and the solve moves the drive').toBeLessThan(0);
    const target = finalDriveTarget(runTune(4.07, sixSpeed), moves, {});
    expect(target).toBe(Math.round(4.07 * adv.scale * 100) / 100);
    expect(target, '4.07 × 0.905').toBe(3.68);
  });

  it('follows the recorded final drive, so applying the advice cannot move it again', () => {
    // The 5cf8628 loop, replayed: each round "applies" the target to the box. Only the
    // recorded run feeds the target, so it stays put.
    const recorded = runTune(4.07, sixSpeed);
    const targets = Array.from({ length: 5 }, () => finalDriveTarget(recorded, moves, sixSpeed));
    expect(targets, 'no chase').toEqual([3.68, 3.68, 3.68, 3.68, 3.68]);
    expect(finalDriveTarget(runTune(4.33, sixSpeed), moves, {}), 'a run recorded at 4.33: 4.33 × 0.905').toBe(3.92);
  });
});

describe('finalDriveTarget: no target (AC-2)', () => {
  it('when the solve says hold (0%)', () => {
    const adv = finalDriveAdvice(holdsSolved.gearing.finalDrive, sixSpeed, contextFromAnalytics(holdsSolved));
    expect([adv.solved, adv.pct]).toEqual([true, 0]);
    expect(finalDriveTarget(runTune(4.07, sixSpeed), holdsSolved, {})).toBeNull();
  });

  it('when the rev-limit fallback says hold (0%)', () => {
    const adv = finalDriveAdvice(holdsByRpm.gearing.finalDrive, sixSpeed, contextFromAnalytics(holdsByRpm));
    expect([adv.solved, adv.pct]).toEqual([false, 0]);
    expect(finalDriveTarget(runTune(4.07, sixSpeed), holdsByRpm, {})).toBeNull();
  });

  it('when the run has no recorded final drive, even though the advice moves', () => {
    expect(finalDriveTarget(runTune(undefined, sixSpeed), moves, sixSpeed), 'not recorded').toBeNull();
    expect(finalDriveTarget(runTune(0, sixSpeed), moves, sixSpeed), 'recorded as 0').toBeNull();
    expect(finalDriveTarget(undefined, moves, sixSpeed), 'no tune confirmed before the run').toBeNull();
  });

  it('when the run has no gearing analytics', () => {
    expect(finalDriveTarget(runTune(4.07, sixSpeed), { cdA: { value: 0.7 } }, sixSpeed)).toBeNull();
  });
});

describe('finalDriveTarget: whose gear ratios (AC-3)', () => {
  it('uses the recorded ratios when the run has 2 or more, ignoring the fallback', () => {
    expect(finalDriveTarget(runTune(4.07, sixSpeed), moves, threeSpeed), 'six recorded').toBe(3.68);
    // Exactly two is enough: the two-speed answer, not the six-speed fallback's 3.68.
    expect(finalDriveTarget(runTune(4.07, twoSpeed), moves, sixSpeed), 'two recorded').toBe(4.27);
  });

  it('uses the fallback ratios when the run recorded fewer than 2', () => {
    const oneGear = runTune(4.07, { 1: 3.2 });
    expect(finalDriveTarget(oneGear, moves, threeSpeed), 'three-speed fallback').toBe(3.89);
    expect(finalDriveTarget(oneGear, moves, sixSpeed), 'six-speed fallback').toBe(3.68);
    expect(finalDriveTarget(runTune(4.07, {}), moves, threeSpeed), 'no gears recorded').toBe(3.89);
  });
});
