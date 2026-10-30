// Event types the pre-run card offers (FH6-28). Must match EVENT_TYPES in
// client/src/events.ts; tests/unit/events.test.ts checks they agree.
export const EVENT_TYPE_KEYS = ['road', 'street', 'dirt', 'crossCountry', 'drag', 'drift', 'freeRoam'];

// A known event type, or undefined for anything else (never trust the client's string).
export function validEventType(v) {
  return EVENT_TYPE_KEYS.includes(v) ? v : undefined;
}
