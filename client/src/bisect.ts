// Bisection search for tune settings.
//
// WHY THIS BEATS PROPORTIONAL STEPPING HERE: a gradient/secant step needs the MAGNITUDE
// of the error to size its move. This app's symptom metrics are far too noisy for that —
// measured on a real 50-run history, the rear-looseness rate ranged 0.8–17.9 (sd 4.12 vs
// mean 4.04) with the setting completely unchanged. Bisection needs only the SIGN of the
// error ("too much" / "too little"), which survives that noise, and it halves the search
// space every run: a 0–100 range reaches ±1 in ~7 runs worst case, ~3–4 in practice.
//
// The bracket is DERIVED from history rather than stored, so it cannot drift out of sync
// with the runs: every past run where we advised RAISE proves the optimum is above that
// value; every RUN where we advised LOWER proves it is below.

import { CHANNELS, isGearRatioKey } from './tune';
import type { SessionSummary } from './types';

const CH = new Map(CHANNELS.map((c) => [c.key, c]));

// Gearing is deliberately excluded — its coordinated geometric-progression solver
// already produces the whole box in one step and works well.
export const usesBisection = (channel: string) =>
  !isGearRatioKey(channel) && channel !== 'finalDrive' && channel !== 'gearbox';

export interface Bracket {
  lo: number | null;      // optimum is above this (we advised RAISE here)
  hi: number | null;      // optimum is below this (we advised LOWER here)
  next: number | null;    // the value to run next
  span: number | null;    // remaining uncertainty (hi − lo)
  rationale: string;
  bounded: boolean;       // true when the channel has a known in-game range
}

const snap = (v: number, step: number) => {
  const r = Math.round(v / step) * step;
  return Math.round(r * 1000) / 1000;
};

// Rebuild the search bracket from every prior run on this car.
export function bracketFor(
  channel: string,
  current: number | null,
  direction: number,            // <0 = advice says LOWER, >0 = says RAISE
  s: SessionSummary,
  sessions: SessionSummary[],
  deltaOf: (x: SessionSummary) => number | null,
): Bracket {
  const ch = CH.get(channel);
  const step = ch?.step ?? 1;
  const bounded = ch?.min != null && ch?.max != null;
  const railLo: number | null = bounded ? ch!.min! : null;
  const railHi: number | null = bounded ? ch!.max! : null;
  let lo: number | null = railLo;
  let hi: number | null = railHi;

  // Fold one observation into the bracket: at value `v` the advice pointed `d`.
  //
  // The two bounds can CONTRADICT each other. "RAISE at 50" says the optimum is above
  // 50; "LOWER at 30" says it is below 30. Both cannot hold, and the advice sign really
  // does flip run to run — this module exists because the symptom rates are that noisy
  // (0.8–17.9 at a completely fixed setting). Accumulating both with max()/min() left
  // lo ABOVE hi, which silently skipped the bisection branch and let a stale bound sit
  // on the wrong side of the current value: the search then stepped AGAINST its own
  // advice (advice "LOWER from 45" returned 48). Observations arrive oldest-first, so
  // a contradicted bound is the stale one — drop it back to the rail and keep the newer
  // evidence. Losing a bound costs a run of search; inverting the step costs the tune.
  const observe = (v: number, d: number) => {
    if (d > 0) {                                        // advised RAISE ⇒ optimum > v
      if (hi != null && hi <= v) hi = railHi;
      lo = lo == null ? v : Math.max(lo, v);
    } else {                                            // advised LOWER ⇒ optimum < v
      if (lo != null && lo >= v) lo = railLo;
      hi = hi == null ? v : Math.min(hi, v);
    }
  };

  // Every past run narrows the bracket: the advice direction at that run tells us which
  // side of that value the optimum lies on.
  const hist = sessions
    .filter((x) => x.meta?.carOrdinal === s.meta?.carOrdinal && x.startedAt <= s.startedAt
      && typeof x.meta?.tune?.[channel] === 'number' && x.analytics)
    .sort((a, b) => a.startedAt - b.startedAt);
  for (const run of hist) {
    const v = run.meta!.tune![channel];
    const d = deltaOf(run);
    if (d == null || d === 0) continue;
    observe(v, d);
  }

  // Fold in this run's advice about the CURRENT value — the newest evidence there is.
  if (current != null && direction !== 0) observe(current, direction);

  // No current value yet — tell the driver how to open the search.
  if (current == null) {
    return {
      lo, hi, next: null, span: null, bounded,
      rationale: bounded
        ? `Enter your current value and this jumps straight to the midpoint of ${ch!.min}–${ch!.max}, then halves the remaining range every run.`
        : 'Enter your current value first. With no known in-game range, the search opens by halving it (to go lower) or doubling it (to go higher), then bisects from there.',
    };
  }

  let next: number;
  let rationale: string;
  if (lo != null && hi != null && hi > lo) {
    // Both sides known → true bisection.
    next = snap((lo + hi) / 2, step);
    // Never stall: if rounding lands back on the current value, take one step past it.
    if (next === current) next = snap(current + (direction > 0 ? step : -step), step);
    rationale = `Optimum is bracketed between ${snap(lo, step)} and ${snap(hi, step)} — this is the midpoint. Each run halves what's left.`;
  } else if (direction < 0) {
    // Only an upper bound (or none) → halve toward the floor.
    const floor = lo ?? 0;
    next = snap((floor + current) / 2, step);
    if (next === current) next = snap(current - step, step);
    rationale = lo == null
      ? `No lower bound known yet — halving ${current} to open the search. If that overshoots, the next step comes back halfway.`
      : `Halfway between the known-too-low ${snap(lo, step)} and the current ${current}.`;
  } else {
    // Only a lower bound (or none) → midpoint to the ceiling, or double if unbounded.
    if (hi != null) {
      next = snap((current + hi) / 2, step);
      rationale = `Halfway between the current ${current} and the known-too-high ${snap(hi, step)}.`;
    } else {
      next = snap(current * 2, step);
      rationale = `No upper bound known yet — doubling ${current} to open the search. If that overshoots, the next step comes back halfway.`;
    }
  }

  // INVARIANT: never step against this run's own advice. The bracket logic above
  // keeps lo/hi straddling `current`, so the midpoint already lands on the right
  // side — but a channel pinned at a rail can still produce a wrong-way midpoint.
  // Fall back to a single step the advised way and let the rail clamp below decide
  // whether there is any room left to move.
  if (direction !== 0 && (direction > 0 ? next < current : next > current)) {
    next = snap(current + (direction > 0 ? step : -step), step);
    rationale = `Past runs disagree about which side of ${current} the optimum is on, so this takes one ${step}-step ${direction > 0 ? 'up' : 'down'} rather than a step against the advice.`;
  }

  if (ch?.min != null) next = Math.max(ch.min, next);
  if (ch?.max != null) next = Math.min(ch.max, next);
  const span = lo != null && hi != null ? Math.round((hi - lo) * 1000) / 1000 : null;
  return { lo, hi, next, span, bounded, rationale };
}

// How many more runs to reach the channel's step resolution, given the bracket.
export function runsRemaining(b: Bracket, channel: string): number | null {
  const step = CH.get(channel)?.step ?? 1;
  if (b.span == null || b.span <= step) return 0;
  return Math.ceil(Math.log2(b.span / step));
}
