import type { SessionSummary } from '../../client/src/types';

// A recorded run reduced to what the tuning logic reads from history: identity, time
// order, the car, and the tune that was on it. `analytics` only has to be truthy —
// bisection ignores runs that were never analysed.
export function session(
  id: string,
  startedAt: number,
  tune: Record<string, number>,
  carOrdinal = 999999,
): SessionSummary {
  return { id, startedAt, meta: { carOrdinal, tune }, analytics: {} } as unknown as SessionSummary;
}
