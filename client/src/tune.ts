// Tune channel registry + adaptive step engine.
//
// WHY THIS EXISTS: the report's closed loops used a fixed-gain proportional step —
// measure symptom, nudge by a preset amount, repeat. That converges slowly (6-10 runs)
// because the step never learns how a PARTICULAR car responds to a click.
//
// The fix is a secant step. Treat each section's recommended delta d as the error
// signal (d = 0 means converged). With two runs at different settings for a channel:
//
//   S = (d_new − d_old) / (x_new − x_old)      response of the recommendation to the knob
//   next x = x_new − d_new / S                  the setting where d would reach 0
//   multiplier m = (−d_new / S) / d_new = −1/S  vs the naive step
//
// A perfectly calibrated model gives S = −1 → m = 1. If the car only moved half as far
// as expected (S = −0.5) → m = 2, take a double step. If it overshot (S = −2) → m = 0.5,
// pull back. So the same formula both accelerates AND damps overshoot, and it needs no
// hardcoded per-car gains — it learns them from that car's measured response.
//
// This is only trustworthy with REAL (settings → outcome) pairs, which is why the tune
// is captured before the run rather than inferred afterwards.

import type { SessionSummary, TuneSnapshot } from './types';

export type ChannelKind = 'abs' | 'pct';

export interface Channel {
  key: string;
  label: string;
  group: string;
  step: number;
  unit?: string;
  kind: ChannelKind;      // 'pct' channels move by % of current (springs, aero, ride height)
  drivetrain?: string[];  // restrict to these drivetrains
  min?: number;           // in-game rail — a recommendation past this is meaningless
  max?: number;
}

// Every knob the report can advise on, in in-game tuning-menu order. Keys match the
// field keys the report sections already use, so a pre-run snapshot seeds them directly.
export const CHANNELS: Channel[] = [
  { key: 'frontPsi', label: 'Front tire pressure', group: 'Tires', step: 0.5, unit: 'psi', kind: 'abs', min: 15, max: 55 },
  { key: 'rearPsi', label: 'Rear tire pressure', group: 'Tires', step: 0.5, unit: 'psi', kind: 'abs', min: 15, max: 55 },

  { key: 'frontCamber', label: 'Front camber', group: 'Alignment', step: 0.1, unit: '°', kind: 'abs', min: -5, max: 5 },
  { key: 'rearCamber', label: 'Rear camber', group: 'Alignment', step: 0.1, unit: '°', kind: 'abs', min: -5, max: 5 },
  { key: 'frontToe', label: 'Front toe', group: 'Alignment', step: 0.1, unit: '°', kind: 'abs', min: -5, max: 5 },
  { key: 'rearToe', label: 'Rear toe', group: 'Alignment', step: 0.1, unit: '°', kind: 'abs', min: -5, max: 5 },
  { key: 'caster', label: 'Caster', group: 'Alignment', step: 0.1, unit: '°', kind: 'abs', min: 1, max: 7 },

  { key: 'frontARB', label: 'Front ARB', group: 'Anti-roll bars', step: 1, kind: 'abs', min: 1, max: 65 },
  { key: 'rearARB', label: 'Rear ARB', group: 'Anti-roll bars', step: 1, kind: 'abs', min: 1, max: 65 },

  { key: 'frontSpring', label: 'Front spring', group: 'Springs', step: 1, kind: 'pct' },
  { key: 'rearSpring', label: 'Rear spring', group: 'Springs', step: 1, kind: 'pct' },
  { key: 'frontHeight', label: 'Front ride height', group: 'Springs', step: 0.1, kind: 'pct' },
  { key: 'rearHeight', label: 'Rear ride height', group: 'Springs', step: 0.1, kind: 'pct' },

  { key: 'frontRebound', label: 'Front rebound', group: 'Damping', step: 0.5, kind: 'abs', min: 1, max: 20 },
  { key: 'rearRebound', label: 'Rear rebound', group: 'Damping', step: 0.5, kind: 'abs', min: 1, max: 20 },
  { key: 'frontBump', label: 'Front bump', group: 'Damping', step: 0.5, kind: 'abs', min: 1, max: 20 },
  { key: 'rearBump', label: 'Rear bump', group: 'Damping', step: 0.5, kind: 'abs', min: 1, max: 20 },

  { key: 'frontAero', label: 'Front downforce', group: 'Aero', step: 1, kind: 'pct' },
  { key: 'rearAero', label: 'Rear downforce', group: 'Aero', step: 1, kind: 'pct' },

  { key: 'balance', label: 'Brake balance', group: 'Brakes', step: 1, unit: '%', kind: 'abs', min: 0, max: 100 },
  { key: 'pressure', label: 'Brake pressure', group: 'Brakes', step: 1, unit: '%', kind: 'abs', min: 0, max: 200 },

  { key: 'frontAccel', label: 'Front accel lock', group: 'Differential', step: 1, unit: '%', kind: 'abs', drivetrain: ['FWD', 'AWD'], min: 0, max: 100 },
  { key: 'frontDecel', label: 'Front decel lock', group: 'Differential', step: 1, unit: '%', kind: 'abs', drivetrain: ['FWD', 'AWD'], min: 0, max: 100 },
  { key: 'rearAccel', label: 'Rear accel lock', group: 'Differential', step: 1, unit: '%', kind: 'abs', drivetrain: ['RWD', 'AWD'], min: 0, max: 100 },
  { key: 'rearDecel', label: 'Rear decel lock', group: 'Differential', step: 1, unit: '%', kind: 'abs', drivetrain: ['RWD', 'AWD'], min: 0, max: 100 },
  { key: 'center', label: 'Center balance (% rear)', group: 'Differential', step: 1, unit: '%', kind: 'abs', drivetrain: ['AWD'], min: 0, max: 100 },
];

// Which report section owns each channel. The sections already persist their latest
// RECOMMENDED values to `fh6.<prefix>.c.<carOrdinal>`, so the pre-run card can offer
// "apply recommended" without recomputing anything.
const SECTION_OF: Record<string, string> = {
  frontPsi: 'fh6.tire', rearPsi: 'fh6.tire',
  frontToe: 'fh6.align', rearToe: 'fh6.align', frontCamber: 'fh6.align', rearCamber: 'fh6.align',
  caster: 'fh6.align', frontARB: 'fh6.align', rearARB: 'fh6.align',
  frontSpring: 'fh6.align', rearSpring: 'fh6.align',
  frontHeight: 'fh6.ride', rearHeight: 'fh6.ride',
  frontRebound: 'fh6.damp', rearRebound: 'fh6.damp', frontBump: 'fh6.damp', rearBump: 'fh6.damp',
  frontAero: 'fh6.aero', rearAero: 'fh6.aero',
  balance: 'fh6.brake', pressure: 'fh6.brake',
  frontAccel: 'fh6.diff', frontDecel: 'fh6.diff', rearAccel: 'fh6.diff', rearDecel: 'fh6.diff', center: 'fh6.diff',
};

// The report's latest recommended value for a channel on this car, if any.
export function recommendedFor(channel: string, carOrdinal?: number): number | null {
  const id = carOrdinal ?? 'unknown';
  // Gearing predates the channel registry and keeps its own per-car storage: the gear
  // section stores ratios keyed by gear NUMBER, final drive stores a bare number.
  try {
    if (channel === 'finalDrive') {
      const v = localStorage.getItem(`fh6.finaldrive.c.${id}`);
      return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
    }
    if (isGearRatioKey(channel)) {
      const raw = localStorage.getItem(`fh6.gears.c.${id}`);
      if (!raw) return null;
      const v = JSON.parse(raw)?.[channel.slice(4)];
      return typeof v === 'number' ? v : null;
    }
  } catch { return null; }
  const prefix = SECTION_OF[channel];
  if (!prefix) return null;
  try {
    const raw = localStorage.getItem(`${prefix}.c.${carOrdinal ?? 'unknown'}`);
    if (!raw) return null;
    const v = JSON.parse(raw)?.[channel];
    return typeof v === 'number' ? v : null;
  } catch { return null; }
}

// Gearing channels are generated per car because the gear COUNT varies. Capturing them
// matters for more than completeness: a gearing change that isn't in the snapshot is
// invisible to the experiment miner, so it silently confounds every other A/B test.
const ORD = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];
export const gearChannels = (numGears: number): Channel[] => {
  const out: Channel[] = [{ key: 'finalDrive', label: 'Final drive', group: 'Gearing', step: 0.01, kind: 'abs' }];
  for (let n = 1; n <= Math.min(10, Math.max(0, numGears)); n++) {
    out.push({ key: `gear${n}`, label: `${ORD[n] ?? n + 'th'} gear`, group: 'Gearing', step: 0.01, kind: 'abs' });
  }
  return out;
};

export const isGearRatioKey = (k: string) => /^gear\d+$/.test(k);

export const VALID_DRIVETRAINS = ['FWD', 'RWD', 'AWD'];

// Drivetrain-filtered channel list. CRITICAL: if the drivetrain isn't a known value we
// return EVERYTHING. Before the green light the game reports a placeholder identity
// (carOrdinal 0, drivetrainType 0 → 'FWD', or out-of-range → 'UNK'), and trusting it
// silently hid the real diff channels — a RWD car captured frontAccel/frontDecel one
// run and no diff channels at all the next. Showing an extra irrelevant field is
// harmless; hiding the one that matters corrupts the data the whole loop learns from.
export const channelsFor = (drivetrain?: string, numGears = 0): Channel[] => {
  const dt = (drivetrain || '').toUpperCase();
  const base = !VALID_DRIVETRAINS.includes(dt)
    ? CHANNELS
    : CHANNELS.filter((c) => !c.drivetrain || c.drivetrain.includes(dt));
  return [...base, ...gearChannels(numGears)];
};

export interface Gain {
  mult: number;                  // multiply the naive recommended delta by this
  confidence: 'none' | 'low' | 'good';
  note: string;
  responsePerUnit?: number;      // |S| — how much the recommendation moves per unit of knob
}

const NEUTRAL: Gain = { mult: 1, confidence: 'none', note: '' };

// Learn a per-channel step multiplier from the two most recent runs (same car) that
// recorded a tune AND differ in this channel.
//
// `deltaOf(session)` must return this section's naive recommended delta for that run —
// the same number the report would have shown then.
export function learnGain(
  channel: string,
  s: SessionSummary,
  sessions: SessionSummary[],
  deltaOf: (x: SessionSummary) => number | null,
): Gain {
  const hist = sessions
    .filter((x) => x.startedAt <= s.startedAt && x.meta?.tune && typeof x.meta.tune[channel] === 'number')
    .filter((x) => s.meta?.carOrdinal == null || x.meta?.carOrdinal === s.meta?.carOrdinal)
    .sort((a, b) => a.startedAt - b.startedAt);
  if (hist.length < 2) return NEUTRAL;

  const newer = hist[hist.length - 1];
  const xNew = (newer.meta!.tune as TuneSnapshot)[channel];
  // Walk back to the most recent run whose setting actually differs.
  let older: SessionSummary | null = null;
  for (let i = hist.length - 2; i >= 0; i--) {
    if ((hist[i].meta!.tune as TuneSnapshot)[channel] !== xNew) { older = hist[i]; break; }
  }
  if (!older) {
    return { mult: 1, confidence: 'none', note: 'setting unchanged across runs — no response measured yet' };
  }
  const xOld = (older.meta!.tune as TuneSnapshot)[channel];
  const dNew = deltaOf(newer);
  const dOld = deltaOf(older);
  if (dNew == null || dOld == null) return NEUTRAL;

  const dx = xNew - xOld;
  if (Math.abs(dx) < 1e-6) return NEUTRAL;
  const S = (dNew - dOld) / dx;

  // S must be negative: moving the knob the recommended way should SHRINK the
  // recommendation. S ≈ 0 means the knob did nothing measurable.
  if (S > -0.05) {
    if (Math.abs(dNew) < 1e-6) return { mult: 1, confidence: 'good', note: 'converged — no change needed' };
    return {
      mult: 1,
      confidence: 'low',
      responsePerUnit: Math.abs(S),
      note: S >= 0
        ? `moving this ${dx > 0 ? 'up' : 'down'} didn't reduce the symptom — it may not be the right lever for this car (holding the normal step)`
        : 'barely responded — holding the normal step',
    };
  }
  const raw = -1 / S;
  const mult = Math.max(0.3, Math.min(4, raw));
  const confidence = Math.abs(dx) >= 1 || Math.abs(dNew - dOld) > 0.5 ? 'good' : 'low';
  const note = mult > 1.15
    ? `this car responds weakly here (${(1 / mult * 100).toFixed(0)}% of expected) — taking a ${mult.toFixed(1)}× bigger step to converge sooner`
    : mult < 0.85
      ? `this car responds strongly here — taking a ${mult.toFixed(1)}× step to avoid overshooting`
      : 'responding as expected — normal step';
  return { mult, confidence, note, responsePerUnit: Math.abs(S) };
}

// Apply a learned gain to a naive delta, keeping the channel's step granularity.
export function applyGain(d: number, gain: Gain, step: number): number {
  if (!d) return d;
  const scaled = d * gain.mult;
  const snapped = Math.round(scaled / step) * step;
  // Never round a real recommendation down to nothing.
  if (snapped === 0) return d > 0 ? step : -step;
  return Math.round(snapped * 100) / 100;
}
