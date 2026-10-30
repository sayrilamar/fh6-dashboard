// qi-trace work-item: FH6-28
// qi-trace acceptance-criteria: AC-1, AC-3, AC-4, AC-5, AC-6
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// The tire-pressure hold on loose surfaces (AC-4) became a hold everywhere in FH6-26; its
// tests moved to tests/unit/tire-temps.test.ts.
//
// The telemetry never says what kind of event a run was. On 2026-10-29 every run was a rally
// car on dirt (a water crossing cools the tires ~45 °F), which the app couldn't tell from a
// road race of similar length: the planner's only "same event" test was the finish distance
// (all nine dirt races finished at 5,950–5,951 m). The driver now labels the event type on
// the pre-run card, and runs of different kinds are never compared.

import { describe, expect, it } from 'vitest';
import { EVENT_TYPES, comparableRuns, defaultEventType, isLooseSurface, sameEventType } from '../../client/src/events';
import { bracketFor } from '../../client/src/bisect';
import { buildPlan } from '../../client/src/plan';
import type { Candidate } from '../../client/src/plan';
import { learnGain } from '../../client/src/tune';
import type { EventType, SessionSummary } from '../../client/src/types';
import { EVENT_TYPE_KEYS, validEventType } from '../../server/event-types.js';
import { BASE_SIZE, OFFSETS as O, parsePacket } from '../../server/parser.js';
import { session } from '../fixtures/sessions';

// A run of car #634 (the rally car), optionally labelled, optionally a finished race.
const run = (eventType?: EventType, finishDistanceM: number | null = 5951, carOrdinal = 634) =>
  ({ meta: { carOrdinal, ...(eventType ? { eventType } : {}) }, finishDistanceM }) as Pick<SessionSummary, 'meta' | 'finishDistanceM'>;

// A history fixture run with its event type set.
const label = (x: SessionSummary, e: EventType) => ({ ...x, meta: { ...x.meta, eventType: e } }) as SessionSummary;

describe('like-for-like runs (AC-3, AC-6)', () => {
  it('compares runs of the same kind of event on the same route', () => {
    expect(comparableRuns(run('dirt'), run('dirt'))).toBe(true);
  });

  it('never compares a dirt race with a road race, even at the same length', () => {
    expect(sameEventType(run('dirt'), run('road'))).toBe(false);
    expect(comparableRuns(run('dirt'), run('road'))).toBe(false);
  });

  it('never pools a labelled free-roam run with a labelled race', () => {
    expect(comparableRuns(run('dirt'), run('freeRoam', null))).toBe(false);
    expect(comparableRuns(run('freeRoam', null), run('road'))).toBe(false);
  });

  it('keeps comparing runs recorded before event types existed', () => {
    expect(sameEventType(run(), run('dirt')), 'unlabelled matches anything').toBe(true);
    expect(comparableRuns(run(), run('dirt'))).toBe(true);
  });

  it('keeps the car and route-length checks', () => {
    expect(comparableRuns(run('dirt'), run('dirt', 5951, 999)), 'another car').toBe(false);
    expect(comparableRuns(run('dirt'), run('dirt', 8000)), 'another route').toBe(false);
    expect(comparableRuns(run('dirt'), run('dirt', 6100)), 'within 5%').toBe(true);
  });
});

describe('bisection only learns from the same kind of event (AC-3)', () => {
  it('ignores another event type\'s history when bracketing', () => {
    // An earlier DIRT run advised raising rear ARB at 20, which says "the optimum is above 20".
    const dirt = label(session('dirt-1', 1, { rearARB: 20 }), 'dirt');
    const road = label(session('road-1', 2, { rearARB: 30 }), 'road');
    const advice = (x: SessionSummary) => (x.id === 'dirt-1' ? 3 : -3);
    const withDirt = bracketFor('rearARB', 30, -3, road, [dirt, road], advice);
    const alone = bracketFor('rearARB', 30, -3, road, [road], advice);
    expect(withDirt, 'the dirt run must not set the road bracket').toEqual(alone);
    // And it does count when both are dirt.
    const dirt2 = label(session('dirt-2', 2, { rearARB: 30 }), 'dirt');
    expect(bracketFor('rearARB', 30, -3, dirt2, [dirt, dirt2], advice).lo).toBe(20);
  });
});

describe('the learned step only learns from the same kind of event (AC-3)', () => {
  it('ignores a dirt run when sizing a road run\'s step', () => {
    const dirt = label(session('dirt-1', 1, { rearARB: 10 }), 'dirt');
    const road = label(session('road-1', 2, { rearARB: 20 }), 'road');
    const advice = (x: SessionSummary) => (x.id === 'dirt-1' ? 4 : 2);
    expect(learnGain('rearARB', road, [dirt, road], advice).confidence, 'one road run: nothing to learn from').toBe('none');
    // The same pair on dirt: the ask fell 4 → 2 over 10 clicks, so the step grows (capped at 4×).
    const dirt2 = label(session('dirt-2', 2, { rearARB: 20 }), 'dirt');
    expect(learnGain('rearARB', dirt2, [dirt, dirt2], advice).mult).toBe(4);
  });
});

describe('a lever is only written off on the same kind of event (AC-3)', () => {
  // Three dirt runs pushed rear ARB 20 → 26 → 32 and the ask never shrank, so on dirt the
  // planner calls it the wrong lever. That says nothing about the same car on tarmac.
  const dirt = [20, 26, 32].map((v, i) => label(session(`dirt-${i}`, i, { rearARB: v }), 'dirt'));
  const ask: Candidate[] = [{ channel: 'rearARB', label: 'Rear ARB', delta: 3, why: 'test', symptom: 'powerOversteer', severity: 0.8 }];
  const stillAsks = () => () => 3;

  it('still offers the lever on a road run', () => {
    const road = label(session('road-1', 3, { rearARB: 32 }), 'road');
    const plan = buildPlan(road, [...dirt, road], ask, stillAsks);
    expect(plan.blocked, 'dirt history must not block it').toHaveLength(0);
    expect(plan.primary?.channel).toBe('rearARB');
  });

  it('writes it off on the next dirt run', () => {
    const next = label(session('dirt-3', 3, { rearARB: 32 }), 'dirt');
    const plan = buildPlan(next, [...dirt, next], ask, stillAsks);
    expect(plan.blocked.map((c) => c.blocked)).toEqual([expect.stringContaining('wrong lever')]);
  });
});

describe('the planner\'s A/B reviews only use the same kind of event (AC-3)', () => {
  // plan-backfired.test.ts's shape from car #634: softening rear rebound 11.6 → 10 measurably
  // worsened its rebound/bump balance error, here on dirt.
  const damped = (id: string, startedAt: number, rearRebound: number, err: number, e: EventType) =>
    label({ ...session(id, startedAt, { rearRebound }), analytics: { damping: { fBump: 1, fReb: 0.8, rBump: 1, rReb: 0.8 + err, rmsF: 1, rmsR: 1 } } } as unknown as SessionSummary, e);
  const dirt = [damped('d1', 1, 11.6, 0.2, 'dirt'), damped('d2', 2, 11.6, 0.4, 'dirt'), damped('d3', 3, 10, 0.6, 'dirt'), damped('d4', 4, 10, 0.8, 'dirt')];
  const soften: Candidate[] = [{ channel: 'rearRebound', label: 'Rear rebound', delta: -1, why: 'test', symptom: 'trailBrakeOversteer', severity: 0.6 }];
  const noHistory = () => () => null;

  it('blocks the backfired direction on dirt, but not on a road run', () => {
    expect(buildPlan(dirt[3], dirt, soften, noHistory).blocked.map((c) => c.channel), 'proven wrong on dirt').toEqual(['rearRebound']);
    const road = damped('r1', 5, 10, 0.8, 'road');
    const plan = buildPlan(road, [...dirt, road], soften, noHistory);
    expect(plan.experiments, 'no road A/B has been run yet').toHaveLength(0);
    expect(plan.blocked).toHaveLength(0);
  });
});

describe('the pre-run card defaults to this car\'s last labelled event (AC-1, AC-6)', () => {
  const s = (startedAt: number, carOrdinal: number, eventType?: EventType) =>
    ({ startedAt, meta: { carOrdinal, ...(eventType ? { eventType } : {}) } }) as Pick<SessionSummary, 'startedAt' | 'meta'>;

  it('picks the newest labelled run of this car', () => {
    expect(defaultEventType([s(1, 634, 'road'), s(2, 634, 'dirt'), s(3, 634)], 634)).toBe('dirt');
  });

  it('ignores other cars, and has no default without a labelled run', () => {
    expect(defaultEventType([s(1, 634, 'dirt'), s(2, 999, 'drift')], 634)).toBe('dirt');
    expect(defaultEventType([s(1, 634)], 634)).toBeNull();
  });
});

describe('event types (AC-1, AC-4)', () => {
  it('the server accepts exactly the types the card offers', () => {
    expect(EVENT_TYPE_KEYS).toEqual(EVENT_TYPES.map((e) => e.key));
    expect(validEventType('dirt')).toBe('dirt');
    expect(validEventType('moon'), 'anything else is refused').toBeUndefined();
  });

  it('marks dirt and cross country as loose surfaces', () => {
    expect(EVENT_TYPES.filter((e) => isLooseSurface(e.key)).map((e) => e.key)).toEqual(['dirt', 'crossCountry']);
    expect(isLooseSurface(undefined)).toBe(false);
  });
});

describe('the packet bytes the app doesn\'t decode are kept raw (AC-5)', () => {
  it('records the 12-byte placeholder and the trailing byte of a live 324-byte packet', () => {
    const buf = Buffer.alloc(324, 0);
    buf.writeInt32LE(1, O.isRaceOn);
    buf.set([0xde, 0xad, 0xbe, 0xef], 232);
    buf[323] = 0x07;
    const t = parsePacket(buf)!;
    expect(t.rawPlaceholder).toBe('deadbeef' + '00'.repeat(8));
    expect(t.rawTail).toBe('07');
  });

  it('keeps an empty tail for a bare 323-byte packet', () => {
    expect(parsePacket(Buffer.alloc(BASE_SIZE, 0))!.rawTail).toBe('');
  });
});
