// Handling deltas: the chassis changes (toe, camber, caster, ARB, springs) the Tuning
// Report derives from a run's measured balance.
//
// Lives outside Sessions.tsx so it can be unit-tested without React or the store. The
// toe sign here has flipped back and forth on reasoning alone; it is now taken from a
// telemetry measurement (FH6-17) and tests/unit/handling.test.ts pins it.

import type { SessionAnalytics } from './types';

// FH6's alignment, ARB and damper settings all have 0.1 resolution.
const r1 = (n: number) => Math.round(n * 10) / 10;

// Per-channel change from the measured balance. For abs fields `d` is in the field's
// units (° or ARB clicks); for pct fields (springs) `d` is a percentage of current.
//
// Driven by the signals that are ACTUALLY populated (same ones the diff section uses):
// the per-phase steady-state usPct/osPct almost never fire (the slip-angle classifier
// flags only a handful of frames), so this reads OVERSTEER from the length-normalized
// rear-slide RATES (slideCausePer1k) + brakeStability, and UNDERSTEER from `overall` +
// the understeer-frame rate. Oversteer has real magnitude (rate-scaled → converges);
// understeer is only coarsely captured, so its nudges are near-categorical.
// qi-trace: work-item="FH6-17" acceptance-criteria="AC-1, AC-2" risk-tier="high" test-coverage="tests/unit/handling.test.ts"
export function handlingDeltas(a: SessionAnalytics): Record<string, { d: number; why: string }> {
  const h = a.handling;
  const o: Record<string, { d: number; why: string }> = {};
  if (!h) return o;
  const sev = (x: number) => Math.max(0, Math.min(1, x));
  const cf = Math.max(1, h.cornerFrames);
  const p = h.slideCausePer1k;
  // Rear-slide severities (events per 1000 cornering frames): ~2/1k settled, ~7/1k bad.
  const trailSev = sev((p.trailBrake - 2) / 5);
  const powerSev = sev((p.power - 2) / 5);
  const gripSev = sev((p.grip - 1.5) / 3);
  const rearOS = Math.max(trailSev, powerSev, gripSev); // overall rear looseness
  const rearLoose = h.brakeStability === 'rear-loose';
  const latOS = Math.max(powerSev, gripSev); // rear loses LATERAL grip (camber/spring help)
  // Understeer is only coarsely captured, and front-lock under braking is a brake-bias
  // issue (handled in the Braking section) — so drive the understeer levers ONLY off the
  // overall steady-state read, not brakeStability.
  const usRate = (h.understeerFrames / cf) * 1000;
  // NO FLOOR ON A COIN FLIP. `overall` is decided by comparing understeer and oversteer
  // FRAME COUNTS, and on real data those run 0 or 1 frames out of ~2,900 cornering
  // frames — so `overall` flips between 'neutral' and 'understeer' on a single frame.
  // Flooring severity at 0.4 whenever that coin landed on "understeer" put every front
  // lever (toe, camber, caster, ARB, spring) on the table at meaningful severity on the
  // strength of one frame in three thousand. collectCandidates removed the same floor
  // for the same reason; this copy survived. Severity now comes from the RATE alone.
  const usSev = sev((usRate - 1) / 4);
  const causeTxt = `${p.trailBrake}/${p.power}/${p.grip} per-1k brake/power/grip`;

  // TOE SIGN (FH6, MEASURED): NEGATIVE = toe-IN (stability), POSITIVE = toe-OUT
  // (turn-in), on both axles. The tuning menu's In/Out labels are correct.
  //
  // A toed wheel rolling straight carries a steady slip angle, so telemetry shows which
  // way each wheel points. Right turns read positive on all four wheels (the left side
  // compresses more there), so a wheel aimed right of its travel reads positive. With
  // front and rear toe set to +1.0 and the car driven straight (2026-10-29, car #634,
  // 778 frames), FL/FR read −0.122/+0.121 and RL/RR −0.108/+0.108 on every frame, against
  // 0.000 ± 0.01 at toe 0. The left wheels point left and the right wheels right: +1.0
  // splays both axles outward, which is toe-OUT.
  //
  // From 2026-08-30 this code assumed the reverse, on a 14-run correlation (r = −0.67)
  // from runs that moved up to 15 channels at once, plus a belief that the menu's labels
  // were drawn on the wrong sides. So it advised toe-OUT for a loose rear, which loosens
  // it, and toe-IN for understeer, which adds push. Never change this sign again without
  // a measurement like the one above.
  //
  // Understeer wants front toe-OUT => POSITIVE. A loose rear wants toe-IN => NEGATIVE.
  o.frontToe = usSev > 0.05 ? { d: r1(0.1 + 0.1 * usSev), why: 'understeers — more front toe-OUT (toward +) sharpens turn-in' }
    : { d: 0, why: 'turn-in settled — hold' };
  o.rearToe = rearOS > 0.05 || rearLoose ? { d: -r1(0.1 + 0.1 * Math.max(rearOS, rearLoose ? 0.4 : 0)), why: `rear slides (${causeTxt}) — more rear toe-IN (toward −) steadies it` }
    : usSev > 0.6 ? { d: 0.1, why: 'strong persistent push — trim rear toe-in (toward +) to free rotation' }
      : { d: 0, why: 'rear stable — hold' };
  // Front camber — mid-corner front grip.
  o.frontCamber = usSev > 0.05 ? { d: -r1(0.1 + 0.2 * usSev), why: 'front washes out — add negative front camber for grip at lean' }
    : { d: 0, why: 'front grip ok — hold' };
  // Rear camber — helps LATERAL grip (power/grip-limited oversteer), not brake lock.
  o.rearCamber = latOS > 0.05 ? { d: -r1(0.1 + 0.2 * latOS), why: 'rear loses grip on power/mid-corner — add negative rear camber for rear grip' }
    : { d: 0, why: 'rear grip ok — hold' };
  // Caster — low-risk understeer/turn-in fix (front only).
  o.caster = usSev > 0.05 ? { d: r1(0.3 + 0.2 * usSev), why: 'understeer on turn-in — raise caster for front grip at lean (keeps straight-line stability, unlike toe-out)' }
    : { d: 0, why: 'hold — only raise for a turn-in push' };
  // Front ARB — mid balance. Understeer → soften front; loose rear → stiffen front.
  o.frontARB = usSev > 0.05 ? { d: -Math.round(2 + 3 * usSev), why: 'understeers — soften front ARB to free the front' }
    : rearOS > 0.05 ? { d: Math.round(2 + 3 * rearOS), why: 'rear loose — stiffen front ARB to shift balance forward' }
      : { d: 0, why: 'mid-corner balance ok — hold' };
  // Rear ARB — mid balance. Loose rear → soften rear; understeer → stiffen rear.
  o.rearARB = rearOS > 0.05 ? { d: -Math.round(2 + 3 * rearOS), why: 'rear loose — soften rear ARB to plant the rear' }
    : usSev > 0.05 ? { d: Math.round(2 + 2 * usSev), why: 'understeers — stiffen rear ARB to help it rotate' }
      : { d: 0, why: 'mid-corner balance ok — hold' };
  // Springs (pct) — secondary lever, only when the imbalance is strong.
  o.frontSpring = usSev > 0.6 ? { d: -Math.round(5 + 5 * usSev), why: 'strong understeer — if a softer front ARB isn\'t enough, soften the front spring' }
    : { d: 0, why: 'ARB is the primary balance lever — hold unless understeer persists' };
  o.rearSpring = latOS > 0.6 ? { d: -Math.round(5 + 5 * latOS), why: 'strong power/grip oversteer — if a softer rear ARB isn\'t enough, soften the rear spring' }
    : { d: 0, why: 'ARB is the primary balance lever — hold unless oversteer persists' };
  return o;
}

// One row of the Alignment, ARB & Springs table, or of the Ride Height and Downforce rows
// (FH6-22): where the setting should go, and the label for that move. The label, hold state and direction are derived from the FINAL
// target, the planner's when it has one. The rows used to build all three from the
// symptom's own step and then swap the planner's target in underneath them, so rear toe
// read "0° → −0.3°" beside a "−0.1" label and front ARB "34.3 → 40" beside "+1.7"
// (FH6-19). They also rounded ARB targets to whole numbers, holds included, so a held
// 34.3 read "34, −0.3": the phantom move FH6-18 removed from the damping rows.
// `base` is the value an abs row assumes when nothing is entered; `step` is a pct row's
// rounding (springs and downforce move in whole numbers, ride height in tenths).
export interface MoveField { mode: 'abs' | 'pct'; base?: number; min?: number; max?: number; step?: number }
export interface HandlingMove { target: number | null; label: string; held: boolean; dir: -1 | 0 | 1 }

const sign = (n: number): -1 | 0 | 1 => (n > 0 ? 1 : n < 0 ? -1 : 0);

// qi-trace: work-item="FH6-19" acceptance-criteria="AC-1, AC-2, AC-3, AC-4" risk-tier="medium" test-coverage="tests/unit/handling-move.test.ts"
// qi-trace: work-item="FH6-22" acceptance-criteria="AC-1, AC-2, AC-3" risk-tier="medium" test-coverage="tests/unit/ride-aero-rows.test.ts"
export function handlingMove(f: MoveField, cur: number | undefined, d: number, planned: number | null): HandlingMove {
  if (f.mode === 'pct') {
    // Springs, ride height and downforce move by a percentage of the current value, so
    // without one there is nothing to move from or to label.
    const k = 1 / (f.step ?? 1);
    const target = planned ?? (d !== 0 && cur != null ? Math.max(f.min ?? 1, Math.round(cur * (1 + d / 100) * k) / k) : (cur ?? null));
    if (cur == null || target == null || target === cur) return { target, label: 'hold', held: true, dir: 0 };
    const dir = sign(target - cur);
    if (cur === 0) return { target, label: dir > 0 ? 'raise' : 'lower', held: false, dir };
    const pct = Math.round((target / cur - 1) * 100);
    // A real move too small to show as a whole percent is still a move, not a hold.
    const label = pct === 0 ? `${dir > 0 ? '+' : '-'}<1%` : `${pct > 0 ? '+' : ''}${pct}%`;
    return { target, label, held: false, dir };
  }
  const base = cur ?? f.base;
  if (base == null) return { target: planned, label: 'hold', held: true, dir: 0 };
  const target = planned ?? (d === 0 ? base : Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, r1(base + d))));
  const delta = r1(target - base);
  if (delta === 0) return { target, label: 'hold', held: true, dir: 0 };
  return { target, label: `${delta > 0 ? '+' : ''}${delta}`, held: false, dir: sign(delta) };
}
