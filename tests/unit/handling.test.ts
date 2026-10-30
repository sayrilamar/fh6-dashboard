// qi-trace work-item: FH6-3, FH6-17
// qi-trace acceptance-criteria: FH6-3 AC-1–AC-5; FH6-17 AC-1, AC-2, AC-5
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: high
//
// TOE SIGN (FH6): NEGATIVE = toe-IN, POSITIVE = toe-OUT, as the tuning menu labels it.
// MEASURED, not reasoned (FH6-17): with front and rear toe at +1.0 and the car driven
// straight, the left wheels read slip angle −0.122 (front) / −0.108 (rear) and the right
// wheels +0.121 / +0.108 on all 778 frames, where right-turn frames read positive. So
// +1.0 points both axles' wheels outward: toe-out. FH6-3 first pinned the opposite sign,
// which came from a confounded correlation. Getting it backwards makes the car worse, so
// these tests pin the SIGN of each toe recommendation rather than its exact size.

import { describe, expect, it } from 'vitest';
import { handlingDeltas } from '../../client/src/handling';
import type { SessionAnalytics } from '../../client/src/types';

type Handling = NonNullable<SessionAnalytics['handling']>;

const phase = { os: 0, us: 0, osPct: 0, usPct: 0 };

// A settled run: 3,000 cornering frames, no understeer frames, slide rates below the
// thresholds handlingDeltas starts from (2/1k trail-brake and power, 1.5/1k grip).
function run(over: Partial<Handling> = {}): SessionAnalytics {
  const handling: Handling = {
    cornerFrames: 3000,
    overall: 'neutral',
    oversteerFrames: 0,
    understeerFrames: 0,
    entry: phase,
    mid: phase,
    exit: phase,
    dominantOversteerPhase: null,
    dominantUndersteerPhase: null,
    slideEvents: 0,
    slideCause: { trailBrake: 0, power: 0, grip: 0 },
    slideCausePer1k: { trailBrake: 1, power: 1, grip: 1 },
    slideDominantCause: null,
    slideMedianMph: null,
    brakeStability: 'stable',
    ...over,
  };
  // Only `handling` is read; the rest of SessionAnalytics is irrelevant here.
  return { handling } as unknown as SessionAnalytics;
}

// 15 understeer frames in 3,000 = 5 per 1k, which is full understeer severity.
const understeer = { overall: 'understeer' as const, understeerFrames: 15 };

describe('toe sign', () => {
  it('advises NEGATIVE rear toe (toe-in) when the rear slides on power', () => {
    const d = handlingDeltas(run({ slideCausePer1k: { trailBrake: 1, power: 7, grip: 1 } }));
    expect(d.rearToe.d, 'a loose rear wants toe-IN, which is negative').toBeLessThan(0);
    expect(d.rearToe.why).toContain('toe-IN (toward −)');
  });

  it('advises NEGATIVE rear toe when the rear slides under trail braking', () => {
    const d = handlingDeltas(run({ slideCausePer1k: { trailBrake: 7, power: 1, grip: 1 } }));
    expect(d.rearToe.d, 'a loose rear wants toe-IN, which is negative').toBeLessThan(0);
  });

  it('advises NEGATIVE rear toe when braking stability reads rear-loose', () => {
    const d = handlingDeltas(run({ brakeStability: 'rear-loose' }));
    expect(d.rearToe.d, 'rear-loose under braking wants toe-IN, which is negative').toBeLessThan(0);
  });

  it('advises POSITIVE front toe (toe-out) when the car understeers', () => {
    const d = handlingDeltas(run(understeer));
    expect(d.frontToe.d, 'understeer wants front toe-OUT, which is positive').toBeGreaterThan(0);
    expect(d.frontToe.why).toContain('toe-OUT (toward +)');
  });

  it('holds both toe settings on a neutral run', () => {
    const d = handlingDeltas(run());
    expect(d.frontToe.d, 'neutral run: front toe should not move').toBe(0);
    expect(d.rearToe.d, 'neutral run: rear toe should not move').toBe(0);
    expect(d.frontToe.why).toContain('hold');
    expect(d.rearToe.why).toContain('hold');
  });

  it('trims rear toe by +0.1 for a strong push with a stable rear', () => {
    const d = handlingDeltas(run(understeer));
    expect(d.rearToe.d, 'strong understeer with a stable rear frees rotation with less toe-in').toBe(0.1);
    expect(d.rearToe.why).toContain('toe-in (toward +)');
  });

  it('lets a loose rear win over the push trim', () => {
    // Both symptoms at once: the rear must still get toe-IN, never the +0.1 trim.
    const d = handlingDeltas(run({ ...understeer, slideCausePer1k: { trailBrake: 1, power: 7, grip: 1 } }));
    expect(d.rearToe.d, 'a sliding rear takes priority over freeing rotation').toBeLessThan(0);
    expect(d.frontToe.d, 'the front still gets toe-OUT for the understeer').toBeGreaterThan(0);
  });
});
