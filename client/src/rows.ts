// Row rules for the Tuning Report's whole-number sections: each section's rounding, limits
// and baseline, defined once and shared by the row and the next-run pre-fill (FH6-24). Pure,
// so the unit suite tests the real limits rather than copies of them.

import type { MoveField } from './handling';

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
