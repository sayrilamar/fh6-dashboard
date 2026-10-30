// qi-trace work-item: FH6-34
// qi-trace acceptance-criteria: AC-1, AC-3, AC-4
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// Before the 14:34 run of car #1335 on 2026-10-30, the driver set brake balance 61 % in the
// game, as recommended, but the pre-run card still held 67 when "Confirm & record" was
// pressed. The run was saved at 67, so the next report said 67 → 61 again. The card now
// asks first whenever one of this run's planned changes isn't in its box.

import { describe, expect, it } from 'vitest';
import { unenteredChanges } from '../../client/src/prerun';

const balance = { channel: 'balance', label: 'Brake balance' };
const rearAccel = { channel: 'rearAccel', label: 'Rear accel' };

describe('which planned changes are not entered (AC-1, AC-3)', () => {
  it('flags the 14:34 run: 67 still in the box, 61 planned', () => {
    expect(unenteredChanges([balance], { balance: '67' }, { balance: 61 }))
      .toEqual([{ channel: 'balance', label: 'Brake balance', entered: 67, target: 61 }]);
  });

  it('asks nothing once the planned value is entered', () => {
    expect(unenteredChanges([balance], { balance: '61' }, { balance: 61 })).toEqual([]);
    expect(unenteredChanges([balance], { balance: '61.0' }, { balance: 61 }), 'same number, other spelling').toEqual([]);
  });

  it('counts an empty or unreadable box as not entered', () => {
    expect(unenteredChanges([balance], { balance: '' }, { balance: 61 })[0]?.entered).toBeNull();
    expect(unenteredChanges([balance], {}, { balance: 61 })[0]?.entered).toBeNull();
    expect(unenteredChanges([balance], { balance: 'abc' }, { balance: 61 })[0]?.entered).toBeNull();
  });

  it('lists only the planned changes that are missing', () => {
    expect(unenteredChanges([balance, rearAccel], { balance: '61', rearAccel: '32' }, { balance: 61, rearAccel: 16 }).map((u) => u.channel))
      .toEqual(['rearAccel']);
  });

  it('ignores a planned change the card has no target for', () => {
    expect(unenteredChanges([balance], { balance: '67' }, {})).toEqual([]);
  });

  it('asks nothing when there are no planned changes', () => {
    expect(unenteredChanges([], { balance: '67' }, { balance: 61 })).toEqual([]);
  });
});
