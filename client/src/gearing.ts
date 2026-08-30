// Gear-ratio spacing solver.
//
// WHAT WAS WRONG BEFORE: the box was spaced as a GEOMETRIC progression — a constant
// step ratio, so every upshift lands at the same RPM. That draws the tidy "arc" on the
// in-game gear graph and it is what every basic tuning calculator does, but it is NOT
// the fastest box, and the reason is simple:
//
//   Equal RPM landing weights every gear equally. Time does not.
//
// You are in 2nd for a blink and in top gear for most of the straight, because
// acceleration falls as speed rises (drag climbs with v², and the same power makes less
// force at higher speed). A power valley between two tall gears is therefore paid for
// over several seconds; the identical valley between two low gears is paid for over a
// fraction of one. Minimising lap time means tightening the steps where the time is
// actually spent — the top of the box — and spending the slack down low.
//
// Benchmarked against a full acceleration simulation (see gearing.test): the geometric
// arc loses 0.5–4.4% of run time versus the optimum across mass 1000–1900 kg, CdA
// 0.35–1.10, grip 0.9–1.8 and flat/peaky torque curves. It never once won.
//
// THE FAMILY. Optimal sets are described by
//
//     ratio_n = first · (top/first) ^ ( ((n-1)/(N-1)) ^ p )
//
// p = 1 is exactly the old geometric arc. p < 1 is progressive: wide steps low down,
// tightening toward top gear. Solving the real time integral per car puts p in the
// 0.45–0.66 band for every configuration tested, and a fixed p = 0.55 lands within
// 0.09–0.35% of the per-car optimum. Restricting the search to this one parameter is
// deliberate: it always produces a strictly descending box that hits both anchors
// exactly, so the solver can never emit a pathological set no matter how noisy the
// telemetry behind it is.

export const GEOMETRIC_P = 1;      // the old behaviour, kept for comparison/tests
export const DEFAULT_P = 0.55;     // validated fallback when the power band is unusable

export type GearRatios = Record<number, number>;

export interface PowerPoint { rpm: number; hp: number }

// Everything here is MEASURED off the UDP stream. Nothing is asked of the driver.
export interface GearContext {
  powerBand?: PowerPoint[] | null;  // WOT hp per rpm bin — the car's real dyno
  revLimit?: number | null;         // actual rev ceiling the engine reaches at WOT
  shiftRpm?: number | null;         // measured flat-out upshift rpm
  topSpeedMs?: number | null;       // fastest clean speed seen
  topGearMaxRpm?: number | null;    // rpm at that speed, in the tallest gear used
  cdA?: number | null;              // measured from terminal velocity
  // Full-throttle-and-gaining frames per speed bin. Says WHERE on the track the car is
  // actually accelerating, which is what the final-drive objective has to be weighted by.
  wotSpeedHist?: { binMs: number; counts: number[] } | null;
}

// Nominal only. The optimum is almost flat in mass — solving with 1000 vs 1900 kg moves
// the answer by ~0.2% of run time — so a stand-in is honest here, and it keeps the
// solver from depending on a number Forza's packet never sends.
const NOMINAL_MASS_KG = 1500;
const NOMINAL_CDA = 0.70;
const RHO = 1.225;
const CRR = 0.012;
const G = 9.80665;
const HP_TO_W = 745.6998715822702;

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Ratios for a given progression exponent. p=1 reproduces the geometric arc. */
export function setForExponent(first: number, top: number, numGears: number, p: number): GearRatios {
  const out: GearRatios = {};
  for (let n = 1; n <= numGears; n++) {
    if (n === 1) out[n] = first;
    else if (n === numGears) out[n] = top;
    else out[n] = round2(first * Math.pow(top / first, Math.pow((n - 1) / (numGears - 1), p)));
  }
  return out;
}

/** Landing rpm after each upshift: road speed is constant across a shift, so rpm ∝ ratio. */
export function landingsFor(ratios: GearRatios, shiftRpm: number): Record<number, number> {
  const out: Record<number, number> = {};
  for (const k of Object.keys(ratios).map(Number).sort((a, b) => a - b)) {
    const prev = ratios[k - 1];
    if (prev != null && ratios[k] != null) out[k] = Math.round(shiftRpm * (ratios[k] / prev));
  }
  return out;
}

// Linear interpolation over the measured power band, in watts.
function powerWattsAt(band: PowerPoint[], rpm: number): number {
  if (rpm < band[0].rpm || rpm > band[band.length - 1].rpm) return 0;
  for (let i = 1; i < band.length; i++) {
    if (band[i].rpm >= rpm) {
      const a = band[i - 1], b = band[i];
      const f = b.rpm === a.rpm ? 0 : (rpm - a.rpm) / (b.rpm - a.rpm);
      return (a.hp + f * (b.hp - a.hp)) * HP_TO_W;
    }
  }
  return band[band.length - 1].hp * HP_TO_W;
}

/**
 * Time to accelerate through the box, in seconds. Lower is better; only used to RANK
 * candidate sets, so the absolute value carries no meaning. The car is always driven in
 * whichever gear makes the most force at that speed, so every candidate is judged when
 * driven perfectly and the comparison isolates spacing.
 */
export function accelTime(ratios: GearRatios, ctx: GearContext): number | null {
  const band = ctx.powerBand;
  const revLimit = ctx.revLimit ?? 0;
  const topSpeed = ctx.topSpeedMs ?? 0;
  const topRpm = ctx.topGearMaxRpm ?? 0;
  if (!band || band.length < 4 || revLimit <= 0 || topSpeed <= 0 || topRpm <= 0) return null;

  const gears = Object.keys(ratios).map(Number).sort((a, b) => a - b);
  const topRatio = ratios[gears[gears.length - 1]];
  if (!(topRatio > 0)) return null;
  // Road speed per rpm in the tallest gear, straight off the telemetry — this replaces
  // needing the final drive and rolling radius, both of which would just reconstruct it.
  const vPerRpmTop = topSpeed / topRpm;
  const speedAt = (rpm: number, ratio: number) => rpm * vPerRpmTop * (topRatio / ratio);
  const rpmAt = (v: number, ratio: number) => v / (vPerRpmTop * (topRatio / ratio));

  const cda = ctx.cdA && ctx.cdA > 0.05 && ctx.cdA < 3 ? ctx.cdA : NOMINAL_CDA;
  const m = NOMINAL_MASS_KG;
  const drag = (v: number) => 0.5 * RHO * cda * v * v + CRR * m * G;
  const loRpm = band[0].rpm;

  const force = (v: number, ratio: number) => {
    const rpm = rpmAt(v, ratio);
    if (rpm > revLimit || rpm < loRpm) return 0;
    return powerWattsAt(band, rpm) / Math.max(v, 0.5);
  };

  const bestForce = (v: number) => {
    let best = 0;
    for (const g of gears) { const f = force(v, ratios[g]); if (f > best) best = f; }
    return best;
  };

  // Cover the range the box actually spans: from 1st off the bottom of the band up to
  // whichever comes FIRST — the rev ceiling in top gear, or the speed where drag eats
  // the last of the tractive force.
  //
  // Stopping short of terminal velocity is not a detail. As force approaches drag the
  // acceleration approaches zero and dv/a diverges, so the final sliver of speed
  // swamps the integral and a rounding-level force difference reads as whole seconds.
  // Cutting at 90% of terminal keeps the comparison in the region a car is actually
  // driven through, and keeps the ranking stable.
  const vRev = speedAt(revLimit, topRatio);
  // Bottom of the useful range: the speed at which FIRST gear is actually on the
  // measured band. This has to be computed BEFORE the terminal-velocity scan and used
  // as its starting point. Scanning up from a fixed low speed looks like it works until
  // the band does not reach far enough down — then first gear makes no measured power
  // at the scan's start speed, the scan breaks on its first step, and the whole solve
  // silently returns null and falls back. Real telemetry does this often: a run whose
  // lowest full-throttle sample is 2750 rpm fell back, while the same car with samples
  // down to 1500 rpm solved fine.
  const v0 = speedAt(Math.max(loRpm, revLimit * 0.35), ratios[gears[0]]);
  let vTerm = 0;
  for (let v = v0; v <= vRev; v += 0.5) { if (bestForce(v) - drag(v) <= 0) break; vTerm = v; }
  if (vTerm <= v0) return null;
  const vMax = Math.min(vRev, vTerm * 0.90);
  if (!(vMax > v0 + 1)) return null;

  const STEPS = 400;
  const dv = (vMax - v0) / STEPS;
  let t = 0;
  for (let i = 0; i < STEPS; i++) {
    const v = v0 + (i + 0.5) * dv;
    const a = (bestForce(v) - drag(v)) / m;
    if (a <= 0.01) return Infinity;  // a genuine hole in the box's coverage
    t += dv / a;
  }
  return t;
}

export interface GearSolution {
  ratios: GearRatios;
  exponent: number;
  /** true when the measured power band drove the answer, false when it fell back. */
  solved: boolean;
  /** Seconds saved over the old geometric arc, when both could be simulated. */
  gainVsGeometricSec: number | null;
}

/**
 * The recommended box. Holds 1st (launch grip) and top gear (top speed) as anchors and
 * solves the progression between them for minimum time, using the measured power band.
 * Falls back to the validated fixed exponent when telemetry is too thin to simulate.
 */
export function solveGearing(
  ratios: GearRatios,
  numGears: number,
  ctx: GearContext,
): GearSolution | null {
  const first = ratios[1], top = ratios[numGears];
  if (first == null || top == null || numGears < 3 || !(first > top && top > 0)) return null;

  const fallback: GearSolution = {
    ratios: setForExponent(first, top, numGears, DEFAULT_P),
    exponent: DEFAULT_P,
    solved: false,
    gainVsGeometricSec: null,
  };

  const geoT = accelTime(setForExponent(first, top, numGears, GEOMETRIC_P), ctx);
  if (geoT == null || !isFinite(geoT)) return fallback;

  let bestP = DEFAULT_P;
  let bestT = Infinity;
  // 1-D sweep. The family is well behaved, so a coarse-then-fine scan is both faster and
  // steadier than a gradient walk on a simulated objective.
  for (let p = 0.35; p <= 1.001; p += 0.05) {
    const t = accelTime(setForExponent(first, top, numGears, p), ctx);
    if (t != null && t < bestT) { bestT = t; bestP = p; }
  }
  for (let p = Math.max(0.3, bestP - 0.05); p <= bestP + 0.05; p += 0.01) {
    const t = accelTime(setForExponent(first, top, numGears, p), ctx);
    if (t != null && t < bestT) { bestT = t; bestP = p; }
  }
  if (!isFinite(bestT)) return fallback;

  return {
    ratios: setForExponent(first, top, numGears, bestP),
    exponent: Math.round(bestP * 100) / 100,
    solved: true,
    gainVsGeometricSec: Math.max(0, geoT - bestT),
  };
}

// ---------------------------------------------------------------------------
// Final drive — the accel-vs-top-speed lever. Scales every gear equally, so it moves
// how much of the rev range you use without touching the spacing.
//
// Lives here, beside the solver, because BOTH the tuning report and the pre-run capture
// screen need it. It used to exist only inside the report component, and the pre-run
// screen read the report's answer back out of localStorage — so the recommendation only
// existed once you had opened the report. Same reasoning as the gear solve itself: one
// function, two callers, no side channel.
export interface FinalDriveStats {
  limiterPct: number;
  topGearRpmPct: number;
  topGearMaxRpm: number;
  redlineRpm: number;
}

export interface FinalDriveAdvice {
  pct: number;                                // signed % change to the final-drive number
  dir: 'shorter' | 'longer' | 'hold';
  why: string;
}

// LEGACY RPM HEURISTIC — kept only as the fallback when there isn't enough measured
// data to solve. It reasons from "% of rev limit used in top gear", which is a PROXY:
// it silently assumes peak power sits at the rev limiter. When peak power is well below
// the limiter, chasing 100% of the rev range pushes the engine PAST peak power and the
// rule over-shortens. Prefer solveFinalDrive().
export function finalDriveAdviceByRpm(fd: FinalDriveStats | null | undefined): FinalDriveAdvice {
  if (!fd) return { pct: 0, dir: 'hold', why: '' };
  if (fd.limiterPct >= 5) {
    return {
      pct: -Math.min(6, Math.max(2, Math.round(fd.limiterPct / 2))),
      dir: 'longer',
      why: `You hit the rev limiter in top gear ${fd.limiterPct}% of the straight (${fd.topGearMaxRpm} rpm). If you're hitting it BEFORE the end of the longest straight, LENGTHEN final drive (lower the number) for more top speed. If it's right at your braking point, you're already optimal — hold.`,
    };
  }
  if (fd.topGearRpmPct <= 92) {
    return {
      pct: Math.min(15, Math.max(3, Math.round(100 - fd.topGearRpmPct))),
      dir: 'shorter',
      why: `Top gear only reaches ${fd.topGearRpmPct}% of your rev limit (${fd.topGearMaxRpm} / ${fd.redlineRpm} rpm) — SHORTEN final drive (raise the number) for more acceleration; you're leaving the top of the rev range unused.`,
    };
  }
  return {
    pct: 0,
    dir: 'hold',
    why: `Top gear reaches ${fd.topGearRpmPct}% of your rev limit with little time pinned there — you're using the rev range well. Hold.`,
  };
}

// Build the solver context straight off a session's analytics. Shared so the report and
// the pre-run screen can never be solving against different inputs.
export function contextFromAnalytics(a: {
  gearing?: { powerBand?: PowerPoint[]; topSpeedMs?: number | null; shiftRpm?: number;
    finalDrive?: { redlineRpm: number; topGearMaxRpm: number } | null;
    wotSpeedHist?: { binMs: number; counts: number[] } | null } | null;
  dyno?: { redlineRpm?: number | null } | null;
  cdA?: { value: number } | null;
} | null | undefined): GearContext {
  return {
    powerBand: a?.gearing?.powerBand ?? null,
    revLimit: a?.gearing?.finalDrive?.redlineRpm ?? a?.dyno?.redlineRpm ?? null,
    shiftRpm: a?.gearing?.shiftRpm ?? null,
    topSpeedMs: a?.gearing?.topSpeedMs ?? null,
    topGearMaxRpm: a?.gearing?.finalDrive?.topGearMaxRpm ?? null,
    cdA: a?.cdA?.value ?? null,
    wotSpeedHist: a?.gearing?.wotSpeedHist ?? null,
  };
}

// ---------------------------------------------------------------------------
// FINAL DRIVE, SOLVED.
//
// The old rule was "top gear reaches less than 92% of the rev limit -> shorten". That is
// an RPM proxy for a POWER question, and it only gives the right answer when peak power
// happens to sit near the limiter. On a car whose power peaks well below the limiter the
// same rule over-shortens, pushing the engine past peak power.
//
// This integrates instead. Final drive scales every gear equally, so a candidate is just
// a scale factor on road-speed-per-rpm. For each candidate we integrate the time to
// accelerate across the speed range this track actually uses, from measured power
// through the gears minus measured aero drag.
//
// WHY A FIXED RANGE AND NOT A WEIGHTED HISTOGRAM. The obvious idea is to weight by where
// the car spends full-throttle time. It does not work, and the failure is instructive:
// on a fast circuit the great majority of on-power frames sit at 91-98% of terminal
// velocity, where the car is asymptotically creeping rather than traversing. Net force
// there is near zero, so any weighting keyed on frame counts is dominated by those bins
// and predicts absurd gains (a change measured at 0.33s/lap came out at 6.4s/lap).
// Excluding the asymptote just moves the problem: those same bins are the only thing
// penalising over-shortening, so without them the objective rails to the shortest
// possible gearing. Tried at six cutoffs, the "optimum" swung between 3.81 and 5.07.
//
// Integrating a FIXED speed range for every candidate has neither failure. A candidate
// that cannot pull to the top of the observed range is disqualified outright, which is
// exactly the penalty over-shortening deserves, and no tuning constant decides the
// answer. The histogram is still used — but only to choose the range honestly, never as
// a weight.
export interface FinalDriveSolution extends FinalDriveAdvice {
  solved: boolean;        // true when the measured power band drove it
  gainPct: number | null; // % less time to cover the range below — NOT a lap-time gain
  scale: number;          // multiply the current final drive by this
  fromMph: number | null;
  toMph: number | null;
}

const MS_TO_MPH = 2.2369362920544;

export function solveFinalDrive(
  ratios: GearRatios,
  ctx: GearContext,
  fd?: FinalDriveStats | null,
): FinalDriveSolution {
  const fallback = (): FinalDriveSolution => {
    const a = finalDriveAdviceByRpm(fd);
    return { ...a, solved: false, gainPct: null, scale: 1 + a.pct / 100, fromMph: null, toMph: null };
  };
  const band = ctx.powerBand;
  const revLimit = ctx.revLimit ?? 0;
  const topSpeed = ctx.topSpeedMs ?? 0;
  const topRpm = ctx.topGearMaxRpm ?? 0;
  if (!band || band.length < 4 || revLimit <= 0 || topSpeed <= 0 || topRpm <= 0) return fallback();

  const gears = Object.keys(ratios).map(Number).sort((a, b) => a - b);
  if (!gears.length) return fallback();
  const topRatio = ratios[gears[gears.length - 1]];
  if (!(topRatio > 0)) return fallback();

  const vPerRpmTop = topSpeed / topRpm;
  const cda = ctx.cdA && ctx.cdA > 0.05 && ctx.cdA < 5 ? ctx.cdA : NOMINAL_CDA;
  // cdA is derived from terminal velocity assuming engine power balances drag, so the
  // same convention holds here: no separate driveline or rolling term, or the model stops
  // reproducing the speed it was measured at.
  const drag = (v: number) => 0.5 * RHO * cda * v * v;
  const loRpm = band[0].rpm;

  const netAt = (v: number, scale: number): number => {
    let best = 0;
    for (const g of gears) {
      const R = ratios[g];
      if (!(R > 0)) continue;
      const rpm = (v * scale * R) / (vPerRpmTop * topRatio);
      if (rpm > revLimit || rpm < loRpm) continue;
      const f = powerWattsAt(band, rpm) / Math.max(v, 0.5);
      if (f > best) best = f;
    }
    return best - drag(v);
  };

  // Range: from a low on-power speed this track actually pulls from, up to just under the
  // fastest speed it reaches. The histogram picks the bottom end when available (10th
  // percentile of on-power frames) so a slow, twisty track isn't judged on speeds it never
  // sees; otherwise a sane fraction of top speed.
  const hist = ctx.wotSpeedHist;
  let v0 = topSpeed * 0.35;
  if (hist && Array.isArray(hist.counts) && hist.binMs > 0) {
    const total = hist.counts.reduce((a, b) => a + b, 0);
    if (total > 200) {
      let run = 0;
      for (let i = 0; i < hist.counts.length; i++) {
        run += hist.counts[i];
        if (run >= total * 0.10) { v0 = Math.max(8, (i + 0.5) * hist.binMs); break; }
      }
    }
  }
  const v1 = topSpeed * 0.99;
  if (!(v1 > v0 + 3)) return fallback();

  const STEPS = 240;
  const dv = (v1 - v0) / STEPS;
  const cost = (scale: number): number => {
    let t = 0;
    for (let i = 0; i < STEPS; i++) {
      const n = netAt(v0 + (i + 0.5) * dv, scale);
      if (n <= 0) return Infinity;   // can't pull to the top of the range the track uses
      t += dv / n;
    }
    return t;
  };

  const t1 = cost(1);
  if (!isFinite(t1) || t1 <= 0) return fallback();
  let bestScale = 1;
  let bestT = t1;
  for (let sc = 0.80; sc <= 1.2501; sc += 0.005) {
    const t = cost(sc);
    if (t < bestT - 1e-12) { bestT = t; bestScale = sc; }
  }

  const pct = Math.round((bestScale - 1) * 1000) / 10;
  const gainPct = Math.round((1 - bestT / t1) * 1000) / 10;
  const fromMph = Math.round(v0 * MS_TO_MPH);
  const toMph = Math.round(v1 * MS_TO_MPH);
  if (Math.abs(pct) < 1.5 || gainPct < 0.5) {
    return {
      pct: 0, dir: 'hold', solved: true, gainPct, scale: 1, fromMph, toMph,
      why: `Solved against your measured power curve: the final drive is within ${Math.abs(pct).toFixed(1)}% of optimal for the ${fromMph}-${toMph} mph range this track uses. Hold it.`,
    };
  }
  const dir: FinalDriveAdvice['dir'] = pct > 0 ? 'shorter' : 'longer';
  return {
    pct, dir, solved: true, gainPct, scale: bestScale, fromMph, toMph,
    why: `Solved against your measured power curve (peak at ${peakRpmOf(band)} rpm), not rev-range usage. ${dir === 'shorter' ? 'SHORTEN' : 'LENGTHEN'} the final drive ${Math.abs(pct).toFixed(1)}% (${dir === 'shorter' ? 'raise' : 'lower'} the number) to put peak power where this track drives. Cuts ${gainPct.toFixed(1)}% off the time to pull ${fromMph}-${toMph} mph — a lap gain is smaller and depends on how much of the lap is spent accelerating.`,
  };
}

function peakRpmOf(band: PowerPoint[]): number {
  let best = band[0];
  for (const p of band) if (p.hp > best.hp) best = p;
  return best.rpm;
}

// Public entry point: solve when the data allows, else fall back to the rpm rule.
export function finalDriveAdvice(
  fd: FinalDriveStats | null | undefined,
  ratios?: GearRatios | null,
  ctx?: GearContext | null,
): FinalDriveSolution {
  if (ratios && ctx && Object.keys(ratios).length >= 2) return solveFinalDrive(ratios, ctx, fd);
  const a = finalDriveAdviceByRpm(fd);
  return { ...a, solved: false, gainPct: null, scale: 1 + a.pct / 100, fromMph: null, toMph: null };
}
