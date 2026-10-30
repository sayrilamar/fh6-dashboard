// qi-trace work-item: FH6-32
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// Car #1335 (Mazda 787B), 2026-10-30. In the FH6-30 validation, brake balance 55 → 41 made
// the rear step out under braking (trail-brake slides ~2 → ~10 per 1k), so that direction
// was marked "proven wrong". By the 14:09 run the balance was 67 %, front brake slip 90 %
// against rear 21 %, and the bisection wanted 61 % — between 55 (rear steps out) and 67
// (fronts lock). The direction-wide block refused it, and the report said "out of levers".

import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../client/src/plan';
import type { Candidate } from '../../client/src/plan';
import { brakeDiagnosis } from '../../client/src/rows';
import type { SessionSummary } from '../../client/src/types';
import { session } from '../fixtures/sessions';

// A run with the brake balance it ran and its trail-brake slide rate (the balance lever's metric).
const run = (id: string, startedAt: number, balance: number, trailBrake: number, extra: Record<string, number> = {}): SessionSummary =>
  ({
    ...session(id, startedAt, { balance, ...extra }, 1335),
    analytics: { handling: { slideCausePer1k: { trailBrake, power: 0, grip: 0 }, cornerFrames: 3000, understeerFrames: 0 } },
  }) as unknown as SessionSummary;
const frontLock = (delta: number): Candidate =>
  ({ channel: 'balance', label: 'Brake balance', delta, why: 'fronts lock first', symptom: 'frontLock', severity: 0.6 });
// The balance advice each run gave: rear steps out at 55 and below (raise), fronts lock at 67 (lower).
const advice = () => (x: SessionSummary) => ((x.meta?.tune?.balance ?? 0) >= 67 ? -3 : 3);

// 55 → 41 backfired: two runs at each setting, so the review pools them.
const history = [run('v1', 1, 55, 2.0), run('v2', 2, 55, 2.4), run('v3', 3, 41, 9.0), run('v4', 4, 41, 10.0)];

describe('a backfire blocks only the range it tested (AC-1)', () => {
  it('offers 67 → 61, between the two settings already tried', () => {
    const now = run('14:09', 5, 67, 0.4);
    const plan = buildPlan(now, [...history, now], [frontLock(-6)], advice);
    expect(plan.experiments.find((e) => e.channel === 'balance' && e.from === 55 && e.to === 41)?.review?.verdict,
      'the fixture reproduces the backfire').toBe('backfired');
    expect(plan.blocked.map((c) => c.channel)).not.toContain('balance');
    expect(plan.primary?.channel).toBe('balance');
    expect(plan.primary?.to).toBe(61);
    expect(plan.status.state).toBe('tuning');
  });

  it('keeps the whole direction blocked when the run has no brake balance captured', () => {
    const now = { ...session('no-tune-value', 5, { rearAccel: 0 }, 1335), analytics: history[0].analytics } as SessionSummary;
    const plan = buildPlan(now, [...history, now], [frontLock(-6)], advice);
    expect(plan.primary?.from ?? null, 'no captured value').toBeNull();
    expect(plan.blocked.find((c) => c.channel === 'balance')?.blocked).toContain('tried this direction (55→41)');
  });

  it('still blocks a move from 55 back toward 41', () => {
    const now = run('back-at-55', 5, 55, 2.2);
    const lower = () => (x: SessionSummary) => ((x.meta?.tune?.balance ?? 0) >= 55 ? -3 : 3);
    const plan = buildPlan(now, [...history, now], [frontLock(-3)], lower);
    expect(plan.blocked.find((c) => c.channel === 'balance')?.blocked).toContain('tried this direction (55→41)');
    expect(plan.primary).toBeNull();
  });
});

describe('"out of levers" counts only the named symptom\'s levers (AC-2)', () => {
  it('leaves a ride height marked at its minimum out of the brake-lever count', () => {
    const now = { ...run('back-at-55', 5, 55, 2.2, { frontHeight: 2.8 }) } as SessionSummary;
    now.meta = { ...now.meta!, limits: { frontHeight: 'min' } };
    const lower = () => (x: SessionSummary) => ((x.meta?.tune?.balance ?? 0) >= 55 ? -3 : 3);
    const plan = buildPlan(now, [...history, now], [
      frontLock(-3),
      { channel: 'frontHeight', label: 'Front ride height', delta: -0.4, why: 'headroom to lower', symptom: 'bottoming', severity: 0.3 },
    ], lower);
    expect(plan.blocked.map((c) => c.channel).sort()).toEqual(['balance', 'frontHeight']);
    expect(plan.status.state).toBe('limited');
    expect(plan.status.blockedLevers, 'only brake balance targets front lock').toBe(1);
  });
});

describe('the braking summary names a wide split (AC-3)', () => {
  it('calls the 14:09 run front-heavy, not balanced', () => {
    const d = brakeDiagnosis(90, 21);
    expect(d.diagnosis).toContain('Front-heavy braking');
    expect(d.diagnosis).not.toContain('balanced');
    expect(d.level).toBe('warn');
    expect(brakeDiagnosis(21, 90).diagnosis).toContain('Rear-heavy braking');
  });

  it('keeps the other verdicts', () => {
    expect(brakeDiagnosis(85, 80).diagnosis).toContain('near the limit, balanced');
    expect(brakeDiagnosis(96, 50).diagnosis).toContain('Fronts locking first');
    expect(brakeDiagnosis(60, 50).diagnosis).toContain('Under-braking');
  });
});
