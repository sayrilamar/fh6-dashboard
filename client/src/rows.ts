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
