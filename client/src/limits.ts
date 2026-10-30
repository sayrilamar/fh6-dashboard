// Driver-marked limits (FH6-25). Every setting on the pre-run card has MIN / MAX chips:
// "this is as low (or high) as the game lets it go". That marked value is a hard
// threshold — no target may go past it, from the planner, a report row, a saved next-run
// recommendation, or the pre-run card's own "rec" chip.
//
// The planner used to read the marks only to BLOCK a lever, leaving its target past the
// limit; every row deferred to that target, so front downforce marked MAX at 120 showed
// "→ 138, +15%" beside "blocked · you've marked this at its maximum (120)".

import type { TuneLimits } from './types';

export interface MarkedLimit { which: 'min' | 'max'; at: number }
export type LimitOf = (key: string) => MarkedLimit | undefined;

// qi-trace: work-item="FH6-25" acceptance-criteria="AC-1, AC-3" risk-tier="high" test-coverage="tests/unit/limits.test.ts"
// The mark on one setting, at the value it was marked on (the run's confirmed tune in the
// report, the box's value on the pre-run card). No value, no threshold.
export function markedLimit(
  limits: TuneLimits | null | undefined,
  values: Record<string, unknown> | null | undefined,
  key: string,
): MarkedLimit | undefined {
  const which = limits?.[key];
  const at = values?.[key];
  return which && typeof at === 'number' && Number.isFinite(at) ? { which, at } : undefined;
}

// Hold a target to its marked threshold. A MAX still allows a decrease and a MIN an
// increase; only a move past the mark is cut back to it.
export function clampToLimit(target: number, lim: MarkedLimit | undefined): number;
export function clampToLimit(target: number | null, lim: MarkedLimit | undefined): number | null;
export function clampToLimit(target: number | null, lim: MarkedLimit | undefined): number | null {
  if (target == null || !lim) return target;
  return lim.which === 'max' ? Math.min(target, lim.at) : Math.max(target, lim.at);
}
