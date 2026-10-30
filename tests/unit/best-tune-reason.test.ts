// qi-trace work-item: FH6-36
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4, AC-5
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// Car #1335 (Mazda 787B), 2026-10-30. The 15:22 run read "Best tune for this build — the
// levers are used up" because the car "still shows suspension bottoming out", at 0 %
// bottoming with both ride heights marked at the game's minimum. Beside it, Front Accel
// asked for 41 → 38 (a lever the planner never weighed; 44 → 41 had moved front wheelspin
// from about 42 % to 44 %), and the gear rows asked for a re-spaced box worth 0.006 s per
// full pull.

import { describe, expect, it } from 'vitest';
import { buildPlan, tuneVerdict } from '../../client/src/plan';
import type { Candidate } from '../../client/src/plan';
import { diffDeltas, frontAccelCandidate, frontSpinSeverity, rideHeightTag } from '../../client/src/rows';
import { GEARBOX_MIN_GAIN_PCT, recommendedBox, solveGearing } from '../../client/src/gearing';
import type { GearContext, GearRatios } from '../../client/src/gearing';
import type { SessionAnalytics, SessionSummary } from '../../client/src/types';
import { session } from '../fixtures/sessions';

// A run of the car: AWD, front and rear wheelspin under power, settled handling.
const analytics = (frontSpin: number, rearSpin = 40) =>
  ({
    diff: { accelSlipFrontPct: frontSpin, accelSlipRearPct: rearSpin, brakeSlipFrontPct: 78, brakeSlipRearPct: 26 },
    handling: {
      cornerFrames: 2400, understeerFrames: 0,
      entry: { usPct: 0 }, exit: { usPct: 0 },
      slideCausePer1k: { trailBrake: 0.8, power: 1.2, grip: 0 },
    },
  }) as unknown as SessionAnalytics;
const tune = { frontAccel: 41, frontHeight: 2.8, rearHeight: 2.8, balance: 58 };
const run = (id: string, startedAt: number, frontSpin: number, t: Record<string, number> = tune): SessionSummary => {
  const s = session(id, startedAt, t, 1335);
  s.analytics = analytics(frontSpin);
  s.meta = { ...s.meta!, limits: { frontHeight: 'min', rearHeight: 'min' } };
  return s;
};
const noHistory = () => () => null;
const deltaOf = (ch: string) => (ch === 'frontAccel'
  ? (x: SessionSummary) => (x.analytics?.diff ? diffDeltas(x.analytics).frontAccel.d : null)
  : null);

// "Front only uses 70% of its bump travel — headroom to LOWER", at the marked minimum.
const lower = (channel: 'frontHeight' | 'rearHeight'): Candidate =>
  ({ channel, label: channel, delta: -3, why: 'headroom to LOWER', ...rideHeightTag(-3, 0) });

describe('lowering a car that doesn\'t bottom is a refinement (AC-1)', () => {
  it('tags a lowering as lowerCG, and a raise as bottoming', () => {
    expect(rideHeightTag(-3, 0)).toEqual({ symptom: 'lowerCG', severity: 0.25 });
    expect(rideHeightTag(4, 2.5)).toEqual({ symptom: 'bottoming', severity: 0.7 });
    expect(rideHeightTag(3, 0.5), 'raised on peak travel, little bottoming').toEqual({ symptom: 'bottoming', severity: 0.25 });
  });

  it('a lowering at the marked minimum leaves the car optimal, not out of levers', () => {
    const s = run('15:22', 10, 30);
    const plan = buildPlan(s, [s], [lower('frontHeight'), lower('rearHeight')], noHistory);
    expect(plan.blocked.map((b) => b.channel)).toEqual(['frontHeight', 'rearHeight']);
    expect(plan.status.state).toBe('dialled-in');
    expect(tuneVerdict(s, plan, null)).toMatchObject({ kind: 'optimal', symptom: null });
  });

  it('is still offered while the car can go lower', () => {
    const s = { ...run('a', 10, 30), meta: { carOrdinal: 1335, tune } } as SessionSummary;
    const plan = buildPlan(s, [s], [lower('frontHeight')], noHistory);
    expect(plan.thisRun.map((c) => c.channel)).toEqual(['frontHeight']);
  });

  it('real bottoming with the height at its maximum is still a build limit', () => {
    const s = { ...run('a', 10, 30), meta: { carOrdinal: 1335, tune, limits: { frontHeight: 'max' } } } as SessionSummary;
    const raise: Candidate = { channel: 'frontHeight', label: 'Front ride height', delta: 4, why: 'bottoms out', ...rideHeightTag(4, 2.5) };
    const v = tuneVerdict(s, buildPlan(s, [s], [raise], noHistory), null);
    expect(v).toMatchObject({ kind: 'build-limit', symptom: 'bottoming' });
  });
});

describe('front accel lock is a planner lever (AC-2)', () => {
  it('scores front wheelspin from 25 % (fine) to 100 %, or a push on exit', () => {
    expect(frontSpinSeverity(25)).toBe(0);
    expect(frontSpinSeverity(46)).toBeCloseTo(0.28, 2);
    expect(frontSpinSeverity(25, 30)).toBe(1);
  });

  it('gives the 15:22 run a candidate at the 5-run median, with the row\'s own move', () => {
    const c = frontAccelCandidate(analytics(46), 'AWD', 45)!;
    expect(c).toMatchObject({ channel: 'frontAccel', delta: -3, symptom: 'frontWheelspin' });
    expect(c.severity, 'scored on the median 45 %, not this run\'s 46 %').toBeCloseTo(frontSpinSeverity(45), 9);
    expect(frontAccelCandidate(analytics(46), 'RWD', 45), 'no front diff').toBeNull();
  });

  // 44 % for six runs, then 41 % for six: front wheelspin moved within its own scatter.
  const at44 = [42, 40, 44, 41, 42, 44].map((f, i) => run(`44-${i}`, i, f, { ...tune, frontAccel: 44 }));
  const at41 = [41, 46, 43, 45, 43, 46].map((f, i) => run(`41-${i}`, 10 + i, f));
  const history = [...at44, ...at41];
  const now = at41[at41.length - 1];
  const candidates = [{ label: 'Front accel lock', ...frontAccelCandidate(now.analytics!, 'AWD', 45)! }, lower('frontHeight'), lower('rearHeight')];

  it('reviews 44 → 41 on front wheelspin: no effect', () => {
    const plan = buildPlan(now, history, candidates, deltaOf);
    const e = plan.experiments.find((x) => x.channel === 'frontAccel');
    expect([e?.from, e?.to]).toEqual([44, 41]);
    expect(e?.review).toMatchObject({ metricLabel: 'front wheelspin under power', verdict: 'no-effect' });
  });

  it('blocks a further cut and holds the row at 41', () => {
    const plan = buildPlan(now, history, candidates, deltaOf);
    const fa = plan.blocked.find((c) => c.channel === 'frontAccel');
    expect(fa?.blocked).toContain('wrong lever');
    expect(fa?.to).toBe(41);
    expect(plan.thisRun).toEqual([]);
  });

  it('names front wheelspin as the limit, never bottoming', () => {
    const plan = buildPlan(now, history, candidates, deltaOf);
    const v = tuneVerdict(now, plan, null);
    expect(v).toMatchObject({ kind: 'build-limit', symptom: 'frontWheelspin' });
    expect(v?.usedUp.map((c) => c.channel)).toEqual(['frontAccel']);
  });
});

describe('confirmation is "nothing left to change" (AC-4)', () => {
  it('confirms 15:22 (front wheelspin median 45 %) by 15:19 (43 %, under the line)', () => {
    const prev = run('15:19', 1, 46), cur = run('15:22', 2, 46);
    // Front accel's only lever is used up (here marked at its minimum), as in the run.
    const fa = (median: number): Candidate => ({ label: 'Front accel lock', ...frontAccelCandidate(analytics(46), 'AWD', median)! });
    const limits = { frontAccel: 'min' as const, frontHeight: 'min' as const, rearHeight: 'min' as const };
    prev.meta = { ...prev.meta!, limits }; cur.meta = { ...cur.meta!, limits };
    const before = buildPlan(prev, [prev], [fa(43)], noHistory);
    const after = buildPlan(cur, [prev, cur], [fa(45)], noHistory);
    expect([before.status.state, after.status.state]).toEqual(['dialled-in', 'limited']);
    expect(tuneVerdict(cur, after, before)?.confirmed).toBe(true);
  });
});

// The 15:22 run's measured context: power band (rpm, hp), rev ceiling 10,133 rpm, 98.4 m/s
// at 9,559 rpm in 6th, CdA 0.962.
const BAND: [number, number][] = [[1250, 10], [1500, 25], [2000, 46], [2500, 78], [3000, 122], [3750, 289], [4000, 97], [4250, 331], [4500, 369], [4750, 402], [5000, 429], [5250, 377], [5500, 0], [5750, 507], [6000, 528], [6250, 554], [6500, 578], [6750, 606], [7000, 627], [7250, 645], [7500, 660], [7750, 674], [8000, 686], [8250, 697], [8500, 706], [8750, 714], [9000, 718], [9250, 718], [9500, 716], [9750, 713], [10000, 708], [10250, 701]];
const ctx: GearContext = { powerBand: BAND.map(([rpm, hp]) => ({ rpm, hp })), revLimit: 10133, topSpeedMs: 98.37, topGearMaxRpm: 9559, cdA: 0.962 };
const box: GearRatios = { 1: 4.22, 2: 2.42, 3: 1.82, 4: 1.45, 5: 1.19, 6: 1 };

describe('a box within the floor of the solved spacing holds (AC-3)', () => {
  it('holds the 15:22 box: the re-spacing it was offered is worth well under the floor', () => {
    const rec = recommendedBox(box, 6, ctx)!;
    expect(rec.sol.solved).toBe(true);
    expect(rec.sol.gainVsCurrentPct!).toBeLessThan(GEARBOX_MIN_GAIN_PCT);
    expect(rec.held).toBe(true);
    expect(rec.box).toEqual(box);
  });

  it('still re-spaces an evenly spaced box, which loses far more', () => {
    const even: GearRatios = { 1: 4.22, 6: 1 };
    for (let n = 2; n <= 5; n++) even[n] = +(4.22 * (1 / 4.22) ** ((n - 1) / 5)).toFixed(2);
    const rec = recommendedBox(even, 6, ctx)!;
    expect(rec.sol.gainVsCurrentPct!).toBeGreaterThan(GEARBOX_MIN_GAIN_PCT);
    expect(rec.held).toBe(false);
    expect(rec.box).toEqual(rec.sol.ratios);
  });

  it('has nothing to compare when the middle gears aren\'t entered', () => {
    const sol = solveGearing({ 1: 4.22, 6: 1 }, 6, ctx)!;
    expect(sol.gainVsCurrentPct).toBeNull();
    expect(recommendedBox({ 1: 4.22, 6: 1 }, 6, ctx)!.held).toBe(false);
  });
});
