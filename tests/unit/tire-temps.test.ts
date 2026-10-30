// qi-trace work-item: FH6-26
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// FH6-27 measured car #634 at 26 vs 34 psi front on one road route and one dirt route:
// the late-race front temperature moved +0.2 °F on tarmac and −0.03 °F on dirt, and no
// grip signal moved. The old rule steered pressure toward a 175 °F tire temperature: it
// called the tires cold on every road run (front 146 °F on the 11:00 AM run of 2026-10-30)
// and asked for −2 psi each time, at either pressure. On dirt it never ran, because no
// frame reached its 140 °F floor. Temperatures are now information only.

import { describe, expect, it } from 'vitest';
import { tireDeltas } from '../../client/src/tires';
import { MANUAL_ONLY, buildPlan, reviewChange } from '../../client/src/plan';
import type { Candidate } from '../../client/src/plan';
import type { SessionAnalytics, SessionSummary } from '../../client/src/types';
import { addTireTemps, buildTireTemps, freshTireTemps, tireTempsFromLines } from '../../server/analytics.js';
import { engineerNotes } from '../../server/metrics.js';
import { session } from '../fixtures/sessions';

const analytics = (front: number, rear: number) =>
  ({ tires: { frontTempF: front, rearTempF: rear, frontPeakF: front + 20, rearPeakF: rear + 20, rearShared: true, samples: 5000 } }) as unknown as SessionAnalytics;

describe('pressure never follows temperature (AC-1, AC-3)', () => {
  it.each([
    ['cold, as the 11:00 AM road run read', 146, 150],
    ['at the old 175 °F ideal', 175, 175],
    ['hot', 245, 250],
  ])('holds both pressures when the tires run %s', (_, front, rear) => {
    const d = tireDeltas(analytics(front, rear));
    expect([d.frontPsi.d, d.rearPsi.d]).toEqual([0, 0]);
    expect(d.frontPsi.why, 'says why it holds').toContain('measured on tarmac and dirt');
  });
});

describe('the live tire notes report temperature only (AC-1)', () => {
  it.each([['cold', 120], ['hot', 240], ['overheating', 280]])('a %s tire gets no pressure advice', (_, f) => {
    const t = {
      isRaceOn: true, tireTempF: { fl: f, fr: 175, rl: 175, rr: 175 },
      normSusp: { fl: 0.5, fr: 0.5, rl: 0.5, rr: 0.5 }, throttle: 0,
    };
    const d = { g: { lat: 0 }, balance: { angleBalance: 0 }, driven: { wheelspin: false, front: 0, rear: 0 } };
    const note = engineerNotes(t, d).find((n: { code: string }) => n.code.startsWith('tire-') && n.code.endsWith('-FL'));
    expect(note?.msg, 'the FL note fires').toContain(`FL tire`);
    expect(note?.msg).not.toMatch(/pressure|psi/i);
  });
});

describe('the planner never offers a pressure change (AC-1, AC-4)', () => {
  const cand = (channel: string, delta: number, symptom: string, severity: number): Candidate =>
    ({ channel, label: channel, delta, why: 'test', symptom, severity });
  const noHistory = () => () => null;
  const s = session('road-1', 1, { frontPsi: 26, rearPsi: 32, rearARB: 30 }, 634);

  it('drops pressure candidates, even the most severe', () => {
    const plan = buildPlan(s, [s], [
      cand('frontPsi', -2, 'tireTemp', 0.9),
      cand('rearPsi', -1.5, 'tireTemp', 0.9),
      cand('rearARB', -3, 'powerOversteer', 0.5),
    ], noHistory);
    const offered = [plan.primary, ...plan.queued, ...plan.blocked].map((c) => c?.channel);
    expect(offered).not.toContain('frontPsi');
    expect(offered).not.toContain('rearPsi');
    expect(plan.primary?.channel).toBe('rearARB');
    expect(plan.dominant, 'tire temperature is no longer a symptom').toBe('powerOversteer');
  });

  it('offers nothing when pressure is the only candidate', () => {
    const plan = buildPlan(s, [s], [cand('frontPsi', -2, 'tireTemp', 0.9)], noHistory);
    expect(plan.primary).toBeNull();
    expect([...MANUAL_ONLY].sort()).toEqual(['frontPsi', 'rearPsi']);
  });

  it('gives a pressure A/B no verdict, so it can never block or revert', () => {
    // The FH6-27 road pair: front 26 → 34 psi, rear 32, nothing else changed.
    const run = (id: string, startedAt: number, frontPsi: number): SessionSummary =>
      ({ ...session(id, startedAt, { frontPsi, rearPsi: 32 }, 634), analytics: analytics(134.1, 143) }) as SessionSummary;
    const a = run('road-26', 1, 26), b = run('road-34', 2, 34);
    expect(reviewChange({ channel: 'frontPsi', from: 26, to: 34 }, a, b, [a, b])).toBeNull();
  });
});

// A dirt run shaped like the 6:09 PM run of 2026-10-29: cold through warm-up, a water
// crossing at 34 °F, then warm running that peaks at 102.8 °F. No frame reaches 140 °F.
const frame = (front: number, wet = false, rr?: number) => ({
  isRaceOn: true,
  tireTempF: { fl: front, fr: front, rl: front + 8, rr: rr ?? front + 8 },
  puddle: { fl: wet ? 0.4 : 0, fr: wet ? 0.4 : 0, rl: 0, rr: 0 },
});
const dirtRun = () => [
  ...Array.from({ length: 160 }, () => frame(60)), // warm-up
  ...Array.from({ length: 5 }, () => frame(34, true)), // the water crossing
  ...Array.from({ length: 144 }, () => frame(90)),
  frame(102.8),
];
const build = (frames: ReturnType<typeof frame>[]) => {
  const acc = freshTireTemps();
  for (const t of frames) addTireTemps(acc, t);
  return buildTireTemps(acc);
};

describe('tire temperatures as information (AC-2, AC-4)', () => {
  it('builds them for a dirt run that never reaches 140 °F, leaving the water out', () => {
    expect(build(dirtRun())).toEqual({
      frontTempF: 90, // median of the last two-thirds; the whole run's median is the 60 °F warm-up
      rearTempF: 98,
      frontPeakF: 102.8,
      rearPeakF: 110.8,
      rearShared: true,
      samples: 305, // 310 frames, 5 in water
    });
  });

  it('says when FH6 sent different rear temperatures', () => {
    const frames = dirtRun();
    frames[200] = frame(90, false, 99);
    expect(build(frames)?.rearShared).toBe(false);
  });

  it('ignores frames outside the race, and needs 50 dry frames', () => {
    const menus = Array.from({ length: 100 }, () => ({ ...frame(200), isRaceOn: false }));
    expect(build([...menus, ...dirtRun()])?.frontPeakF, 'menu frames are not the run').toBe(102.8);
    expect(build(Array.from({ length: 49 }, () => frame(80)))).toBeNull();
  });

  it('rebuilds the same block from a recording, for runs saved before FH6-26', () => {
    const lines = [
      JSON.stringify({ type: 'session-meta', tune: { frontPsi: 29 }, eventType: 'dirt' }),
      ...dirtRun().map((t, i) => JSON.stringify({ type: 'telemetry', t, d: {}, ts: i })),
      'not json',
      '',
    ];
    expect(tireTempsFromLines(lines)).toEqual(build(dirtRun()));
  });
});
