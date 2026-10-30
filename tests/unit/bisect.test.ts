// qi-trace work-item: FH6-1, FH6-17
// qi-trace acceptance-criteria: FH6-1 AC-2, AC-6; FH6-17 AC-4
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high

import { describe, expect, it } from 'vitest';
import { bracketFor } from '../../client/src/bisect';
import type { SessionSummary } from '../../client/src/types';
import { session } from '../fixtures/sessions';

// Walk a channel through successive runs, each advising `dirs[i]`, and return the value
// bisection hands to every next run.
function walk(channel: string, start: number, dirs: number[]): number[] {
  const advice = new Map<string, number>();
  const runs: SessionSummary[] = [];
  const out = [start];
  let current = start;
  dirs.forEach((dir, i) => {
    const s = session(`run-${i}`, i + 1, { [channel]: current });
    advice.set(s.id, dir);
    const b = bracketFor(channel, current, dir, s, [...runs, s], (x) => advice.get(x.id) ?? null);
    runs.push(s);
    current = b.next!;
    out.push(current);
  });
  return out;
}

describe('bisection formula', () => {
  // The user's specified narrowing (2026-08-28): halve toward the known bound on each
  // run. The advised step here is large enough that the 3× move cap (added 2026-08-30)
  // never binds, so this isolates the midpoint formula itself.
  it('reproduces the brake-balance narrowing 81 → 41 → 61 → 51 → 56', () => {
    expect(walk('balance', 81, [-40, +40, -40, +40]), 'midpoint of the bracket each run').toEqual([81, 41, 61, 51, 56]);
  });
});

describe('bisection guards', () => {
  it('caps one run\'s move at 3× the advised step (rear toe +0.2 from 2.7)', () => {
    const s = session('run-0', 1, { rearToe: 2.7 });
    const b = bracketFor('rearToe', 2.7, 0.2, s, [s], () => 0.2);
    // Uncapped this is the midpoint of [2.7, 5.0], about 3.9: the +1.2 jump that walked
    // rear toe toward the rail.
    expect(b.next!, 'move capped at 3 × 0.2 = 0.6').toBeCloseTo(3.3, 6);
    expect(b.rationale).toContain('Capped to 0.6 this run');
  });

  it('prints the cap as a clean number (rear toe −0.1 from 0, as on 2026-10-29)', () => {
    // 3 × 0.1 is 0.30000000000000004 in floating point; the report printed it raw.
    const s = session('run-0', 1, { rearToe: 0 });
    const b = bracketFor('rearToe', 0, -0.1, s, [s], () => -0.1);
    expect(b.next!, 'toe-in (negative), capped at 3 × 0.1').toBeCloseTo(-0.3, 6);
    expect(b.rationale).toContain('Capped to 0.3 this run');
    expect(b.rationale).not.toMatch(/\d\.\d{6,}/);
  });

  it('lets the cap override the formula\'s first jump when the advised step is small', () => {
    // Same opening as the narrowing above, but advised −3 points: 81 → 41 would be a
    // 40-point jump, so the cap holds it to 9.
    expect(walk('balance', 81, [-3])).toEqual([81, 72]);
  });

  it('drops a contradicted older bound back to the rail (newest evidence wins)', () => {
    // RAISE at 50 says the optimum is above 50; LOWER at 45 (newer) says below 45.
    const older = session('run-0', 1, { balance: 50 });
    const s = session('run-1', 2, { balance: 45 });
    const advice: Record<string, number> = { 'run-0': 3, 'run-1': -3 };
    const b = bracketFor('balance', 45, -3, s, [older, s], (x) => advice[x.id]);
    expect(b.lo, 'the stale "above 50" bound falls back to the 0 rail').toBe(0);
    expect(b.hi, 'the newer "below 45" bound is kept').toBe(45);
    expect(b.next!, 'and the step goes the advised way').toBeLessThan(45);
  });

  it('never steps against the advice, across a grid of histories and rails', () => {
    const grid: { channel: string; currents: number[]; hist: number[]; mags: number[] }[] = [
      { channel: 'balance', currents: [0, 1, 45, 50, 99, 100], hist: [30, 50, 70], mags: [1, 5] },
      { channel: 'rearToe', currents: [-5, -0.1, 0, 0.2, 2.7, 5], hist: [-0.4, 0.1, 0.5], mags: [0.1, 0.3] },
      { channel: 'rearSpring', currents: [100, 450, 700], hist: [400, 500, 600], mags: [3, 10] },
    ];
    let checked = 0;
    for (const { channel, currents, hist, mags } of grid) {
      const obs = hist.flatMap((v) => [[v, 1], [v, -1]] as [number, number][]);
      const histories: [number, number][][] = [[], ...obs.map((o) => [o]), ...obs.flatMap((a) => obs.map((b) => [a, b]))];
      for (const h of histories) {
        for (const current of currents) {
          for (const mag of mags) {
            for (const sign of [1, -1]) {
              const dir = sign * mag;
              const past = h.map(([v], i) => session(`h${i}`, i + 1, { [channel]: v }));
              const s = session('now', h.length + 1, { [channel]: current });
              const adv = new Map<string, number>([...h.map(([, d], i) => [`h${i}`, d] as [string, number]), ['now', dir]]);
              const next = bracketFor(channel, current, dir, s, [...past, s], (x) => adv.get(x.id) ?? null).next!;
              const ok = dir > 0 ? next >= current - 1e-9 : next <= current + 1e-9;
              expect(ok, `${channel}: history ${JSON.stringify(h)}, at ${current} advised ${dir} → ${next}`).toBe(true);
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });
});
