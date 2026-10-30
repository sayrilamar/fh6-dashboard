// Change planner — decides what to change next: one lever per group per run (FH6-30), or
// one lever per run when the driver asks for it.
//
// WHY NOT EVERYTHING AT ONCE: with every section recommending independently, a single run
// could move 10 channels at once. That is fatal for two reasons:
//   1. You cannot attribute the result to any one change, so the learned step size
//      (tune.ts) is estimated from a confounded experiment and is meaningless.
//   2. Five levers all aimed at the same symptom over-correct wildly, and each one
//      marches to its in-game rail while the symptom never improves.
// Measured on a real 12-run session: up to 10 channels moved per run, rear camber ran
// -1.4°→-4.2°, front ARB 34→65 (rail), rear ARB 26→1 (rail), rear toe →1.0 (rail), and
// the car ended 2.6 s SLOWER than the untouched baseline.
//
// WHY NOT ONE AT A TIME EITHER (FH6-29): one change per run with one run per setting gave
// no decisive A/B verdict in two days, and cost hours. Each lever's advice reads one part
// of the lap: braking levers read brake slip, throttle levers read power-on slip, gearing
// is solved from the power curve. Levers in different groups therefore don't pile onto
// the same reading. The chassis levers (ARB, springs, toe, camber, caster, ride height,
// aero, dampers) all act on the same corner balance, so that group stays one at a time,
// and no two changes in a run ever target the same symptom.
//
// So: per group, one lever chosen by a symptom playbook (primary lever first), skipping
// levers that are at a rail or have been proven not to move the symptom — plus a hard
// NO CLOCK: lap/track time is never consulted. On a controller the run-to-run variance
// from a distraction or a missed brake point exceeds the effect of a tuning change, so
// every verdict here comes from measured car behaviour (SYMPTOM_METRIC) instead.

import { comparableRuns, sameEventType } from './events';
import type { SessionSummary, SessionAnalytics } from './types';
import { CHANNELS, isGearRatioKey } from './tune';
import { bracketFor, usesBisection, runsRemaining } from './bisect';
import type { Bracket } from './bisect';

const CH = new Map(CHANNELS.map((c) => [c.key, c]));

export interface Candidate {
  channel: string;
  label: string;
  delta: number;          // recommended change (abs units, or % for pct channels)
  why: string;
  symptom: string;        // symptom id this lever targets
  severity: number;       // 0..1, how bad that symptom is this run
}

export interface PlannedChange extends Candidate {
  from: number | null;
  to: number | null;
  rank: number;
  blocked?: string;
  // 'symptom'  — the car is showing this problem NOW
  // 'recovery' — no live symptom; past A/B data says an earlier value measured better
  kind?: 'symptom' | 'recovery';
  bracket?: Bracket;        // bisection search state (not used for gearing)
  runsLeft?: number | null; // runs still needed to reach this channel's step resolution
}

// A completed A/B test: a pair of comparable runs where each changed channel sits in a
// different lever group, so each change is judged on its own symptom metric.
export interface Experiment {
  channel: string;
  from: number;
  to: number;
  dir: 1 | -1;
  review?: ChangeReview | null;   // symptom-based verdict, when the channel has a metric
  afterId: string;                // the run this change led to (the pair's second run)
}

// qi-trace: work-item="FH6-30" acceptance-criteria="AC-1" risk-tier="high" test-coverage="tests/unit/grouped-plan.test.ts"
// Lever groups: which part of the lap each lever's advice is read from. A lever not
// listed is chassis, the safe default — it then never shares a run with another chassis
// change.
export type LeverGroup = 'braking' | 'throttle' | 'gearing' | 'chassis';
const LEVER_GROUP: Record<string, LeverGroup> = {
  balance: 'braking', pressure: 'braking', frontDecel: 'braking', rearDecel: 'braking',
  frontAccel: 'throttle', rearAccel: 'throttle', center: 'throttle',
  gearbox: 'gearing', finalDrive: 'gearing',
};
export const leverGroup = (channel: string): LeverGroup =>
  LEVER_GROUP[channel] ?? (isGearRatioKey(channel) ? 'gearing' : 'chassis');
export const GROUP_LABEL: Record<LeverGroup, string> = { braking: 'Braking', throttle: 'Throttle', gearing: 'Gearing', chassis: 'Chassis' };

// How many changes go out per run: one per lever group (default), or just one.
export type PerRun = 'group' | 'one';

export interface Plan {
  primary: PlannedChange | null;     // the first of thisRun: the worst symptom's lever
  thisRun: PlannedChange[];          // every change to make before the next run
  perRun: PerRun;
  queued: PlannedChange[];
  blocked: PlannedChange[];
  dominant: string | null;
  experiments: Experiment[];
  lastChange: ChangeReview | null;   // the first of lastChanges
  lastChanges: ChangeReview[];       // did each change made before this run work?
  quality: RunQuality | null;        // enough clean data to trust the symptom readings?
  status: TuneStatus;                // done, still tuning, or out of levers?
}

// Ordered levers per symptom: primary first, last resort last. A symptom is only ever
// attacked with ONE lever at a time, and we walk down this list as levers get used up.
const PLAYBOOK: Record<string, string[]> = {
  trailBrakeOversteer: ['balance', 'pressure', 'rearDecel', 'rearToe', 'rearARB', 'rearRebound'],
  powerOversteer: ['rearAccel', 'rearToe', 'rearARB', 'rearSpring', 'rearCamber'],
  gripOversteer: ['rearARB', 'rearCamber', 'rearAero', 'rearSpring'],
  understeer: ['frontARB', 'frontCamber', 'caster', 'frontToe', 'frontSpring', 'frontAero'],
  frontLock: ['balance', 'pressure'],
  bottoming: ['frontHeight', 'rearHeight', 'frontBump', 'rearBump'],
  lowerCG: ['frontHeight', 'rearHeight'],
  frontWheelspin: ['frontAccel'],
  aeroBalance: ['frontAero', 'rearAero'],
  launch: ['gear1'],
};

// qi-trace: work-item="FH6-36" acceptance-criteria="AC-1" risk-tier="high" test-coverage="tests/unit/best-tune-reason.test.ts"
// Refinements, not symptoms: the car isn't misbehaving, there is only room to gain. When a
// refinement's levers are used up it is finished, so it never makes the car "out of
// levers" and the banner never names it. Lowering car #1335 at its minimum height, with
// 0 % bottoming, read "still shows suspension bottoming out" (FH6-36).
export const REFINEMENTS = new Set(['lowerCG']);

// ---------------------------------------------------------------------------
// Judging whether a change WORKED.
//
// Lap time alone is a bad verdict: a lock-up, a missed apex or traffic can cost more
// than any tuning change gains, so "slower ⇒ bad change" is often wrong. The reliable
// test is whether the change moved THE SYMPTOM IT WAS AIMED AT — that's directly
// attributable and far less noisy. Lap time then acts as confirmation, not the judge.
//
// Each channel maps to the measurement it is supposed to improve (lower = better).
type Metric = (a: SessionAnalytics) => number | null;
const rearLoose: Metric = (a) => (a.handling ? Math.max(a.handling.slideCausePer1k.power, a.handling.slideCausePer1k.grip) : null);
const trailRate: Metric = (a) => a.handling?.slideCausePer1k.trailBrake ?? null;
const powerRate: Metric = (a) => a.handling?.slideCausePer1k.power ?? null;
const frontSpin: Metric = (a) => a.diff?.accelSlipFrontPct ?? null;
const usRate: Metric = (a) => (a.handling ? (a.handling.understeerFrames / Math.max(1, a.handling.cornerFrames)) * 1000 : null);
const bottoming: Metric = (a) => (a.rideHeight ? Math.max(a.rideHeight.frontBottomPct, a.rideHeight.rearBottomPct) : null);
const aeroShift: Metric = (a) => (a.aeroBalance ? Math.abs(a.aeroBalance.shift) : null);
// Mean rpm shortfall of measured shift landings vs peak-torque rpm (0 = none bog).
const bogGap: Metric = (a) => {
  const g = a.gearing; if (!g || !g.measured?.length || !g.peakTorqueRpm) return null;
  const gaps = g.measured.map((m) => Math.max(0, g.peakTorqueRpm! - m.landingRpm));
  return gaps.length ? Math.round(gaps.reduce((x, y) => x + y, 0) / gaps.length) : null;
};
// How much of the rev range top gear never uses (0 = reaches the limiter).
const revUnused: Metric = (a) => (a.gearing?.finalDrive ? Math.max(0, 100 - a.gearing.finalDrive.topGearRpmPct) : null);
const launchSpin: Metric = (a) => a.launchRealSpinPct;
// Damping metrics. These were MISSING entirely, so reviewChange() returned null for every
// damper change: no verdict, no blocking, no learning — they could be recommended for
// ever with zero feedback. Rebound is judged by how far the rebound/bump velocity ratio
// sits from the middle of its healthy band; bump by how far front/rear damper work is
// from balanced. Both are "lower is better", like every other metric here.
const REBOUND_IDEAL = 0.8;  // midpoint of the 0.55–1.05 healthy band
const reboundErrF: Metric = (a) => (a.damping && a.damping.fBump > 0 ? Math.abs(a.damping.fReb / a.damping.fBump - REBOUND_IDEAL) : null);
const reboundErrR: Metric = (a) => (a.damping && a.damping.rBump > 0 ? Math.abs(a.damping.rReb / a.damping.rBump - REBOUND_IDEAL) : null);
const damperImbalance: Metric = (a) => (a.damping && a.damping.rmsR > 0 ? Math.abs(a.damping.rmsF / a.damping.rmsR - 1) : null);

// A channel can serve more than one symptom: front ARB is the understeer lever, but it's
// ALSO used to shift balance forward on a loose rear. Judging it only by the understeer
// rate meant that when it was doing the second job the metric read 0 with no variance —
// no signal — so every verdict was "unclear", nothing was ever blocked, and front ARB
// marched 8 → 46 unchecked. Each channel therefore carries a fallback metric, used when
// the primary one is degenerate (flat at zero) for this car.
export const SYMPTOM_METRIC: Record<string, { metric: Metric; label: string; alt?: { metric: Metric; label: string } }> = {
  balance: { metric: trailRate, label: 'rear-slide-under-braking rate' },
  pressure: { metric: trailRate, label: 'rear-slide-under-braking rate' },
  rearDecel: { metric: trailRate, label: 'rear-slide-under-braking rate' },
  rearAccel: { metric: powerRate, label: 'power-oversteer rate' },
  center: { metric: powerRate, label: 'power-oversteer rate' },
  // FH6-36: car #1335's 44 → 41 had no verdict at all before this; it is "no effect".
  frontAccel: { metric: frontSpin, label: 'front wheelspin under power' },
  rearToe: { metric: rearLoose, label: 'rear-looseness rate', alt: { metric: trailRate, label: 'rear-slide-under-braking rate' } },
  rearARB: { metric: rearLoose, label: 'rear-looseness rate', alt: { metric: trailRate, label: 'rear-slide-under-braking rate' } },
  rearCamber: { metric: rearLoose, label: 'rear-looseness rate' },
  rearSpring: { metric: rearLoose, label: 'rear-looseness rate' },
  frontARB: { metric: usRate, label: 'understeer rate', alt: { metric: rearLoose, label: 'rear-looseness rate' } },
  frontCamber: { metric: usRate, label: 'understeer rate', alt: { metric: rearLoose, label: 'rear-looseness rate' } },
  frontToe: { metric: usRate, label: 'understeer rate' },
  caster: { metric: usRate, label: 'understeer rate' },
  frontSpring: { metric: usRate, label: 'understeer rate' },
  frontHeight: { metric: bottoming, label: 'bottoming %' },
  rearHeight: { metric: bottoming, label: 'bottoming %' },
  frontAero: { metric: aeroShift, label: 'speed-dependent balance shift' },
  rearAero: { metric: aeroShift, label: 'speed-dependent balance shift' },
  // Gearing: judged by how far the average shift lands from peak power — that's
  // what re-spacing the box and the final drive are trying to fix.
  gearbox: { metric: bogGap, label: 'shift-landing gap below the power band' },
  finalDrive: { metric: revUnused, label: 'unused rev range in top gear' },
  gear1: { metric: launchSpin, label: 'launch wheelspin' },
  frontRebound: { metric: reboundErrF, label: 'front rebound/bump balance error' },
  rearRebound: { metric: reboundErrR, label: 'rear rebound/bump balance error', alt: { metric: trailRate, label: 'rear-slide-under-braking rate' } },
  frontBump: { metric: damperImbalance, label: 'front/rear damper work imbalance' },
  rearBump: { metric: damperImbalance, label: 'front/rear damper work imbalance' },
};

// How messy was the run? discardedPct counts frames thrown out for kerbs, puddles,
// impact spikes and impossible slip — a good proxy for off-track moments and contact.
// A messy run's LAP TIME is untrustworthy, though its symptom rates (which are
// computed from clean frames only) usually still are.
export interface RunQuality { discardedPct: number; spins: number; messy: boolean; why: string }
export function runQuality(s: SessionSummary): RunQuality | null {
  const a = s.analytics;
  if (!a) return null;
  const discardedPct = a.discardedPct ?? 0;
  const cf = a.handling?.cornerFrames ?? 0;
  const spins = a.handling?.slideEvents ?? 0;
  const spinRate = cf > 0 ? (spins / cf) * 1000 : 0;
  // NOTE: thresholds are first-pass and want calibrating against a set of known-clean
  // vs known-scrappy runs; they only gate a caution message, never a recommendation.
  const reasons: string[] = [];
  if (discardedPct > 25) reasons.push(`${discardedPct}% of frames discarded (kerbs / off-track / contact)`);
  if (spinRate > 12) reasons.push(`${spins} rear-slide events`);
  return { discardedPct, spins, messy: reasons.length > 0, why: reasons.join(' · ') };
}

// Has the car stopped getting faster? Without this the loop never terminates: it always
// finds SOME candidate, so it keeps issuing changes long after the car is dialled in.
// Are we done? Judged ENTIRELY on car behaviour, never on the clock.
//
// Lap/track time is deliberately NOT used anywhere in this file. On a controller the
// run-to-run variance from a distraction, a missed brake point or traffic is larger
// than the gain a tuning change produces, so a slower lap says nothing about whether
// the change worked. Every verdict here comes from measured car symptoms instead.
export interface TuneStatus {
  // 'tuning'     — a symptom is actionable and a lever is available
  // 'dialled-in' — no symptom is above the action threshold
  // 'limited'    — symptoms remain but every lever for them is exhausted or disproven
  state: 'tuning' | 'dialled-in' | 'limited';
  worstSymptom: string | null;
  worstSeverity: number;
  openLevers: number;
  blockedLevers: number;
}

export type ChangeVerdict = 'worked' | 'no-effect' | 'backfired' | 'unclear';

export interface ChangeReview {
  channel: string;
  from: number;
  to: number;
  verdict: ChangeVerdict;
  metricLabel: string;
  before: number | null;
  after: number | null;
  symptomDeltaPct: number | null;
  // Car-wide scatter of this metric and the size of the change in those units. A
  // percentage alone is misleading near a metric's floor: 2.5 → 0.0 reads "−100%" but
  // is only 0.44 sd when the metric scatters ±5.6 and 66% of runs already read 0.
  scatterSd: number | null;
  changeInSd: number | null;
  floorHeavy: boolean;   // most runs sit at the metric's zero floor
  thinData: boolean;    // few clean frames → symptom reading is less certain
  advice: string;
}

// Evaluate the most recent single-channel change purely on the symptom it targeted.
// Pooled sample of a metric across every comparable run at a given channel value.
// Symptom rates are extremely noisy run-to-run: measured on real data the rear-looseness
// rate swung 0.8–17.9 (sd 4.12 vs mean 4.04) across 53 runs at a COMPLETELY FIXED spring
// rate. Judging a single before/after pair against a +/-12% band is therefore a coin
// flip, and acting on those verdicts made the planner ping-pong a setting back and
// forth. So pool every run at each value, compare MEANS, and only return a verdict when
// the gap clears the measured noise.
function sampleAt(channel: string, value: number, sessions: SessionSummary[], ref: SessionSummary, metric: Metric): number[] {
  return sessions
    .filter((x) => comparable(ref, x) && x.meta?.tune && x.meta.tune[channel] === value && x.analytics)
    .map((x) => metric(x.analytics!))
    .filter((v): v is number => v != null);
}
const meanOf = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
const sdOf = (a: number[]) => {
  if (a.length < 2) return NaN;
  const m = meanOf(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
};

export function reviewChange(
  exp: { channel: string; from: number; to: number },
  before: SessionSummary,
  after: SessionSummary,
  sessions?: SessionSummary[],
): ChangeReview | null {
  const spec0 = SYMPTOM_METRIC[exp.channel];
  const a0 = before.analytics, a1 = after.analytics;
  if (!spec0 || !a0 || !a1) return null;

  // Prefer pooled means over the two single runs — see sampleAt().
  const pool = sessions ?? [];
  // A metric that sits flat at zero on both sides carries no information about this
  // lever; fall back to the channel's alternate symptom before giving a verdict.
  const degenerate = (x: number[], y: number[]) =>
    [...x, ...y].every((v) => Math.abs(v) < 0.05) || (x.length >= 2 && y.length >= 2 && sdOf(x) === 0 && sdOf(y) === 0);
  let spec = spec0;
  let sFrom = sampleAt(exp.channel, exp.from, pool, after, spec.metric);
  let sTo = sampleAt(exp.channel, exp.to, pool, after, spec.metric);
  if (spec0.alt && sFrom.length && sTo.length && degenerate(sFrom, sTo)) {
    const altFrom = sampleAt(exp.channel, exp.from, pool, after, spec0.alt.metric);
    const altTo = sampleAt(exp.channel, exp.to, pool, after, spec0.alt.metric);
    if (altFrom.length && altTo.length && !degenerate(altFrom, altTo)) {
      spec = { metric: spec0.alt.metric, label: `${spec0.alt.label} (this lever's other job)` };
      sFrom = altFrom; sTo = altTo;
    }
  }
  const pooled = sFrom.length >= 2 && sTo.length >= 2;
  const noSignal = pooled && degenerate(sFrom, sTo);

  const m0 = pooled ? meanOf(sFrom) : spec.metric(a0);
  const m1 = pooled ? meanOf(sTo) : spec.metric(a1);
  const nFrom = pooled ? sFrom.length : 1;
  const nTo = pooled ? sTo.length : 1;

  // Noise floor: spread of the metric at a FIXED setting. Without repeats we cannot
  // know it, so we refuse to call a verdict rather than inventing one.
  const sd = pooled ? Math.max(sdOf(sFrom) || 0, sdOf(sTo) || 0) : NaN;
  const se = pooled ? Math.sqrt((sd * sd) / nFrom + (sd * sd) / nTo) : NaN;

  const thinData = !!runQuality(after)?.messy;
  let symptomDeltaPct: number | null = null;
  if (m0 != null && m1 != null && m0 > 0.05) symptomDeltaPct = ((m1 - m0) / m0) * 100;

  // Car-wide spread of this metric — the yardstick for "is this change even real?".
  const allVals = pool
    .filter((x) => comparable(after, x) && x.analytics)
    .map((x) => spec.metric(x.analytics!))
    .filter((v): v is number => v != null);
  const scatterSd = allVals.length >= 5 ? sdOf(allVals) : null;
  const changeInSd = scatterSd && scatterSd > 0 && m0 != null && m1 != null
    ? Math.abs(m1 - m0) / scatterSd : null;
  const floorHeavy = allVals.length >= 5 && allVals.filter((v) => v <= 0.001).length / allVals.length >= 0.4;

  let verdict: ChangeVerdict = 'unclear';
  let significant = false;
  if (m0 != null && m1 != null) {
    if (pooled && isFinite(se) && se > 0) {
      // Two standard errors ~ 95% confidence. Anything smaller is indistinguishable
      // from run-to-run scatter and must NOT drive a block or a revert.
      significant = Math.abs(m1 - m0) > 2 * se;
      if (significant) verdict = m1 < m0 ? 'worked' : 'backfired';
      else verdict = nFrom >= 4 && nTo >= 4 ? 'no-effect' : 'unclear';
    } else if (noSignal) {
      verdict = 'no-effect'; // metric flat on both sides — this lever isn't moving it
    } else {
      verdict = 'unclear'; // single-run pair: not enough to resolve a noisy rate
    }
  }

  const noisePct = pooled && m0 ? (2 * se / m0) * 100 : null;
  let advice: string;
  if (verdict === 'worked') advice = thinData
    ? `The symptom improved beyond run-to-run scatter (${nFrom}+${nTo} runs pooled) — keep it. Little of this run was clean though, so re-run to confirm.`
    : `The symptom improved beyond run-to-run scatter (${nFrom}+${nTo} runs pooled) — keep it and move to the next lever.`;
  else if (verdict === 'backfired') advice = `The symptom got measurably worse across ${nFrom}+${nTo} pooled runs — put this one back.`;
  else if (verdict === 'no-effect') advice = `No effect beyond noise across ${nFrom}+${nTo} pooled runs — this lever doesn't move the symptom on this car.`;
  else if (noSignal) advice = `${spec.label} reads flat across both settings — this lever isn't moving the symptom on this car, so stop spending runs on it.`;
  else {
    const bits: string[] = [];
    if (changeInSd != null && scatterSd != null) {
      bits.push(`the ${spec.label} varies by about ±${scatterSd.toFixed(1)} between your runs, and this change moved it ${(Math.abs((m1 ?? 0) - (m0 ?? 0))).toFixed(1)} — only ${changeInSd.toFixed(2)} of that spread`);
    }
    if (floorHeavy) bits.push(`${Math.round(allVals.filter((v) => v <= 0.001).length / allVals.length * 100)}% of your runs already read 0 here, so hitting 0 is close to a coin flip`);
    const why = bits.length ? ` — ${bits.join('; ')}` : '';
    advice = pooled
      ? `Can't call it yet${why}. Repeat the run at each setting so the comparison has something to stand on.`
      : `Only one run at each setting${why}. Run each setting again to build a real comparison.`;
  }
  return { channel: exp.channel, from: exp.from, to: exp.to, verdict, metricLabel: spec.label, before: m0, after: m1, symptomDeltaPct, scatterSd, changeInSd, floorHeavy, thinData, advice };
}

// Comparable runs = same car and same event, so the symptom mix is like-for-like. The rule
// (car, event type, route length) lives in events.ts so bisection and the pre-fill share it
// (FH6-28). No lap/race time is required: practice runs still contribute symptom data, but a
// run labelled free roam is no longer pooled with a labelled race.
const comparable = comparableRuns;

// Mine completed A/B tests out of history. The planner changes at most one lever per
// group per run, so a consecutive run pair whose changes all sit in different groups is
// attributable: each change is judged on its own symptom metric, read in its own part of
// the lap. That turns every run (including the failures) into knowledge: a direction
// that measurably made its symptom worse is never recommended again.
export function experiments(s: SessionSummary, sessions: SessionSummary[]): Experiment[] {
  const hist = sessions
    .filter((x) => x.startedAt <= s.startedAt && comparable(s, x) && x.meta?.tune)
    .sort((a, b) => a.startedAt - b.startedAt);
  const out: Experiment[] = [];
  for (let i = 1; i < hist.length; i++) {
    const A = hist[i - 1], B = hist[i];
    const at = A.meta!.tune!, bt = B.meta!.tune!;
    let changed = [...new Set([...Object.keys(at), ...Object.keys(bt)])]
      .filter((k) => typeof at[k] === 'number' && typeof bt[k] === 'number' && at[k] !== bt[k]);
    // Re-spacing the gearbox moves several ratios at once but is ONE decision, so
    // collapse gear1..gearN into a single 'gearbox' change rather than discarding the
    // pair as confounded.
    const gearsMoved = changed.filter(isGearRatioKey);
    if (gearsMoved.length > 1) changed = ['gearbox', ...changed.filter((k) => !isGearRatioKey(k))];
    // qi-trace: work-item="FH6-31" acceptance-criteria="AC-3" risk-tier="high" test-coverage="tests/unit/change-review.test.ts"
    // Two changes in one group push on the same reading: those levers are confounded and
    // skipped. A lever alone in its group is still judged on its own metric — skipping the
    // whole pair lost the rear accel and rear toe verdicts when the solved gearbox and final
    // drive went in together (FH6-31).
    const perGroup = new Map<LeverGroup, number>();
    for (const k of changed) perGroup.set(leverGroup(k), (perGroup.get(leverGroup(k)) ?? 0) + 1);
    for (const k of changed.filter((c) => perGroup.get(leverGroup(c)) === 1)) {
      if (k === 'gearbox') {
        // Represent the box by its overall spread (1st ÷ top), which is what re-spacing changes.
        const spread = (t: Record<string, number>) => {
          const gs = Object.keys(t).filter(isGearRatioKey).sort((x, y) => Number(x.slice(4)) - Number(y.slice(4)));
          return gs.length >= 2 ? +(t[gs[0]] / t[gs[gs.length - 1]]).toFixed(3) : 0;
        };
        const e: Experiment = { channel: 'gearbox', from: spread(at), to: spread(bt), dir: spread(bt) > spread(at) ? 1 : -1, afterId: B.id };
        e.review = reviewChange(e, A, B, sessions);
        out.push(e);
        continue;
      }
      const e: Experiment = { channel: k, from: at[k], to: bt[k], dir: bt[k] > at[k] ? 1 : -1, afterId: B.id };
      e.review = reviewChange(e, A, B, sessions);
      out.push(e);
    }
  }
  return out;
}

// Has this channel been moved without the symptom responding? If a channel has been
// pushed across several runs and its recommendation never shrank, it's the wrong lever.
function unresponsive(channel: string, s: SessionSummary, sessions: SessionSummary[], deltaOf: (x: SessionSummary) => number | null): boolean {
  const hist = sessions
    .filter((x) => x.startedAt <= s.startedAt && x.meta?.tune && typeof x.meta.tune[channel] === 'number')
    .filter((x) => s.meta?.carOrdinal == null || x.meta?.carOrdinal === s.meta?.carOrdinal)
    .filter((x) => sameEventType(s, x)) // a lever dead on dirt may still work on tarmac (FH6-28)
    .sort((a, b) => a.startedAt - b.startedAt);
  if (hist.length < 3) return false;
  // Look at the channel's WHOLE movement history, not a fixed window of recent runs.
  // The planner rotates through channels, so any one of them only changes every few
  // runs — a short window frequently saw zero movement and let a useless lever keep
  // being recommended (measured: front ARB walked 11.5 → 30, +161%, with the rear
  // still loose, because it hadn't moved within the last 4 runs).
  const xs = hist.map((r) => r.meta!.tune![channel]);
  const moved = Math.max(...xs) - Math.min(...xs);
  if (Math.abs(moved) < (CH.get(channel)?.step ?? 1) * 3) return false; // never really tried
  // Compare the recommendation when the channel was at its lowest vs its current value:
  // if pushing it across that whole range never shrank the ask, it isn't the lever.
  const ds = hist.map(deltaOf);
  const firstIdx = ds.findIndex((d) => d != null);
  const lastIdx = ds.length - 1 - [...ds].reverse().findIndex((d) => d != null);
  if (firstIdx < 0 || lastIdx <= firstIdx) return false;
  const d0 = ds[firstIdx] as number, d1 = ds[lastIdx] as number;
  if (Math.abs(d0) < 1e-6) return false;
  // A lever only counts as DISPROVEN if it was actually tried the way the advice asks.
  // Moving it the opposite way and seeing no improvement says nothing about the lever —
  // it is evidence about the other direction. Without this check a channel stays blocked
  // on history gathered while it was being pushed the wrong way, which is exactly what
  // happened when the rear-toe sign was flipped: 14 runs of it marching toward −4.8 had
  // "proven" the lever useless, so advice in the other direction was never offered.
  const netMove = xs[xs.length - 1] - xs[0];
  if (Math.abs(netMove) > 1e-9 && d1 !== 0 && Math.sign(netMove) !== Math.sign(d1)) return false;
  return Math.abs(d1) >= Math.abs(d0) * 0.75; // ask never shrank by even 25%
}

// How much worse a backfired change made its symptom. symptomDeltaPct is null when the
// baseline sat near zero (a percentage from ~0 means nothing), so show the readings
// instead. Asserting it non-null blanked the whole report (FH6-16); defaulting it to 0
// said "0% worse".
function worseBy(rv: ChangeReview): string {
  if (rv.symptomDeltaPct != null) return `${Math.abs(rv.symptomDeltaPct).toFixed(0)}% worse`;
  return `worse (${+(rv.before ?? 0).toFixed(2)} → ${+(rv.after ?? 0).toFixed(2)})`;
}

// qi-trace: work-item="FH6-26" acceptance-criteria="AC-1" risk-tier="high" test-coverage="tests/unit/tire-temps.test.ts"
// Channels the planner never moves; the driver sets them. Tire pressure: FH6-27 measured
// that it moves neither tire temperature nor any grip signal, on tarmac or dirt, so a run
// spent on it could never be judged.
export const MANUAL_ONLY = new Set(['frontPsi', 'rearPsi']);

// qi-trace: work-item="FH6-30" acceptance-criteria="AC-2" risk-tier="high" test-coverage="tests/unit/grouped-plan.test.ts"
// The first change for each lever group, skipping any whose symptom a change already
// targets. Order in, order out.
export function pickPerGroup(ordered: PlannedChange[]): PlannedChange[] {
  const groups = new Set<LeverGroup>(), symptoms = new Set<string>();
  const out: PlannedChange[] = [];
  for (const c of ordered) {
    const g = leverGroup(c.channel);
    if (groups.has(g) || symptoms.has(c.symptom)) continue;
    groups.add(g); symptoms.add(c.symptom);
    out.push(c);
  }
  return out;
}

export function buildPlan(
  s: SessionSummary,
  sessions: SessionSummary[],
  candidates: Candidate[],
  deltaOfFor: (channel: string) => ((x: SessionSummary) => number | null) | null,
  perRun: PerRun = 'group',
): Plan {
  const tune = s.meta?.tune ?? null;
  const limits = s.meta?.limits ?? null;

  const exps = experiments(s, sessions);
  const quality = runQuality(s);

  // qi-trace: work-item="FH6-31" acceptance-criteria="AC-2" risk-tier="high" test-coverage="tests/unit/change-review.test.ts"
  // Review the changes that produced THIS run (mined from the pair previous run → this
  // run), each judged only on its targeted symptom. Matching by from/to values instead
  // picked up every past change with the same values: the 2×2 had made balance 41 → 55
  // three times, so one report listed that verdict four times (FH6-31).
  const lastChanges = exps
    .filter((x) => x.afterId === s.id)
    .map((x) => x.review)
    .filter((r): r is ChangeReview => r != null);

  // ---- 2. Rank candidates by symptom severity, then lever priority. ----
  candidates = candidates.filter((c) => !MANUAL_ONLY.has(c.channel));
  const bySymptom = new Map<string, number>();
  for (const c of candidates) bySymptom.set(c.symptom, Math.max(bySymptom.get(c.symptom) ?? 0, c.severity));
  const dominant = [...bySymptom.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const decorate = (c: Candidate): PlannedChange => {
    const ch = CH.get(c.channel);
    const from = tune && typeof tune[c.channel] === 'number' ? tune[c.channel] : null;
    // TARGET VALUE BY BISECTION (everything except gearing, which has its own solver).
    // The symptom logic supplies only the DIRECTION; bisection supplies the step. That
    // split matters because direction survives the metric noise while magnitude doesn't.
    let to: number | null = null;
    let bracket: Bracket | undefined;
    let runsLeft: number | null | undefined;
    if (usesBisection(c.channel)) {
      const dOf = deltaOfFor(c.channel);
      // Without a delta function the bracket cannot read history and resets to the full
      // in-game range every run — the search oscillates forever instead of narrowing.
      // Silent before; loud now.
      if (!dOf) console.error(`buildPlan: no delta function for bisecting channel "${c.channel}" — bracket will reset every run and never converge`);
      bracket = bracketFor(c.channel, from, c.delta, s, sessions, dOf ?? (() => null));
      to = bracket.next;
      runsLeft = runsRemaining(bracket, c.channel);
    } else if (from != null) {
      to = ch?.kind === 'pct' ? Math.round(from * (1 + c.delta / 100) * 100) / 100 : Math.round((from + c.delta) * 100) / 100;
      if (ch?.min != null) to = Math.max(ch.min, to);
      if (ch?.max != null) to = Math.min(ch.max, to);
    }
    const order = PLAYBOOK[c.symptom]?.indexOf(c.channel);
    const rank = order == null || order < 0 ? 99 : order;
    const dir: 1 | -1 = c.delta > 0 ? 1 : -1;
    const atLimit = limits?.[c.channel];
    let blocked: string | undefined;
    // Driver-declared limit. Essential for springs / ride height / aero, whose ranges
    // are car-specific and can't be hardcoded — without this the planner keeps
    // recommending a change the game won't accept.
    if ((atLimit === 'min' && dir < 0) || (atLimit === 'max' && dir > 0)) {
      blocked = `you've marked this at its ${atLimit === 'min' ? 'minimum' : 'maximum'}${from != null ? ` (${from}${ch?.unit ?? ''})` : ''} — can't go further, this lever is used up`;
      // The marked value IS the threshold (FH6-25). Leaving the computed target past it
      // made every row that defers to the plan show it — "→ 138" beside "maximum (120)".
      if (from != null) to = from;
    } else if (from != null && to != null && Math.abs(to - from) < (ch?.step ?? 1) * 0.5) {
      blocked = `already at the in-game limit (${from}${ch?.unit ?? ''}) — this lever is used up`;
    } else {
      // Already A/B tested this exact direction and it BACKFIRED. Judged on the targeted
      // symptom, not the clock — blacklisting a lever because of one scrappy lap would
      // throw away a good setting.
      // Only a measured SYMPTOM regression disqualifies a direction. A channel with no
      // symptom metric is never blacklisted — we have no evidence either way.
      // qi-trace: work-item="FH6-32" acceptance-criteria="AC-1" risk-tier="high" test-coverage="tests/unit/backfire-range.test.ts"
      // A backfire disproves the range it tested, not the whole direction: brake balance
      // 55 → 41 making the rear step out says nothing about 67 → 61, which sits between
      // 55 (rear steps out) and 67 (fronts lock). Blocking every rearward move declared the
      // car "out of levers" with that change left (FH6-32). So a move is blocked only when
      // its target reaches the value the failed change started from. With no captured value
      // there is no target, and the direction stays blocked.
      const reaches = (e: Experiment) => to == null || (dir < 0 ? to <= e.from + 1e-9 : to >= e.from - 1e-9);
      const failed = exps.filter((e) => e.channel === c.channel && e.dir === dir && e.review?.verdict === 'backfired' && reaches(e))
        .sort((a, b) => (b.review!.symptomDeltaPct ?? 0) - (a.review!.symptomDeltaPct ?? 0))[0];
      if (failed) {
        const rv = failed.review!;
        blocked = `tried this direction (${failed.from}→${failed.to}) and the ${rv.metricLabel} got ${worseBy(rv)} — proven wrong way, don't repeat`;
      } else {
        const dOf = deltaOfFor(c.channel);
        if (dOf && unresponsive(c.channel, s, sessions, dOf)) {
          blocked = 'moved across several runs without the symptom improving — wrong lever for this car';
        }
      }
    }
    // qi-trace: work-item="FH6-35" acceptance-criteria="AC-2" risk-tier="medium" test-coverage="tests/unit/brake-compromise.test.ts"
    // A blocked lever stays where it is: its row reads "hold". Leaving the bisection's
    // target in place showed "→ 34 %, blocked" on a brake balance the planner would never
    // move (FH6-35). FH6-25 did the same for marked limits.
    if (blocked && from != null) to = from;
    return { ...c, from, to, rank, blocked, bracket, runsLeft };
  };

  // Defensive de-dupe: a channel must appear once, at its highest severity. A duplicate
  // would otherwise show as the primary change AND in the queued list simultaneously.
  const bestByChannel = new Map<string, Candidate>();
  for (const c of candidates) {
    const prev = bestByChannel.get(c.channel);
    if (!prev || c.severity > prev.severity) bestByChannel.set(c.channel, c);
  }
  const all = [...bestByChannel.values()].map(decorate).map((c) => ({ ...c, kind: 'symptom' as const }));
  const blocked = all.filter((c) => c.blocked);
  // A change that just backfired is about to be put back, so don't also offer it as
  // the next thing to try.
  const reverts = new Set(lastChanges.filter((r) => r.verdict === 'backfired').map((r) => r.channel));
  const open = all
    .filter((c) => !c.blocked && !reverts.has(c.channel))
    .sort((a, b) => (b.severity - a.severity) || (a.rank - b.rank));

  // A backfired experiment doesn't just disqualify a direction — it PROVES the value it
  // came from was better. If the car is still sitting on the worse side, walking back to
  // the known-good value is a real, evidence-backed change. Without this the planner
  // blocked the lever and declared "no levers left" while holding a setting its own A/B
  // data showed was wrong (e.g. rear toe −0.2 → −0.4 made rear-looseness 68% worse, and
  // the car was left at −0.4).
  const recoveries: PlannedChange[] = [];
  for (const e of exps) {
    if (e.review?.verdict !== 'backfired') continue;
    if (tune == null || typeof tune[e.channel] !== 'number') continue;
    const cur = tune[e.channel];
    // qi-trace: work-item="FH6-35" acceptance-criteria="AC-4" risk-tier="high" test-coverage="tests/unit/brake-compromise.test.ts"
    // Still past where it started, in the direction that made things worse? Values between
    // the start and the end are the range FH6-32 blocks moves into, so a car sitting there
    // is offered the way back too: brake balance 52 after 55 → 41 made the rear step out
    // had no way back to 55 (FH6-35).
    const worseSide = e.dir > 0 ? cur > e.from + 1e-9 : cur < e.from - 1e-9;
    if (!worseSide) continue;
    if (blocked.some((b) => b.channel === e.channel && b.blocked?.includes('in-game limit'))) continue;
    if (open.some((o) => o.channel === e.channel)) continue;
    // One way back per lever: the FH6-30 validation ran 55 → 41 twice, and each backfire
    // offered "52 → 55", once in this run and again in the queue (FH6-35).
    if (recoveries.some((r) => r.channel === e.channel)) continue;
    const ch = CH.get(e.channel);
    recoveries.push({
      channel: e.channel,
      label: ch?.label ?? e.channel,
      delta: e.from - cur,
      why: `going ${e.dir > 0 ? 'up' : 'down'} to ${e.to} made the ${e.review.metricLabel} ${worseBy(e.review)} — ${e.from} measured better, go back to it`,
      symptom: Object.keys(PLAYBOOK).find((k) => PLAYBOOK[k].includes(e.channel)) ?? 'unknown',
      severity: 0.6,
      from: cur, to: e.from, rank: 0, kind: 'recovery',
    });
  }

  // This run's changes, in priority order (open levers by severity, then recoveries):
  // one per lever group, never two for the same symptom (the playbooks cross groups —
  // trail-brake oversteer lists brake balance AND rear toe). In 'one' mode, just the
  // first. Computed even when regressed, so a failed experiment always advances the loop
  // (revert the culprit AND try the next lever) instead of dead-ending.
  const ordered = [...open, ...recoveries];
  const thisRun = perRun === 'one' ? ordered.slice(0, 1) : pickPerGroup(ordered);
  const primary = thisRun[0] ?? null;
  const queued = ordered.filter((c) => !thisRun.includes(c));
  // Status is purely behavioural: is anything actionable left, and can we act on it?
  const ACTIONABLE = 0.25;                       // below this a symptom isn't worth chasing
  // A refinement with no lever left is finished, not a limit (FH6-36).
  const worst = [...bySymptom.entries()].filter(([k]) => !REFINEMENTS.has(k)).sort((a, b) => b[1] - a[1])[0] ?? null;
  const worstSeverity = worst ? worst[1] : 0;
  // Only the worst symptom's own levers count as used up: ride heights marked at their
  // minimum (bottoming) aren't brake levers, yet "out of levers" counted them (FH6-32).
  const blockedForWorst = worst ? blocked.filter((b) => b.symptom === worst[0]).length : 0;
  const state: TuneStatus['state'] = primary ? 'tuning'
    : worstSeverity >= ACTIONABLE && blockedForWorst > 0 ? 'limited' : 'dialled-in';
  const status: TuneStatus = {
    state,
    worstSymptom: worst ? worst[0] : null,
    worstSeverity: +worstSeverity.toFixed(2),
    openLevers: open.length + recoveries.length,
    blockedLevers: blockedForWorst,
  };
  return { primary, thisRun, perRun, queued, blocked, dominant, experiments: exps, lastChange: lastChanges[0] ?? null, lastChanges, quality, status };
}

export const SYMPTOM_LABEL: Record<string, string> = {
  trailBrakeOversteer: 'rear steps out under braking',
  powerOversteer: 'rear spins up under power',
  gripOversteer: 'rear runs out of grip mid-corner',
  understeer: 'front pushes',
  frontLock: 'fronts lock under braking',
  bottoming: 'suspension bottoming out',
  lowerCG: 'room to lower the car',
  frontWheelspin: 'front wheelspin under power',
  aeroBalance: 'balance shifts with speed',
  launch: 'launch traction',
};

// qi-trace: work-item="FH6-33" acceptance-criteria="AC-1, AC-2, AC-3" risk-tier="medium" test-coverage="tests/unit/tune-verdict.test.ts"
// Has this car reached its best tune for its current build? Only when the plan offers no
// change: either no symptom is worth chasing ('optimal'), or one remains and every lever
// for it is used up ('build-limit'). Confirmed when the run before, on the same tune,
// reached the same verdict — one run can read clean by luck. A run with no cornering data
// (a few seconds parked on the grid) has no symptoms to read, so it never earns a verdict:
// two such 0 hp captures read "optimal" before this check.
export interface TuneVerdict {
  kind: 'optimal' | 'build-limit';
  confirmed: boolean;
  symptom: string | null;        // build-limit: the symptom that remains
  usedUp: PlannedChange[];       // build-limit: its levers, all blocked
}
export function tuneVerdict(s: SessionSummary, plan: Plan, previous: Plan | null): TuneVerdict | null {
  if (plan.status.state === 'tuning' || !s.analytics?.handling) return null;
  const kind = plan.status.state === 'dialled-in' ? 'optimal' : 'build-limit';
  const symptom = kind === 'build-limit' ? plan.status.worstSymptom : null;
  return {
    kind,
    // qi-trace: work-item="FH6-36" acceptance-criteria="AC-4" risk-tier="medium" test-coverage="tests/unit/best-tune-reason.test.ts"
    // What is confirmed is that nothing is left to change. Whether the remaining symptom
    // counts as mild is a threshold: car #1335's front wheelspin sits on it (median 43 %
    // one run, 45 % the next), so requiring the same kind never confirmed (FH6-36).
    confirmed: previous != null && previous.status.state !== 'tuning',
    symptom,
    usedUp: symptom ? plan.blocked.filter((b) => b.symptom === symptom) : [],
  };
}

// The comparable run just before this one, if it ran exactly the same tune: the only run
// that can confirm a verdict. A run with any setting different is a different car.
export function previousSameTune(s: SessionSummary, sessions: SessionSummary[]): SessionSummary | null {
  const t = s.meta?.tune;
  if (!t || !Object.keys(t).length) return null;
  const prev = sessions
    .filter((x) => x.startedAt < s.startedAt && comparable(s, x) && x.meta?.tune && x.analytics?.handling)
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  if (!prev) return null;
  const pt = prev.meta!.tune!;
  return Object.keys({ ...t, ...pt }).every((k) => t[k] === pt[k]) ? prev : null;
}
