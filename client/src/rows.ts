// Row rules for the Tuning Report's whole-number sections: each section's rounding, limits
// and baseline, defined once and shared by the row and the next-run pre-fill (FH6-24). Pure,
// so the unit suite tests the real limits rather than copies of them.

import type { MoveField } from './handling';
import type { SessionAnalytics } from './types';

// qi-trace: work-item="FH6-24" acceptance-criteria="AC-1, AC-3" risk-tier="medium" test-coverage="tests/unit/diff-brake-rows.test.ts"
// Diff settings are whole percentages, 0–100.
export const diffMove = (f: { base: number }): MoveField => ({ mode: 'abs', base: f.base, min: 0, max: 100, step: 1 });

// The brake balance a car starts from when none is entered, by drivetrain.
export const brakeBalBase = (dt: string) => (dt === 'FWD' ? 66 : dt === 'AWD' ? 60 : 58);

// Brake balance is 0–100% front and brake pressure 50–200%, both in whole percent.
export const brakeMove = (k: 'balance' | 'pressure', dt: string): MoveField =>
  k === 'balance'
    ? { mode: 'abs', base: brakeBalBase(dt), min: 0, max: 100, step: 1 }
    : { mode: 'abs', base: 100, min: 50, max: 200, step: 1 };

// qi-trace: work-item="FH6-32" acceptance-criteria="AC-3" risk-tier="medium" test-coverage="tests/unit/backfire-range.test.ts"
// The braking summary from typical brake slip per axle (100 % = at the limit). A wide
// split with neither axle locked used to fall through to "near the limit, balanced" —
// front 90 % / rear 21 % read as balanced while the front did nearly all the braking.
export function brakeDiagnosis(f: number, r: number): { diagnosis: string; level: 'info' | 'warn' | 'crit' } {
  const maxSlip = Math.max(f, r), gap = f - r;
  if (maxSlip < 70) return { diagnosis: `Under-braking — you can brake harder (peak axle slip ${maxSlip}%)`, level: 'info' };
  if (gap < -15 && r >= 95) return { diagnosis: `Rears locking first — unstable (rear ${r}% / front ${f}%)`, level: 'crit' };
  if (f >= 95 && r >= 95) return { diagnosis: `Both axles past lockup (front ${f}% / rear ${r}%)`, level: 'warn' };
  if (gap > 15 && f >= 95) return { diagnosis: `Fronts locking first (front ${f}% / rear ${r}%)`, level: 'warn' };
  if (Math.abs(gap) > 15) {
    const [busy, idle] = gap > 0 ? ['front', 'rear'] : ['rear', 'front'];
    return { diagnosis: `${busy === 'front' ? 'Front' : 'Rear'}-heavy braking — the ${busy} is near the limit while the ${idle} does little (front ${f}% / rear ${r}%)`, level: 'warn' };
  }
  return { diagnosis: `Threshold braking (front ${f}% / rear ${r}%) — near the limit, balanced`, level: 'info' };
}

// qi-trace: work-item="FH6-35" acceptance-criteria="AC-1, AC-3" risk-tier="high" test-coverage="tests/unit/brake-compromise.test.ts"
// Brake pressure + balance from measured per-axle slip (100% = lockup). Target is threshold
// braking: both axles just under 100%, together. Moved here from Sessions.tsx (FH6-35) so
// the unit suite can check it.
export function brakeAdvice(a: SessionAnalytics) {
  const f = a.diff.brakeSlipFrontPct;
  const r = a.diff.brakeSlipRearPct;
  if (f == null || r == null) return null;
  const R = (n: number) => Math.round(n);
  const cl = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
  const maxSlip = Math.max(f, r);
  const gap = f - r;

  // PRESSURE vs BALANCE ARE DIFFERENT QUESTIONS — don't judge both on the same number.
  // Pressure asks "can the car reach the limit at all?"; balance asks "do the two axles
  // reach it together?". Judging pressure on max(front, rear) meant a pure BALANCE fault
  // — one axle locking while the other barely slipped — also dragged pressure down.
  // So: lower pressure only when BOTH axles are past the limit (minSlip), and raise it
  // when NEITHER axle reaches it (maxSlip). A one-axle split is balance's job alone.
  const minSlip = Math.min(f, r);
  // With a wide split, more pressure goes to the axle already doing the work: car #1335 at
  // 52 % balance, 115 → 130 % moved front slip 76 → 85 % and trail-brake slides 0.9 → 2.6
  // (FH6-35). So a split only takes more pressure while its busier axle is well under.
  const split = Math.abs(gap) > 15;
  const busy = f >= r ? 'front' : 'rear';
  let press = split
    ? { d: 0, why: `the ${busy} does most of the braking (${f}% vs ${r}%) — more pressure would only push it toward lockup; that's a balance split, not a pressure problem` }
    : { d: 0, why: `one axle reaches the limit and the other doesn't (${f}% vs ${r}%) — that's a balance split, not a pressure problem` };
  if (maxSlip < 70) press = { d: R(cl((80 - maxSlip) / 2, 3, 15)), why: `neither axle reaches the limit (${f}% / ${r}%) — RAISE pressure to actually use the grip` };
  else if (maxSlip < 82 && !split) press = { d: R(cl((85 - maxSlip) / 2, 2, 6)), why: `just under the limit (${f}% / ${r}%) — a touch more pressure reaches threshold` };
  else if (minSlip > 108) press = { d: -R(cl((minSlip - 100) / 3, 3, 12)), why: `both axles past the limit (${f}% / ${r}%) — LOWER pressure to threshold-brake` };
  else if (minSlip >= 82 && maxSlip <= 108) press = { d: 0, why: `both axles sit at threshold (${f}% / ${r}%) — pressure looks right` };

  let bal = maxSlip < 80
    ? { d: 0, why: `neither axle is near the limit on typical braking (${f}% / ${r}%) — balance holds` }
    : { d: 0, why: 'both axles reach the limit together — balance looks right' };
  if (maxSlip >= 80) {
    if (gap > 15) bal = { d: -R(cl(gap / 6, 2, 6)), why: `fronts lock first (${f}% vs ${r}%) — shift balance REARWARD (less front %) so both lock together` };
    else if (gap < -15) bal = { d: R(cl(-gap / 6, 2, 6)), why: `rears lock first (${r}% vs ${f}%) — twitchy entry; shift balance FORWARD (more front %)` };
  }

  // Straight-line slip alone is too blunt a test for trail-braking. A car can sit
  // inside the ±15% gap and still step out every time you brake INTO a corner, because
  // the rear is closer to lockup than the front while it's also being asked for
  // cornering grip. When the measured handling says the rear goes away under braking,
  // brake balance and pressure ARE live levers — previously both read 0 here and were
  // never even offered, which made the planner wrongly declare "no levers left".
  const h = a.handling;
  const trailRate = h?.slideCausePer1k.trailBrake ?? 0;
  const rearLooseOnBrakes = h?.brakeStability === 'rear-loose' || trailRate >= 3;
  if (rearLooseOnBrakes && bal.d === 0 && gap <= 0) {
    bal = { d: R(cl(2 + trailRate / 4, 2, 6)), why: `rear steps out under braking (${trailRate}/1k) and is nearer lockup than the front (${r}% vs ${f}%) — shift balance FORWARD (more front %) to stabilise entry` };
  }
  // Same separation as above: only reach for PRESSURE once the axles are actually close
  // together. With a wide split the rear is going away because the balance is rear-biased,
  // and cutting pressure just makes the car slower into the corner without fixing it —
  // that is what walked pressure down to 33% while the real fault was balance.
  if (rearLooseOnBrakes && press.d === 0 && maxSlip >= 88 && Math.abs(gap) <= 15) {
    press = { d: -R(cl((maxSlip - 80) / 3, 2, 8)), why: `rear goes away under braking with an axle at the limit (${f}% / ${r}%) — LOWER pressure so trail-braking doesn't tip the rear over the limit` };
  }

  const { diagnosis, level } = brakeDiagnosis(f, r);

  return { f, r, diagnosis, level, bal, press };
}
