// qi-trace work-item: FH6-33
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium
//
// The driver, 2026-10-30, after tuning car #1335 (Mazda 787B): "make sure the top of the
// tuning report clearly says so anytime I've reached optimal tuning on any given car." The
// banner shows only when the plan offers no change, and it is confirmed only by the run
// before on exactly the same tune.

import { describe, expect, it } from 'vitest';
import { buildPlan, previousSameTune, tuneVerdict } from '../../client/src/plan';
import type { Candidate } from '../../client/src/plan';
import type { SessionSummary } from '../../client/src/types';
import { session } from '../fixtures/sessions';

const noHistory = () => () => null;
const tune = { balance: 61, rearAccel: 0, rearToe: -0.7, rearARB: 20 };
// A real run: 2,281 cornering frames, like the 14:09 run, and no symptom.
const run = (id: string, startedAt: number, t: Record<string, number> = tune, car = 1335) =>
  ({ ...session(id, startedAt, t, car), analytics: { handling: { cornerFrames: 2281, understeerFrames: 0, slideCausePer1k: { trailBrake: 0, power: 0, grip: 0 } } } }) as unknown as SessionSummary;

describe('the verdict (AC-1, AC-3)', () => {
  it('stays hidden while the plan offers a change', () => {
    const s = run('a', 1);
    const plan = buildPlan(s, [s], [{ channel: 'balance', label: 'Brake balance', delta: -3, why: 'test', symptom: 'frontLock', severity: 0.6 }], noHistory);
    expect(plan.status.state).toBe('tuning');
    expect(tuneVerdict(s, plan, null)).toBeNull();
  });

  it('says optimal when nothing is worth chasing', () => {
    const s = run('a', 1);
    const v = tuneVerdict(s, buildPlan(s, [s], [], noHistory), null);
    expect(v).toEqual({ kind: 'optimal', confirmed: false, symptom: null, usedUp: [] });
  });

  it('says build limit, naming the symptom and its used-up levers', () => {
    const s = { ...run('a', 1, { ...tune, frontHeight: 2.8 }) } as SessionSummary;
    s.meta = { ...s.meta!, limits: { frontHeight: 'min', rearAccel: 'min' } };
    const lever: Candidate = { channel: 'frontHeight', label: 'Front ride height', delta: -0.4, why: 'test', symptom: 'bottoming', severity: 0.6 };
    const other: Candidate = { channel: 'rearAccel', label: 'Rear accel', delta: -3, why: 'test', symptom: 'powerOversteer', severity: 0.3 };
    const v = tuneVerdict(s, buildPlan(s, [s], [lever, other], noHistory), null);
    expect(v?.kind).toBe('build-limit');
    expect(v?.symptom).toBe('bottoming');
    expect(v?.usedUp.map((c) => c.channel)).toEqual(['frontHeight']);
  });
});

describe('only real driving earns a verdict (AC-1)', () => {
  it('gives none for a few seconds parked on the grid, like the 0 hp runs of 2026-10-29', () => {
    const parked = session('3:42', 1, tune, 1335);   // analytics with no cornering data
    expect(tuneVerdict(parked, buildPlan(parked, [parked], [], noHistory), null)).toBeNull();
  });

  it('never lets such a run confirm a verdict', () => {
    const parked = session('parked', 1, tune, 1335), b = run('b', 2);
    expect(previousSameTune(b, [parked, b])).toBeNull();
  });
});

describe('confirmation (AC-2)', () => {
  it('is confirmed by the run before on the same tune with the same verdict', () => {
    const a = run('a', 1), b = run('b', 2);
    expect(previousSameTune(b, [a, b])?.id).toBe('a');
    const v = tuneVerdict(b, buildPlan(b, [a, b], [], noHistory), buildPlan(a, [a, b], [], noHistory));
    expect(v?.confirmed).toBe(true);
  });

  it('is not confirmed by a run whose verdict differs', () => {
    const a = run('a', 1), b = run('b', 2);
    const tuning = buildPlan(a, [a, b], [{ channel: 'balance', label: 'Brake balance', delta: -3, why: 'test', symptom: 'frontLock', severity: 0.6 }], noHistory);
    expect(tuneVerdict(b, buildPlan(b, [a, b], [], noHistory), tuning)?.confirmed).toBe(false);
  });

  it('never takes a run with any different setting as the previous same-tune run', () => {
    const a = run('a', 1, { ...tune, balance: 67 }), b = run('b', 2);
    expect(previousSameTune(b, [a, b])).toBeNull();
    const c = run('c', 0, tune);   // same tune, but not the run just before b
    expect(previousSameTune(b, [c, a, b]), 'the run just before decides').toBeNull();
  });

  it("ignores another car's runs", () => {
    const other = run('other', 1, tune, 634), b = run('b', 2);
    expect(previousSameTune(b, [other, b])).toBeNull();
  });
});
