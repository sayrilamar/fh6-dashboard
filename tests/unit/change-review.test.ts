// qi-trace work-item: FH6-31
// qi-trace acceptance-criteria: AC-2, AC-3, AC-4
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// Car #1335, 2026-10-30. The FH6-30 validation set brake balance 41 → 55 three times, and
// the 13:22 run made the same change again. Its report matched past changes by from/to
// values, so it listed "Brake balance 41 → 55 worked" four times. Then from 13:26 to 13:30
// the driver applied the solved gear ratios and final drive (both Gearing) alongside rear
// accel 16 → 8 and rear toe 0.2 → −0.1, and the whole pair was skipped as confounded,
// losing the rear accel and rear toe verdicts.

import { describe, expect, it } from 'vitest';
import { buildPlan, experiments } from '../../client/src/plan';
import { session } from '../fixtures/sessions';

const noHistory = () => () => null;
const channels = (xs: { channel: string; from: number; to: number }[]) => xs.map((x) => `${x.channel} ${x.from}->${x.to}`);

describe('a run reviews only its own changes, once each (AC-2)', () => {
  // The 2×2's balance changes (41 → 55 three times), then the 13:22 run's.
  const runs = [41, 55, 41, 55, 41, 55, 41, 55].map((balance, i) => session(`r${i}`, i, { balance, rearAccel: 32 }, 1335));

  it('shows a repeated change once, for the run it led to', () => {
    const last = runs[runs.length - 1];
    expect(channels(buildPlan(last, runs, [], noHistory).lastChanges)).toEqual(['balance 41->55']);
  });

  it('never shows an older run\'s change on a run that changed something else', () => {
    const next = session('r8', 8, { balance: 55, rearAccel: 16 }, 1335);
    expect(channels(buildPlan(next, [...runs, next], [], noHistory).lastChanges)).toEqual(['rearAccel 32->16']);
  });
});

describe('a lever alone in its group is still judged (AC-3)', () => {
  const before = { balance: 67, rearAccel: 16, rearToe: 0.2, finalDrive: 2.94, gear1: 4.22, gear2: 2.67, gear3: 1.9 };
  // 13:26 → 13:30: the solved gearbox and final drive (both Gearing), plus one throttle and
  // one chassis change.
  const after = { ...before, rearAccel: 8, rearToe: -0.1, finalDrive: 3.29, gear2: 2.72, gear3: 2.03 };
  const A = session('13:26', 1, before, 1335), B = session('13:30', 2, after, 1335);

  it('reviews rear accel and rear toe, and skips only the two gearing changes', () => {
    expect(channels(experiments(B, [A, B]))).toEqual(['rearAccel 16->8', 'rearToe 0.2->-0.1']);
    expect(channels(buildPlan(B, [A, B], [], noHistory).lastChanges)).toEqual(['rearAccel 16->8', 'rearToe 0.2->-0.1']);
  });

  it('mines nothing when every change shares a group', () => {
    const C = session('gears-only', 3, { ...after, finalDrive: 3.4, gear2: 2.8 }, 1335);
    expect(experiments(C, [B, C])).toEqual([]);
  });
});
