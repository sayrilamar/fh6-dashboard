// qi-trace work-item: FH6-24
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4, AC-5
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium
//
// The diff and brake rows and their next-run pre-fills now share one rule each: handlingMove()
// with the limits in client/src/rows.ts, defined once. Before, each section wrote its rule
// twice, and the brake limits (balance 0–100, pressure 50–200) lived both in brakeTarget()
// and in the BrakeRec rows. The brake section has escaped twice through that kind of drift.
//
// Values are the tune confirmed before car #634's 6:09 PM run on 2026-10-29: brake balance
// 41, brake pressure 100, rear accel 32, rear decel 100. That run's report showed balance
// 50 (+9, queued), pressure 102 (+2), rear accel 32 (hold), rear decel 100 (hold).

import { describe, expect, it } from 'vitest';
import { handlingMove } from '../../client/src/handling';
import { brakeBalBase, brakeMove, diffMove } from '../../client/src/rows';

const rearAccel = diffMove({ base: 50 });
const rearDecel = diffMove({ base: 15 });
const balance = brakeMove('balance', 'RWD');
const pressure = brakeMove('pressure', 'RWD');

describe('the 6:09 PM rows (AC-5)', () => {
  it('reproduces the brake rows: a planned balance and a pressure step', () => {
    expect(handlingMove(balance, 41, 3, 50)).toEqual({ target: 50, label: '+9', held: false, dir: 1 });
    expect(handlingMove(pressure, 100, 2, null)).toEqual({ target: 102, label: '+2', held: false, dir: 1 });
  });

  it('holds the diff rows', () => {
    expect(handlingMove(rearAccel, 32, 0, null)).toEqual({ target: 32, label: 'hold', held: true, dir: 0 });
    expect(handlingMove(rearDecel, 100, 0, null)).toEqual({ target: 100, label: 'hold', held: true, dir: 0 });
  });
});

describe('limits and rounding are defined once (AC-1, AC-3)', () => {
  it('keeps diff settings to whole percent within 0–100', () => {
    expect(handlingMove(rearAccel, 32, 2.6, null).target, '34.6 → 35').toBe(35);
    expect(handlingMove(rearDecel, 100, 5, null), 'already at 100').toEqual({ target: 100, label: 'hold', held: true, dir: 0 });
    expect(handlingMove(rearAccel, 32, -40, null).target).toBe(0);
  });

  it('keeps brake balance within 0–100 and pressure within 50–200', () => {
    expect(handlingMove(balance, 98, 5, null).target).toBe(100);
    expect(handlingMove(pressure, 100, 150, null).target).toBe(200);
    expect(handlingMove(pressure, 60, -20, null).target).toBe(50);
  });

  it('starts from each section\'s baseline when nothing is entered', () => {
    expect([brakeBalBase('RWD'), brakeBalBase('FWD'), brakeBalBase('AWD')]).toEqual([58, 66, 60]);
    expect(handlingMove(balance, undefined, 3, null).target, 'RWD balance 58 + 3').toBe(61);
    expect(handlingMove(pressure, undefined, 2, null).target, 'pressure 100 + 2').toBe(102);
    expect(handlingMove(rearDecel, undefined, 5, null).target, 'rear decel 15 + 5').toBe(20);
  });
});

describe('a hold keeps the entered value; a plan is a move (AC-2)', () => {
  it('holds a non-whole entry exactly instead of rounding it', () => {
    expect(handlingMove(rearAccel, 32.5, 0, null)).toEqual({ target: 32.5, label: 'hold', held: true, dir: 0 });
  });

  it('labels a planned target as the move to it, even when the row\'s own delta is 0', () => {
    expect(handlingMove(balance, 41, 0, 50)).toEqual({ target: 50, label: '+9', held: false, dir: 1 });
    expect(handlingMove(rearDecel, 100, 0, 90)).toEqual({ target: 90, label: '-10', held: false, dir: -1 });
  });
});
