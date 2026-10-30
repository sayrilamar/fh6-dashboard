// qi-trace work-item: FH6-35
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4, AC-5
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// Car #1335 (Mazda 787B), 2026-10-30. Brake balance 58 % / pressure 115 % gave front 80.5 % /
// rear 28.5 % typical brake slip with ~0.4 trail-brake slides per 1k, the best compromise
// tried. Below ~55 % the rear steps out on corner entry. The report still asked for more
// pressure on that front-heavy split (115 → 121–124 %), though 52 % / 130 % had shown it only
// pushes the front toward lockup; it showed a blocked balance as "→ 34 %"; and from 52 % it
// offered no way back.

import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../client/src/plan';
import type { Candidate } from '../../client/src/plan';
import { brakeAdvice } from '../../client/src/rows';
import type { SessionAnalytics, SessionSummary } from '../../client/src/types';
import { session } from '../fixtures/sessions';

const analytics = (front: number, rear: number, trailBrake = 0, brakeStability = 'front-lock') =>
  ({
    diff: { brakeSlipFrontPct: front, brakeSlipRearPct: rear },
    handling: { slideCausePer1k: { trailBrake, power: 0, grip: 0 }, brakeStability, cornerFrames: 3000, understeerFrames: 0 },
  }) as unknown as SessionAnalytics;

describe('pressure on a front-heavy split (AC-1)', () => {
  it('holds at the 15:05 run instead of asking for more', () => {
    const adv = brakeAdvice(analytics(81, 28))!;
    expect(adv.press.d).toBe(0);
    expect(adv.press.why).toContain('front does most of the braking');
  });

  it('holds at the 52 % / 130 % run too', () => {
    expect(brakeAdvice(analytics(85, 46, 2.6))!.press.d).toBe(0);
  });

  it('still raises pressure while the busier axle is well under the limit', () => {
    expect(brakeAdvice(analytics(60, 30))!.press.d, 'split, but the front is only at 60 %').toBeGreaterThan(0);
  });

  it('still adds a touch when the axles are together and just under', () => {
    expect(brakeAdvice(analytics(78, 72, 0, 'stable'))!.press.d).toBeGreaterThan(0);
  });
});

describe('the balance row says what it measured (AC-3)', () => {
  it('never calls 78 % / 26 % "both axles reach the limit together"', () => {
    const adv = brakeAdvice(analytics(78, 26))!;
    expect(adv.bal.d).toBe(0);
    expect(adv.bal.why).toContain('neither axle is near the limit');
    expect(adv.bal.why).not.toContain('reach the limit together');
  });

  it('keeps that wording when both axles really are at the limit together', () => {
    expect(brakeAdvice(analytics(88, 85, 0, 'stable'))!.bal.why).toContain('reach the limit together');
  });
});

// The FH6-30 validation's backfire: 55 → 41 made the rear step out (trail-brake ~2 → ~10).
const run = (id: string, startedAt: number, balance: number, trailBrake: number): SessionSummary =>
  ({
    ...session(id, startedAt, { balance }, 1335),
    analytics: { handling: { slideCausePer1k: { trailBrake, power: 0, grip: 0 }, cornerFrames: 3000, understeerFrames: 0 } },
  }) as unknown as SessionSummary;
const history = [run('v1', 1, 55, 2.0), run('v2', 2, 55, 2.4), run('v3', 3, 41, 9.0), run('v4', 4, 41, 10.0)];
const rearward: Candidate = { channel: 'balance', label: 'Brake balance', delta: -6, why: 'fronts lock first', symptom: 'frontLock', severity: 0.5 };
const fronts = () => () => -3;   // every run says "fronts lock first — go rearward"

describe('a blocked lever holds (AC-2)', () => {
  it('shows the current balance, not the bisection\'s 40 %', () => {
    const now = run('15:05', 5, 58, 0);
    const plan = buildPlan(now, [...history, now], [rearward], fronts);
    const bal = plan.blocked.find((c) => c.channel === 'balance');
    expect(bal?.blocked).toContain('tried this direction (55→41)');
    expect(bal?.to).toBe(58);
  });
});

describe('the way back from inside a backfired range (AC-4)', () => {
  it('offers balance 52 → 55, where the backfired change started', () => {
    const now = run('14:49', 5, 52, 4.3);
    const plan = buildPlan(now, [...history, now], [rearward], fronts);
    const back = plan.thisRun.find((c) => c.channel === 'balance');
    expect(back?.kind).toBe('recovery');
    expect([back?.from, back?.to]).toEqual([52, 55]);
  });

  it('offers the way back once, even after two backfires of the same change', () => {
    // 55 → 41 twice, as in the validation's A B C D D C B A order.
    const twice = [...history, run('v5', 5, 55, 2.2), run('v6', 6, 41, 9.5)];
    const now = run('14:49', 7, 52, 4.3);
    const plan = buildPlan(now, [...twice, now], [rearward], fronts);
    expect(plan.experiments.filter((e) => e.from === 55 && e.to === 41 && e.review?.verdict === 'backfired')).toHaveLength(2);
    expect(plan.thisRun.filter((c) => c.channel === 'balance')).toHaveLength(1);
    expect(plan.queued.filter((c) => c.channel === 'balance')).toHaveLength(0);
  });

  it('offers nothing from 58, which is outside that range', () => {
    const now = run('15:05', 5, 58, 0);
    const plan = buildPlan(now, [...history, now], [rearward], fronts);
    expect(plan.thisRun.find((c) => c.channel === 'balance')).toBeUndefined();
  });
});
