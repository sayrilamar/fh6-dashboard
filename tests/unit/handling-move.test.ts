// qi-trace work-item: FH6-19
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-5
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium
//
// Values come from car #634's 6:09 PM run on 2026-10-29: rear toe 0 with a planned
// −0.3 (advised step −0.1), front ARB 34.3 with a planned 40 (adapted step +1.7), and
// front spring 359.9 on hold. The old rows labelled those two planned moves "−0.1" and
// "+1.7".

import { describe, expect, it } from 'vitest';
import { handlingMove } from '../../client/src/handling';
import type { MoveField } from '../../client/src/handling';

const toe: MoveField = { mode: 'abs', base: -0.1, min: -1, max: 1 };
const arb: MoveField = { mode: 'abs', base: 30, min: 1, max: 65 };
const spring: MoveField = { mode: 'pct', base: 500, min: 1 };

describe('handlingMove: the label describes the move to the final target (AC-1)', () => {
  it('labels the planner\'s rear-toe target, not the advised step', () => {
    expect(handlingMove(toe, 0, -0.1, -0.3)).toEqual({ target: -0.3, label: '-0.3', held: false, dir: -1 });
  });

  it('labels the planner\'s front-ARB target, not the adapted step', () => {
    expect(handlingMove(arb, 34.3, 1.7, 40)).toEqual({ target: 40, label: '+5.7', held: false, dir: 1 });
  });

  it('labels a spring move as a percentage of the current rate', () => {
    expect(handlingMove(spring, 400, -5, null)).toEqual({ target: 380, label: '-5%', held: false, dir: -1 });
    expect(handlingMove(spring, 400, 0, 440).label, 'planned spring target').toBe('+10%');
  });
});

describe('handlingMove: hold means hold, and a planned move never does (AC-2)', () => {
  it('keeps a held value exactly, tenths included', () => {
    expect(handlingMove(arb, 34.3, 0, null)).toEqual({ target: 34.3, label: 'hold', held: true, dir: 0 });
    expect(handlingMove(toe, 0, 0, null)).toEqual({ target: 0, label: 'hold', held: true, dir: 0 });
    expect(handlingMove(spring, 359.9, 0, null)).toEqual({ target: 359.9, label: 'hold', held: true, dir: 0 });
  });

  it('never labels a planned move "hold", even when the row\'s own delta is 0', () => {
    expect(handlingMove(arb, 34.3, 0, 36.3).held).toBe(false);
    expect(handlingMove(spring, 359.9, 0, 361).label, 'too small for a whole percent').toBe('+<1%');
  });

  it('holds when the planner targets the current value', () => {
    expect(handlingMove(toe, -0.3, -0.1, -0.3).label).toBe('hold');
  });

  it('cannot move a spring without its current rate', () => {
    expect(handlingMove(spring, undefined, -5, null)).toEqual({ target: null, label: 'hold', held: true, dir: 0 });
  });
});

describe('handlingMove: abs rows move at FH6\'s 0.1 resolution (AC-3)', () => {
  it('keeps the tenths of an ARB setting', () => {
    expect(handlingMove(arb, 34.3, 2, null).target, '34.3 + 2, not rounded to 36').toBe(36.3);
    expect(handlingMove(arb, 35.3, -3, null).target).toBe(32.3);
  });

  it('prints toe and camber steps without float noise and clamps to the rail', () => {
    expect(handlingMove(toe, 0.1, 0.2, null)).toEqual({ target: 0.3, label: '+0.2', held: false, dir: 1 });
    expect(handlingMove(toe, -0.9, -0.3, null).target, 'rear toe rail').toBe(-1);
  });
});
