// qi-trace work-item: FH6-30
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4, AC-6
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// FH6-29 found that one change per run gave no decisive A/B verdict in two days of tuning,
// and that each lever's advice reads one part of the lap: braking levers read brake slip,
// throttle levers read power-on slip, gearing is solved from the power curve. The chassis
// levers share one corner balance. So the planner now offers one change per lever group,
// never two aimed at the same symptom, and never two chassis levers — the failure it was
// built to stop: 10 changes per run, three levers on their rails, 2.6 s slower.

import { describe, expect, it } from 'vitest';
import { buildPlan, experiments, leverGroup, pickPerGroup } from '../../client/src/plan';
import type { Candidate, PlannedChange } from '../../client/src/plan';
import { CHANNELS } from '../../client/src/tune';
import { session } from '../fixtures/sessions';

const cand = (channel: string, delta: number, symptom: string, severity: number): Candidate =>
  ({ channel, label: channel, delta, why: 'test', symptom, severity });
const noHistory = () => () => null;
const s = session('run-1', 1, { balance: 41, rearAccel: 32, rearToe: 0, rearARB: 35.3, frontARB: 34.3, frontHeight: 5.3 });

describe('one group map (AC-1)', () => {
  it('puts every planner lever in exactly the group its advice is read from', () => {
    const groups: Record<string, string[]> = { braking: [], throttle: [], gearing: [], chassis: [] };
    for (const c of CHANNELS.filter((c) => c.key !== 'frontPsi' && c.key !== 'rearPsi')) groups[leverGroup(c.key)].push(c.key);
    expect(groups.braking.sort()).toEqual(['balance', 'frontDecel', 'pressure', 'rearDecel']);
    expect(groups.throttle.sort()).toEqual(['center', 'frontAccel', 'rearAccel']);
    expect(groups.gearing, 'gearing channels are added per car by channelsFor()').toEqual([]);
    expect(groups.chassis.sort()).toEqual([
      'caster', 'frontARB', 'frontAero', 'frontBump', 'frontCamber', 'frontHeight', 'frontRebound', 'frontSpring', 'frontToe',
      'rearARB', 'rearAero', 'rearBump', 'rearCamber', 'rearHeight', 'rearRebound', 'rearSpring', 'rearToe',
    ]);
  });

  it('treats the gearbox and every gear ratio as gearing, and anything unknown as chassis', () => {
    expect(['finalDrive', 'gearbox', 'gear1', 'gear6'].map(leverGroup)).toEqual(['gearing', 'gearing', 'gearing', 'gearing']);
    expect(leverGroup('somethingNew'), 'the safe default').toBe('chassis');
  });
});

describe('one change per group, never two for a symptom (AC-2)', () => {
  // The 11:00 AM road run of 2026-10-30, reduced to its planner candidates.
  const road = [
    cand('balance', 3, 'trailBrakeOversteer', 0.7),
    cand('rearRebound', -0.5, 'trailBrakeOversteer', 0.6),
    cand('rearHeight', -0.8, 'bottoming', 0.25),
    cand('rearAccel', -9, 'powerOversteer', 0.5),
    cand('rearToe', -0.3, 'powerOversteer', 0.5),
  ];

  it('picks brake balance, rear accel and one chassis change', () => {
    const plan = buildPlan(s, [s], road, noHistory);
    expect(plan.thisRun.map((c) => c.channel)).toEqual(['balance', 'rearAccel', 'rearHeight']);
    expect(plan.primary?.channel, 'the worst symptom still leads').toBe('balance');
    expect(plan.queued.map((c) => c.channel), 'the rest wait').toEqual(['rearRebound', 'rearToe']);
  });

  it('never puts two chassis levers in one run', () => {
    const plan = buildPlan(s, [s], [
      cand('rearToe', -0.3, 'powerOversteer', 0.8),
      cand('frontARB', -3, 'understeer', 0.6),
      cand('frontHeight', -0.4, 'bottoming', 0.4),
    ], noHistory);
    expect(plan.thisRun.map((c) => c.channel)).toEqual(['rearToe']);
  });

  it('skips a lever whose symptom another group already targets', () => {
    const plan = buildPlan(s, [s], [
      cand('balance', 3, 'trailBrakeOversteer', 0.7),
      cand('rearToe', -0.3, 'trailBrakeOversteer', 0.6),
      cand('frontARB', -3, 'understeer', 0.4),
    ], noHistory);
    expect(plan.thisRun.map((c) => c.channel), 'rear toe would double up on trail braking').toEqual(['balance', 'frontARB']);
  });

  it('lets a recovery fill its group when that group has no open lever', () => {
    const pc = (channel: string, symptom: string, kind?: 'recovery') =>
      ({ ...cand(channel, 1, symptom, 0.5), from: 0, to: 1, rank: 0, ...(kind ? { kind } : {}) }) as PlannedChange;
    const picks = pickPerGroup([pc('rearARB', 'gripOversteer'), pc('rearToe', 'powerOversteer'), pc('balance', 'trailBrakeOversteer', 'recovery')]);
    expect(picks.map((c) => c.channel)).toEqual(['rearARB', 'balance']);
  });
});

describe('the one-change switch (AC-3)', () => {
  it('gives exactly one change in "one" mode, as before', () => {
    const plan = buildPlan(s, [s], [
      cand('balance', 3, 'trailBrakeOversteer', 0.7),
      cand('rearAccel', -9, 'powerOversteer', 0.5),
    ], noHistory, 'one');
    expect(plan.thisRun.map((c) => c.channel)).toEqual(['balance']);
    expect(plan.primary).toBe(plan.thisRun[0]);
    expect(plan.queued.map((c) => c.channel)).toEqual(['rearAccel']);
    expect(plan.perRun).toBe('one');
  });
});

describe('attribution by group (AC-4)', () => {
  const t = (over: Record<string, number>) => ({ balance: 50, pressure: 100, rearAccel: 60, rearARB: 30, rearToe: 0, ...over });
  const A = session('A', 1, t({}));
  const B = session('B', 2, t({ balance: 55, rearAccel: 50 }));                   // braking + throttle
  const C = session('C', 3, t({ balance: 55, rearAccel: 50, rearARB: 25, rearToe: -0.2 })); // chassis + chassis
  const D = session('D', 4, t({ balance: 60, pressure: 110, rearAccel: 50, rearARB: 25, rearToe: -0.2 })); // braking + braking

  it('mines a braking + throttle pair as two experiments, and skips same-group pairs', () => {
    expect(experiments(D, [A, B, C, D]).map((e) => `${e.channel} ${e.from}->${e.to}`)).toEqual(['balance 50->55', 'rearAccel 60->50']);
  });

  it('reviews every change made before this run, not just one', () => {
    expect(buildPlan(B, [A, B], [], noHistory).lastChanges.map((r) => r.channel)).toEqual(['balance', 'rearAccel']);
  });
});
