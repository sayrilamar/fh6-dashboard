// Damper target math for the Tuning Report's Damping section. Pure, so the unit suite
// can pin it without React or the store.
//
// FH6 damper settings move in 0.1 steps (a confirmed tune read 8.7 / 10 / 5.4 / 7.2).
// The section used to compute every target as Math.round(base + d), i.e. to WHOLE
// numbers, so a row whose logic said "hold" still asked for 8.7 → 9 and printed the
// difference as +0.3000000000000007. The same rounding fed the forward simulation that
// pre-fills the next run's boxes, so an unconfirmed run inherited changes nobody made.

import { clampToLimit } from './limits';
import type { MarkedLimit } from './limits';

export const DAMP_MIN = 1, DAMP_MAX = 20;

const r1 = (n: number) => Math.round(n * 10) / 10;

// qi-trace: work-item="FH6-25" acceptance-criteria="AC-1, AC-3" risk-tier="high" test-coverage="tests/unit/limits.test.ts"
// qi-trace: work-item="FH6-18" acceptance-criteria="AC-1, AC-2, AC-3, AC-4" risk-tier="medium" test-coverage="tests/unit/damping.test.ts"
// Where one damper setting should go, and the change to show for it. A planner target
// wins when there is one; a zero delta holds the driver's value exactly, untouched by
// rounding or the range clamp. `limit` is the driver's MIN/MAX mark: no target goes past it
// (FH6-25).
export function damperMove(base: number, d: number, planned: number | null = null, limit?: MarkedLimit): { target: number; delta: number } {
  const target = clampToLimit(planned ?? (d === 0 ? base : Math.max(DAMP_MIN, Math.min(DAMP_MAX, r1(base + d)))), limit);
  return { target, delta: r1(target - base) };
}
