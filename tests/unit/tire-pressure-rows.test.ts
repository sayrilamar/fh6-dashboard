// qi-trace work-item: FH6-23
// qi-trace acceptance-criteria: AC-1, AC-2, AC-3, AC-4
// qi-layer: protection-strength
// qi-generated-by: assert-iq
// qi-review-required: true
// qi-risk-tier: medium
//
// The tire-pressure row and its next-run pre-fill now share handlingMove()'s abs mode with a
// 0.5 psi step, inside the game's 15–55 psi range (the descriptor Sessions.tsx builds with
// psiMove). Pressures come from the tune confirmed before car #634's 6:09 PM run on
// 2026-10-29: front 29, rear 32.
//
// The old row rounded base + delta to 0.5 even on a hold, while the pre-fill skipped holds:
// an entered 29.3 showed "→ 29.5" labelled "hold" in the row but stayed 29.3 for next run.

import { describe, expect, it } from 'vitest';
import { handlingMove } from '../../client/src/handling';
import type { MoveField } from '../../client/src/handling';

const psi: MoveField = { mode: 'abs', base: 30, min: 15, max: 55, step: 0.5 };

describe('pressure moves in 0.5 psi steps inside 15–55 (AC-1, AC-3)', () => {
  it('moves the 6:09 PM pressures by whole and half steps', () => {
    expect(handlingMove(psi, 29, 1, null)).toEqual({ target: 30, label: '+1', held: false, dir: 1 });
    expect(handlingMove(psi, 32, -0.5, null)).toEqual({ target: 31.5, label: '-0.5', held: false, dir: -1 });
  });

  it('lands a fractional advice on the nearest half psi', () => {
    expect(handlingMove(psi, 29, 0.7, null).target, '29.7 → 29.5').toBe(29.5);
    expect(handlingMove(psi, 29, 0.8, null).target, '29.8 → 30').toBe(30);
  });

  it('stays inside the game\'s range', () => {
    expect(handlingMove(psi, 54.5, 2, null).target).toBe(55);
    expect(handlingMove(psi, 15.5, -2, null).target).toBe(15);
  });

  it('starts from the 30 psi baseline when nothing is entered', () => {
    expect(handlingMove(psi, undefined, 1, null)).toEqual({ target: 31, label: '+1', held: false, dir: 1 });
  });
});

describe('a hold keeps the entered value; a plan is a move (AC-2)', () => {
  it('holds an off-grid entry exactly instead of showing it rounded', () => {
    expect(handlingMove(psi, 29.3, 0, null)).toEqual({ target: 29.3, label: 'hold', held: true, dir: 0 });
  });

  it('labels a move from an off-grid entry by its real size', () => {
    expect(handlingMove(psi, 29.3, 1, null)).toEqual({ target: 30.5, label: '+1.2', held: false, dir: 1 });
  });

  it('never labels a planned pressure "hold"', () => {
    expect(handlingMove(psi, 29, 0, 30.5)).toEqual({ target: 30.5, label: '+1.5', held: false, dir: 1 });
  });

  it('holds at a pressure marked MAX (FH6-25 still applies)', () => {
    expect(handlingMove(psi, 29, 1, null, { which: 'max', at: 29 })).toEqual({ target: 29, label: 'hold', held: true, dir: 0 });
  });
});
