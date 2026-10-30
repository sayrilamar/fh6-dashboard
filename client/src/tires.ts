// Tire pressure never follows tire temperature (FH6-26). FH6-27 measured it on car #634
// at 26 vs 34 psi front: the late-race front temperature moved +0.2 °F on tarmac and
// −0.03 °F on dirt, and no grip signal moved either. The old window rule (cold → lower,
// hot → raise) called the tires cold on every road run and asked for −2 psi each time,
// which would have walked pressure to the 15 psi rail without changing the temperature.

import type { SessionAnalytics } from './types';

export const PRESSURE_HOLD_WHY = 'hold: in FH6, pressure moves neither tire temperature nor grip (measured on tarmac and dirt)';

// qi-trace: work-item="FH6-26" acceptance-criteria="AC-1, AC-3" risk-tier="high" test-coverage="tests/unit/tire-temps.test.ts"
export function tireDeltas(a: SessionAnalytics): Record<string, { d: number; why: string }> {
  if (!a.tires) return {};
  return { frontPsi: { d: 0, why: PRESSURE_HOLD_WHY }, rearPsi: { d: 0, why: PRESSURE_HOLD_WHY } };
}
