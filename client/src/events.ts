// Event types (FH6-28). The telemetry never says what kind of event a run was: a dirt race
// and a road race of similar length look alike to the planner, and so do free roam and an
// unfinished race. The driver picks the type on the pre-run card; it is saved with the run
// and decides which runs are compared with which.
//
// Found the hard way: the tire-temperature investigation (FH6-26/27) misread a day of
// rally-on-dirt runs, where a water crossing cools the tires ~45 °F, until the driver said
// what the event was.

import type { EventType, SessionSummary } from './types';

export const EVENT_TYPES: { key: EventType; label: string; loose: boolean }[] = [
  { key: 'road', label: 'Road', loose: false },
  { key: 'street', label: 'Street', loose: false },
  { key: 'dirt', label: 'Dirt', loose: true },
  { key: 'crossCountry', label: 'Cross Country', loose: true },
  { key: 'drag', label: 'Drag', loose: false },
  { key: 'drift', label: 'Drift', loose: false },
  { key: 'freeRoam', label: 'Free roam', loose: false },
];

export const eventLabel = (e: EventType | undefined): string =>
  EVENT_TYPES.find((x) => x.key === e)?.label ?? 'Unknown event';

// Loose surfaces (dirt, cross country): rules measured on tarmac don't apply.
export const isLooseSurface = (e: EventType | undefined): boolean =>
  EVENT_TYPES.find((x) => x.key === e)?.loose ?? false;

type Run = Pick<SessionSummary, 'meta' | 'finishDistanceM'>;

// qi-trace: work-item="FH6-28" acceptance-criteria="AC-3, AC-6" risk-tier="high" test-coverage="tests/unit/events.test.ts"
// Same kind of event. A run recorded before event types existed matches anything, so old
// history keeps contributing until the driver labels it.
export function sameEventType(a: Run, b: Run): boolean {
  const ea = a.meta?.eventType, eb = b.meta?.eventType;
  return ea == null || eb == null || ea === eb;
}

// Like-for-like runs for A/B reviews and pooled symptoms: same car, same kind of event,
// and races of about the same length (the route fingerprint: within 5% / 50 m).
export function comparableRuns(s: Run, x: Run): boolean {
  if (s.meta?.carOrdinal != null && x.meta?.carOrdinal !== s.meta?.carOrdinal) return false;
  if (!sameEventType(s, x)) return false;
  if (s.finishDistanceM && x.finishDistanceM &&
    Math.abs(x.finishDistanceM - s.finishDistanceM) > Math.max(50, s.finishDistanceM * 0.05)) return false;
  return true;
}

// The pre-run card's default: the event type of this car's most recent labelled run.
export function defaultEventType(
  sessions: Pick<SessionSummary, 'startedAt' | 'meta'>[],
  carOrdinal: number | null | undefined,
): EventType | null {
  const last = [...sessions]
    .filter((x) => x.meta?.eventType && (carOrdinal == null || x.meta?.carOrdinal === carOrdinal))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  return last?.meta?.eventType ?? null;
}
