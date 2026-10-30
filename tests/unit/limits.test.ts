// qi-trace work-item: FH6-25
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4, AC-5
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// A setting marked MIN or MAX on the pre-run card is a hard threshold: no target goes
// past the value it was marked at. On car #634's 6:09 PM run (2026-10-29) front downforce
// was marked MAX at 120, yet the report showed "→ 138, +15%" beside "blocked · you've
// marked this at its maximum (120)": the planner blocked the lever but left its target at
// 120 × 1.15, and every row deferred to that target.

import { describe, expect, it } from 'vitest';
import { clampToLimit, markedLimit } from '../../client/src/limits';
import { handlingMove } from '../../client/src/handling';
import type { MoveField } from '../../client/src/handling';
import { damperMove } from '../../client/src/damping';
import { buildPlan } from '../../client/src/plan';
import type { Candidate } from '../../client/src/plan';
import type { SessionSummary } from '../../client/src/types';
import { session } from '../fixtures/sessions';

const max = (at: number) => ({ which: 'max' as const, at });
const min = (at: number) => ({ which: 'min' as const, at });

describe('the threshold rule (AC-1, AC-3)', () => {
  it('reads a mark at the value it was marked on, and only with a value', () => {
    expect(markedLimit({ frontAero: 'max' }, { frontAero: 120 }, 'frontAero')).toEqual(max(120));
    expect(markedLimit({ frontAero: 'max' }, {}, 'frontAero'), 'no value, no threshold').toBeUndefined();
    expect(markedLimit({}, { frontAero: 120 }, 'frontAero'), 'no mark').toBeUndefined();
  });

  it('holds a target at a MAX but still allows a decrease', () => {
    expect(clampToLimit(138, max(120))).toBe(120);
    expect(clampToLimit(108, max(120))).toBe(108);
  });

  it('holds a target at a MIN but still allows an increase', () => {
    expect(clampToLimit(0.5, min(1))).toBe(1);
    expect(clampToLimit(4, min(1))).toBe(4);
    expect(clampToLimit(null, min(1)), 'no target stays no target').toBeNull();
  });
});

describe('report rows hold at the mark (AC-1, AC-2, AC-5)', () => {
  const aero: MoveField = { mode: 'pct', min: 0, step: 1 };
  const arb: MoveField = { mode: 'abs', base: 30, min: 1, max: 65 };

  it('shows front downforce marked MAX at 120 as 120 / hold, whether the move is planned or its own', () => {
    const hold = { target: 120, label: 'hold', held: true, dir: 0 };
    expect(handlingMove(aero, 120, 0, 138, max(120)), 'the planner\'s 138').toEqual(hold);
    expect(handlingMove(aero, 120, 15, null, max(120)), 'the row\'s own +15%').toEqual(hold);
  });

  it('still lets a MAX-marked setting come down', () => {
    expect(handlingMove(aero, 120, -10, null, max(120))).toEqual({ target: 108, label: '-10%', held: false, dir: -1 });
  });

  it('holds an abs row at its MIN', () => {
    expect(handlingMove(arb, 1, -3, null, min(1))).toEqual({ target: 1, label: 'hold', held: true, dir: 0 });
    expect(handlingMove(arb, 1, 3, null, min(1)).target, 'up from a MIN is fine').toBe(4);
  });

  it('holds a damper at its mark', () => {
    expect(damperMove(8.7, 2, null, max(8.7))).toEqual({ target: 8.7, delta: 0 });
    expect(damperMove(5.4, -1, 4.4, min(5.4))).toEqual({ target: 5.4, delta: 0 });
    expect(damperMove(8.7, -2, null, max(8.7)).target, 'down from a MAX is fine').toBe(6.7);
  });
});

describe('the planner targets the marked value for a lever it blocks (AC-1, AC-2)', () => {
  const run = (tune: Record<string, number>, limits: Record<string, 'min' | 'max'>): SessionSummary => {
    const s = session('run-1', 1, tune);
    return { ...s, meta: { ...s.meta, limits } } as SessionSummary;
  };
  const cand = (channel: string, delta: number, symptom: string): Candidate =>
    ({ channel, label: channel, delta, why: 'test', symptom, severity: 0.8 });
  const noHistory = () => () => null;

  it('blocks front downforce marked MAX at 120 and targets 120, not 138', () => {
    const s = run({ frontAero: 120 }, { frontAero: 'max' });
    const plan = buildPlan(s, [s], [cand('frontAero', 15, 'aeroBalance')], noHistory);
    const fa = plan.blocked.find((c) => c.channel === 'frontAero');
    expect(fa?.blocked).toContain('maximum (120');
    expect(fa?.to, 'the marked value is the threshold').toBe(120);
  });

  it('blocks rear ARB marked MIN at 1 and targets 1', () => {
    const s = run({ rearARB: 1 }, { rearARB: 'min' });
    const plan = buildPlan(s, [s], [cand('rearARB', -3, 'gripOversteer')], noHistory);
    const ra = plan.blocked.find((c) => c.channel === 'rearARB');
    expect(ra?.blocked).toContain('minimum (1');
    expect(ra?.to).toBe(1);
  });
});
