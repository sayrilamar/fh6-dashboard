// qi-trace work-item: FH6-18
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-5
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium
//
// The settings below are the tune confirmed before car #634's 6:09 PM run on 2026-10-29:
// front rebound 8.7, rear rebound 10, front bump 5.4, rear bump 7.2. Rounding targets to
// whole numbers turned the three "hold" rows into 8.7 → 9 (+0.3000000000000007),
// 5.4 → 5 and 7.2 → 7.

import { describe, expect, it } from 'vitest';
import { DAMP_MAX, DAMP_MIN, damperMove } from '../../client/src/damping';

describe('damperMove: a hold leaves the setting alone (AC-1)', () => {
  it.each([8.7, 5.4, 7.2, 10])('holds %s exactly', (base) => {
    expect(damperMove(base, 0), 'a zero delta is a hold').toEqual({ target: base, delta: 0 });
  });
});

describe('damperMove: a real change lands on FH6\'s 0.1 resolution (AC-2)', () => {
  it('keeps the tenths of the current setting', () => {
    expect(damperMove(8.7, 2).target, 'stiffen 2 from 8.7').toBe(10.7);
    expect(damperMove(7.2, -2).target, 'soften 2 from 7.2').toBe(5.2);
    expect(damperMove(5.4, 1).target, 'one click of bump').toBe(6.4);
  });

  it('clamps to the 1–20 damper range', () => {
    expect(damperMove(19.5, 3).target).toBe(DAMP_MAX);
    expect(damperMove(1.4, -2).target).toBe(DAMP_MIN);
  });
});

describe('damperMove: the change shown is a clean number (AC-3)', () => {
  it('prints learned-step deltas without float noise', () => {
    // 0.1 + 0.2-style noise: 8.7 + 0.3 is 8.999999999999998 in floating point.
    expect(damperMove(8.7, 0.3)).toEqual({ target: 9, delta: 0.3 });
    expect(damperMove(5.4, -0.4)).toEqual({ target: 5, delta: -0.4 });
  });

  it('takes the planner\'s target and reports the change to it', () => {
    // The 6:09 PM run's queued rear-rebound change: 10 → 8.5.
    expect(damperMove(10, -2, 8.5)).toEqual({ target: 8.5, delta: -1.5 });
    expect(damperMove(8.7, 0, 9), 'a planned move wins over a hold').toEqual({ target: 9, delta: 0.3 });
  });
});
