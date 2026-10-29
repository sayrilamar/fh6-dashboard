// qi-trace work-item: FH6-1
// qi-trace acceptance-criteria: AC-3, AC-6
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium
//
// ONE LEVER PER RUN: attribution and backfire detection only work when exactly one
// channel moved between runs, so the planner must put a single change forward.

import { describe, expect, it } from 'vitest';
import { buildPlan } from '../../client/src/plan';
import type { Candidate } from '../../client/src/plan';
import { session } from '../fixtures/sessions';

const cand = (channel: string, delta: number, symptom: string, severity: number): Candidate =>
  ({ channel, label: channel, delta, why: 'test', symptom, severity });

// No history to bisect against: every run reads as "no advice recorded".
const noHistory = () => () => null;

const s = session('run-1', 1, { rearToe: 0.1, rearARB: 30, frontToe: 0 });
const mixed = [
  cand('rearToe', 0.2, 'powerOversteer', 0.8),
  cand('rearARB', -3, 'powerOversteer', 0.8),
  cand('frontToe', -0.2, 'understeer', 0.3),
  cand('rearToe', 0.1, 'gripOversteer', 0.5), // same channel again, less severe
];

describe('buildPlan', () => {
  it('puts exactly one change forward, never offering a channel twice', () => {
    const plan = buildPlan(s, [s], mixed, noHistory);
    expect(plan.primary, 'a symptomatic run gets a change').not.toBeNull();
    const offered = [plan.primary!, ...plan.queued].map((c) => c.channel);
    expect(new Set(offered).size, `channels offered: ${offered.join(', ')}`).toBe(offered.length);
    expect(plan.queued.map((c) => c.channel), 'the primary is not also queued').not.toContain(plan.primary!.channel);
  });

  it('takes the most severe symptom first', () => {
    const plan = buildPlan(s, [s], mixed, noHistory);
    expect(plan.primary!.severity, 'primary comes from the worst symptom').toBe(0.8);
    expect(plan.queued.map((c) => c.channel), 'the milder understeer lever waits').toContain('frontToe');
  });

  it('keeps a duplicated channel once, at its most severe candidate', () => {
    const plan = buildPlan(s, [s], mixed, noHistory);
    const rearToe = [plan.primary!, ...plan.queued].filter((c) => c.channel === 'rearToe');
    expect(rearToe, 'rear toe appears once').toHaveLength(1);
    expect(rearToe[0].severity).toBe(0.8);
  });

  it('offers nothing on a run with no symptoms', () => {
    const plan = buildPlan(s, [s], [], noHistory);
    expect(plan.primary).toBeNull();
    expect(plan.queued).toHaveLength(0);
    expect(plan.status.state).toBe('dialled-in');
  });
});
