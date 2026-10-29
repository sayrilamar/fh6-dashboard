// qi-trace work-item: FH6-1
// qi-trace acceptance-criteria: AC-4, AC-6
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium

import { describe, expect, it } from 'vitest';
import { DEFAULT_P, finalDriveAdvice, solveGearing } from '../../client/src/gearing';
import type { GearContext, GearRatios, PowerPoint } from '../../client/src/gearing';

// The simulator's engine: a torque bell peaking near 4,800 rpm, sampled every 400 rpm.
const powerBand: PowerPoint[] = [];
for (let rpm = 2000; rpm <= 7800; rpm += 400) {
  const torqueNm = 480 * Math.exp(-(((rpm - 4800) / 2600) ** 2)) + 120;
  powerBand.push({ rpm, hp: (torqueNm * rpm) / 7120.9 });
}
const ctx: GearContext = { powerBand, revLimit: 7800, topSpeedMs: 75, topGearMaxRpm: 7200, cdA: 0.7 };

const anchors: GearRatios = { 1: 3.2, 6: 0.82 };

function expectStrictlyDescending(r: GearRatios, n: number) {
  for (let g = 2; g <= n; g++) expect(r[g], `gear ${g} (${r[g]}) is taller than gear ${g - 1} (${r[g - 1]})`).toBeLessThan(r[g - 1]);
}

describe('solveGearing', () => {
  it('refuses a box it cannot solve', () => {
    expect(solveGearing({ 1: 0.82, 6: 3.2 }, 6, ctx), '1st must be shorter than top').toBeNull();
    expect(solveGearing({ 1: 3.2, 2: 1.5 }, 2, ctx), 'needs at least 3 gears').toBeNull();
    expect(solveGearing({ 1: 3.2 }, 6, ctx), 'needs a top-gear anchor').toBeNull();
  });

  it('solves a strictly descending box against a measured power band, holding 1st and top', () => {
    const sol = solveGearing(anchors, 6, ctx)!;
    expect(sol.solved, 'the power band was usable').toBe(true);
    expect(sol.ratios[1]).toBe(3.2);
    expect(sol.ratios[6]).toBe(0.82);
    expectStrictlyDescending(sol.ratios, 6);
    expect(sol.gainVsGeometricSec!, 'never worse than the geometric arc').toBeGreaterThanOrEqual(0);
  });

  it('falls back to the validated exponent when there is no telemetry', () => {
    const sol = solveGearing(anchors, 6, {})!;
    expect(sol.solved).toBe(false);
    expect(sol.exponent).toBe(DEFAULT_P);
    expectStrictlyDescending(sol.ratios, 6);
  });
});

describe('finalDriveAdvice without a gearing solve', () => {
  it('holds when there is no final-drive data', () => {
    const a = finalDriveAdvice(null);
    expect(a.solved).toBe(false);
    expect(a.pct).toBe(0);
    expect(a.scale).toBe(1);
  });

  it('lengthens (lower number) when top gear sits on the limiter', () => {
    const a = finalDriveAdvice({ limiterPct: 10, topGearRpmPct: 100, topGearMaxRpm: 7800, redlineRpm: 7800 });
    expect(a.solved).toBe(false);
    expect(a.pct, 'a lower final-drive number is a longer drive').toBeLessThan(0);
    expect(a.scale).toBeCloseTo(1 + a.pct / 100, 9);
  });

  it('shortens (higher number) when top gear leaves revs unused', () => {
    const a = finalDriveAdvice({ limiterPct: 0, topGearRpmPct: 85, topGearMaxRpm: 6630, redlineRpm: 7800 });
    expect(a.pct, 'a higher final-drive number is a shorter drive').toBeGreaterThan(0);
    expect(a.scale).toBeCloseTo(1 + a.pct / 100, 9);
  });
});
