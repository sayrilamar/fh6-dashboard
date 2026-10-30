// qi-trace work-item: FH6-16
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// A change can be judged "backfired" from a baseline near zero, where no percentage
// exists (symptomDeltaPct is null). The planner's messages assumed one and blanked the
// whole tuning report. Shape taken from car #634 on 2026-10-29: rear rebound 11.6 -> 10
// moved its rebound/bump balance error 0.03 -> 0.06, enough to clear the noise test.

import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../client/src/plan';
import type { Candidate } from '../../client/src/plan';
import type { SessionSummary } from '../../client/src/types';
import { session } from '../fixtures/sessions';

const noHistory = () => () => null;

// Rear rebound is judged by |rReb / rBump - 0.8|, so a run reading `err` has rReb = 0.8 + err.
const run = (id: string, startedAt: number, rearRebound: number, err: number): SessionSummary =>
  ({
    ...session(id, startedAt, { rearRebound }),
    analytics: { damping: { fBump: 1, fReb: 0.8, rBump: 1, rReb: 0.8 + err, rmsF: 1, rmsR: 1 } },
  }) as unknown as SessionSummary;

// Two runs at each setting, so the review pools them and the gap clears 2 standard errors.
function history(before: [number, number], after: [number, number]) {
  return [
    run('r1', 1, 11.6, before[0]),
    run('r2', 2, 11.6, before[1]),
    run('r3', 3, 10, after[0]),
    run('r4', 4, 10, after[1]),
  ];
}

// The planner asks to soften rear rebound again: the same direction that backfired.
const softenRearRebound: Candidate[] = [
  { channel: 'rearRebound', label: 'Rear rebound', delta: -1, why: 'test', symptom: 'trailBrakeOversteer', severity: 0.6 },
];

const messages = (plan: ReturnType<typeof buildPlan>) => ({
  blocked: plan.blocked.find((c) => c.channel === 'rearRebound')?.blocked ?? '',
  recovery: [plan.primary, ...plan.queued].find((c) => c?.kind === 'recovery')?.why ?? '',
});

describe('buildPlan with a backfired change in the history', () => {
  it('opens a run whose backfired change has no percentage (AC-1)', () => {
    const runs = history([0.02, 0.04], [0.06, 0.08]);
    expect(() => buildPlan(runs[3], runs, softenRearRebound, noHistory)).not.toThrow();
  });

  it('reports the readings when there is no percentage, never "0%" or "null" (AC-2)', () => {
    const runs = history([0.02, 0.04], [0.06, 0.08]);
    const plan = buildPlan(runs[3], runs, softenRearRebound, noHistory);
    const review = plan.experiments.find((e) => e.channel === 'rearRebound')?.review;
    expect(review?.verdict, 'the fixture reproduces a backfire').toBe('backfired');
    expect(review?.symptomDeltaPct, 'from a near-zero baseline').toBeNull();

    const { blocked, recovery } = messages(plan);
    expect(blocked, 'the same direction is blocked').toContain('got worse (0.03 → 0.07) — proven wrong way');
    expect(recovery, 'and walking back to 11.6 is offered').toContain('worse (0.03 → 0.07) — 11.6 measured better');
    for (const text of [blocked, recovery]) expect(text).not.toMatch(/null|NaN|\b0% worse/);
  });

  it('still reports the percentage when one exists (AC-2)', () => {
    const runs = history([0.2, 0.4], [0.6, 0.8]);
    const plan = buildPlan(runs[3], runs, softenRearRebound, noHistory);
    const { blocked, recovery } = messages(plan);
    expect(blocked).toContain('got 133% worse — proven wrong way');
    expect(recovery).toContain('made the rear rebound/bump balance error 133% worse');
  });
});
