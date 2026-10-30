import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Card, SectionHead, Tile } from './Card';
import type { Status } from './Card';
import { useMeta, dismissReport, send } from '../store';
import { fmt, lapTime } from '../format';
import type { SessionSummary, SessionIssue, SessionAnalytics, TuneSnapshot } from '../types';
import { CHANNELS, isGearRatioKey, learnGain, applyGain } from '../tune';
import { buildPlan, SYMPTOM_LABEL } from '../plan';
import { solveGearing, landingsFor, finalDriveAdvice, contextFromAnalytics } from '../gearing';
import type { GearContext } from '../gearing';
import type { Candidate, Plan } from '../plan';
import { handlingDeltas } from '../handling';

// SINGLE SOURCE OF TRUTH for "what should I change".
//
// The sections each compute their own recommendation independently, so the report used
// to show ~10 suggested changes while the Next Change card said "change ONE thing" and
// the convergence banner said "stop tuning" — three subsystems disagreeing on the same
// screen. Every section now consults the plan and labels its recommendation with the
// planner's actual verdict, so the page can only ever tell one story.
const PlanCtx = createContext<Plan | null>(null);

// The planner's target for a channel, so a section never prints a different number
// from the Next Change card. Bisection lives in the planner; sections defer to it.
// Label a move from the ACTUAL target rather than the old proportional delta. The two
// diverge now that targets come from bisection: a row could show "+5%" beside a target
// that was really a 27% cut.
function moveLabel(from: number | null | undefined, to: number | null | undefined, held: boolean): string {
  if (held || from == null || to == null) return 'hold';
  if (from === 0) return to > 0 ? 'raise' : 'lower';
  const pct = Math.round((to / from - 1) * 100);
  return pct === 0 ? 'hold' : `${pct > 0 ? '+' : ''}${pct}%`;
}

// Plain function (not a hook) so it can be called inside .map() callbacks.
const KNOWN_CHANNELS = new Set(CHANNELS.map((c) => c.key));

function targetFromPlan(plan: Plan | null, channel: string): number | null {
  // A misspelled channel returns null forever and silently falls back to the
  // proportional value — the report shows the bisection target while the pre-run popup
  // offers something else. That is exactly how 'brakeBalance' (the real key is
  // 'balance') went unnoticed, so an unknown key is now loud in dev.
  if (!KNOWN_CHANNELS.has(channel) && !isGearRatioKey(channel) && channel !== 'finalDrive') {
    console.error(`targetFromPlan: unknown channel "${channel}" — not in CHANNELS, will never match the plan`);
  }
  if (!plan) return null;
  const hit = [plan.primary, ...plan.queued, ...plan.blocked].find((c) => c && c.channel === channel);
  return hit?.to ?? null;
}

// Status of one channel according to the planner, rendered inline beside its row.
function ChannelStatus({ channel }: { channel: string }) {
  const plan = useContext(PlanCtx);
  if (!plan) return null;
  const blocked = plan.blocked.find((b) => b.channel === channel);
  if (blocked) {
    return <span className="chip crit" title={blocked.blocked}>blocked · {blocked.blocked!.split('—')[0].trim()}</span>;
  }
  if (plan.primary?.channel === channel) return <span className="chip go">← change this one</span>;
  if (plan.queued.some((q) => q.channel === channel)) {
    return <span className="chip hold" title="Valid, but change only one thing per run so the result stays attributable.">queued · not this run</span>;
  }
  if (plan.status.state !== 'tuning') return <span className="chip hold" title="No symptom is severe enough to chase — this is optional.">optional</span>;
  return null;
}
import type { Gain } from '../tune';

type Delta = { d: number; why: string };
type AdaptedDelta = Delta & { gain: Gain; naive: number };

const STEP_OF: Record<string, number> = Object.fromEntries(CHANNELS.map((c) => [c.key, c.step]));

// Scale each naive recommended delta by the step size LEARNED from this car's measured
// response (see tune.ts). Falls back to the naive delta whenever there isn't a real
// pair of runs to learn from, so behaviour is unchanged until the data exists.
function adaptDeltas(
  raw: Record<string, Delta>,
  s: SessionSummary,
  sessions: SessionSummary[],
  deltasFn: (a: SessionAnalytics) => Record<string, Delta>,
): Record<string, AdaptedDelta> {
  const out: Record<string, AdaptedDelta> = {};
  for (const [key, v] of Object.entries(raw)) {
    const gain = learnGain(key, s, sessions, (x) => (x.analytics ? deltasFn(x.analytics)[key]?.d ?? null : null));
    const step = STEP_OF[key] ?? 1;
    out[key] = { d: applyGain(v.d, gain, step), why: v.why, gain, naive: v.d };
  }
  return out;
}

// One-line explanation of a learned step, for the row's detail text.
const gainNote = (g: Gain, naive: number, applied: number): string =>
  g.confidence === 'none' || !g.note || naive === applied ? '' : ` · ${g.note}`;

// Phase-specific fixes for over/understeer (FH6 tuning order). Keyed by which
// part of the corner the imbalance shows up in.
const OVERSTEER_FIX: Record<string, string> = {
  entry: 'Move Brake Balance ~2–3% FORWARD, soften the REAR ARB a couple clicks, lower the Deceleration diff, and add rear Toe-in (−0.1°, toe-in is negative). The rear steps out as you brake and turn in.',
  mid: 'Soften the REAR spring, add a little rear Camber (−0.2°), and/or raise rear Aero. The rear runs out of grip through the middle of the corner.',
  exit: 'Lower the Acceleration diff (counterintuitive but it calms power-on rotation), add rear Toe-in (−0.1°, toe-in is negative), and soften the REAR spring. The rear breaks loose as you pick up throttle.',
};
const UNDERSTEER_FIX: Record<string, string> = {
  entry: 'Soften the FRONT ARB and front Rebound; reduce front Toe-in (move it toward +, i.e. toe-out). If it only pushes above ~100 mph, add front Aero.',
  mid: 'Soften the FRONT spring and add front Camber (−0.2°). Try front tire pressure ±1 psi.',
  exit: 'Lower the Acceleration diff and raise front Aero; stiffen the REAR ARB slightly to help the car rotate off the corner.',
};

// Rear-slide fixes keyed by the PHYSICAL cause read from the telemetry (signed
// rear slip ratio), not just when in the corner it happened.
const SLIDE_FIX: Record<string, { label: string; fix: string }> = {
  trailBrake: {
    label: 'rear locks & steps out under braking (trail-braking oversteer)',
    fix: 'The rear is locking while you brake into the corner. Move Brake Balance ~3–5% FORWARD (less rear brake), drop Brake Pressure a couple %, soften the REAR ARB, and add rear Toe-in (−0.1°, toe-in is negative). If it snaps the instant you lift or turn in, soften rear Rebound too.',
  },
  power: {
    label: 'rear spins up under power (power-oversteer)',
    fix: 'The rear lights up as you feed in throttle. Lower the Acceleration diff, add rear Toe-in (−0.1°, toe-in is negative), soften the REAR spring, and roll into the throttle more progressively. Wider/stickier rear tires help if it persists.',
  },
  grip: {
    label: 'rear runs out of lateral grip (grip-limited oversteer)',
    fix: 'The rear loses grip mid-corner with little brake or throttle input. Soften the REAR spring, add rear Camber (−0.2°), and/or raise rear Aero. If it lets go right as you lift off, raise the Deceleration diff and soften rear Rebound.',
  },
};

// Chassis run-over-run adjustment: toe, camber, caster, ARB, springs. (Brake
// balance/pressure, damping and diff have their own sections, so they're excluded
// here.) Driven by the NORMALIZED per-phase understeer/oversteer percentages — a
// rate, not raw counts, so a longer run doesn't inflate the recommendation. Each
// knob is mapped to the phase it most affects, so they don't all fire for one
// symptom: toe/caster → turn-in (entry), camber/ARB → mid-corner grip & balance,
// springs → the secondary balance lever only when a mid imbalance is strong.
interface HandlingSettings {
  frontToe?: number; rearToe?: number; frontCamber?: number; rearCamber?: number;
  caster?: number; frontARB?: number; rearARB?: number; frontSpring?: number; rearSpring?: number;
}
const HANDLING_FIELDS: { key: keyof HandlingSettings; label: string; base: number; mode: 'abs' | 'pct'; min?: number; max?: number; step: number; unit?: string }[] = [
  // TOE SIGN CONVENTION (FH6, measured 2026-10-29): NEGATIVE = toe-IN, POSITIVE =
  // toe-OUT — front and rear, exactly as the tuning menu labels them. (The evidence is
  // in handling.ts.) Toe-in stabilises that axle; toe-out sharpens/frees it. So a loose
  // rear wants a NEGATIVE change and an understeering front wants a POSITIVE one. Getting
  // this backwards actively makes the car worse, so keep the sign and the wording together.
  { key: 'frontToe', label: 'Front · Toe', base: 0.0, mode: 'abs', min: -1, max: 1, step: 0.1, unit: '°' },
  { key: 'rearToe', label: 'Rear · Toe', base: -0.1, mode: 'abs', min: -1, max: 1, step: 0.1, unit: '°' },
  { key: 'frontCamber', label: 'Front · Camber', base: -1.5, mode: 'abs', min: -5, max: 0.5, step: 0.1, unit: '°' },
  { key: 'rearCamber', label: 'Rear · Camber', base: -1.2, mode: 'abs', min: -5, max: 0.5, step: 0.1, unit: '°' },
  { key: 'caster', label: 'Caster', base: 5.0, mode: 'abs', min: 3, max: 7, step: 0.1, unit: '°' },
  { key: 'frontARB', label: 'Front · ARB', base: 30, mode: 'abs', min: 1, max: 65, step: 1 },
  { key: 'rearARB', label: 'Rear · ARB', base: 30, mode: 'abs', min: 1, max: 65, step: 1 },
  { key: 'frontSpring', label: 'Front · Spring', base: 500, mode: 'pct', min: 1, step: 1 },
  { key: 'rearSpring', label: 'Rear · Spring', base: 500, mode: 'pct', min: 1, step: 1 },
];

// THE POPUP MUST AGREE WITH THE REPORT. The `*Target()` functions below compute what gets
// persisted to `fh6.<section>.c.<carOrdinal>` — the value the "Confirm the tune on the car"
// pre-run card offers next session. They originally used the same proportional math the rows
// used, so they matched by construction. Once the rows moved to bisection, they no longer did:
// the row said "rear spring 493" while the popup still offered the proportional 470. Each now
// takes the plan and prefers `targetFromPlan()`, falling back to the proportional value only
// for channels the planner has no candidate for.
function handlingTarget(cur: HandlingSettings, a: SessionAnalytics, plan?: Plan | null): HandlingSettings {
  const deltas = handlingDeltas(a);
  const out: HandlingSettings = { ...cur };
  for (const f of HANDLING_FIELDS) {
    const planned = targetFromPlan(plan ?? null, f.key as string);
    if (planned != null) { out[f.key] = planned; continue; }
    const dd = deltas[f.key]; if (!dd || dd.d === 0) continue;
    if (f.mode === 'pct') {
      const base = cur[f.key];
      if (base == null) continue; // % change needs the current spring rate
      out[f.key] = Math.max(f.min ?? 1, Math.round(base * (1 + dd.d / 100)));
    } else {
      const base = cur[f.key] ?? f.base;
      let t = base + dd.d;
      t = f.step < 1 ? Math.round(t * 10) / 10 : Math.round(t);
      out[f.key] = Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, t));
    }
  }
  return out;
}

function Handling({ s }: { s: SessionSummary }) {
  const plan = useContext(PlanCtx);
  const plannedTarget = (ch: string) => targetFromPlan(plan, ch);
  const meta = useMeta();
  const h = s.analytics?.handling;
  const [state, setState] = useState(() => inheritSettings<HandlingSettings>(s, meta.sessions, 'fh6.align', handlingTarget, HANDLING_FIELDS.map((f) => f.key)));
  const { cur, from, edited } = state;
  useEffect(() => {
    if (!s.analytics?.handling) return;
    try { localStorage.setItem(`fh6.align.c.${s.meta?.carOrdinal ?? 'unknown'}`, JSON.stringify(handlingTarget(cur, s.analytics, plan))); } catch { /* ignore */ }
  }, [cur, s, plan]);
  if (!h) return null;
  const deltas = adaptDeltas(handlingDeltas(s.analytics!), s, meta.sessions, handlingDeltas);
  const update = (k: keyof HandlingSettings, v: string) => {
    const next = { ...cur, [k]: v === '' ? undefined : Number(v) };
    setState({ cur: next, from: 'self', edited: true });
    try { localStorage.setItem(`fh6.align.s.${s.id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const inheritNote = from === 'prev' ? " Boxes pre-filled from your previous run's RECOMMENDATION — edit any to override."
    : from === 'car' ? ' Pre-filled from your last saved chassis tune for this car.' : '';

  const biasColor = h.overall === 'oversteer' ? 'var(--red)' : h.overall === 'understeer' ? 'var(--amber)' : 'var(--green)';
  const cap = (p: string) => p.toUpperCase();
  const notes: { level: string; title: string; text: string }[] = [];

  if (h.slideEvents > 0 && h.slideDominantCause) {
    const g = SLIDE_FIX[h.slideDominantCause];
    const c = h.slideCause;
    const breakdown = `${c.trailBrake} braking · ${c.power} power · ${c.grip} grip`;
    notes.push({
      level: 'crit',
      title: `${h.slideEvents} rear-slide events — ${g.label}${h.slideMedianMph ? ` (~${h.slideMedianMph} mph)` : ''}`,
      text: `${g.fix}  [by cause: ${breakdown}]`,
    });
    // If a second cause is also significant (≥40% of the top one), surface it too.
    const ranked = (['trailBrake', 'power', 'grip'] as const)
      .map((k) => [k, c[k]] as const)
      .sort((a, b) => b[1] - a[1]);
    if (ranked[1][1] >= Math.max(3, ranked[0][1] * 0.4)) {
      const s = SLIDE_FIX[ranked[1][0]];
      notes.push({ level: 'warn', title: `Also: ${s.label}`, text: s.fix });
    }
  }
  if (h.overall === 'oversteer' && h.dominantOversteerPhase) {
    notes.push({ level: 'info', title: `Steady-state: oversteer-biased, worst ${cap(h.dominantOversteerPhase)} of corner`, text: `Baseline balance (not just the slides): ${OVERSTEER_FIX[h.dominantOversteerPhase]}` });
  }
  if (h.overall === 'understeer' && h.dominantUndersteerPhase) {
    notes.push({ level: 'warn', title: `Understeer — worst on ${cap(h.dominantUndersteerPhase)}`, text: UNDERSTEER_FIX[h.dominantUndersteerPhase] });
  }
  // Braking-stability note — but never contradict the trail-brake fix: if the
  // rear is locking under cornering-braking (the spin), forward bias wins, so
  // suppress the straight-line "move rearward" note.
  if (h.brakeStability === 'rear-loose' && h.slideDominantCause !== 'trailBrake') {
    notes.push({ level: 'warn', title: 'Rear unstable under braking', text: 'Under braking the rear loses grip before the front — the entry-spin trigger. Move Brake Balance forward 3–5% and/or soften the rear (rear ARB, Decel diff, rear Toe-in).' });
  } else if (h.brakeStability === 'front-lock' && h.slideDominantCause !== 'trailBrake') {
    notes.push({ level: 'info', title: 'Fronts lock under braking', text: 'Fronts lock first under straight-line braking, so you lose turn-in (entry understeer). Ease Brake Pressure a few % or shift Balance slightly rearward.' });
  }

  return (
    <>
      <div className="sec-head">
        Handling Balance
      </div>
      <div style={{ fontSize: 12, marginTop: 6 }}>
        Overall: <b style={{ color: biasColor, textTransform: 'uppercase' }}>{h.overall}</b>{' '}
        <span style={{ color: 'var(--muted)' }}>({h.oversteerFrames} oversteer / {h.understeerFrames} understeer frames, {h.cornerFrames} cornering)</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
        by phase — entry {h.entry.osPct}% OS / {h.entry.usPct}% US · mid {h.mid.osPct}% OS / {h.mid.usPct}% US · exit {h.exit.osPct}% OS / {h.exit.usPct}% US
      </div>
      <div className="notes" style={{ marginTop: 6 }}>
        {notes.length > 0 ? (
          notes.map((n, i) => (
            <div key={i} className={`note ${n.level}`}>
              <b>{n.title}</b>
              <div style={{ marginTop: 3 }}>{n.text}</div>
            </div>
          ))
        ) : (
          <div className="note empty">Balanced through entry, mid and exit — no dominant over/understeer.</div>
        )}
      </div>

      <div className="sec-head" style={{ marginTop: 10 }}>
        Alignment, ARB &amp; springs — {edited ? 'run-over-run adjustment' : 'starting point'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        Enter your in-game values; each run nudges toward the measured balance and converges. Brake balance/pressure, damping and diff have their own sections.{inheritNote}
      </div>
      <div className="notes" style={{ marginTop: 6 }}>
        {HANDLING_FIELDS.map((f) => {
          const dd = deltas[f.key] || { d: 0, why: '' };
          const curV = cur[f.key];
          let target: number | null; let deltaLabel: string; let dColor: string; let held: boolean;
          if (f.mode === 'pct') {
            held = dd.d === 0;
            target = plannedTarget(f.key) ?? (!held && curV != null ? Math.max(f.min ?? 1, Math.round(curV * (1 + dd.d / 100))) : (curV ?? null));
            deltaLabel = moveLabel(curV, target, held);
            dColor = held ? 'var(--muted)' : dd.d < 0 ? 'var(--amber)' : 'var(--blue)';
          } else {
            const base = curV ?? f.base;
            let t = base + dd.d;
            t = f.step < 1 ? Math.round(t * 10) / 10 : Math.round(t);
            t = Math.max(f.min ?? -Infinity, Math.min(f.max ?? Infinity, t));
            target = t;
            const delta = Math.round((t - base) * 10) / 10;
            held = delta === 0;
            deltaLabel = held ? 'hold' : `${delta > 0 ? '+' : ''}${delta}`;
            dColor = held ? 'var(--muted)' : delta < 0 ? 'var(--amber)' : 'var(--blue)';
          }
          // Defer to the planner's bisection target so this row can't print a different
          // number from the Next Change card.
          const planned = plannedTarget(f.key);
          if (planned != null) target = planned;
          const showTarget = f.mode === 'pct' ? (curV != null ? `${target}` : '—') : `${target}${f.unit ?? ''}`;
          return (
            <div key={f.key} className="note info" style={{ borderLeftColor: held ? 'var(--line)' : dColor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <b>{f.label}{f.unit ? ` (${f.unit})` : ''}</b>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                  <input
                    className="car-input"
                    style={{ width: 56, textAlign: 'right' }}
                    type="number"
                    step={f.step}
                    value={curV ?? ''}
                    placeholder={f.mode === 'pct' ? 'value' : String(f.base)}
                    onChange={(e) => update(f.key, e.target.value)}
                  />
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <b style={{ color: dColor, minWidth: 40, textAlign: 'right' }}>{showTarget}</b>
                  <span style={{ color: dColor, fontSize: 11, minWidth: 38 }}>{deltaLabel}</span>
                  <ChannelStatus channel={f.key} />
                </span>
              </div>
              <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11 }}>{dd.why}{f.mode !== 'pct' && curV == null ? ` · baseline ${f.base}${f.unit ?? ''}` : ''}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        Apply the → values in-game, run again, and each re-adjusts from what you enter. Each knob is tied to the phase it most affects (toe/caster → turn-in, camber/ARB → mid-corner, springs → strong mid imbalance only), so they don't all pile onto one symptom. Springs need your current rate to show a target — they move by %. Measured closed-loop, not a first-principles alignment calc.
      </div>
    </>
  );
}

// Closed-loop differential tuning. You enter the diff you actually ran (saved
// per car); each recorded run nudges every channel FROM your current value by a
// delta scaled by how severe the measured symptom is — so the step shrinks as
// the problem shrinks and it converges over several runs. Blank = start from a
// drivetrain baseline. Diff settings aren't in the telemetry, so "current" has
// to come from you.
interface DiffSettings { frontAccel?: number; frontDecel?: number; rearAccel?: number; rearDecel?: number; center?: number }

const DIFF_FIELDS: Record<string, { key: keyof DiffSettings; label: string; base: number }[]> = {
  RWD: [{ key: 'rearAccel', label: 'Rear · Accel', base: 50 }, { key: 'rearDecel', label: 'Rear · Decel', base: 15 }],
  FWD: [{ key: 'frontAccel', label: 'Front · Accel', base: 45 }, { key: 'frontDecel', label: 'Front · Decel', base: 0 }],
  AWD: [
    { key: 'frontAccel', label: 'Front · Accel', base: 35 }, { key: 'frontDecel', label: 'Front · Decel', base: 0 },
    { key: 'rearAccel', label: 'Rear · Accel', base: 50 }, { key: 'rearDecel', label: 'Rear · Decel', base: 15 },
    { key: 'center', label: 'Center · % rear', base: 65 },
  ],
};

// Per-channel adjustment for THIS run, scaled by symptom severity (0..1).
function diffDeltas(a: SessionAnalytics): Record<string, { d: number; why: string }> {
  const h = a.handling;
  const sev = (x: number) => Math.max(0, Math.min(1, x));
  const r = (n: number) => Math.round(n);
  // Use length-normalized slide RATES (events per 1000 cornering frames) so the
  // advice reflects car behaviour, not stint length. ~2/1k = settled, ~7/1k = bad.
  const powerRate = h ? h.slideCausePer1k.power : 0;
  const trailRate = h ? h.slideCausePer1k.trailBrake : 0;
  const powerSev = sev((powerRate - 2) / 5);
  const trailSev = sev((trailRate - 2) / 5);
  const exitUS = h ? sev((h.exit.usPct - 8) / 22) : 0;
  const entryUS = h ? sev((h.entry.usPct - 8) / 22) : 0;
  const rearSpin = a.diff.accelSlipRearPct ?? 0;
  const frontSpin = a.diff.accelSlipFrontPct ?? 0;
  const frontSpinSev = sev((frontSpin - 25) / 75);

  const o: Record<string, { d: number; why: string }> = {};
  o.rearAccel = powerSev > 0.05
    ? { d: -r(12 * powerSev), why: `power-oversteer (${powerRate}/1k corner frames) — lower so both rears don't break loose together` }
    : exitUS > 0.05 ? { d: -r(6 * exitUS), why: 'push on exit — lower a little to free rotation' }
      : { d: 0, why: 'power delivery settled — hold' };
  o.rearDecel = trailSev > 0.05
    ? { d: -r(8 * trailSev), why: `rear locks under braking (${trailRate}/1k corner frames) — lower decel lock (pair with brake bias forward)` }
    : entryUS > 0.05 ? { d: r(6 * entryUS), why: "won't turn in on the brakes — add a little decel lock for stability" }
      : { d: 0, why: 'entry settled — hold' };
  o.frontAccel = (frontSpinSev > 0.05 || exitUS > 0.05)
    ? { d: -r(10 * Math.max(frontSpinSev, exitUS)), why: `front pushing / spinning (${frontSpin}%) — lower front lock` }
    : { d: 0, why: 'front traction fine — hold' };
  o.frontDecel = entryUS > 0.2 ? { d: r(8 * entryUS), why: "won't rotate on entry — a little decel lock helps" } : { d: 0, why: 'leave near 0' };
  const imb = rearSpin - frontSpin;
  o.center = (powerSev > 0.05 && imb > 10) ? { d: -r(Math.min(10, imb / 3)), why: `rear over-driven / spinning (${rearSpin}% vs front ${frontSpin}%) — shift torque FORWARD` }
    : (frontSpin > rearSpin + 10) ? { d: r(Math.min(10, (frontSpin - rearSpin) / 3)), why: `front doing too much (${frontSpin}% vs rear ${rearSpin}%) — bias REARWARD to rotate` }
      : { d: 0, why: 'front/rear spin balanced — hold' };
  return o;
}

// Generic closed-loop inheritance. A new session's "current" starts from the
// previous same-car session's RECOMMENDED target (current + measured delta),
// forward-simulated through the whole chain — i.e. it assumes you applied each
// run's advice, so the boxes are already filled with what you should now run. An
// explicit edit on a session re-anchors the chain from there.
function inheritSettings<T extends object>(
  s: SessionSummary,
  sessions: SessionSummary[],
  prefix: string,
  targetFn: (cur: T, a: SessionAnalytics) => T,
  keys?: string[],
  // For sections whose shape doesn't match the tune snapshot's key names. Gear ratios
  // are keyed by NUMBER here (1, 2, 3…) but stored as `gear1`, `gear2`… in the snapshot,
  // so a plain key copy silently picks up nothing — which is why the gearing sections
  // were the only ones that never pre-filled from the confirmed tune.
  fromTune?: (t: TuneSnapshot) => T | null,
): { cur: T; from: 'self' | 'prev' | 'car' | null; edited: boolean } {
  // `edited` = the user has actually TYPED a value somewhere in this car's chain
  // (a `.s.<id>` key). Baseline forward-sim populates `cur` too, so having values
  // in `cur` is NOT proof of a real starting point — only a `.s.` edit is.
  const readS = (id: string): T | null => {
    try { const v = localStorage.getItem(`${prefix}.s.${id}`); return v ? JSON.parse(v) : null; } catch { return null; }
  };
  const own = readS(s.id);
  if (own) return { cur: own, from: 'self', edited: true };
  // GROUND TRUTH: the tune confirmed before this run was recorded. Beats any
  // forward-simulated guess, because it's what was actually on the car.
  if (s.meta?.tune) {
    const t = s.meta.tune;
    if (fromTune) {
      const picked = fromTune(t);
      if (picked && Object.keys(picked).length) return { cur: picked, from: 'self', edited: true };
    } else if (keys) {
      const picked: Record<string, number> = {};
      for (const k of keys) if (typeof t[k] === 'number') picked[k] = t[k];
      if (Object.keys(picked).length) return { cur: picked as T, from: 'self', edited: true };
    }
  }
  const prior = sessions.filter((x) => x.startedAt < s.startedAt).sort((a, b) => a.startedAt - b.startedAt);
  const sameCar = prior.filter((x) => s.meta?.carOrdinal != null && x.meta?.carOrdinal === s.meta?.carOrdinal);
  const chain = sameCar.length ? sameCar : prior;
  if (!chain.length) {
    // The per-car `.c.` key is auto-written from the recommendation, not a user edit.
    try { const v = localStorage.getItem(`${prefix}.c.${s.meta?.carOrdinal ?? 'unknown'}`); if (v) return { cur: JSON.parse(v), from: 'car', edited: false }; } catch { /* ignore */ }
    return { cur: {} as T, from: null, edited: false };
  }
  let cur = {} as T; // seeds from the drivetrain baseline inside targetFn
  let edited = false;
  for (const p of chain) {
    const ex = readS(p.id); if (ex) { cur = { ...cur, ...ex }; edited = true; } // explicit edit re-anchors
    if (p.analytics) cur = targetFn(cur, p.analytics);       // apply that run's recommendation
  }
  return { cur, from: 'prev', edited };
}

// Diff target = current + measured delta per channel, clamped.
function diffTarget(cur: DiffSettings, a: SessionAnalytics, fields: { key: keyof DiffSettings; base: number }[], plan?: Plan | null): DiffSettings {
  const deltas = diffDeltas(a);
  const out: DiffSettings = { ...cur };
  for (const f of fields) {
    const planned = targetFromPlan(plan ?? null, f.key as string);
    if (planned != null) { out[f.key] = planned; continue; }
    const dd = deltas[f.key]; if (!dd) continue;
    const base = cur[f.key] ?? f.base;
    out[f.key] = Math.max(0, Math.min(100, Math.round(base + dd.d)));
  }
  return out;
}

function DiffRecommendation({ s }: { s: SessionSummary }) {
  const plan = useContext(PlanCtx);
  const meta = useMeta();
  const dt = (s.meta?.drivetrain || '').toUpperCase();
  const fields = DIFF_FIELDS[dt];
  const [state, setState] = useState(() => inheritSettings<DiffSettings>(s, meta.sessions, 'fh6.diff', (c, a) => diffTarget(c, a, fields || []), (fields || []).map((f) => f.key)));
  const { cur, from, edited } = state;
  // Persist THIS run's recommendation as the per-car fallback, so a fresh load
  // with no prior session in the list still inherits the target, not the entry.
  useEffect(() => {
    if (!s.analytics || !fields) return;
    try { localStorage.setItem(`fh6.diff.c.${s.meta?.carOrdinal ?? 'unknown'}`, JSON.stringify(diffTarget(cur, s.analytics, fields, plan))); } catch { /* ignore */ }
  }, [cur, s, fields, plan]);
  if (!s.analytics || !fields) return null;
  const deltas = adaptDeltas(diffDeltas(s.analytics), s, meta.sessions, diffDeltas);
  const plannedTarget = (ch: string) => targetFromPlan(plan, ch);

  const update = (k: keyof DiffSettings, v: string) => {
    const next = { ...cur, [k]: v === '' ? undefined : Number(v) };
    setState({ cur: next, from: 'self', edited: true });
    try {
      localStorage.setItem(`fh6.diff.s.${s.id}`, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  const inheritNote = from === 'prev' ? " Pre-filled from your previous run's RECOMMENDATION — edit any box to override."
    : from === 'car' ? ' Pre-filled from your last saved tune for this car.' : '';

  return (
    <>
      <div className="sec-head">
        Differential — {edited ? 'run-over-run adjustment' : 'starting point'} ({dt})
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        The boxes auto-fill with your <b>previous run's recommendation</b> (assuming you applied it); each new run nudges from there by a step sized to the measured symptom — so it converges.{inheritNote}
      </div>
      <div className="notes" style={{ marginTop: 6 }}>
        {fields.map((f) => {
          const base = cur[f.key] ?? f.base;
          const dd = deltas[f.key] || { d: 0, why: '', gain: null as Gain | null, naive: 0 };
          const target = plannedTarget(f.key) ?? Math.max(0, Math.min(100, Math.round(base + dd.d)));
          const delta = target - base;
          const dColor = delta < 0 ? 'var(--amber)' : delta > 0 ? 'var(--blue)' : 'var(--muted)';
          return (
            <div key={f.key} className="note info" style={{ borderLeftColor: delta === 0 ? 'var(--line)' : dColor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <b>{f.label}</b>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                  <input
                    className="car-input"
                    style={{ width: 50, textAlign: 'right' }}
                    type="number"
                    value={cur[f.key] ?? ''}
                    placeholder={String(f.base)}
                    onChange={(e) => update(f.key, e.target.value)}
                  />
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <b style={{ color: dColor, minWidth: 36, textAlign: 'right' }}>{target}%</b>
                  <span style={{ color: dColor, fontSize: 11, minWidth: 34 }}>{delta === 0 ? 'hold' : delta > 0 ? `+${delta}` : delta}</span>
                  <ChannelStatus channel={f.key} />
                </span>
              </div>
              <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11 }}>
                {dd.why}{cur[f.key] == null ? ` · baseline ${f.base}%` : ''}
                {dd.gain && <span style={{ color: dd.gain.mult > 1.15 ? 'var(--blue)' : dd.gain.mult < 0.85 ? 'var(--amber)' : 'var(--muted)' }}>{gainNote(dd.gain, dd.naive, dd.d)}</span>}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        Apply the → values in-game, run again, and each channel re-adjusts from what you enter. Once two runs record different settings for a channel, the step size is <b>learned from how your car actually responded</b> — bigger where it barely moved, smaller where it overshot — so it converges in far fewer runs.
      </div>
    </>
  );
}

// Front brake-dive diagnostic. NOTE: this is deliberately NOT a CG-height calc.
// Testing against a known car (Lotus Exige, ~18 in real) showed the brake-dive
// inversion reads 2-4× low in FH6 — anti-dive geometry carries braking load
// through the suspension links, not the springs, so the front dives less than a
// pure spring calc predicts, and the aero-shifted baseline makes it method-
// sensitive. So we surface the measured dive as a RELATIVE diagnostic only.
function ChassisCG({ s }: { s: SessionSummary }) {
  const cg = s.analytics?.cg ?? null;
  const avgEntry = s.analytics?.avgBrakeEntryMph ?? null;
  const zones = s.analytics?.brakeEntryZones ?? 0;
  if (!cg && avgEntry == null) return null;

  const header = (
    <div className="sec-head">
      Braking — front dive &amp; entry speed
    </div>
  );
  const entryRow = avgEntry != null ? (
    <>
      <span className="k">Avg braking entry speed</span>
      <span className="v">{fmt(avgEntry)} mph{zones ? ` · ${zones} zones` : ''}</span>
    </>
  ) : null;

  if (!cg) {
    return (
      <>
        {header}
        <div className="stat-grid" style={{ marginTop: 6 }}>{entryRow}</div>
        <div className="note empty" style={{ marginTop: 6 }}>
          Not enough clean straight-line braking to measure front dive — a few hard stops from ~60 mph will populate it.
        </div>
      </>
    );
  }

  const r2Color = cg.r2 >= 0.6 ? 'var(--green)' : cg.r2 >= 0.4 ? 'var(--amber)' : 'var(--red)';

  return (
    <>
      {header}
      <div className="stat-grid" style={{ marginTop: 6 }}>
        {entryRow}
        <span className="k">Front dive under braking</span>
        <span className="v">{fmt(cg.frontTravelChangeIn, 2)} in @ {fmt(cg.brakeGRef, 2)} g</span>
        <span className="k">Front dive per g</span>
        <span className="v">{fmt(cg.frontTravelPerGIn, 3)} in/g</span>
        <span className="k">Fit confidence (r²)</span>
        <span className="v" style={{ color: r2Color }}>{fmt(cg.r2, 2)} · {cg.samples} frames{cg.reliable ? '' : ' · low'}</span>
      </div>
      {!cg.reliable && (
        <div className="note empty" style={{ marginTop: 6 }}>
          Low confidence (r²={fmt(cg.r2, 2)}). A few hard, straight-line stops from ~60 mph (little steering) firm this up.
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        A <b>relative</b> read — front-dive per g tracks front stiffness and braking load, so it's useful for comparing setups. It is <b>not</b> an absolute CG height: FH6's anti-dive geometry makes the front dive less than a pure spring calc, so back-calculating CG reads ~2–4× low. For your sheet, use a looked-up CG (sports car ≈ 16–18 in).
      </div>
    </>
  );
}

// Brake pressure + balance from measured per-axle slip (100% = lockup). Target
// is threshold braking: both axles just under 100%, together.
interface BrakeInputs { balance?: number; pressure?: number }

function brakeAdvice(a: SessionAnalytics) {
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
  let press = { d: 0, why: `one axle reaches the limit and the other doesn't (${f}% vs ${r}%) — that's a balance split, not a pressure problem` };
  if (maxSlip < 70) press = { d: R(cl((80 - maxSlip) / 2, 3, 15)), why: `neither axle reaches the limit (${f}% / ${r}%) — RAISE pressure to actually use the grip` };
  else if (maxSlip < 82) press = { d: R(cl((85 - maxSlip) / 2, 2, 6)), why: `just under the limit (${f}% / ${r}%) — a touch more pressure reaches threshold` };
  else if (minSlip > 108) press = { d: -R(cl((minSlip - 100) / 3, 3, 12)), why: `both axles past the limit (${f}% / ${r}%) — LOWER pressure to threshold-brake` };
  else if (minSlip >= 82 && maxSlip <= 108) press = { d: 0, why: `both axles sit at threshold (${f}% / ${r}%) — pressure looks right` };

  let bal = { d: 0, why: 'both axles reach the limit together — balance looks right' };
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

  let diagnosis: string, level: 'info' | 'warn' | 'crit';
  if (maxSlip < 70) { diagnosis = `Under-braking — you can brake harder (peak axle slip ${maxSlip}%)`; level = 'info'; }
  else if (gap < -15 && r >= 95) { diagnosis = `Rears locking first — unstable (rear ${r}% / front ${f}%)`; level = 'crit'; }
  else if (f >= 95 && r >= 95) { diagnosis = `Both axles past lockup (front ${f}% / rear ${r}%)`; level = 'warn'; }
  else if (gap > 15 && f >= 95) { diagnosis = `Fronts locking first (front ${f}% / rear ${r}%)`; level = 'warn'; }
  else { diagnosis = `Threshold braking (front ${f}% / rear ${r}%) — near the limit, balanced`; level = 'info'; }

  return { f, r, diagnosis, level, bal, press };
}

const brakeBalBase = (dt: string) => (dt === 'FWD' ? 66 : dt === 'AWD' ? 60 : 58);

function brakeTarget(cur: BrakeInputs, a: SessionAnalytics, dt: string, plan?: Plan | null): BrakeInputs {
  const adv = brakeAdvice(a);
  if (!adv) return cur;
  return {
    // Channel keys are 'balance'/'pressure' — matching CHANNELS in tune.ts and the
    // playbook in plan.ts. Naming these 'brakeBalance'/'brakePressure' here silently
    // missed the plan on every lookup and fell through to the proportional value.
    balance: targetFromPlan(plan ?? null, 'balance')
      ?? Math.max(0, Math.min(100, Math.round((cur.balance ?? brakeBalBase(dt)) + adv.bal.d))),
    pressure: targetFromPlan(plan ?? null, 'pressure')
      ?? Math.max(50, Math.min(200, Math.round((cur.pressure ?? 100) + adv.press.d))),
  };
}

function BrakeRec({ s }: { s: SessionSummary }) {
  const plan = useContext(PlanCtx);
  const plannedTarget = (ch: string) => targetFromPlan(plan, ch);
  const meta = useMeta();
  const a = s.analytics;
  const dt = (s.meta?.drivetrain || '').toUpperCase();
  const [state, setState] = useState(() => inheritSettings<BrakeInputs>(s, meta.sessions, 'fh6.brake', (c, av) => brakeTarget(c, av, dt), ['balance', 'pressure']));
  const { cur: inp, from } = state;
  // Persist this run's recommendation as the per-car fallback (see DiffRecommendation).
  useEffect(() => {
    if (!a) return;
    try { localStorage.setItem(`fh6.brake.c.${s.meta?.carOrdinal ?? 'unknown'}`, JSON.stringify(brakeTarget(inp, a, dt, plan))); } catch { /* ignore */ }
  }, [inp, a, dt, s, plan]);
  if (!a) return null;
  const adv = brakeAdvice(a);
  if (!adv) return null;

  const update = (k: keyof BrakeInputs, v: string) => {
    const next = { ...inp, [k]: v === '' ? undefined : Number(v) };
    setState({ cur: next, from: 'self', edited: true });
    try {
      localStorage.setItem(`fh6.brake.s.${s.id}`, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  const balBase = brakeBalBase(dt);
  const rows = [
    { k: 'balance' as const, label: 'Brake Balance (% front)', base: balBase, dd: adv.bal, lo: 0, hi: 100 },
    { k: 'pressure' as const, label: 'Brake Pressure (%)', base: 100, dd: adv.press, lo: 50, hi: 200 },
  ];

  return (
    <>
      <div className="sec-head">
        Braking — pressure &amp; balance
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        Typical (median) brake slip per axle across the run's braking frames — 100% = at the limit. The <i>peak</i> is deliberately not used: its top few frames are downshift blips and low-speed noise, which read as lockup at every pressure. Boxes auto-fill with your <b>previous run's recommendation</b>; each run nudges toward <b>threshold braking</b> — both axles just under 100%, together.{from === 'prev' ? " Pre-filled from your previous run's RECOMMENDATION — edit any box to override." : from === 'car' ? ' Pre-filled from your last saved tune for this car.' : ''}
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Typical brake slip F / R</span>
        <span className="v">{adv.f}% / {adv.r}%</span>
      </div>
      <div className={`note ${adv.level}`} style={{ marginTop: 6 }}>
        <b>{adv.diagnosis}</b>
      </div>
      <div className="notes" style={{ marginTop: 6 }}>
        {rows.map((row) => {
          const base = inp[row.k] ?? row.base;
          const target = plannedTarget(row.k) ?? Math.max(row.lo, Math.min(row.hi, Math.round(base + row.dd.d)));
          const delta = target - base;
          const c = delta < 0 ? 'var(--amber)' : delta > 0 ? 'var(--blue)' : 'var(--muted)';
          return (
            <div key={row.k} className="note info" style={{ borderLeftColor: delta === 0 ? 'var(--line)' : c }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <b>{row.label}</b>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                  <input
                    className="car-input"
                    style={{ width: 52, textAlign: 'right' }}
                    type="number"
                    value={inp[row.k] ?? ''}
                    placeholder={String(row.base)}
                    onChange={(e) => update(row.k, e.target.value)}
                  />
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <b style={{ color: c, minWidth: 40, textAlign: 'right' }}>{target}{row.k === 'balance' ? '%' : '%'}</b>
                  <span style={{ color: c, fontSize: 11, minWidth: 34 }}>{delta === 0 ? 'hold' : delta > 0 ? `+${delta}` : delta}</span>
                  <ChannelStatus channel={row.k} />
                </span>
              </div>
              <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11 }}>{row.dd.why}{inp[row.k] == null ? ` · baseline ${row.base}%` : ''}</div>
            </div>
          );
        })}
      </div>
    </>
  );
}

// 1st-gear (launch) guidance. Launch quality is judged by MEASURED ACCELERATION,
// not raw slip: Forza's slip ratio reads high off the line even when the car is
// hooking up at its grip peak, so slip alone falsely flags good launches. A launch
// is only traction-limited when the wheels spin hard WITHOUT accelerating
// (launchWastedSpinPct) — that's power wasted to spin, and taller 1st helps. When
// the car pulls strong g, a taller 1st only makes the launch slower.
interface LaunchInputs { firstRatio?: number }

// Signed % change to 1st (server-computed): − taller (spinning), + shorter (bogging),
// 0 when at the grip limit (the sweet spot — wide dead band, no oscillation).
const launchRatioChangePct = (a: SessionAnalytics): number => a.launchChangePct ?? 0;

// Forward-simulate the previous run's recommendation in whichever direction it went.
function launchTarget(cur: LaunchInputs, a: SessionAnalytics): LaunchInputs {
  const pct = launchRatioChangePct(a);
  if (cur.firstRatio == null || pct === 0) return cur;
  return { firstRatio: +(cur.firstRatio * (1 + pct / 100)).toFixed(2) };
}

function LaunchGear({ s }: { s: SessionSummary }) {
  const meta = useMeta();
  const a = s.analytics!;
  const [state, setState] = useState(() => inheritSettings<LaunchInputs>(
    s, meta.sessions, 'fh6.gear1', launchTarget, undefined,
    (t) => (typeof t.gear1 === 'number' ? { firstRatio: t.gear1 } : null)));
  const { cur: inp, from } = state;
  // Persist this run's recommendation as the per-car fallback (see DiffRecommendation).
  useEffect(() => {
    if (inp.firstRatio == null) return; // no ratio to carry
    try { localStorage.setItem(`fh6.gear1.c.${s.meta?.carOrdinal ?? 'unknown'}`, JSON.stringify(launchTarget(inp, a))); } catch { /* ignore */ }
  }, [inp, a, s]);
  const accelG = a.launchAccelG;
  const peakG = a.launchPeakAccelG;
  const realSpin = a.launchRealSpinPct;
  const lrpm = a.launchRpm;
  const rpmFrac = a.launchRpmFracPct;
  const hpRpm = a.dyno?.peakHpRpm;

  const header = (
    <div className="sec-head">
      1st Gear — launch grip
    </div>
  );

  if (a.launchSamples == null || accelG == null) {
    return (
      <>
        {header}
        <div className="note empty" style={{ marginTop: 6 }}>
          No standing-start launch captured — floor it from a dead stop (or arm RECORD on the grid) to read launch grip.
        </div>
      </>
    );
  }

  const update = (v: string) => {
    const next: LaunchInputs = { firstRatio: v === '' ? undefined : Number(v) };
    setState({ cur: next, from: 'self', edited: true });
    try {
      localStorage.setItem(`fh6.gear1.s.${s.id}`, JSON.stringify(next));
    } catch { /* ignore */ }
  };

  const changePct = launchRatioChangePct(a);
  const taller = changePct < 0;
  const target = inp.firstRatio && changePct !== 0 ? +(inp.firstRatio * (1 + changePct / 100)).toFixed(2) : null;

  const notes: { level: string; title: string; text: string }[] = [];
  if (a.launchVerdict === 'traction-limited') {
    notes.push({
      level: 'warn',
      title: `Traction-limited — 1st slightly too short`,
      text: `${realSpin}% of the launch is the tires spinning hard (pulling ${accelG} g) — a bit more grip is being wasted to spin than made. Nudge 1st ~${Math.abs(changePct)}% TALLER (lower the ratio).${target != null ? ` Your ${inp.firstRatio} → ~${target}.` : ' Enter your current 1st ratio for a target.'}`,
    });
  } else if (a.launchVerdict === 'under-geared') {
    notes.push({
      level: 'warn',
      title: `Under-geared — 1st too tall (only ${accelG} g)`,
      text: `The launch pulls just ${accelG} g and the engine lugs at ~${lrpm} rpm (${rpmFrac}% of its ${hpRpm} rpm power peak) without the tires breaking loose — 1st is too tall to load them. Make 1st ~${changePct}% SHORTER (raise the ratio)${target != null ? `: ${inp.firstRatio} → ~${target}` : ''}, re-launch, and the g should climb.`,
    });
  } else {
    notes.push({
      level: 'info',
      title: `At the grip limit — 1st is about right`,
      text: `Pulls ${accelG} g (peak ${peakG} g) with the tires just breaking loose (${realSpin}% real spin) — that's the launch traction limit for this car. Shorter would only spin more; taller would bog it. This is the sweet spot — leave 1st here.`,
    });
  }

  return (
    <>
      {header}
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Launch accel (median)</span>
        <span className="v">{accelG} g</span>
        <span className="k">Peak launch g</span>
        <span className="v">{peakG} g</span>
        <span className="k">Heavy wheelspin (sustained)</span>
        <span className="v">{realSpin}%</span>
        {lrpm != null && (<><span className="k">Launch rpm</span><span className="v">{lrpm}{hpRpm ? ` (${rpmFrac}% of pwr peak)` : ''}</span></>)}
      </div>
      {changePct !== 0 && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 8 }}>
          <label style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 2 }}>
            Current 1st ratio
            <input
              className="car-input"
              style={{ width: 88 }}
              type="number"
              step="0.01"
              value={inp.firstRatio ?? ''}
              placeholder="3.50"
              onChange={(e) => update(e.target.value)}
            />
          </label>
          {target != null && (
            <div style={{ fontSize: 12 }}>
              <span style={{ color: 'var(--muted)' }}>→ target </span>
              <b style={{ color: taller ? 'var(--amber)' : 'var(--blue)', fontSize: 16 }}>{target}</b>
              <span style={{ color: 'var(--muted)' }}> ({taller ? `−${Math.abs(changePct)}%, taller` : `+${changePct}%, shorter`})</span>
            </div>
          )}
        </div>
      )}
      <div className="notes" style={{ marginTop: 6 }}>
        {notes.map((n, i) => (
          <div key={i} className={`note ${n.level}`}>
            <b>{n.title}</b>
            <div style={{ marginTop: 3 }}>{n.text}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        The sweet spot is the launch traction limit — g plateaus and the tires just start to break loose. There's a wide dead band around it, so once you're there the report says “about right” and stops nudging (no more back-and-forth). It only calls for TALLER when the tires are spinning hard (wasting grip) or SHORTER when the engine bogs below its power band with no spin at all. Exact ratio needs car weight/μ (your sheet's Optimal 1st cell).{(from === 'prev' || from === 'car') && inp.firstRatio != null ? ' The ratio box is pre-filled from your previous run.' : ''}
      </div>
    </>
  );
}

// Gear-ratio spacing — the WHOLE box at once, not one gear in isolation.
//
// Physics: at a shift the road speed is constant, so engine RPM ∝ gear ratio; the
// landing RPM after an upshift = shiftRPM × (ratio_next / ratio_this). The same
// landing RPM on EVERY shift ⟺ a constant step ratio (ratio_{n+1}/ratio_n) ⟺ a
// GEOMETRIC progression of the ratios. That is exactly the smooth "arc" the in-game
// gear graph draws, and it's why the whole set has to move together: nudging one gear
// bends the arc and leaves a neighbour bogged or a shift wasted.
//
// So we HOLD 1st (your launch gear) and top gear (your top-speed gear) as anchors, and
// SOLVE the gears between them for minimum time against this car's measured power band.
// All targets fall between 1st and top, so nothing can exceed the game's limits.
//
// The spacing is deliberately NOT a constant-step geometric arc — see gearing.ts. Equal
// RPM landings weight every gear equally, but you spend a blink in 2nd and most of the
// straight in top, so the steps have to tighten where the time actually goes.
type GearRatioInputs = Record<number, number>; // gear number → current ratio

// Pull the ratios out of the pre-run tune snapshot, translating `gear1`…`gearN` into the
// numeric keys this section uses. The confirmed tune is ground truth — it is what was
// actually bolted to the car — so it beats any forward-simulated pre-fill.
const tuneToRatios = (t: TuneSnapshot): GearRatioInputs | null => {
  const out: GearRatioInputs = {};
  for (let n = 1; n <= 10; n++) {
    const v = t[`gear${n}`];
    if (typeof v === 'number' && v > 0) out[n] = v;
  }
  return Object.keys(out).length ? out : null;
};

// Everything the solver needs, all measured off the UDP stream — no driver input.
const gearCtx = (a: SessionAnalytics): GearContext => contextFromAnalytics(a);

const solvedSet = (ratios: GearRatioInputs, numGears: number, a: SessionAnalytics) =>
  solveGearing(ratios, numGears, gearCtx(a));

// Total gears = detected top gear, but never fewer than the highest gear you've typed.
const gearCount = (a: SessionAnalytics, ratios: GearRatioInputs): number => {
  const detected = a.gearing?.numGears ?? 0;
  const entered = Object.keys(ratios).reduce((m, k) => Math.max(m, Number(k)), 0);
  return Math.max(detected, entered);
};

// The gear count the REPORT is using: the driver's per-car "Total gears" override when
// set, else what the telemetry detected. Detection only sees the gears you actually
// USED, so a run that never reached top gear undercounts — which is the whole reason
// the override exists, and the reason every consumer has to read it.
function gearCountFor(a: SessionAnalytics, ratios: GearRatioInputs, carOrdinal?: number): number {
  try {
    const v = localStorage.getItem(`fh6.gears.count.${carOrdinal ?? 'unknown'}`);
    const n = v ? Number(v) : NaN;
    if (Number.isFinite(n) && n >= 3 && n <= 10) return n;
  } catch { /* ignore */ }
  return gearCount(a, ratios);
}

// Forward-simulate the previous run's recommendation, so the next run pre-fills with
// the coordinated set (assuming you applied it). Must resolve the gear count the same
// way the display does — it previously used the raw detected count and ignored the
// override, so with an override set the box on screen and the box handed to Confirm &
// Record were solved for different gear counts.
function gearTarget(cur: GearRatioInputs, a: SessionAnalytics, carOrdinal?: number): GearRatioInputs {
  return solvedSet(cur, gearCountFor(a, cur, carOrdinal), a)?.ratios ?? cur;
}

function GearRatios({ s }: { s: SessionSummary }) {
  const meta = useMeta();
  const g = s.analytics?.gearing;
  const countKey = `fh6.gears.count.${s.meta?.carOrdinal ?? 'unknown'}`;
  const [state, setState] = useState(() => inheritSettings<GearRatioInputs>(
    s, meta.sessions, 'fh6.gears', (c, a) => gearTarget(c, a, s.meta?.carOrdinal), undefined, tuneToRatios));
  const { cur: ratios, edited } = state;
  // Total-gears override, saved per car — because detection only sees the gears you
  // USED this session, so a run that never reached top gear would undercount.
  const [override, setOverride] = useState<number | null>(() => {
    try { const v = localStorage.getItem(countKey); return v ? Number(v) : null; } catch { return null; }
  });
  const detected = s.analytics ? gearCount(s.analytics, ratios) : 0;
  const numGears = override ?? detected;
  // Publish the recommendation for the pre-run Confirm & Record screen. This persists
  // the SAME object the report renders, rather than recomputing it down a second path —
  // that second path is how the two screens came to disagree. When there is no valid
  // solution (anchors missing, e.g. the override says 8 gears but 8th isn't entered yet)
  // the key is CLEARED, so Confirm & Record shows nothing instead of confidently
  // offering a stale box for a different gear count.
  useEffect(() => {
    if (!s.analytics || Object.keys(ratios).length === 0) return;
    const key = `fh6.gears.c.${s.meta?.carOrdinal ?? 'unknown'}`;
    const t = solvedSet(ratios, numGears, s.analytics)?.ratios ?? null;
    try {
      if (t) localStorage.setItem(key, JSON.stringify(t));
      else localStorage.removeItem(key);
    } catch { /* ignore */ }
  }, [ratios, s, numGears]);
  if (!g) return null;

  const setRatio = (gear: number, v: string) => {
    const next = { ...ratios };
    if (v === '') delete next[gear]; else next[gear] = Number(v);
    setState({ cur: next, from: 'self', edited: true });
    try { localStorage.setItem(`fh6.gears.s.${s.id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const setTotalGears = (v: string) => {
    const n = v === '' ? null : Math.max(3, Math.min(10, Math.round(Number(v))));
    setOverride(n);
    try { if (n == null) localStorage.removeItem(countKey); else localStorage.setItem(countKey, String(n)); } catch { /* ignore */ }
  };

  const gearList = Array.from({ length: numGears }, (_, i) => i + 1);
  const sol = solvedSet(ratios, numGears, s.analytics!);
  const target = sol?.ratios ?? null;
  const first = ratios[1], top = ratios[numGears];
  const anchorsSet = target != null;
  // Bog line = PEAK TORQUE rpm: below it the engine labors (a real bog). Landing
  // between peak torque and the 90%-power edge is fine — you're past peak torque and
  // pulling hard. (Using the 90%-power edge as the bog line was too strict and flagged
  // good boxes.) Fall back to ~67% of peak-power rpm if torque rpm isn't measured.
  const bogRpm = g.peakTorqueRpm ?? Math.round(g.peakHpRpm * 0.67);
  // Landings of the RECOMMENDED box. These are deliberately NOT all the same number any
  // more: the solved box drops furthest on the 1→2 shift and barely drops at the top.
  const tgtLandings = target ? landingsFor(target, g.shiftRpm) : {};
  const landedGears = Object.keys(tgtLandings).map(Number).sort((a, b) => a - b);
  // A low 1→2 landing is intentional — 1st is a launch gear you leave almost at once, so
  // a valley there is paid for in a fraction of a second. The bog test therefore covers
  // shifts into 3rd and above, which is where the time on a lap is actually spent.
  const payingLandings = landedGears.filter((n) => n >= 3).map((n) => tgtLandings[n]);
  const worstLanding = payingLandings.length ? Math.min(...payingLandings) : null;
  const topLanding = landedGears.length ? tgtLandings[landedGears[landedGears.length - 1]] : null;
  const evenBogs = worstLanding != null && worstLanding < bogRpm;
  // Landing predicted from the ratios you actually entered (consecutive pair).
  const curLanding = (n: number): number | null =>
    ratios[n] != null && ratios[n - 1] != null ? Math.round(g.shiftRpm * (ratios[n] / ratios[n - 1])) : null;
  // Measured (on-road) landing overlay by gear number.
  const measuredBy = new Map(g.measured.map((m) => [m.gear, m]));
  // How far off the arc is the current box? (max % deviation of any middle gear)
  const middleGears = gearList.slice(1, -1);
  const middleEntered = anchorsSet && middleGears.every((n) => ratios[n] != null);
  const maxDev = anchorsSet && middleGears.some((n) => ratios[n] != null)
    ? Math.max(...middleGears.filter((n) => ratios[n] != null).map((n) => Math.abs(ratios[n] / (target as GearRatioInputs)[n] - 1) * 100))
    : 0;
  const onArc = middleEntered && maxDev < 2;

  // MINIMUM GEAR COUNT for this 1st→top range: the fewest gears that keep every shift
  // into 3rd or above off the bog line. Solved by running the SAME solver at each gear
  // count rather than from a closed form, because the closed form only holds for even
  // spacing — with solved spacing the steps differ per gear, so the algebra no longer
  // describes the box being recommended.
  const spread = anchorsSet ? (first as number) / (top as number) : null;
  let minGears: number | null = null;
  if (anchorsSet) {
    for (let n = 3; n <= 10; n++) {
      const cand = solvedSet({ ...ratios, 1: first as number, [n]: top as number }, n, s.analytics!);
      if (!cand) continue;
      const L = landingsFor(cand.ratios, g.shiftRpm);
      const paying = Object.keys(L).map(Number).filter((k) => k >= 3).map((k) => L[k]);
      if (paying.length && Math.min(...paying) >= bogRpm) { minGears = n; break; }
    }
  }
  const needsMoreGears = minGears != null && minGears > numGears;

  return (
    <>
      <div className="sec-head">Gear ratios — solved for minimum time</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        Every basic tuning calculator spaces a box <b>evenly</b> — the same RPM after every shift, a smooth arc on the in-game graph. That is not the fastest box. Equal landings weight every gear the same, but you spend a blink in 2nd and most of the straight in top, so a power valley up top costs several seconds where the identical valley low down costs a fraction of one. This solves the spacing against <b>your car's measured power curve</b> for minimum time: <b>wide steps low, tightening toward top gear</b>. Holds <b>1st</b> (launch) and <b>top gear</b> (top speed) as anchors and sets the middle together.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11 }}>
        <span style={{ color: 'var(--muted)' }}>Total gears</span>
        <input
          className="car-input"
          style={{ width: 78, textAlign: 'right' }}
          type="number"
          step="1"
          min={3}
          max={10}
          value={override ?? ''}
          placeholder={String(detected)}
          onChange={(e) => setTotalGears(e.target.value)}
        />
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>
          {override != null ? `set to ${override}` : `auto: ${detected} used this run`} — override if you didn't reach top gear{override != null ? ' (clear to auto-detect)' : ''}.
        </span>
      </div>

      {!anchorsSet ? (
        <div className="note warn" style={{ marginTop: 6 }}>
          Enter at least <b>1st</b> and <b>gear {numGears}</b> (your top gear) — and ideally every gear — to get the coordinated set. {first != null && top != null && !(first > top) ? 'Ratios must descend (1st highest, top lowest).' : ''}
        </div>
      ) : (
        <>
          <div className={`note ${onArc && !evenBogs ? 'info' : 'warn'}`} style={{ marginTop: 6 }}>
            <b>{onArc
              ? (evenBogs
                ? `Spacing is solved, but the tightest shift still lands ~${worstLanding} rpm — below peak torque (${bogRpm} rpm) — so the upper gears bog. That's a RANGE problem, not spacing (see below).`
                : `Box is solved — every shift into 3rd and up lands at or above ${worstLanding} rpm, clear of peak torque (${bogRpm} rpm), with the top shift holding ${topLanding} rpm. Leave it.`)
              : `Set each → target for the time-optimal box${topLanding != null ? ` — the top shift holds ${topLanding} rpm and nothing above 2nd drops under ${worstLanding} rpm` : ''}.${middleEntered ? ` (currently up to ${maxDev.toFixed(0)}% off)` : ''}`}</b>
            {sol?.solved && sol.gainVsGeometricSec != null && sol.gainVsGeometricSec > 0.01 && (
              <div style={{ marginTop: 3, fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>
                Solved against your measured power band (progression exponent {sol.exponent}) — about <b>{sol.gainVsGeometricSec.toFixed(2)}s</b> per full pull through the box versus the evenly-spaced arc a basic calculator would give you.
              </div>
            )}
            {sol && !sol.solved && (
              <div style={{ marginTop: 3, fontWeight: 400, color: 'var(--muted)', fontSize: 11 }}>
                Not enough clean full-throttle data this run to simulate your power curve, so this uses the validated default progression. Do one long flat-out pull through every gear and it will solve against your actual dyno.
              </div>
            )}
          </div>
          {evenBogs && (
            <div className="note crit" style={{ marginTop: 6 }}>
              Even with the spacing solved, the tightest shift above 2nd lands ~{worstLanding} rpm — below peak torque ({bogRpm} rpm), so the engine labors out of the upper gears. The 1st→top <b>range is too wide for {numGears} gears</b>.
              {needsMoreGears
                ? <> Covering a {spread!.toFixed(2)}:1 spread without dropping below peak torque needs <b>at least {minGears} gears</b> — a <b>{minGears}-speed</b> swap fixes this properly. Otherwise: shorten 1st, lengthen top gear, or accept the bog.</>
                : <> Shorten 1st a touch, lengthen top gear, or accept the bog.</>}
            </div>
          )}
          {!evenBogs && minGears != null && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
              Your {spread!.toFixed(2)}:1 spread needs at least <b>{minGears}</b> gears to keep every shift above 2nd clear of peak torque — you have <b>{numGears}</b>
              {minGears < numGears
                ? <>, so there's room to spare. A {minGears}-speed could cover this range, and the extra ratios let you run tighter steps for better acceleration.</>
                : <>, which is exactly enough. A shorter transmission would start bogging.</>}
            </div>
          )}
        </>
      )}

      <div className="notes" style={{ marginTop: 6 }}>
        {gearList.map((n) => {
          const curV = ratios[n];
          const tgt = target ? target[n] : null;
          const isAnchor = n === 1 || n === numGears;
          const delta = curV != null && tgt != null ? Math.round((tgt - curV) * 100) / 100 : null;
          const off = !isAnchor && delta != null && Math.abs(curV! / tgt! - 1) >= 0.02;
          const land = curLanding(n);
          const landBog = land != null && land < bogRpm;
          const landTight = land != null && land > g.shiftRpm * 0.92; // barely dropped = wasted shift
          const meas = measuredBy.get(n);
          const c = off ? 'var(--blue)' : 'var(--muted)';
          return (
            <div key={n} className={`note ${off ? 'warn' : 'info'}`} style={{ borderLeftColor: off ? c : 'var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <b>Gear {n}{isAnchor ? <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · anchor ({n === 1 ? 'launch' : 'top speed'})</span> : ''}</b>
                <span style={{ fontSize: 11, color: 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {n >= 2 && land != null
                    ? <>lands ~{land}{landBog ? <span style={{ color: 'var(--red)' }}> · bogs</span> : landTight ? <span style={{ color: 'var(--amber)' }}> · too close</span> : ''}{meas ? ` · measured ${meas.landingRpm}` : ''}</>
                    : n === 1 ? 'off the line' : ''}
                </span>
              </div>
              <div style={{ marginTop: 4, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <input
                  className="car-input"
                  style={{ width: 78, textAlign: 'right' }}
                  type="number"
                  step="0.01"
                  value={curV ?? ''}
                  placeholder="ratio"
                  onChange={(e) => setRatio(n, e.target.value)}
                />
                {isAnchor
                  ? <span style={{ color: 'var(--muted)' }}>held</span>
                  : tgt != null
                    ? <><span style={{ color: 'var(--muted)' }}>→</span><b style={{ color: c }}>{tgt}</b>{delta != null && delta !== 0 && <span style={{ color: c, fontSize: 11 }}>{delta > 0 ? `+${delta}` : delta}</span>}{!off && curV != null && <span style={{ color: 'var(--muted)', fontSize: 11 }}>on arc</span>}</>
                    : <span style={{ color: 'var(--muted)' }}>enter 1st + top for a target</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        {edited ? 'Boxes pre-fill from your previous run\'s recommendation — edit any to override. ' : ''}
        This coordinates the <b>whole box</b>. The gear graph will look slightly steeper at the bottom than the even arc you may be used to — that is intentional, and it is where the time comes from: the low gears give up a little so the tall gears, where you spend most of the lap, keep more power on tap. 1st and top are your anchors — set 1st for launch grip and top gear for the top speed you need; <b>final drive</b> then scales the whole box for top speed without changing the spacing.
      </div>
    </>
  );
}

// Final drive — the accel-vs-top-speed master lever. It scales EVERY gear equally, so
// it doesn't touch the arc/spacing; it sets how much of the rev range you use. Judged
// from top-gear RPM on the straight: never reach redline → too tall, SHORTEN (raise the
// number) for acceleration; bounce off the limiter → too short, LENGTHEN (lower the
// number) for top speed; kiss redline at the braking point → the sweet spot.
function FinalDrive({ s }: { s: SessionSummary }) {
  const fd = s.analytics?.gearing?.finalDrive;
  const cKey = `fh6.finaldrive.c.${s.meta?.carOrdinal ?? 'unknown'}`;
  const sKey = `fh6.finaldrive.s.${s.id}`;
  // Same precedence every other section uses. This one doesn't go through
  // inheritSettings, so it needs the confirmed-tune step spelled out: without it the
  // final drive was the one gearing field that never pre-filled from the tune you
  // confirmed before the run. Note the `.c.` key is the auto-written RECOMMENDATION,
  // not something you typed, so it must rank below the tune snapshot rather than
  // standing in for what is actually on the car.
  const [cur, setCurState] = useState<number | null>(() => {
    try { const own = localStorage.getItem(sKey); if (own != null) return Number(own); } catch { /* ignore */ }
    const confirmed = s.meta?.tune?.finalDrive;
    if (typeof confirmed === 'number' && confirmed > 0) return confirmed;
    try { const v = localStorage.getItem(cKey); return v ? Number(v) : null; } catch { return null; }
  });
  // Recommendation from top-gear rev usage, measured against the ACTUAL rev limit.
  // Solve against the measured power band + where this track is on power, using the tune
  // confirmed before the run as the ratio set. Falls back to the rpm rule if data is thin.
  const adv = finalDriveAdvice(
    fd,
    s.meta?.tune ? tuneToRatios(s.meta.tune) : null,
    s.analytics ? contextFromAnalytics(s.analytics) : null,
  );
  const { pct, dir, why } = adv;
  // The scale is relative to the final drive the RUN was recorded at, since that is what
  // the measured power band and speed mapping behind the solve belong to. Applying it to
  // a hand-typed value instead would rescale a recommendation that was never about that
  // number — and in the pre-run screen the same mistake made the suggestion chase itself.
  const runFd = typeof s.meta?.tune?.finalDrive === 'number' ? s.meta.tune.finalDrive : null;
  const solvedTarget = pct
    ? (runFd != null ? Math.round(runFd * adv.scale * 100) / 100
      : cur != null ? Math.round(cur * adv.scale * 100) / 100 : null)
    : cur;
  useEffect(() => {
    if (!fd || solvedTarget == null) return;
    try { localStorage.setItem(cKey, String(solvedTarget)); } catch { /* ignore */ }
  }, [s, fd, cKey, solvedTarget]);
  if (!fd) return null;

  const setCur = (v: string) => {
    const n = v === '' ? null : Number(v);
    setCurState(n);
    try { if (n == null) localStorage.removeItem(sKey); else localStorage.setItem(sKey, String(n)); } catch { /* ignore */ }
  };
  const held = pct === 0;
  const target = !held ? solvedTarget : cur;
  const dColor = held ? 'var(--muted)' : 'var(--blue)';

  return (
    <>
      <div className="sec-head" style={{ marginTop: 10 }}>Final drive — accel vs top speed</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        Scales the whole box, so it doesn't change the arc — it sets how much rev range you use on the straight. Enter your current final drive to get a target.
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Top gear on the straight</span>
        <span className="v">{fd.topGearMaxRpm} rpm ({fd.topGearRpmPct}% of {fd.redlineRpm} rev limit)</span>
        <span className="k">Time on the limiter</span>
        <span className="v">{fd.limiterPct}%</span>
      </div>
      <div className={`note ${held ? 'info' : 'warn'}`} style={{ marginTop: 6, borderLeftColor: held ? 'var(--line)' : dColor }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <b>Final drive{dir !== 'hold' ? ` — ${dir === 'shorter' ? 'shorten (raise number)' : 'lengthen (lower number)'}` : ''}</b>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
            <input
              className="car-input" style={{ width: 78, textAlign: 'right' }} type="number" step="0.01"
              value={cur ?? ''} placeholder="e.g. 3.50" onChange={(e) => setCur(e.target.value)}
            />
            {!held && <><span style={{ color: 'var(--muted)' }}>→</span><b style={{ color: dColor }}>{cur != null ? target : '—'}</b><span style={{ color: dColor, fontSize: 11 }}>{pct > 0 ? `+${pct}%` : `${pct}%`}</span></>}
            {held && <span style={{ color: 'var(--muted)', fontSize: 11 }}>hold</span>}
          </span>
        </div>
        <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11 }}>{why}</div>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        Aim to hit redline in top gear right where you brake for the end of the longest straight. Shorter (higher number) = more acceleration everywhere but lower top speed; longer (lower number) = the reverse. It doesn't change your gear spacing.
      </div>
    </>
  );
}

// Damping run-over-run adjustment. Same closed-loop pattern as the diff section:
// enter your in-game damper clicks, the report nudges each toward the measured
// symptom. Honesty limits (this is NOT a first-principles stiffness calc):
//  • REBOUND front/rear is well-grounded — the rebound÷bump velocity split directly
//    says too soft (extends faster than it compresses) or too stiff.
//  • BUMP front/rear has no telemetry signal that isolates compression direction, so
//    it's advised only from the OVERALL front/rear damper-work balance (a weaker cue):
//    the busier end gets a small stiffen. Bottoming (too-soft bump) shows in Issues.
interface DampingSettings { frontBump?: number; frontRebound?: number; rearBump?: number; rearRebound?: number }

const DAMP_MIN = 1, DAMP_MAX = 20;
// Order matches the in-game damper tuning menu: rebound (front, rear) then bump.
const DAMPING_FIELDS: { key: keyof DampingSettings; label: string; base: number }[] = [
  { key: 'frontRebound', label: 'Front · Rebound', base: 8 },
  { key: 'rearRebound', label: 'Rear · Rebound', base: 8 },
  { key: 'frontBump', label: 'Front · Bump', base: 5 },
  { key: 'rearBump', label: 'Rear · Bump', base: 5 },
];

function dampingDeltas(a: SessionAnalytics, pooled?: SessionAnalytics['damping']): Record<string, { d: number; why: string }> {
  const d = pooled ?? a.damping;
  const o: Record<string, { d: number; why: string }> = {};
  if (!d) return o;
  const rebDelta = (dir: string | null, topPct: number, end: string): { d: number; why: string } => {
    if (dir === 'soft') return { d: topPct > 5 ? 3 : 2, why: `${end} rebound extends faster than it compresses${topPct > 5 ? ` and tops out ${topPct}% of the run` : ''} — too soft; stiffen to calm float/bounce` };
    if (dir === 'stiff') return { d: -2, why: `${end} rebound is slow vs compression — too stiff; soften so the wheel follows the road back down` };
    return { d: 0, why: `${end} rebound↔bump velocity split in range — hold` };
  };
  o.frontRebound = rebDelta(d.frontRebound, d.toppingFrontPct, 'Front');
  o.rearRebound = rebDelta(d.rearRebound, d.toppingRearPct, 'Rear');
  // Bump from overall balance: 'front-busy' = front dampers move faster (higher RMS).
  o.frontBump = d.balance === 'front-busy'
    ? { d: 1, why: `front dampers work harder than rear (RMS ${d.rmsF} vs ${d.rmsR} in/s) — stiffen front bump a click to settle it` }
    : { d: 0, why: 'no bump-specific signal from telemetry — hold (bottoming, if any, shows in Issues)' };
  o.rearBump = d.balance === 'rear-busy'
    ? { d: 1, why: `rear dampers work harder than front (RMS ${d.rmsR} vs ${d.rmsF} in/s) — stiffen rear bump a click` }
    : { d: 0, why: 'no bump-specific signal from telemetry — hold (bottoming, if any, shows in Issues)' };
  return o;
}

function dampingTarget(cur: DampingSettings, a: SessionAnalytics, plan?: Plan | null): DampingSettings {
  const deltas = dampingDeltas(a);
  const out: DampingSettings = { ...cur };
  for (const f of DAMPING_FIELDS) {
    const planned = targetFromPlan(plan ?? null, f.key as string);
    if (planned != null) { out[f.key] = planned; continue; }
    const dd = deltas[f.key]; if (!dd) continue;
    const base = cur[f.key] ?? f.base;
    out[f.key] = Math.max(DAMP_MIN, Math.min(DAMP_MAX, Math.round(base + dd.d)));
  }
  return out;
}

function Damping({ s }: { s: SessionSummary }) {
  const plan = useContext(PlanCtx);
  const meta = useMeta();
  const d = s.analytics?.damping;
  const [state, setState] = useState(() => inheritSettings<DampingSettings>(s, meta.sessions, 'fh6.damp', dampingTarget, DAMPING_FIELDS.map((f) => f.key)));
  const { cur, from, edited } = state;
  useEffect(() => {
    if (!s.analytics?.damping) return;
    try { localStorage.setItem(`fh6.damp.c.${s.meta?.carOrdinal ?? 'unknown'}`, JSON.stringify(dampingTarget(cur, s.analytics, plan))); } catch { /* ignore */ }
  }, [cur, s, plan]);
  if (!d) return null;
  const pooled = pooledDamping(s, meta.sessions);
  const deltas = adaptDeltas(dampingDeltas(s.analytics!, pooled), s, meta.sessions, (x) => dampingDeltas(x));
  const plannedTarget = (ch: string) => targetFromPlan(plan, ch);

  const update = (k: keyof DampingSettings, v: string) => {
    const next = { ...cur, [k]: v === '' ? undefined : Number(v) };
    setState({ cur: next, from: 'self', edited: true });
    try { localStorage.setItem(`fh6.damp.s.${s.id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };

  const inheritNote = from === 'prev' ? " Pre-filled from your previous run's RECOMMENDATION — edit any box to override."
    : from === 'car' ? ' Pre-filled from your last saved damper tune for this car.' : '';

  return (
    <>
      <div className="sec-head">
        Damping — {edited ? 'run-over-run adjustment' : 'starting point'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        Enter your in-game damper clicks; each run nudges toward the measured symptom and converges.{inheritNote}
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Front bump / rebound vel</span>
        <span className="v">{d.fBump} / {d.fReb} in/s</span>
        <span className="k">Rear bump / rebound vel</span>
        <span className="v">{d.rBump} / {d.rReb} in/s</span>
        <span className="k">Damper work RMS F / R</span>
        <span className="v">{d.rmsF} / {d.rmsR} in/s</span>
      </div>
      <div className="notes" style={{ marginTop: 6 }}>
        {DAMPING_FIELDS.map((f) => {
          const base = cur[f.key] ?? f.base;
          const dd = deltas[f.key] || { d: 0, why: '' };
          const target = plannedTarget(f.key) ?? Math.max(DAMP_MIN, Math.min(DAMP_MAX, Math.round(base + dd.d)));
          const delta = target - base;
          const dColor = delta < 0 ? 'var(--amber)' : delta > 0 ? 'var(--blue)' : 'var(--muted)';
          return (
            <div key={f.key} className="note info" style={{ borderLeftColor: delta === 0 ? 'var(--line)' : dColor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <b>{f.label}</b>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                  <input
                    className="car-input"
                    style={{ width: 50, textAlign: 'right' }}
                    type="number"
                    value={cur[f.key] ?? ''}
                    placeholder={String(f.base)}
                    onChange={(e) => update(f.key, e.target.value)}
                  />
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <b style={{ color: dColor, minWidth: 28, textAlign: 'right' }}>{target}</b>
                  <span style={{ color: dColor, fontSize: 11, minWidth: 34 }}>{delta === 0 ? 'hold' : delta > 0 ? `+${delta}` : delta}</span>
                  <ChannelStatus channel={f.key} />
                </span>
              </div>
              <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11 }}>{dd.why}{cur[f.key] == null ? ` · baseline ${f.base}` : ''}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        Apply the → values in-game, run again, and each re-adjusts from what you enter. <b>Rebound</b> is read directly from the rebound÷bump velocity split; <b>bump</b> only from the overall front/rear damper-work balance (a weaker cue), so it mostly holds. This is the measured closed-loop, not a first-principles stiffness (that needs spring rate + sprung mass, not in the packet).
      </div>
    </>
  );
}

// Ride-height run-over-run adjustment. Closed loop toward the sweet spot: the LOWEST
// height that only lightly kisses the bump stops. Two directions, per end:
//  • bottoming (bump travel hits the stops >~1% of the run) → RAISE.
//  • headroom (peak travel stays well below the stops) → LOWER for a lower CG and,
//    if the car makes downforce, more of it — until it just starts to kiss.
// Height units vary (in/cm), so it moves by PERCENT of what you enter.
interface RideHeightSettings { frontHeight?: number; rearHeight?: number }
const RIDE_FIELDS: { key: keyof RideHeightSettings; label: string }[] = [
  { key: 'frontHeight', label: 'Front · Ride Height' },
  { key: 'rearHeight', label: 'Rear · Ride Height' },
];

// Median of a noisy per-run reading across every run at the SAME setting. A single run
// can spike (one kerb strike put peak travel at 0.99 in 1 of 39 runs at a fixed height,
// which alone flipped the advice to RAISE). Judging on the median makes a
// recommendation require the symptom to PERSIST rather than appear once.
// Damping pooled the same way as ride height, and for the same reason. The damper-work
// balance verdict was a coin flip from a single run: at a FIXED front-bump setting the
// front/rear RMS ratio averaged 1.17-1.28 with sd up to 0.22, so the call flipped
// between 'front-busy' and 'balanced' at EVERY setting tested (47%/53% at one of them).
// Widening the threshold alone still leaves ~22% flipping at the noisiest setting;
// taking the MEDIAN across every run at the same damper settings removes it.
function pooledDamping(s: SessionSummary, sessions: SessionSummary[]): SessionAnalytics['damping'] {
  const d = s.analytics?.damping;
  const t = s.meta?.tune;
  if (!d || !t) return d ?? null;
  const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor((a.length - 1) / 2)]; };
  // Peers = runs on this car with the SAME four damper settings.
  const keys = ['frontRebound', 'rearRebound', 'frontBump', 'rearBump'] as const;
  if (keys.some((k) => typeof t[k] !== 'number')) return d;
  const peers = sessions.filter((x) =>
    x.meta?.carOrdinal === s.meta?.carOrdinal && x.analytics?.damping &&
    keys.every((k) => x.meta?.tune?.[k] === t[k]));
  if (peers.length < 3) return d; // not enough repeats to pool — use the single run
  const P = peers.map((x) => x.analytics!.damping!);
  const fBump = med(P.map((x) => x.fBump)), fReb = med(P.map((x) => x.fReb));
  const rBump = med(P.map((x) => x.rBump)), rReb = med(P.map((x) => x.rReb));
  const rmsF = med(P.map((x) => x.rmsF)), rmsR = med(P.map((x) => x.rmsR));
  const T = 1.45; // matches DAMPER_IMBALANCE in server/analytics.js
  const rebound = (bump: number, reb: number) => (bump <= 0 ? null : reb / bump > 1.05 ? 'soft' : reb / bump < 0.55 ? 'stiff' : 'ok');
  return {
    ...d, fBump, fReb, rBump, rReb, rmsF, rmsR,
    balance: rmsF > rmsR * T ? 'front-busy' : rmsR > rmsF * T ? 'rear-busy' : 'balanced',
    frontRebound: rebound(fBump, fReb) as 'soft' | 'ok' | 'stiff' | null,
    rearRebound: rebound(rBump, rReb) as 'soft' | 'ok' | 'stiff' | null,
    toppingFrontPct: med(P.map((x) => x.toppingFrontPct)),
    toppingRearPct: med(P.map((x) => x.toppingRearPct)),
  };
}

function pooledRideHeight(s: SessionSummary, sessions: SessionSummary[]): SessionAnalytics['rideHeight'] {
  const rh = s.analytics?.rideHeight;
  if (!rh) return rh ?? null;
  const t = s.meta?.tune;
  if (!t) return rh;
  const med = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return a[Math.floor((a.length - 1) / 2)]; };
  const pick = (end: 'front' | 'rear') => {
    const key = end === 'front' ? 'frontHeight' : 'rearHeight';
    const v = t[key];
    if (typeof v !== 'number') return null;
    const peers = sessions.filter((x) =>
      x.meta?.carOrdinal === s.meta?.carOrdinal && x.meta?.tune?.[key] === v && x.analytics?.rideHeight);
    if (peers.length < 3) return null; // not enough repeats to pool — use the single run
    return {
      peak: med(peers.map((x) => x.analytics!.rideHeight![`${end}PeakComp`])),
      bot: med(peers.map((x) => x.analytics!.rideHeight![`${end}BottomPct`])),
    };
  };
  const f = pick('front'), r = pick('rear');
  return {
    ...rh,
    frontPeakComp: f?.peak ?? rh.frontPeakComp,
    frontBottomPct: f?.bot ?? rh.frontBottomPct,
    rearPeakComp: r?.peak ?? rh.rearPeakComp,
    rearBottomPct: r?.bot ?? rh.rearBottomPct,
  };
}

function rideHeightDeltas(a: SessionAnalytics, pooled?: SessionAnalytics['rideHeight']): Record<string, { d: number; why: string }> {
  const rh = pooled ?? a.rideHeight;
  const o: Record<string, { d: number; why: string }> = {};
  if (!rh) return o;
  const hasAero = a.aero != null && a.aero.aeroGainPer100mph > 0.05;
  // DEADBAND SIZED TO THE MEASURED NOISE. The old band (LOWER below 0.90, RAISE at 0.99
  // or 1% bottoming) was narrower than the measurement scatter: at a FIXED front height
  // over 39 runs, peak travel averaged 0.917 with sd 0.025 and ranged 0.88–0.99, and
  // bottoming ranged 0–1.2%. So the same unchanged car flipped between LOWER, hold and
  // RAISE run to run — pure noise, and exactly the "run-around" this produced.
  // The LOWER edge now sits ~2 sd clear of the hold zone and the bottoming trigger is
  // above the observed noise ceiling, so a recommendation means a real change.
  const LOWER_BELOW = 0.85;   // was 0.90 — 0.05 ≈ 2 sd of clearance
  const BOTTOM_RAISE = 2.0;   // was 1.0 — observed noise reached 1.2% with no change
  const end = (peak: number, bot: number, label: string): { d: number; why: string } => {
    const usedPct = Math.round(peak * 100);
    if (bot >= BOTTOM_RAISE || peak >= 0.99) {
      return { d: Math.min(8, Math.max(3, Math.round(3 + bot))), why: `${label} bottoms out (${bot}% of the run, peak travel ${usedPct}%) — RAISE ride height (or stiffen springs/bump).` };
    }
    if (peak < LOWER_BELOW) {
      const margin = 0.90 - peak; // how far from just kissing the stops
      return { d: -Math.min(6, Math.max(2, Math.round(margin * 25))), why: `${label} only uses ${usedPct}% of its bump travel — headroom to LOWER for a lower CG${hasAero ? ' and more downforce' : ''}. Drop it toward just kissing the stops.` };
    }
    return { d: 0, why: `${label} uses ${usedPct}% of travel with ${bot}% bottoming — inside the measurement noise for this car, so it's already at the sweet spot. Hold.` };
  };
  o.frontHeight = end(rh.frontPeakComp, rh.frontBottomPct, 'Front');
  o.rearHeight = end(rh.rearPeakComp, rh.rearBottomPct, 'Rear');
  return o;
}

function rideHeightTarget(cur: RideHeightSettings, a: SessionAnalytics, plan?: Plan | null): RideHeightSettings {
  const deltas = rideHeightDeltas(a);
  const out: RideHeightSettings = { ...cur };
  for (const f of RIDE_FIELDS) {
    const planned = targetFromPlan(plan ?? null, f.key as string);
    if (planned != null) { out[f.key] = planned; continue; }
    const dd = deltas[f.key]; if (!dd || dd.d === 0) continue;
    const base = cur[f.key];
    if (base == null) continue; // % change needs your current height
    out[f.key] = Math.max(0, Math.round(base * (1 + dd.d / 100) * 10) / 10);
  }
  return out;
}

function RideHeight({ s }: { s: SessionSummary }) {
  const plan = useContext(PlanCtx);
  const plannedTarget = (ch: string) => targetFromPlan(plan, ch);
  const meta = useMeta();
  const rh = s.analytics?.rideHeight;
  const [state, setState] = useState(() => inheritSettings<RideHeightSettings>(s, meta.sessions, 'fh6.ride', rideHeightTarget, RIDE_FIELDS.map((f) => f.key)));
  const { cur, from, edited } = state;
  useEffect(() => {
    if (!s.analytics?.rideHeight) return;
    try { localStorage.setItem(`fh6.ride.c.${s.meta?.carOrdinal ?? 'unknown'}`, JSON.stringify(rideHeightTarget(cur, s.analytics, plan))); } catch { /* ignore */ }
  }, [cur, s, plan]);
  if (!rh) return null;
  const deltas = rideHeightDeltas(s.analytics!, pooledRideHeight(s, meta.sessions));
  const update = (k: keyof RideHeightSettings, v: string) => {
    const next = { ...cur, [k]: v === '' ? undefined : Number(v) };
    setState({ cur: next, from: 'self', edited: true });
    try { localStorage.setItem(`fh6.ride.s.${s.id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const inheritNote = from === 'prev' && edited ? " Pre-filled from your previous run's RECOMMENDATION — edit to override."
    : from === 'car' ? ' Pre-filled from your last saved ride height for this car.' : '';

  return (
    <>
      <div className="sec-head" style={{ marginTop: 10 }}>
        Ride Height — {edited ? 'run-over-run adjustment' : 'starting point'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        Enter your in-game ride height (in or cm — it moves by %). Each run converges toward the LOWEST height that just kisses the bump stops: lower CG / more aero without bottoming.{inheritNote}
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Front bump travel used (peak / bottoming)</span>
        <span className="v">{Math.round(rh.frontPeakComp * 100)}% / {rh.frontBottomPct}%</span>
        <span className="k">Rear bump travel used (peak / bottoming)</span>
        <span className="v">{Math.round(rh.rearPeakComp * 100)}% / {rh.rearBottomPct}%</span>
      </div>
      <div className="notes" style={{ marginTop: 6 }}>
        {RIDE_FIELDS.map((f) => {
          const dd = deltas[f.key] || { d: 0, why: '' };
          const curV = cur[f.key];
          const held = dd.d === 0;
          const target = plannedTarget(f.key) ?? (!held && curV != null ? Math.max(0, Math.round(curV * (1 + dd.d / 100) * 10) / 10) : (curV ?? null));
          const dColor = held ? 'var(--muted)' : dd.d < 0 ? 'var(--amber)' : 'var(--blue)';
          const deltaLabel = moveLabel(curV, target, held);
          return (
            <div key={f.key} className={`note ${held ? 'info' : 'warn'}`} style={{ borderLeftColor: held ? 'var(--line)' : dColor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <b>{f.label}</b>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                  <input
                    className="car-input"
                    style={{ width: 56, textAlign: 'right' }}
                    type="number"
                    step="0.1"
                    value={curV ?? ''}
                    placeholder="value"
                    onChange={(e) => update(f.key, e.target.value)}
                  />
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <b style={{ color: dColor, minWidth: 40, textAlign: 'right' }}>{curV != null ? target : '—'}</b>
                  <span style={{ color: dColor, fontSize: 11, minWidth: 38 }}>{deltaLabel}</span>
                  <ChannelStatus channel={f.key} />
                </span>
              </div>
              <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11 }}>{dd.why}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        Enter your current height to get a numeric target (it moves by %). The loop lowers while there's travel to spare and raises if it starts bottoming, so it settles at the lowest height that doesn't upset the car — bounded by the game's minimum. Softer springs/bump can also cure a bottom if you'd rather keep it low.
      </div>
    </>
  );
}

// Tire-pressure run-over-run adjustment. FH sets pressure per axle (front/rear), and
// grip peaks with the tire in its temperature window. Closed loop toward the ideal:
// too HOT → lower psi (in FH, higher psi crowns the tread and concentrates heat); too
// COLD once warmed → raise psi. LIMITATION: the packet gives one temp per corner, not
// the tread's inner/middle/outer split, so it can't separate over-inflation (middle
// hot) from under-inflation (shoulders hot) — verify with the in-game 3-zone tire
// display if a tire stays out of the window after a couple of runs.
interface TireSettings { frontPsi?: number; rearPsi?: number }
const TIRE_FIELDS: { key: keyof TireSettings; label: string; tempKey: 'frontTempF' | 'rearTempF'; base: number }[] = [
  { key: 'frontPsi', label: 'Front · Pressure', tempKey: 'frontTempF', base: 30 },
  { key: 'rearPsi', label: 'Rear · Pressure', tempKey: 'rearTempF', base: 30 },
];
const PSI_MIN = 15, PSI_MAX = 55;

function tireDeltas(a: SessionAnalytics): Record<string, { d: number; why: string }> {
  const tp = a.tires;
  const o: Record<string, { d: number; why: string }> = {};
  if (!tp) return o;
  const half = (n: number) => Math.round(n * 2) / 2; // 0.5-psi steps
  // PRESSURE → TEMPERATURE DIRECTION. Pressure controls sidewall FLEX, and flex is what
  // generates heat, so this runs the real-world way in FH6:
  //   LOWER psi → more flex → tires HEAT UP.   RAISE psi → less flex → tires COOL DOWN.
  // This was inverted here originally ("cold → RAISE pressure to warm them"), which drove
  // cold tires further out of the window on every run. FH6 community physics guides state
  // the real-world direction explicitly: lower 0.5 psi when tires stay cold, raise 0.5 psi
  // when they overheat.
  const end = (temp: number, label: string): { d: number; why: string } => {
    const err = temp - tp.idealF; // + = hot, − = cold
    if (err > 15) return { d: Math.min(3, Math.max(0.5, half(err / 15))), why: `${label} tires run hot (${temp}°F vs ${tp.idealF} ideal) — RAISE pressure to cut sidewall flex so they stop building heat` };
    if (err < -15) return { d: -Math.min(3, Math.max(0.5, half(-err / 15))), why: `${label} tires run cold (${temp}°F vs ${tp.idealF} ideal) — LOWER pressure so the sidewall flexes more and builds heat` };
    return { d: 0, why: `${label} tires in the grip window (${temp}°F) — hold` };
  };
  o.frontPsi = end(tp.frontTempF, 'Front');
  o.rearPsi = end(tp.rearTempF, 'Rear');
  return o;
}

function tireTarget(cur: TireSettings, a: SessionAnalytics, plan?: Plan | null): TireSettings {
  const deltas = tireDeltas(a);
  const out: TireSettings = { ...cur };
  for (const f of TIRE_FIELDS) {
    const planned = targetFromPlan(plan ?? null, f.key as string);
    if (planned != null) { out[f.key] = planned; continue; }
    const dd = deltas[f.key]; if (!dd || dd.d === 0) continue;
    const base = cur[f.key] ?? f.base;
    out[f.key] = Math.max(PSI_MIN, Math.min(PSI_MAX, Math.round((base + dd.d) * 2) / 2));
  }
  return out;
}

function TirePressure({ s }: { s: SessionSummary }) {
  const plan = useContext(PlanCtx);
  const meta = useMeta();
  const tp = s.analytics?.tires;
  const [state, setState] = useState(() => inheritSettings<TireSettings>(s, meta.sessions, 'fh6.tire', tireTarget, TIRE_FIELDS.map((f) => f.key)));
  const { cur, from, edited } = state;
  useEffect(() => {
    if (!s.analytics?.tires) return;
    try { localStorage.setItem(`fh6.tire.c.${s.meta?.carOrdinal ?? 'unknown'}`, JSON.stringify(tireTarget(cur, s.analytics, plan))); } catch { /* ignore */ }
  }, [cur, s, plan]);
  if (!tp) return null;
  const deltas = adaptDeltas(tireDeltas(s.analytics!), s, meta.sessions, tireDeltas);
  const plannedTarget = (ch: string) => targetFromPlan(plan, ch);
  const update = (k: keyof TireSettings, v: string) => {
    const next = { ...cur, [k]: v === '' ? undefined : Number(v) };
    setState({ cur: next, from: 'self', edited: true });
    try { localStorage.setItem(`fh6.tire.s.${s.id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const inheritNote = from === 'prev' && edited ? " Pre-filled from your previous run's RECOMMENDATION — edit to override."
    : from === 'car' ? ' Pre-filled from your last saved pressures for this car.' : '';
  const tempColor = (t: number | null) => t == null ? 'var(--muted)'
    : t > tp.hotF ? 'var(--red)' : t < tp.coldF ? 'var(--blue)' : Math.abs(t - tp.idealF) <= 15 ? 'var(--green)' : 'var(--amber)';

  return (
    <>
      <div className="sec-head">
        Tire Pressure — {edited ? 'run-over-run adjustment' : 'starting point'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        Enter your in-game hot pressures (psi). Each run nudges toward the grip window (ideal ~{tp.idealF}°F): hot → lower, cold → raise, until the tires sit in the sweet spot.{inheritNote}
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Front temp FL / FR</span>
        <span className="v"><span style={{ color: tempColor(tp.flTempF) }}>{tp.flTempF ?? '–'}</span> / <span style={{ color: tempColor(tp.frTempF) }}>{tp.frTempF ?? '–'}</span> °F</span>
        <span className="k">Rear temp RL / RR</span>
        <span className="v"><span style={{ color: tempColor(tp.rlTempF) }}>{tp.rlTempF ?? '–'}</span> / <span style={{ color: tempColor(tp.rrTempF) }}>{tp.rrTempF ?? '–'}</span> °F</span>
      </div>
      <div className="notes" style={{ marginTop: 6 }}>
        {TIRE_FIELDS.map((f) => {
          const dd = deltas[f.key] || { d: 0, why: '' };
          const curV = cur[f.key];
          const base = curV ?? f.base;
          const target = plannedTarget(f.key) ?? Math.max(PSI_MIN, Math.min(PSI_MAX, Math.round((base + dd.d) * 2) / 2));
          const delta = Math.round((target - base) * 2) / 2;
          const held = delta === 0;
          const dColor = held ? 'var(--muted)' : delta < 0 ? 'var(--amber)' : 'var(--blue)';
          return (
            <div key={f.key} className={`note ${held ? 'info' : 'warn'}`} style={{ borderLeftColor: held ? 'var(--line)' : dColor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <b>{f.label}</b>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                  <input
                    className="car-input"
                    style={{ width: 56, textAlign: 'right' }}
                    type="number"
                    step="0.5"
                    value={curV ?? ''}
                    placeholder={String(f.base)}
                    onChange={(e) => update(f.key, e.target.value)}
                  />
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <b style={{ color: dColor, minWidth: 40, textAlign: 'right' }}>{target}</b>
                  <span style={{ color: dColor, fontSize: 11, minWidth: 38 }}>{held ? 'hold' : delta > 0 ? `+${delta}` : delta}</span>
                  <ChannelStatus channel={f.key} />
                </span>
              </div>
              <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11 }}>{dd.why}{curV == null ? ` · baseline ${f.base} psi` : ''}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        Apply the → psi, run again, and it re-adjusts from the new temps until the tires sit near {tp.idealF}°F. <b>Limitation:</b> the game only sends one temp per tire, not the inner/middle/outer split — so if a tire stays out of the window after adjusting, check the in-game 3-zone tire display: middle hottest = lower psi, both shoulders hottest = raise psi.
      </div>
    </>
  );
}

// Aero (downforce) run-over-run adjustment. Downforce grows with speed², so aero only
// matters where the balance CHANGES between low- and high-speed corners. If the car
// washes out (understeers) more at high speed → front-downforce deficit → add front.
// If it gets loose (oversteers) at high speed → add rear. A car that's uniformly
// off-balance at all speeds has a MECHANICAL problem (alignment/ARB/diff), not aero,
// so this holds. Only shown for cars that actually make downforce.
interface AeroSettings { frontAero?: number; rearAero?: number }
const AERO_FIELDS: { key: keyof AeroSettings; label: string }[] = [
  { key: 'frontAero', label: 'Front · Downforce' },
  { key: 'rearAero', label: 'Rear · Downforce' },
];
const AERO_SHIFT = 0.05; // balance-shift magnitude that counts as speed-dependent

function aeroDeltas(a: SessionAnalytics): Record<string, { d: number; why: string }> {
  const ab = a.aeroBalance;
  const o: Record<string, { d: number; why: string }> = { frontAero: { d: 0, why: '' }, rearAero: { d: 0, why: '' } };
  if (!ab) return o;
  const sev = (x: number) => Math.max(0, Math.min(1, x));
  const pct = (s: number) => Math.min(12, Math.max(3, Math.round(3 + 9 * s)));
  if (ab.shift < -AERO_SHIFT) {
    // understeers MORE at high speed than low → the front loses grip as load builds
    o.frontAero = { d: pct(sev((Math.abs(ab.shift) - AERO_SHIFT) / 0.15)), why: `understeers more at high speed (balance ${ab.hiBal} vs ${ab.loBal} at low speed) — add FRONT downforce; the front washes out as aero load builds.` };
    o.rearAero = { d: 0, why: 'no high-speed oversteer — hold rear.' };
  } else if (ab.hiBal > AERO_SHIFT && ab.shift > 0.03) {
    // genuinely loose at high speed, and looser than at low speed
    o.rearAero = { d: pct(sev((ab.hiBal - AERO_SHIFT) / 0.2)), why: `gets loose at high speed (balance ${ab.hiBal} vs ${ab.loBal} at low speed) — add REAR downforce to plant the rear as speed builds.` };
    o.frontAero = { d: 0, why: 'no high-speed understeer — hold front.' };
  } else {
    const msg = `balance holds across speed (${ab.loBal} low → ${ab.hiBal} high) — no aero shift; any imbalance here is mechanical (alignment / ARB / diff), not aero.`;
    o.frontAero = { d: 0, why: msg };
    o.rearAero = { d: 0, why: 'consistent across speed — hold.' };
  }
  return o;
}

function aeroTarget(cur: AeroSettings, a: SessionAnalytics, plan?: Plan | null): AeroSettings {
  const deltas = aeroDeltas(a);
  const out: AeroSettings = { ...cur };
  for (const f of AERO_FIELDS) {
    const planned = targetFromPlan(plan ?? null, f.key as string);
    if (planned != null) { out[f.key] = planned; continue; }
    const dd = deltas[f.key]; if (!dd || dd.d === 0) continue;
    const base = cur[f.key];
    if (base == null) continue; // % change needs your current downforce
    out[f.key] = Math.max(0, Math.round(base * (1 + dd.d / 100)));
  }
  return out;
}

function AeroBalance({ s }: { s: SessionSummary }) {
  const plan = useContext(PlanCtx);
  const plannedTarget = (ch: string) => targetFromPlan(plan, ch);
  const meta = useMeta();
  const ab = s.analytics?.aeroBalance;
  const [state, setState] = useState(() => inheritSettings<AeroSettings>(s, meta.sessions, 'fh6.aero', aeroTarget, AERO_FIELDS.map((f) => f.key)));
  const { cur, from, edited } = state;
  useEffect(() => {
    if (!s.analytics?.aeroBalance) return;
    try { localStorage.setItem(`fh6.aero.c.${s.meta?.carOrdinal ?? 'unknown'}`, JSON.stringify(aeroTarget(cur, s.analytics, plan))); } catch { /* ignore */ }
  }, [cur, s, plan]);
  if (!ab) return null;
  const deltas = aeroDeltas(s.analytics!);
  const update = (k: keyof AeroSettings, v: string) => {
    const next = { ...cur, [k]: v === '' ? undefined : Number(v) };
    setState({ cur: next, from: 'self', edited: true });
    try { localStorage.setItem(`fh6.aero.s.${s.id}`, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const inheritNote = from === 'prev' && edited ? " Pre-filled from your previous run's RECOMMENDATION — edit to override."
    : from === 'car' ? ' Pre-filled from your last saved aero for this car.' : '';
  const verdict = ab.shift < -AERO_SHIFT ? 'understeers more at speed' : (ab.hiBal > AERO_SHIFT && ab.shift > 0.03) ? 'loose at speed' : 'consistent across speed';

  return (
    <>
      <div className="sec-head">
        Aero — {edited ? 'run-over-run adjustment' : 'starting point'}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        Downforce only changes the balance at speed. This compares low- vs high-speed corner balance and only moves aero for a genuine speed shift — enter your front/rear downforce (moves by %).{inheritNote}
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Balance low → high speed</span>
        <span className="v">{ab.loBal} → {ab.hiBal}</span>
        <span className="k">Speed-dependent shift</span>
        <span className="v" style={{ color: verdict === 'consistent across speed' ? 'var(--green)' : 'var(--amber)' }}>{verdict}</span>
      </div>
      <div className="notes" style={{ marginTop: 6 }}>
        {AERO_FIELDS.map((f) => {
          const dd = deltas[f.key] || { d: 0, why: '' };
          const curV = cur[f.key];
          const held = dd.d === 0;
          const target = plannedTarget(f.key) ?? (!held && curV != null ? Math.max(0, Math.round(curV * (1 + dd.d / 100))) : (curV ?? null));
          const dColor = held ? 'var(--muted)' : 'var(--blue)';
          return (
            <div key={f.key} className={`note ${held ? 'info' : 'warn'}`} style={{ borderLeftColor: held ? 'var(--line)' : dColor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                <b>{f.label}</b>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontVariantNumeric: 'tabular-nums' }}>
                  <input
                    className="car-input"
                    style={{ width: 56, textAlign: 'right' }}
                    type="number"
                    step="1"
                    value={curV ?? ''}
                    placeholder="value"
                    onChange={(e) => update(f.key, e.target.value)}
                  />
                  <span style={{ color: 'var(--muted)' }}>→</span>
                  <b style={{ color: dColor, minWidth: 40, textAlign: 'right' }}>{curV != null ? target : '—'}</b>
                  <span style={{ color: dColor, fontSize: 11, minWidth: 38 }}>{moveLabel(curV, target, held)}</span>
                  <ChannelStatus channel={f.key} />
                </span>
              </div>
              <div style={{ marginTop: 3, color: 'var(--muted)', fontSize: 11 }}>{dd.why}</div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        Downforce is drag — adding it lowers top speed. To keep speed, you can instead REDUCE the opposite end by the same %. Only the end that's out of balance at speed moves; a car that's off-balance at all speeds is a mechanical fix, not aero.
      </div>
    </>
  );
}

const kphToMph = (k: number) => k * 0.621371;
const CLASS_NAMES: Record<number, string> = { 0: 'D', 1: 'C', 2: 'B', 3: 'A', 4: 'S1', 5: 'S2', 6: 'X' };

// Prescriptive FH6 tuning-menu fix for each flagged issue family. Written so the
// driver can act on it directly in the in-game Tune menu (tuning order: tires →
// gearing → alignment → ARBs → springs → damping → aero → brakes → diff).
// IMPORTANT vocabulary the advice is careful about:
//   • PRESSURE is psi (Tires & Alignment page). TEMPERATURE is °F (telemetry).
//     They are NOT the same slider — raising psi can RAISE temp, so chase the
//     green temp window in small 0.5 psi steps and re-check.
//   • Front/rear TEMP imbalance is a BALANCE (ARB/camber/driving) issue, not a
//     pressure one — psi barely moves the gap.
const ISSUE_GUIDE: Record<string, { title: string; fix: string }> = {
  understeer: {
    title: 'Understeer — front pushes wide',
    fix: 'Soften the FRONT Anti-roll Bar a few clicks (e.g. −3) and re-test. Still pushing? Lower Acceleration diff, add a little front Camber (−0.2°). Only above ~100 mph → add front Aero.',
  },
  oversteer: {
    title: 'Oversteer — rear steps out',
    fix: 'Soften the REAR Anti-roll Bar a few clicks. Loose on entry/lift? Lower Deceleration diff and add rear Toe-in (−0.1°, toe-in is negative). Loose only at speed → add rear Aero.',
  },
  'tire-hot': {
    title: 'Tires too HOT (temperature)',
    fix: 'DROP that tire’s PRESSURE (psi) 0.5–1 at a time — in Forza, higher psi crowns the tire (smaller patch) so it runs HOTTER with less grip, the opposite of the real-world “add air to cut flex heat” rule. Confirm with the in-game 3-zone tire telemetry: middle hottest → lower psi; both shoulders hottest → RAISE psi instead; inner edge only → less Camber; evenly hot → ease Aero / driving.',
  },
  'tire-crit': {
    title: 'Tires CRITICALLY hot (temperature)',
    fix: 'DROP those tires’ PRESSURE (psi) ~1–2 and reduce Camber — you’re cooking the compound. In Forza higher psi = hotter, so lowering it cools the tire and adds grip. Exception: if the in-game telemetry shows the SHOULDERS hottest (not the middle), the tire is under-inflated — RAISE psi. Also back off Aero load and smooth inputs.',
  },
  'tire-cold': {
    title: 'Tires below temp window',
    fix: 'A small % here is just warm-up on the opening lap — IGNORE it. Only act if a tire stays cold once you’re up to pace: then RAISE that tire’s PRESSURE (psi) in 0.5 steps. Rears naturally run cooler than fronts — that alone is fine.',
  },
  bottom: {
    title: 'Suspension bottoming out',
    fix: 'Raise Ride Height on that end, or stiffen Springs, and raise Bump damping. On dirt/cross-country prefer ride height for travel.',
  },
};

// Issues are raw per-frame flags; several are also handled by a dedicated closed-loop
// section that reasons over the whole run. Where both exist the section is the better
// authority (it knows what's already been tried and what's at its limit), so the issue
// defers to it instead of shouting a contradictory fix — e.g. 3 bottoming events at
// 0.1% of frames had Issues saying "RAISE ride height" while the Ride Height section
// correctly said "lower it, you're barely touching the stops".
const ISSUE_OWNER: Record<string, { section: string; label: string }> = {
  bottom: { section: 'chassis', label: 'Ride Height' },
  'tire-cold': { section: 'tires', label: 'Tire Pressure' },
  'tire-hot': { section: 'tires', label: 'Tire Pressure' },
  'tire-crit': { section: 'tires', label: 'Tire Pressure' },
  wheelspin: { section: 'diff', label: 'Differential' },
  oversteer: { section: 'grip', label: 'Grip & Balance' },
  understeer: { section: 'grip', label: 'Grip & Balance' },
};
// Below this share of the run an issue is a handful of frames — worth showing, not
// worth acting on. Prevents a 0.1% blip reading as loudly as a 40% problem.
const MARGINAL_PCT = 0.5;

function guideFor(i: SessionIssue, drivetrain?: string): { title: string; fix: string } {
  if (i.code === 'wheelspin') {
    const dt = (drivetrain || '').toUpperCase();
    // Which axle is dominant comes from the trigger ("Front/Rear/All-wheel ...").
    const front = /^front/i.test(i.msg);
    const rear = /^rear/i.test(i.msg);
    let fix =
      'Some wheelspin on corner exit is normal — only chase this if it’s a big share of the run or the car steps out under throttle. Smooth the throttle first (ease in, don’t stab).';
    if (dt === 'AWD') {
      fix +=
        ' AWD: your biggest lever is the CENTER diff (front/rear power split). ' +
        (rear ? 'Rear is spinning → shift the center diff a few % toward the FRONT and lower the REAR Accel lock.'
              : front ? 'Front is spinning → shift the center diff toward the REAR and lower the FRONT Accel lock.'
              : 'Spinning all round → lower both Accel locks a few %; if it still won’t hook up, the car simply out-powers the tires (race compound / wider tires help).');
    } else if (dt === 'FWD') {
      fix += ' FWD: lower the Accel diff lock; the fronts are doing steering AND power. Get on throttle later and straighter; race-compound tires help most.';
    } else {
      fix += ' RWD: lower the Accel diff lock (try 40–50%), then drop REAR tire PRESSURE 1–2 psi for a bigger patch. Still spinning? Wider rear tires / race compound (build change).';
    }
    return { title: 'Wheelspin under power', fix };
  }
  if (i.code === 'thermal-fr') {
    return /Fronts/i.test(i.msg)
      ? {
          title: 'Fronts hotter than rears (understeer bias)',
          fix: 'This is a BALANCE fix, not pressure — psi barely closes the gap. Fronts hotter = fronts overworked = the car pushes. Soften the FRONT ARB, add front Camber (−0.2 to −0.3°), and lower the Accel diff so the nose isn’t dragged wide on exit. Don’t keep dropping front psi — it can overheat the tire center.',
        }
      : {
          title: 'Rears hotter than fronts (oversteer bias)',
          fix: 'Balance fix, not pressure. Rears hotter = rears overworked = the tail is loose / spinning. Soften the REAR ARB, add rear Camber (−0.2°), and if it’s under power, lower the Accel diff lock.',
        };
  }
  return (i.code && ISSUE_GUIDE[i.code]) || { title: i.msg, fix: '' };
}

function carLabel(s: SessionSummary): string {
  return s.meta?.carName?.trim() || 'Unnamed car';
}
function carDetail(s: SessionSummary): string {
  const m = s.meta;
  if (!m) return '';
  const cls = m.carClass != null ? CLASS_NAMES[m.carClass] ?? '?' : '';
  return [cls && `${cls} ${m.carPI ?? ''}`.trim(), m.drivetrain, m.carOrdinal != null && `#${m.carOrdinal}`]
    .filter(Boolean)
    .join(' · ');
}

// Effective rolling diameter (in) of the DRIVEN axle — the value the sheet's
// gearing math actually wants (B16). Measured = slightly less than geometric.
function drivenDiameterIn(s: SessionSummary): number | null {
  const a = s.analytics!;
  const rf = a.rollingRadiusFrontIn, rr = a.rollingRadiusRearIn;
  if (rf == null && rr == null) return null;
  const dt = (s.meta?.drivetrain || '').toUpperCase();
  const r = dt === 'FWD' ? rf : dt === 'RWD' ? rr : rf != null && rr != null ? (rf + rr) / 2 : (rf ?? rr);
  return r != null ? +(r * 2).toFixed(1) : null;
}

interface InputRow { cell: string; label: string; value: string; unit: string; hint?: string }

// The spreadsheet input cells the dashboard can MEASURE from telemetry, mapped
// 1:1 to the user's FH6 tuning sheet. Cells the FH6 Data Out packet does NOT
// carry (weight, weight %, wheelbase, CG height, track, ride height, downforce
// targets, tire widths, in-game Mechanical Balance) stay manual by design.
function inputRows(s: SessionSummary): InputRow[] {
  const a = s.analytics!;
  const num = (x: number | null | undefined, dp = 0) => (x == null ? null : x.toFixed(dp));
  const topMph = s.maxSpeedKph != null ? kphToMph(s.maxSpeedKph) : null;
  const raw: [string, string, string | null, string, string?][] = [
    ['B2', 'Red Line RPM', num(a.dyno.redlineRpm), 'rpm', ''],
    ['B9', 'Horse Power', num(a.dyno.peakHp), 'hp', 'full-throttle pull through the rev range'],
    ['B10', 'Torque (peak)', num(a.dyno.peakTorque), 'lb·ft', 'full-throttle pull through the rev range'],
    ['B12', 'Peak Torque RPM', num(a.dyno.peakTorqueRpm), 'rpm', 'full-throttle pull through the rev range'],
    ['B109', 'Peak-power RPM', num(a.dyno.peakHpRpm), 'rpm', 'full-throttle pull through the rev range'],
    ['B67', 'Measured top speed', num(topMph, 1), 'mph', 'hold a flat-out straight to true vmax'],
    ['B78', 'Lateral G @ 60 mph', num(a.muLat60, 2), 'g', 'corner hard & clean at ~55–65 mph'],
    ['B77', '60–0 braking distance', num(a.brake60to0Ft, 1), 'ft', 'hard, STRAIGHT-LINE braking through ~60 mph down to low speed — little steering; no full stop needed'],
    ['B66', 'Braking decel (60→0)', num(a.brake60to0DecelG, 2), 'g', 'measured with the 60–0 above (your sheet may compute this from B77 instead)'],
    ['B84', '0–60 time', num(a.zeroTo60, 2), 's', 'standing-start full-throttle launch'],
    ['B85', '0–100 time', num(a.zeroTo100, 2), 's', 'standing-start full-throttle launch'],
  ];
  return raw.map(([cell, label, value, unit, hint]) => ({ cell, label, value: value ?? '', unit, hint }));
}

function SpreadsheetInputs({ s }: { s: SessionSummary }) {
  const [copied, setCopied] = useState(false);
  const a = s.analytics!;
  const rows = inputRows(s);
  const tsv = rows.filter((r) => r.value !== '').map((r) => `${r.cell}\t${r.value}`).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(tsv);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="sec-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 0 }}>
        <span>Spreadsheet Inputs — measured</span>
        <button
          className="btn"
          onClick={copy}
          style={{ padding: '2px 8px', fontSize: 10, letterSpacing: 0, textTransform: 'none' }}
        >
          {copied ? 'Copied ✓' : 'Copy cell→value'}
        </button>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        Mapped to your tuning sheet's cells, measured from {a.cleanFrames}/{a.raceFrames} clean frames. Grey
        “— need run” = that test wasn't captured this session (hover for how). Copy pastes <b>cell→value</b> pairs.
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        {rows.map((r) => (
          <span key={r.cell} style={{ display: 'contents' }}>
            <span className="k"><span style={{ color: 'var(--accent)' }}>{r.cell}</span> · {r.label}</span>
            <span className="v">
              {r.value ? `${r.value} ${r.unit}` : (
                <span style={{ color: 'var(--muted)' }} title={r.hint}>— need run</span>
              )}
            </span>
          </span>
        ))}
      </div>

      <LoadedRadius s={s} />
    </>
  );
}

// Loaded-radius factor (B19): measured effective radius the tire rolls at,
// backed out from Speed ÷ WheelRotationSpeed at steady cruise. B19 is a FACTOR
// (loaded ÷ geometric), and geometric diameter isn't in telemetry — it's the
// sheet's own B16 — so we surface the measured loaded diameter and the driver
// finishes the one division in-sheet.
function LoadedRadius({ s }: { s: SessionSummary }) {
  const a = s.analytics!;
  const rf = a.rollingRadiusFrontIn;
  const rr = a.rollingRadiusRearIn;
  const dt = (s.meta?.drivetrain || '').toUpperCase();
  const axle = dt === 'FWD' ? 'front' : dt === 'RWD' ? 'rear' : 'avg';
  const drivenDia = drivenDiameterIn(s); // driven loaded radius × 2

  return (
    <>
      <div className="sec-head">
        Driven Loaded Diameter — measured
      </div>
      {rf == null && rr == null ? (
        <div className="note empty" style={{ marginTop: 6 }}>
          Cruise steadily on a flat road (no accel, no cornering) so the app can measure loaded radius from Speed ÷ WheelRotationSpeed.
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <div>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{drivenDia != null ? `${drivenDia.toFixed(1)}"` : '–'}</span>
            <span style={{ color: 'var(--muted)' }}> — feed straight into your Driven Loaded Diameter cell ({axle} axle)</span>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>
            loaded radius: front {rf != null ? `${rf.toFixed(2)}"` : '–'} · rear {rr != null ? `${rr.toFixed(2)}"` : '–'} · measured at steady cruise, averaged over cruise frames (drifts slightly with speed/load)
          </div>
        </div>
      )}
    </>
  );
}

// Measured automatic-transmission shift point: the RPM the game upshifts this
// car at when flat out. Works in automatic mode (we detect the gear change) and
// tells the user whether auto is shifting near peak power.
function AutoShift({ s }: { s: SessionSummary }) {
  const d = s.analytics!.dyno;
  const shift = d.autoShiftRpm;
  const peak = d.peakHpRpm;
  const redline = d.redlineRpm;

  let verdict: { text: string; color: string } | null = null;
  if (shift != null && peak != null) {
    if (shift >= peak - 150) verdict = { text: `Shifting at/after peak power (${fmt(peak)} rpm) — good for acceleration.`, color: 'var(--green)' };
    else if (peak - shift > 400) {
      const target = redline ? Math.round(Math.min(redline, (peak + redline) / 2)) : peak;
      verdict = { text: `Shifting ~${fmt(peak - shift)} rpm BELOW peak power (${fmt(peak)}). In automatic you can't change this — switch to Manual to hold each gear to ~${fmt(target)} rpm and gain acceleration.`, color: 'var(--amber)' };
    } else verdict = { text: `Shifting just below peak power (${fmt(peak)} rpm) — about right.`, color: 'var(--muted)' };
  }

  return (
    <>
      <div className="sec-head">
        Auto-Shift RPM — measured at full throttle
      </div>
      {shift == null ? (
        <div className="note empty" style={{ marginTop: 6 }}>
          No wide-open-throttle upshifts captured. Do a flat-out pull through the gears to read the shift point.
        </div>
      ) : (
        <div style={{ marginTop: 6, fontSize: 12 }}>
          <div>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{fmt(shift)}</span>
            <span style={{ color: 'var(--muted)' }}> rpm{d.autoShiftPctRedline ? ` · ${d.autoShiftPctRedline}% of redline` : ''}</span>
          </div>
          {d.shiftPerGear.length > 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 11, marginTop: 3 }}>
              per gear (shift ↓ land): {d.shiftPerGear.map((g) => `${g.gear}→${g.gear + 1}: ${fmt(g.rpm)}${g.landing ? ` ↓ ${fmt(g.landing)}` : ''}`).join('   ')}
            </div>
          )}
          {verdict && <div style={{ marginTop: 4, color: verdict.color }}>{verdict.text}</div>}
        </div>
      )}
    </>
  );
}


// ---------------------------------------------------------------------------
// Engineering workspace. Sections are grouped into cards with a sticky jump-nav
// so each block is visually distinct and its purpose is stated up front.
// ---------------------------------------------------------------------------
const SECTIONS = [
  { id: 'next', label: 'Next Change' },
  { id: 'overview', label: 'Overview' },
  { id: 'handoff', label: 'Sheet Inputs' },
  { id: 'grip', label: 'Grip' },
  { id: 'tires', label: 'Tires' },
  { id: 'brakes', label: 'Brakes' },
  { id: 'diff', label: 'Differential' },
  { id: 'gearing', label: 'Gearing' },
  { id: 'chassis', label: 'Chassis' },
  { id: 'aero', label: 'Aero' },
  { id: 'issues', label: 'Issues' },
];

// Which report cards actually render for this run — MUST mirror the card gates in
// <Report>. Used to hide nav tabs that would otherwise be dead buttons (scroll to a
// section that isn't on the page).
function presentSectionIds(s: SessionSummary): Set<string> {
  const a = s.analytics;
  const ids = ['overview', 'handoff'];
  if (a) ids.unshift('next');
  if (a) ids.push('grip');
  if (a?.tires) ids.push('tires');
  if (a) ids.push('brakes', 'diff', 'gearing');
  if (a?.damping || a?.rideHeight) ids.push('chassis');
  if (a?.aeroBalance) ids.push('aero');
  ids.push('issues');
  return new Set(ids);
}

function issueStatus(s: SessionSummary): { st: Status; label: string } {
  const list = s.issues ?? [];
  if (list.some((i) => i.level === 'crit')) return { st: 'crit', label: `${list.length} issues` };
  if (list.some((i) => i.level === 'warn')) return { st: 'warn', label: `${list.length} issues` };
  return { st: 'ok', label: 'clean run' };
}

// Closed-loop input prefixes — the sections that need YOUR current in-game values
// as a starting point. A per-session (`.s.<id>`) key only exists once you've typed a
// value (the per-car `.c.<ord>` fallback is auto-written, so it doesn't count).
const TUNE_PREFIXES = ['fh6.diff', 'fh6.brake', 'fh6.damp', 'fh6.align', 'fh6.ride', 'fh6.tire', 'fh6.aero', 'fh6.gear1', 'fh6.gears', 'fh6.finaldrive'];
function carHasEnteredTune(s: SessionSummary, sessions: SessionSummary[]): boolean {
  const carSessions = [s, ...sessions.filter((x) => s.meta?.carOrdinal != null && x.meta?.carOrdinal === s.meta?.carOrdinal)];
  for (const sess of carSessions) {
    // A tune confirmed before the run counts — that's the strongest form of entry.
    if (sess.meta?.tune && Object.keys(sess.meta.tune).length) return true;
    for (const p of TUNE_PREFIXES) {
      try { if (localStorage.getItem(`${p}.s.${sess.id}`) != null) return true; } catch { /* ignore */ }
    }
  }
  return false;
}

// Gather every section's recommendation as a candidate, tagged with the symptom it
// targets and how severe that symptom is. The planner then picks exactly ONE.
// Median symptom rates over the last few runs. Any one run's rates swing wildly (the
// trail-brake rate went 4.5 → 0 → 1.7 → 0 with nothing changed), so choosing WHICH
// symptom to attack from a single run means chasing whichever one happened to spike.
// The median across recent runs is what the car actually does.
export interface PooledSymptoms { trailBrake: number; power: number; grip: number; usRate: number; runs: number }
function pooledSymptoms(s: SessionSummary, sessions: SessionSummary[], n = 5): PooledSymptoms | null {
  const recent = sessions
    .filter((x) => x.meta?.carOrdinal === s.meta?.carOrdinal && x.startedAt <= s.startedAt && x.analytics?.handling)
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, n);
  if (recent.length < 2) return null;
  const med = (f: (h: NonNullable<SessionAnalytics['handling']>) => number) => {
    const v = recent.map((x) => f(x.analytics!.handling!)).sort((a, b) => a - b);
    return v[Math.floor((v.length - 1) / 2)];
  };
  return {
    trailBrake: med((h) => h.slideCausePer1k.trailBrake),
    power: med((h) => h.slideCausePer1k.power),
    grip: med((h) => h.slideCausePer1k.grip),
    usRate: med((h) => (h.understeerFrames / Math.max(1, h.cornerFrames)) * 1000),
    runs: recent.length,
  };
}

function collectCandidates(a: SessionAnalytics, dt: string, pooledRH?: SessionAnalytics['rideHeight'], ps?: PooledSymptoms | null, pooledDamp?: SessionAnalytics['damping']): Candidate[] {
  const out: Candidate[] = [];
  const sev = (x: number) => Math.max(0, Math.min(1, x));
  const h = a.handling;
  const push = (channel: string, delta: number, why: string, symptom: string, severity: number) => {
    if (!delta || severity <= 0.05) return;
    out.push({ channel, label: CHANNELS.find((c) => c.key === channel)?.label ?? channel, delta, why, symptom, severity });
  };

  // Rear-slide symptoms, split by measured cause (rates per 1k cornering frames).
  // Prefer the pooled median over this single run — see pooledSymptoms().
  const p = ps ?? h?.slideCausePer1k;
  const usRate = ps ? ps.usRate : h ? (h.understeerFrames / Math.max(1, h.cornerFrames)) * 1000 : 0;
  const trailSev = p ? sev((p.trailBrake - 2) / 5) : 0;
  const powerSev = p ? sev((p.power - 2) / 5) : 0;
  const gripSev = p ? sev((p.grip - 1.5) / 3) : 0;
  // NO artificial floor. `overall` is decided by comparing understeer/oversteer FRAME
  // COUNTS, which on this data are 1–6 frames out of ~2,430 cornering frames (<0.25%) —
  // a coin flip. Flooring severity at 0.40 whenever that coin landed on "understeer"
  // made front ARB outrank everything and get recommended on essentially no evidence.
  // Severity now comes from the RATE alone, and must clear the metric's noise to count.
  const usSev = sev((usRate - 3) / 8);

  const dd = diffDeltas(a);
  const bd = brakeAdvice(a);
  const hd = handlingDeltas(a);
  const dm = dampingDeltas(a, pooledDamp);
  const td = tireDeltas(a);
  const rd = rideHeightDeltas(a, pooledRH);
  const ad = aeroDeltas(a);

  // trail-brake oversteer → brakes and rear decel FIRST (playbook order does the rest)
  // Single push — this used to fire twice when the rear was loose, so brake balance
  // showed up as BOTH the primary change and a queued one.
  if (bd) {
    const frontLock = h?.brakeStability === 'front-lock';
    const rearLoose = h?.brakeStability === 'rear-loose';
    push('balance', bd.bal.d, bd.bal.why,
      frontLock ? 'frontLock' : 'trailBrakeOversteer',
      frontLock ? 0.5 : rearLoose ? Math.max(trailSev, 0.4) : trailSev);
  }
  if (bd) push('pressure', bd.press.d, bd.press.why, h?.brakeStability === 'front-lock' ? 'frontLock' : 'trailBrakeOversteer', h?.brakeStability === 'front-lock' ? 0.4 : trailSev * 0.6);
  push('rearDecel', dd.rearDecel?.d ?? 0, dd.rearDecel?.why ?? '', 'trailBrakeOversteer', trailSev);
  push('rearAccel', dd.rearAccel?.d ?? 0, dd.rearAccel?.why ?? '', 'powerOversteer', powerSev);
  if (dt === 'AWD') push('center', dd.center?.d ?? 0, dd.center?.why ?? '', 'powerOversteer', powerSev * 0.8);

  const rearSymptom = trailSev >= Math.max(powerSev, gripSev) ? 'trailBrakeOversteer' : powerSev >= gripSev ? 'powerOversteer' : 'gripOversteer';
  const rearSev = Math.max(trailSev, powerSev, gripSev);
  push('rearToe', hd.rearToe?.d ?? 0, hd.rearToe?.why ?? '', rearSymptom, rearSev);
  push('rearARB', hd.rearARB?.d ?? 0, hd.rearARB?.why ?? '', rearSymptom, rearSev);
  push('rearCamber', hd.rearCamber?.d ?? 0, hd.rearCamber?.why ?? '', 'gripOversteer', gripSev);
  push('frontARB', hd.frontARB?.d ?? 0, hd.frontARB?.why ?? '', usSev > 0 ? 'understeer' : rearSymptom, usSev > 0 ? usSev : rearSev * 0.6);
  push('frontCamber', hd.frontCamber?.d ?? 0, hd.frontCamber?.why ?? '', 'understeer', usSev);
  push('caster', hd.caster?.d ?? 0, hd.caster?.why ?? '', 'understeer', usSev * 0.8);
  push('frontToe', hd.frontToe?.d ?? 0, hd.frontToe?.why ?? '', 'understeer', usSev * 0.7);
  // Springs — the secondary balance lever. handlingDeltas only raises these on a
  // STRONG imbalance, and they sit last in each playbook, so they get offered once the
  // ARB/toe/diff levers are exhausted rather than competing with them.
  push('rearSpring', hd.rearSpring?.d ?? 0, hd.rearSpring?.why ?? '', rearSymptom, rearSev * 0.9);
  push('frontSpring', hd.frontSpring?.d ?? 0, hd.frontSpring?.why ?? '', 'understeer', usSev * 0.9);

  // Damping / ride height / tires / aero
  for (const k of ['frontRebound', 'rearRebound', 'frontBump', 'rearBump'] as const) {
    push(k, dm[k]?.d ?? 0, dm[k]?.why ?? '', 'bottoming', dm[k]?.d ? 0.3 : 0);
  }
  // Rear rebound is listed in the trail-brake playbook (a rear that snaps the moment you
  // lift or turn in is often rebound), but damping was only ever tagged 'bottoming', so
  // it could never be offered for that symptom. Emit it there too, softening the rear.
  if (trailSev > 0.05 || h?.brakeStability === 'rear-loose') {
    push('rearRebound', -0.5, 'rear lets go on turn-in/lift — soften rear rebound so the inside rear stays loaded', 'trailBrakeOversteer', Math.max(trailSev, 0.3));
  }
  if (a.rideHeight) {
    const rhSrc = pooledRH ?? a.rideHeight;
    const bot = Math.max(rhSrc.frontBottomPct, rhSrc.rearBottomPct);
    push('frontHeight', rd.frontHeight?.d ?? 0, rd.frontHeight?.why ?? '', 'bottoming', bot >= 1 ? 0.7 : 0.25);
    push('rearHeight', rd.rearHeight?.d ?? 0, rd.rearHeight?.why ?? '', 'bottoming', bot >= 1 ? 0.7 : 0.25);
  }
  if (a.tires) {
    const err = Math.max(Math.abs(a.tires.frontTempF - a.tires.idealF), Math.abs(a.tires.rearTempF - a.tires.idealF));
    push('frontPsi', td.frontPsi?.d ?? 0, td.frontPsi?.why ?? '', 'tireTemp', sev((err - 10) / 40));
    push('rearPsi', td.rearPsi?.d ?? 0, td.rearPsi?.why ?? '', 'tireTemp', sev((err - 10) / 40));
  }
  if (a.aeroBalance) {
    const asev = sev((Math.abs(a.aeroBalance.shift) - 0.05) / 0.15);
    push('frontAero', ad.frontAero?.d ?? 0, ad.frontAero?.why ?? '', 'aeroBalance', asev);
    push('rearAero', ad.rearAero?.d ?? 0, ad.rearAero?.why ?? '', 'aeroBalance', asev);
  }
  return out;
}

// brakeAdvice returns { bal, press } rather than a channel-keyed record, so it needs an
// adapter to join the table below.
function brakeDeltas(a: SessionAnalytics): Record<string, { d: number }> {
  const adv = brakeAdvice(a);
  return adv ? { balance: adv.bal, pressure: adv.press } : {};
}

// Map a channel back to the delta function that produced it, so the planner can test
// whether pushing it across past runs ever moved the symptom.
//
// EVERY BISECTING CHANNEL MUST APPEAR HERE. bracketFor() rebuilds its bracket by asking
// this function which direction each past run was advised — a channel that is missing
// gets `() => null`, so no history is folded in and the bracket resets to the full
// in-game range on every run. That is not slow convergence, it is no convergence: brake
// balance ran 81 → 41 → 71 → 36 → 68, always halving a fresh 0–100 instead of the live
// bracket. Springs, ride height and aero were silently missing for the same reason.
// Gearing is excluded on purpose (see usesBisection in bisect.ts).
function deltaLookup(channel: string): ((x: SessionSummary) => number | null) | null {
  const fns: Record<string, (a: SessionAnalytics) => Record<string, { d: number }>> = {
    frontAccel: diffDeltas, frontDecel: diffDeltas, rearAccel: diffDeltas, rearDecel: diffDeltas, center: diffDeltas,
    frontToe: handlingDeltas, rearToe: handlingDeltas, frontCamber: handlingDeltas, rearCamber: handlingDeltas,
    caster: handlingDeltas, frontARB: handlingDeltas, rearARB: handlingDeltas,
    frontSpring: handlingDeltas, rearSpring: handlingDeltas,
    frontRebound: dampingDeltas, rearRebound: dampingDeltas, frontBump: dampingDeltas, rearBump: dampingDeltas,
    frontPsi: tireDeltas, rearPsi: tireDeltas,
    frontHeight: rideHeightDeltas, rearHeight: rideHeightDeltas,
    frontAero: aeroDeltas, rearAero: aeroDeltas,
    balance: brakeDeltas, pressure: brakeDeltas,
  };
  const fn = fns[channel];
  if (!fn) return null;
  return (x: SessionSummary) => (x.analytics ? fn(x.analytics)[channel]?.d ?? null : null);
}

function NextChange({ s, plan }: { s: SessionSummary; plan: Plan }) {
  const a = s.analytics;
  if (!a) return null;
  const fmtVal = (v: number | null, ch: string) => {
    if (v == null) return '—';
    const u = CHANNELS.find((c) => c.key === ch)?.unit ?? '';
    return `${v}${u}`;
  };

  return (
    <Card
      id="next"
      title="Next Change"
      sub="change ONE thing, then re-run — that's what makes each run measurable"
      status={plan.status.state === 'tuning' ? 'warn' : plan.status.state === 'limited' ? 'crit' : 'ok'}
      statusLabel={plan.status.state === 'tuning' ? '1 change' : plan.status.state === 'limited' ? 'out of levers' : 'dialled in'}
    >
      {/* Done-ness is judged on car behaviour only — never on lap or track time. */}
      {plan.status.state === 'dialled-in' && (
        <div className="note ok" style={{ marginBottom: 8, borderLeftColor: 'var(--green)' }}>
          <b style={{ color: 'var(--green)' }}>Nothing left worth changing — the car is dialled in.</b>
          <div style={{ marginTop: 3 }}>
            No measured symptom is severe enough to chase{plan.status.worstSymptom
              ? <> (worst is <b>{SYMPTOM_LABEL[plan.status.worstSymptom] ?? plan.status.worstSymptom}</b>, and it's mild)</>
              : ''}. Anything below is optional — changing it is as likely to hurt as help.
          </div>
        </div>
      )}

      {plan.status.state === 'limited' && !plan.primary && (
        <div className="note crit" style={{ marginBottom: 8 }}>
          <b>Out of levers — this is a build limit, not a tuning problem.</b>
          <div style={{ marginTop: 3 }}>
            The car still shows <b>{SYMPTOM_LABEL[plan.status.worstSymptom ?? ''] ?? plan.status.worstSymptom}</b>, but all
            {' '}{plan.status.blockedLevers} lever{plan.status.blockedLevers === 1 ? '' : 's'} that could fix it are either at
            their in-game limit or have been measurably disproven on this car. Look at tyre compound/width, weight or power.
          </div>
        </div>
      )}

      {/* Verdict on the previous single change, judged on the symptom it targeted —
          lap time alone is too noisy (one lock-up outweighs most tuning gains). */}
      {plan.lastChange && (() => {
        const lc = plan.lastChange!;
        const tone = lc.verdict === 'worked' ? 'info' : lc.verdict === 'backfired' ? 'crit' : 'warn';
        // Show the move against the metric's own scatter, not a bare percentage. Near a
        // metric floor a percentage is wildly misleading: 2.5 → 0.0 reads "↓100%" but is
        // under half a standard deviation when the metric swings ±5.6 run to run.
        const dir = lc.before != null && lc.after != null ? (lc.after < lc.before ? '↓' : lc.after > lc.before ? '↑' : '') : '';
        const arrow = lc.changeInSd != null
          ? `${dir} ${lc.changeInSd.toFixed(2)}× the run-to-run spread`
          : lc.symptomDeltaPct == null ? null
            : `${lc.symptomDeltaPct < 0 ? '↓' : '↑'} ${Math.abs(lc.symptomDeltaPct).toFixed(0)}%`;
        const head = lc.verdict === 'worked' ? 'That change worked'
          : lc.verdict === 'backfired' ? 'That change backfired'
            : lc.verdict === 'no-effect' ? 'That change did nothing measurable'
              : 'That change is inconclusive';
        return (
          <div className={`note ${tone}`} style={{ marginBottom: 8 }}>
            <b>{head} — {CHANNELS.find((c) => c.key === lc.channel)?.label ?? lc.channel} {lc.from} → {lc.to}</b>
            <div style={{ marginTop: 3, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              {lc.metricLabel}: {lc.before != null ? lc.before.toFixed(1) : '–'} → {lc.after != null ? lc.after.toFixed(1) : '–'}
              {arrow && <b style={{ color: lc.verdict === 'worked' ? 'var(--green)' : lc.verdict === 'backfired' ? 'var(--red)' : 'var(--muted)' }}> {arrow}</b>}
            </div>
            <div style={{ marginTop: 3 }}>{lc.advice}</div>
          </div>
        );
      })()}

      {plan.quality?.messy && (
        <div className="note warn" style={{ marginBottom: 8 }}>
          <b>Thin data this run — the readings are less certain.</b>
          <div style={{ marginTop: 3 }}>
            {plan.quality.why}. Symptom rates only use clean frames, so a lot of this run was discarded and the sample is
            small. The verdict below still stands, but a cleaner run would confirm it.
          </div>
        </div>
      )}

      {plan.lastChange?.verdict === 'backfired' && (
        <div className="note crit">
          <b>
            {CHANNELS.find((c) => c.key === plan.lastChange!.channel)?.label ?? plan.lastChange!.channel}{' '}
            {plan.lastChange.from} → {plan.lastChange.to} made the car worse.
          </b>
          <div style={{ marginTop: 4 }}>
            Clean single-change test: the {plan.lastChange.metricLabel} went from{' '}
            <b>{plan.lastChange.before?.toFixed(1)}</b> to <b>{plan.lastChange.after?.toFixed(1)}</b>
            {plan.lastChange.changeInSd != null
              ? <> ({plan.lastChange.changeInSd.toFixed(2)}× the run-to-run spread)</>
              : plan.lastChange.symptomDeltaPct != null && <> ({plan.lastChange.symptomDeltaPct > 0 ? '+' : ''}{plan.lastChange.symptomDeltaPct.toFixed(0)}%)</>}.
            {' '}<b>Put it back to {plan.lastChange.from}</b>
            {CHANNELS.find((c) => c.key === plan.lastChange!.channel)?.unit ?? ''}. That direction is now marked
            proven-wrong for this car and won't be suggested again.
          </div>
        </div>
      )}

      {plan.primary && (
        <>
          {plan.lastChange?.verdict === 'backfired' && <SectionHead>Then try this next</SectionHead>}
          {plan.status.state !== 'tuning' && <SectionHead>Optional — only if you want to keep experimenting</SectionHead>}
          <div className="note warn" style={plan.lastChange?.verdict === 'backfired' ? { marginTop: 6 } : undefined}>
            <div style={{ fontSize: 13 }}>
              <b>{plan.primary.label}</b>{' '}
              {plan.primary.from != null ? (
                <>
                  <span style={{ color: 'var(--muted)' }}>{fmtVal(plan.primary.from, plan.primary.channel)} → </span>
                  <b style={{ color: 'var(--amber)', fontSize: 16 }}>{fmtVal(plan.primary.to, plan.primary.channel)}</b>
                </>
              ) : (
                // No captured value. Under bisection only the DIRECTION is knowable —
                // printing the old proportional magnitude here ("lower by 12%") was a
                // leftover that contradicted the bisection instruction directly below it.
                <b style={{ color: 'var(--amber)', fontSize: 16 }}>
                  {plan.primary.delta > 0 ? 'RAISE it' : 'LOWER it'}
                </b>
              )}
            </div>
            <div style={{ marginTop: 4 }}>{plan.primary.why}</div>
            {plan.primary.from == null && plan.primary.bracket && (
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--amber)' }}>
                {plan.primary.bracket.rationale}
              </div>
            )}
            {plan.primary.from == null && (
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--amber)' }}>
                This channel wasn't captured before the run, so there's no exact target — and if it's already at its
                in-game limit the report can't tell. <b>Enter it in the pre-run card next time</b> for an exact number.
              </div>
            )}
            {plan.primary.bracket && plan.primary.from != null && (
              <div style={{ marginTop: 5, fontSize: 11, color: 'var(--muted)' }}>
                <b style={{ color: 'var(--text)' }}>Bisection search:</b> {plan.primary.bracket.rationale}
                {plan.primary.bracket.span != null && (
                  <> Remaining uncertainty <b>{plan.primary.bracket.lo}–{plan.primary.bracket.hi}</b>
                    {plan.primary.runsLeft ? <> · about <b>{plan.primary.runsLeft}</b> more run{plan.primary.runsLeft === 1 ? '' : 's'} to pin it down</> : <> · that's as precise as this setting goes</>}.</>
                )}
              </div>
            )}
            {plan.primary.kind === 'recovery' && (
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
                No symptom is currently above the action threshold — this comes from your own A/B history, which
                measured the earlier value as better. Optional, but it's the best-evidenced change available.
              </div>
            )}
            {/* Name the symptom THIS lever addresses. Printing plan.dominant here was
                misleading — the top open candidate isn't always for the worst symptom
                (its levers may all be exhausted), so it claimed e.g. front downforce
                was the primary lever for power oversteer. */}
            <div style={{ marginTop: 4, fontSize: 11, color: 'var(--muted)' }}>
              Targeting: <b>{SYMPTOM_LABEL[plan.primary.symptom] ?? plan.primary.symptom}</b>
              {plan.dominant && plan.dominant !== plan.primary.symptom && (
                <> — note the worst symptom is <b>{SYMPTOM_LABEL[plan.dominant] ?? plan.dominant}</b>, but its levers are exhausted or already tried.</>
              )}
            </div>
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
            {plan.lastChange?.verdict === 'backfired'
              ? <><b>Do both: put the failed setting back, then make this one change.</b> That keeps it a clean single-variable test, so the next run is still measurable.</>
              : <><b>Change only this one thing.</b> Moving several knobs in one run makes the result impossible to attribute — and it's what drove the previous runs to their limits without the car improving.</>}
          </div>
        </>
      )}

      {!plan.primary && (
        plan.blocked.length > 0 ? (
          <div className="note crit">
            <b>Every lever for this symptom is used up.</b>
            <div style={{ marginTop: 3 }}>
              {plan.dominant ? <>The car still shows <b>{SYMPTOM_LABEL[plan.dominant] ?? plan.dominant}</b>, but every setting that could fix it is at its in-game limit or has been proven not to help. </> : null}
              This is no longer a tuning problem — it's a build limit. Look at tire compound/width, weight reduction, or
              power before spending more runs on the tune.
            </div>
          </div>
        ) : (
          <div className="note info">
            <b>Nothing worth changing — the car is dialled in for this track.</b>
            <div style={{ marginTop: 3 }}>No symptom is severe enough to chase. Further tweaks are more likely to hurt than help.</div>
          </div>
        )
      )}

      {plan.queued.length > 0 && (
        <>
          <SectionHead>Queued — don't touch yet</SectionHead>
          <div className="notes" style={{ marginTop: 6 }}>
            {plan.queued.slice(0, 4).map((c) => (
              <div key={c.channel + c.symptom} className="note info" style={{ borderLeftColor: 'var(--line)' }}>
                <span style={{ color: 'var(--muted)' }}>
                  <b style={{ color: 'var(--text)' }}>{c.label}</b> {fmtVal(c.from, c.channel)} → {fmtVal(c.to, c.channel)} · {SYMPTOM_LABEL[c.symptom] ?? c.symptom}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {s.meta?.limits && Object.keys(s.meta.limits).length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
          <b>Levers you marked at a limit:</b>{' '}
          {Object.entries(s.meta.limits).map(([k, v], i) => (
            <span key={k}>
              {i > 0 ? ' · ' : ''}
              {CHANNELS.find((c) => c.key === k)?.label ?? k} at <b style={{ color: 'var(--amber)' }}>{v}</b>
            </span>
          ))}
          . Only the marked direction is blocked — a lever at <i>min</i> can still be raised, and vice versa. Fix any of
          these in the pre-run card if it's wrong.
        </div>
      )}

      {plan.blocked.length > 0 && (
        <>
          <SectionHead>Exhausted levers</SectionHead>
          <div className="notes" style={{ marginTop: 6 }}>
            {plan.blocked.slice(0, 5).map((c) => (
              <div key={c.channel + c.symptom} className="note crit">
                <b>{c.label}</b> — {c.blocked}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
            These can't help any further. If the symptom persists with every lever exhausted, it's a build/parts limit
            (tire compound, weight, power) rather than a tuning problem.
          </div>
        </>
      )}
    </Card>
  );
}

// The planner's verdict for a session. Exported so the pre-run capture screen can offer
// the ONE change the planner endorses, instead of every section's independent suggestion.
export function planForSession(s: SessionSummary, sessions: SessionSummary[]): Plan | null {
  const a = s.analytics;
  if (!a) return null;
  return buildPlan(
    s,
    sessions,
    collectCandidates(
      a,
      (s.meta?.drivetrain || '').toUpperCase(),
      pooledRideHeight(s, sessions),
      pooledSymptoms(s, sessions),
      pooledDamping(s, sessions),
    ),
    deltaLookup,
  );
}

function Report({ s }: { s: SessionSummary }) {
  const a = s.analytics;
  const meta = useMeta();
  const iss = issueStatus(s);
  const noTuneEntered = a != null && !carHasEnteredTune(s, meta.sessions);
  const g = (v: number | null | undefined, d = 2) => (v != null ? fmt(v, d) : '–');
  // Computed once here and shared with every section via PlanCtx, so the whole report
  // reasons from one plan instead of each card deciding independently.
  const plan = planForSession(s, meta.sessions);

  // A run's comparable time: a circuit fastest lap OR — for a point-to-point / sprint
  // (Rivals street races), which never cross start/finish so bestLap stays 0 — the
  // race finish time (currentRaceTime). Compare like-for-like: lap↔lap, race↔race.
  const timeOf = (x: SessionSummary): { t: number; kind: 'lap' | 'race' } | null =>
    x.bestLap != null ? { t: x.bestLap, kind: 'lap' }
      : x.raceTimeSec != null ? { t: x.raceTimeSec, kind: 'race' } : null;
  const cur = timeOf(s);
  const priorRun = (() => {
    if (!cur) return null;
    const prior = meta.sessions.filter((x) => {
      if (x.startedAt >= s.startedAt) return false;
      const p = timeOf(x);
      if (!p || p.kind !== cur.kind) return false; // don't compare a lap to a sprint
      // Same-event guard for sprints: only compare races of ~the same length.
      if (cur.kind === 'race' && s.finishDistanceM && x.finishDistanceM &&
        Math.abs(x.finishDistanceM - s.finishDistanceM) > Math.max(50, s.finishDistanceM * 0.05)) return false;
      return true;
    });
    const sameCar = prior.filter((x) => s.meta?.carOrdinal != null && x.meta?.carOrdinal === s.meta?.carOrdinal);
    const chain = (sameCar.length ? sameCar : prior).sort((x, y) => y.startedAt - x.startedAt);
    return chain[0] ?? null;
  })();
  const priorTime = priorRun ? timeOf(priorRun) : null;
  const lapDelta = cur && priorTime ? cur.t - priorTime.t : null;
  const lapTone = lapDelta == null ? 'var(--muted)' : lapDelta < -0.01 ? 'var(--green)' : lapDelta > 0.01 ? 'var(--red)' : 'var(--muted)';
  const lapText = lapDelta == null ? '–' : Math.abs(lapDelta) < 0.01 ? '±0.00' : `${lapDelta < 0 ? '−' : '+'}${Math.abs(lapDelta).toFixed(2)}`;
  const otherCar = priorRun != null && priorRun.meta?.carOrdinal !== s.meta?.carOrdinal;
  const timeLabel = cur?.kind === 'race' ? 'Race time' : 'Best lap';
  const vsSub = lapDelta != null
    ? `prev ${lapTime(priorTime!.t)}${otherCar ? ' (other car)' : ''}`
    : cur == null ? 'no timed run' : `first ${timeLabel.toLowerCase()} logged`;

  return (
    <PlanCtx.Provider value={plan}>
      {noTuneEntered && (
        <div className="note warn" style={{ marginBottom: 10 }}>
          <b>No in-game tune entered for this car yet.</b>
          <div style={{ marginTop: 3 }}>
            Differential, Braking, Damping and Alignment are <b>closed loops</b> — they compare the settings you're running to a recommended target. Until you type this car's actual values into their boxes <b>once</b>, they show generic baselines and the run-over-run adjustments can't converge. Enter your values, apply the → targets in-game, then re-record — from then on the boxes pre-fill with the prior run's recommendation.
          </div>
        </div>
      )}
      {a && plan && <NextChange s={s} plan={plan} />}

      <Card
        id="overview"
        title="Run Overview"
        sub={carDetail(s)}
        status="info"
        statusLabel={`${fmt(s.durationSec)}s · ${s.frames} frames`}
      >
        <div className="tiles">
          <Tile
            label={timeLabel}
            value={cur ? lapTime(cur.t) : '–'}
            sub={cur?.kind === 'race' ? 'sprint finish' : s.lapsCompleted ? `${s.lapsCompleted} laps` : 'no full lap'}
          />
          {/* Shown as information only. Deliberately NOT used to judge whether a tuning
              change worked — on a controller the variance from a distraction or a missed
              brake point is bigger than the change itself. That verdict lives in the
              Next Change card and is derived from car behaviour. */}
          <Tile
            label="vs previous run"
            value={<span style={{ color: 'var(--muted)' }}>{lapText}</span>}
            unit={lapDelta != null ? 's' : undefined}
            sub={`${vsSub} · not used to judge changes`}
          />
          <Tile label="Top speed" value={s.maxSpeedKph ? fmt(s.maxSpeedKph * 0.621371) : '–'} unit="mph" />
          <Tile label="Peak lateral" value={g(a?.muLat)} unit="g" sub="cornering grip" />
          <Tile label="Peak braking" value={g(a?.peakBrakeG)} unit="g" />
          <Tile label="Peak power" value={fmt(s.peakHp)} unit="hp" sub={`@ ${fmt(s.peakHpRpm)} rpm`} />
        </div>
        {cur == null && (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
            No timed run captured — FH6 reports a time once you're in a race or Rivals event (lap for circuits, finish time for sprints). Free-roam driving has no timer, so there's nothing to compare.
          </div>
        )}
      </Card>

      <Card
        id="handoff"
        title="Spreadsheet Inputs"
        sub="measured values to type into your tuning sheet"
        status="info"
        statusLabel="hand-off"
      >
        {a ? <SpreadsheetInputs s={s} /> : <div className="note empty">Re-record this run to generate measured spreadsheet inputs.</div>}
      </Card>

      {a && (
        <Card id="grip" title="Grip & Balance" sub="what the tyres actually delivered" status="info" statusLabel={a.handling ? a.handling.overall : 'measured'}>
          <div className="tiles">
            <Tile label="Peak lateral" value={g(a.muLat)} unit="g" />
            <Tile label="Peak accel" value={g(a.peakAccelG)} unit="g" />
            <Tile label="Peak brake" value={g(a.peakBrakeG)} unit="g" />
            <Tile label="Corner-exit ax" value={g(a.cornerExitAxG)} unit="g" hand cell="ΔW"
              sub={a.cornerExitAxTypicalG != null ? `${fmt(a.cornerExitAxTypicalG, 2)} g typical` : 'need on-power exits'} />
          </div>
          {a.cornerExitAxG != null && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
              <b>ax</b> feeds your weight-transfer formula (ΔW = M·ax·h/L) — longitudinal g while on power and still cornering.
            </div>
          )}
          {a.handling && <Handling key={`hand-${s.id}`} s={s} />}
        </Card>
      )}

      {a?.tires && (
        <Card id="tires" title="Tires" sub="run-over-run pressure toward the grip window" status="info" statusLabel="closed-loop">
          <TirePressure key={`tire-${s.id}`} s={s} />
        </Card>
      )}

      {a && (
        <Card id="brakes" title="Braking" sub="pressure, balance and front dive" status="info" statusLabel="closed-loop">
          <BrakeRec key={`brake-${s.id}`} s={s} />
          <ChassisCG key={s.meta?.carOrdinal ?? 'x'} s={s} />
        </Card>
      )}

      {a && (
        <Card
          id="diff"
          title="Differential"
          sub="run-over-run lock adjustment from measured handling"
          status="info"
          statusLabel="closed-loop"
        >
          <DiffRecommendation key={s.id} s={s} />
        </Card>
      )}

      {a && (
        <Card
          id="gearing"
          title="Gearing & Launch"
          sub="shift points, 1st-gear launch, ratio spacing"
          status="info"
          statusLabel={a.launchVerdict ? a.launchVerdict.replace('-', ' ') : 'measured'}
        >
          <AutoShift s={s} />
          <LaunchGear key={`gear1-${s.id}`} s={s} />
          {a.gearing && <GearRatios key={`gears-${s.id}`} s={s} />}
          {a.gearing?.finalDrive && <FinalDrive key={`fd-${s.id}`} s={s} />}
        </Card>
      )}

      {(a?.damping || a?.rideHeight) && (
        <Card id="chassis" title="Chassis & Damping" sub="run-over-run damper + ride-height adjustment" status="info" statusLabel={a?.damping ? a.damping.balance : 'ride height'}>
          {a?.damping && <Damping key={`damp-${s.id}`} s={s} />}
          {a?.rideHeight && <RideHeight key={`ride-${s.id}`} s={s} />}
        </Card>
      )}

      {a?.aeroBalance && (
        <Card id="aero" title="Aero" sub="downforce balance across the speed range" status="info" statusLabel="closed-loop">
          <AeroBalance key={`aero-${s.id}`} s={s} />
        </Card>
      )}

      <Card id="issues" title="Issues & Powertrain" sub="what the run flagged, and how to fix it" status={iss.st} statusLabel={iss.label}>
        {s.issues && s.issues.length > 0 && (
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 6 }}>
            “active X% of run” = how much of the stint each issue was present. <b>Fix</b> = what to change in the in-game Tune menu.
          </div>
        )}
        <div className="notes">
          {s.issues && s.issues.length > 0 ? (
            s.issues.map((i, n) => {
              const gd = guideFor(i, s.meta?.drivetrain);
              const corners = i.corners && i.corners.length ? ` · ${i.corners.join(' ')}` : '';
              const marginal = i.pctStint < MARGINAL_PCT;
              const owner = ISSUE_OWNER[i.code ?? ''];
              return (
                <div key={n} className={`note ${marginal ? 'info' : i.level}`} style={marginal ? { opacity: 0.75 } : undefined}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <b>{gd.title}{corners}</b>
                    <span style={{ color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                      {marginal && <span className="chip hold" style={{ marginRight: 5 }}>marginal</span>}
                      active {i.pctStint < 1 ? '<1' : fmt(i.pctStint)}% of run
                    </span>
                  </div>
                  {marginal && (
                    <div style={{ marginTop: 3, fontSize: 11, color: 'var(--muted)' }}>
                      Only {i.pctStint < 0.1 ? '<0.1' : fmt(i.pctStint, 1)}% of the run — a few frames, not a fault to chase.
                    </div>
                  )}
                  {gd.fix && !marginal && (
                    <div style={{ marginTop: 3 }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 700 }}>Fix:</span> {gd.fix}
                    </div>
                  )}
                  {owner && (
                    <div style={{ marginTop: 3, fontSize: 11, color: 'var(--muted)' }}>
                      Handled by the <b>{owner.label}</b> section — it tracks what you've already tried and what's at its
                      limit, so follow that over the generic fix above.
                    </div>
                  )}
                  <div style={{ marginTop: 3, fontSize: 10, color: 'var(--muted)' }}>Trigger: {i.msg}</div>
                </div>
              );
            })
          ) : (
            <div className="note empty">Clean run — no balance, thermal or traction issues surfaced.</div>
          )}
        </div>
        {a && a.powertrain.length > 0 && (
          <>
            <SectionHead>Powertrain &amp; Gearing notes</SectionHead>
            <div className="notes" style={{ marginTop: 6 }}>
              {a.powertrain.map((p, n) => (
                <div key={n} className={`note ${p.level}`}>
                  <b>{p.title}</b>
                  <div style={{ marginTop: 3 }}>{p.text}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </PlanCtx.Provider>
  );
}

// Full-tab engineering workspace: run rail on the left, report canvas on the right.
export function Engineer() {
  const meta = useMeta();
  const [sel, setSel] = useState<SessionSummary | null>(null);
  const [active, setActive] = useState('overview');
  const mainRef = useRef<HTMLDivElement>(null);
  const sessions = meta.sessions;
  const selected = sel || meta.lastSession;

  // Scroll-spy: highlight whichever section is nearest the top of the canvas.
  useEffect(() => {
    const el = mainRef.current;
    if (!el || !selected) return;
    const onScroll = () => {
      let best = SECTIONS[0].id;
      for (const sec of SECTIONS) {
        const node = document.getElementById(sec.id);
        if (node && node.getBoundingClientRect().top - el.getBoundingClientRect().top <= 90) best = sec.id;
      }
      setActive(best);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [selected]);

  const jump = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const deleteSession = (e: React.MouseEvent, s: SessionSummary) => {
    e.stopPropagation();
    if (!window.confirm(`Delete this session?\n\n${carLabel(s)} — ${new Date(s.startedAt).toLocaleString()}`)) return;
    send({ type: 'session-delete', id: s.id });
    if (selected?.id === s.id) { setSel(null); dismissReport(); }
  };

  const deleteAllSessions = () => {
    if (!window.confirm(`Delete ALL ${sessions.length} recorded session${sessions.length === 1 ? '' : 's'}? This cannot be undone.`)) return;
    send({ type: 'sessions-delete-all' });
    setSel(null);
    dismissReport();
  };

  return (
    <div className="eng">
      <aside className="eng-side">
        <div className="rail-head">
          <span>Runs · {sessions.length}</span>
          <button
            className="btn"
            onClick={deleteAllSessions}
            disabled={sessions.length === 0}
            title="Delete all recorded sessions"
            style={{ padding: '2px 7px', fontSize: 10, borderColor: 'var(--red)', color: '#ff8a8a' }}
          >
            Clear
          </button>
        </div>
        {meta.recording.recording && <span className="pill crit">● REC {meta.recording.frames ?? 0}f</span>}
        {meta.recording.armed && <span className="pill warn">◌ ARMED</span>}
        <div className="rail-list">
          {sessions.length === 0 && <div className="note empty">No runs yet. Press RECORD on the Live tab.</div>}
          {sessions.map((x) => (
            <div key={x.id} className={`run${selected?.id === x.id ? ' sel' : ''}`} onClick={() => setSel(x)}>
              <div className="run-car">
                <span>{carLabel(x)}</span>
                <button className="session-del" title="Delete run" onClick={(e) => deleteSession(e, x)}>✕</button>
              </div>
              <div className="run-meta">
                <span>{new Date(x.startedAt).toLocaleDateString()} {new Date(x.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                <span>{lapTime(x.bestLap) || `${fmt(x.durationSec)}s`}</span>
              </div>
              <div className="run-meta">
                <span>{fmt(x.peakHp)} hp</span>
                <span>{x.maxSpeedKph ? `${fmt(x.maxSpeedKph * 0.621371)} mph` : ''}</span>
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="eng-main" ref={mainRef}>
        {selected ? (
          <>
            <div className="eng-nav">
              {SECTIONS.filter((sec) => presentSectionIds(selected).has(sec.id)).map((sec) => (
                <button key={sec.id} className={active === sec.id ? 'on' : ''} onClick={() => jump(sec.id)}>
                  {sec.label}
                </button>
              ))}
            </div>
            <div style={{ margin: '0 0 10px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', letterSpacing: 0.5 }}>{carLabel(selected)}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {new Date(selected.startedAt).toLocaleString()} · {fmt(selected.durationSec)}s · {selected.frames} frames
              </div>
            </div>
            <Report s={selected} />
          </>
        ) : (
          <div className="card"><div className="card-body">
            <div className="note empty">
              Select a run from the left, or press RECORD on the Live tab to capture one.
            </div>
          </div></div>
        )}
      </div>
    </div>
  );
}
