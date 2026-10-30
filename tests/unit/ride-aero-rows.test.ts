// qi-trace work-item: FH6-22
// qi-trace acceptance-criteria: AC-2, AC-3, AC-4, AC-5
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium
//
// The ride-height and downforce rows now go through handlingMove()'s pct mode. Values are
// the tune confirmed before car #634's 6:09 PM run on 2026-10-29: ride height 5.3 / 5.6,
// downforce 120 / 225. That run's report showed front height 4.5 (−15%), rear 4.8
// (−14%), front downforce 138 (+15%) and rear downforce 225 (hold).
//
// The old rows took "hold" from the symptom's own delta before swapping in the planner's
// target, so a planned move on a row whose delta was 0 read "hold". The aero row also
// drew every move blue, cuts included.

import { describe, expect, it } from 'vitest';
import { handlingMove } from '../../client/src/handling';
import type { MoveField } from '../../client/src/handling';

// The same descriptors Sessions.tsx uses.
const ride: MoveField = { mode: 'pct', min: 0, step: 0.1 };
const aero: MoveField = { mode: 'pct', min: 0, step: 1 };

describe('ride height and downforce move by a % of the entered value (AC-3, AC-5)', () => {
  it('reproduces the 6:09 PM run: heights in tenths, downforce in whole numbers', () => {
    expect(handlingMove(ride, 5.3, -15, null)).toEqual({ target: 4.5, label: '-15%', held: false, dir: -1 });
    expect(handlingMove(ride, 5.6, -14, null)).toEqual({ target: 4.8, label: '-14%', held: false, dir: -1 });
    expect(handlingMove(aero, 120, 15, null)).toEqual({ target: 138, label: '+15%', held: false, dir: 1 });
  });

  it('keeps ride height to 0.1 and downforce to whole numbers', () => {
    expect(handlingMove(ride, 5.0, 6, null).target, '5.0 + 6% = 5.3').toBe(5.3);
    expect(handlingMove(aero, 225, 3, null).target, '225 + 3% = 231.75 → 232').toBe(232);
  });

  it('never goes below 0', () => {
    expect(handlingMove(ride, 0.4, -150, null).target).toBe(0);
  });
});

describe('the label describes the move to the final target (AC-2)', () => {
  it('holds an entered value exactly when there is no delta and no plan', () => {
    expect(handlingMove(ride, 5.3, 0, null)).toEqual({ target: 5.3, label: 'hold', held: true, dir: 0 });
    expect(handlingMove(aero, 225, 0, null)).toEqual({ target: 225, label: 'hold', held: true, dir: 0 });
  });

  it('never labels a planned move "hold", even when the row\'s own delta is 0', () => {
    expect(handlingMove(ride, 5.3, 0, 4.8)).toEqual({ target: 4.8, label: '-9%', held: false, dir: -1 });
    expect(handlingMove(aero, 120, 0, 132)).toEqual({ target: 132, label: '+10%', held: false, dir: 1 });
  });

  it('marks a downforce cut as a decrease, so the row draws it amber', () => {
    expect(handlingMove(aero, 225, -10, null)).toEqual({ target: 203, label: '-10%', held: false, dir: -1 });
  });

  it('has nothing to move or label without an entered value', () => {
    expect(handlingMove(ride, undefined, -15, null)).toEqual({ target: null, label: 'hold', held: true, dir: 0 });
    expect(handlingMove(aero, undefined, 0, 138).held, 'a plan alone cannot be labelled as a %').toBe(true);
  });
});
