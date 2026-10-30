import { useMemo, useState } from 'react';
import { getLatest, useMeta, useTick } from '../store';
import { channelsFor, recommendedFor, VALID_DRIVETRAINS, isGearRatioKey } from '../tune';
import { recommendedBox, finalDriveTarget, contextFromAnalytics } from '../gearing';
import { planForSession } from './Sessions';
import { GROUP_LABEL, leverGroup } from '../plan';
import { setPerRun, usePerRun } from '../perRun';
import { unenteredChanges } from '../prerun';
import { clampToLimit, markedLimit } from '../limits';
import type { EventType, TuneSnapshot, TuneLimits } from '../types';
import { EVENT_TYPES, defaultEventType } from '../events';

// Pre-run tune capture. Recording what's ACTUALLY on the car before the run (instead of
// inferring it afterwards) is what makes the (settings → outcome) pairs real — which is
// what the adaptive step size is learned from. It also means one entry per car: after
// the first time the card pre-fills from your last run, so you only touch what changed.
export function PreRunTune({ onConfirm, onCancel }: { onConfirm: (t: TuneSnapshot, l: TuneLimits, e: EventType | null) => void; onCancel: () => void }) {
  const meta = useMeta();
  // Re-render as telemetry arrives: RECORD is pressed on the grid, where the car is
  // still the #0/FWD placeholder. Without this the card would latch onto 'unknown'
  // identity and never pick the real car up when it spawns a moment later.
  useTick(2);
  // Car identity. You press RECORD on the race grid, where the game still reports a
  // PLACEHOLDER (carOrdinal 0, drivetrainType 0 → 'FWD', sometimes 'UNK'). Trusting it
  // showed the wrong diff channels and silently dropped the real ones, so a live frame
  // only counts when the car has actually spawned AND reports a real drivetrain;
  // otherwise fall back to the newest prior run that had one.
  const live = getLatest()?.t;
  const liveValid = !!live && live.carOrdinal > 0 && VALID_DRIVETRAINS.includes((live.drivetrain || '').toUpperCase());
  const priorWithDrive = [...meta.sessions]
    .sort((a, b) => b.startedAt - a.startedAt)
    .find((x) => VALID_DRIVETRAINS.includes((x.meta?.drivetrain || '').toUpperCase()));
  const carOrdinal = liveValid ? live!.carOrdinal : (live?.carOrdinal && live.carOrdinal > 0 ? live.carOrdinal : priorWithDrive?.meta?.carOrdinal);
  const drivetrain = liveValid ? live!.drivetrain : priorWithDrive?.meta?.drivetrain;

  // Gear count: the user's per-car override wins, else the highest gear detected in a
  // prior run. Without it the gearing rows can't be generated.
  const detectedGears = useMemo(() => {
    const prior = [...meta.sessions]
      .filter((x) => carOrdinal == null || x.meta?.carOrdinal === carOrdinal)
      .sort((a, b) => b.startedAt - a.startedAt)
      .find((x) => (x.analytics?.gearing?.numGears ?? 0) >= 3);
    // Unknown on a brand-new car — show 6 (the common case). Spare rows are harmless
    // because blanks are skipped, and the count self-corrects after the first run.
    return prior?.analytics?.gearing?.numGears ?? 6;
  }, [meta.sessions, carOrdinal]);

  // Gear COUNT is a build property, not a tuning value, so it lives in the same per-car
  // key the report's gearing section uses — set it here and both stay in sync. Editable
  // because only gears you actually USED can be auto-detected, and a transmission swap
  // changes it outright.
  const countKey = `fh6.gears.count.${carOrdinal ?? 'unknown'}`;
  const [gearOverride, setGearOverride] = useState<number | null>(() => {
    try { const v = localStorage.getItem(countKey); return v && Number(v) >= 3 ? Number(v) : null; } catch { return null; }
  });
  const numGears = gearOverride ?? detectedGears;
  const setGears = (v: string) => {
    const n = v === '' ? null : Number(v);
    setGearOverride(n != null && n >= 3 && n <= 10 ? n : null);
    try {
      if (n != null && n >= 3 && n <= 10) localStorage.setItem(countKey, String(n));
      else localStorage.removeItem(countKey);
    } catch { /* ignore */ }
  };

  const channels = useMemo(() => channelsFor(drivetrain, numGears), [drivetrain, numGears]);

  // Seed from the most recent run for this car that recorded a tune.
  const lastTune = useMemo(() => {
    const prior = meta.sessions
      .filter((s) => s.meta?.tune && (carOrdinal == null || s.meta?.carOrdinal === carOrdinal))
      .sort((a, b) => b.startedAt - a.startedAt);
    return prior[0]?.meta?.tune ?? null;
  }, [meta.sessions, carOrdinal]);

  const [vals, setVals] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    for (const c of channels) {
      const v = lastTune?.[c.key];
      if (typeof v === 'number') o[c.key] = String(v);
    }
    return o;
  });

  // Levers the driver has flagged as at their in-game limit. Car-specific ranges
  // (springs, ride height, aero) can't be hardcoded, so this is how the planner learns
  // a lever is exhausted and moves to the next one. Carries over between runs.
  // The kind of event (FH6-28): the telemetry never says, and runs of different kinds
  // aren't compared. Pre-filled from this car's most recent labelled run.
  const [eventType, setEventType] = useState<EventType | null>(() => defaultEventType(meta.sessions, carOrdinal));
  const [limits, setLimits] = useState<TuneLimits>(() => {
    const prior = meta.sessions
      .filter((x) => x.meta?.limits && (carOrdinal == null || x.meta?.carOrdinal === carOrdinal))
      .sort((a, b) => b.startedAt - a.startedAt);
    return prior[0]?.meta?.limits ? { ...prior[0].meta!.limits } : {};
  });
  // Explicit MIN / MAX toggles rather than one cycling chip. A single click on a cycling
  // chip silently meant "min", so a lever the driver had MAXED got flagged as at its
  // minimum — which doesn't block the direction the planner wants to push, so it kept
  // recommending a change the game couldn't accept.
  const toggleLimit = (key: string, which: 'min' | 'max') => setLimits((p) => {
    const n = { ...p };
    if (n[key] === which) delete n[key]; else n[key] = which;
    return n;
  });

  // GEARING IS SOLVED RIGHT HERE, not read back from the report.
  //
  // It used to come from `fh6.gears.c.<car>` / `fh6.finaldrive.c.<car>`, keys the tuning
  // report writes as a side effect of RENDERING. So the pre-run recommendation only
  // existed if you had opened the report for that session first, and if you hadn't, this
  // screen silently offered whatever was left from an older run — with no indication it
  // was stale. Solving from the latest run's analytics removes the ordering requirement
  // entirely: the numbers are correct whether or not you ever open the report, and both
  // screens run the same solver over the same measured power band.
  const lastGearing = useMemo(() => {
    return [...meta.sessions]
      .filter((x) => (carOrdinal == null || x.meta?.carOrdinal === carOrdinal) && x.analytics?.gearing)
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  }, [meta.sessions, carOrdinal]);

  const gearRecs = useMemo(() => {
    const out: Record<string, number> = {};
    const a = lastGearing?.analytics;
    if (!a?.gearing) return out;
    const num = (k: string): number | null => {
      const raw = vals[k];
      if (raw == null || raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    // Solve against the ratios currently in the form — that's what is on the car now.
    // 1st and top are held as anchors, so applying the result and re-solving returns the
    // same set; the recommendation doesn't chase itself.
    const ratios: Record<number, number> = {};
    for (let n = 1; n <= 10; n++) { const v = num(`gear${n}`); if (v != null) ratios[n] = v; }
    // A box within the floor of the solved spacing holds as entered (FH6-36).
    const rec = recommendedBox(ratios, numGears, contextFromAnalytics(a));
    if (rec) for (let n = 1; n <= numGears; n++) if (rec.box[n] != null) out[`gear${n}`] = rec.box[n];

    // Final drive is solved relative to the recorded run, never the form (see
    // finalDriveTarget in gearing.ts for why).
    const fd = finalDriveTarget(lastGearing?.meta?.tune, a, ratios);
    if (fd != null) out.finalDrive = fd;
    return out;
  }, [lastGearing, numGears, vals]);

  const recs = useMemo(() => {
    const o: Record<string, number> = {};
    for (const c of channels) {
      // Gearing comes from the solver above, never from the report's cached key.
      if (isGearRatioKey(c.key) || c.key === 'finalDrive') continue;
      const r = recommendedFor(c.key, carOrdinal);
      if (r != null) o[c.key] = r;
    }
    // A setting marked MIN/MAX on this card is held at the value in its box: no "rec"
    // chip suggests going past it (FH6-25).
    const boxes: Record<string, number> = {};
    for (const [k, v] of Object.entries(vals)) {
      const n = Number(v);
      if (v !== '' && Number.isFinite(n)) boxes[k] = n;
    }
    const all: Record<string, number> = { ...o, ...gearRecs };
    for (const k of Object.keys(all)) all[k] = clampToLimit(all[k], markedLimit(limits, boxes, k));
    return all;
  }, [channels, carOrdinal, gearRecs, limits, vals]);

  // ONE CHANGE PER RUN.
  //
  // Every section computes its own recommendation independently, and this screen used to
  // surface all of them at once behind an "Apply all recommended" button — with no
  // reference to the planner at all. That is precisely the failure the planner exists to
  // prevent, and it did happen: across 14 recorded runs on one car, single runs moved 15,
  // 8, 7 and 9 channels at once.
  //
  // Worse than losing attribution, it disabled the safety net. experiments() only mines a
  // before/after pair when EXACTLY ONE channel moved, so only 5 of 13 transitions
  // qualified; rear toe was never once a single-channel change, so reviewChange() never
  // judged it, it was never marked 'backfired', and decorate() never blocked it. It
  // marched to its rail unchecked while rear grip fell 36%.
  //
  // The planner's picks are now the headline, blocked levers are withheld, and the bulk
  // apply is gone. Since FH6-30 the picks are one per lever group (never two for the same
  // symptom), and mining accepts a pair whose changes all sit in different groups.
  const lastRun = useMemo(() => {
    return [...meta.sessions]
      .filter((x) => (carOrdinal == null || x.meta?.carOrdinal === carOrdinal) && x.analytics)
      .sort((a, b) => b.startedAt - a.startedAt)[0] ?? null;
  }, [meta.sessions, carOrdinal]);
  const perRun = usePerRun();
  const plan = useMemo(() => (lastRun ? planForSession(lastRun, meta.sessions, perRun) : null), [lastRun, meta.sessions, perRun]);
  const plannedKeys = useMemo(() => new Set((plan?.thisRun ?? []).map((c) => c.channel)), [plan]);
  // Gearing is solved in its own section, outside the planner. With one change per group
  // and no planned gearing change, applying the solved gearing alongside is fine.
  const gearingFree = perRun === 'group' && ![...plannedKeys].some((k) => leverGroup(k) === 'gearing');
  const blockedKeys = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of plan?.blocked ?? []) if (b.blocked) m.set(b.channel, b.blocked);
    return m;
  }, [plan]);

  // Only the planner's changes for this run are offered for one-click apply (one per lever
  // group, or one — FH6-30). Blocked levers are never offered — those are the ones
  // already at a rail, or measured to have made the symptom worse. The same list is what
  // "Confirm & record" asks about when a change isn't in its box yet (FH6-34).
  const planned = (plan?.thisRun ?? [])
    .map((pc) => ({ pc, ch: channels.find((c) => c.key === pc.channel) ?? null }))
    .filter((x): x is { pc: typeof x.pc; ch: NonNullable<typeof x.ch> } => !!x.ch && !blockedKeys.has(x.pc.channel));
  const unentered = unenteredChanges(planned.map(({ ch }) => ({ channel: ch.key, label: ch.label })), vals, recs);
  const pending = planned.filter(({ pc }) => unentered.some((u) => u.channel === pc.channel));
  const [askUnentered, setAskUnentered] = useState(false);
  const applyPlanned = () => {
    setVals((p) => {
      const next = { ...p };
      for (const { pc } of pending) {
        const r = recs[pc.channel];
        if (r != null) next[pc.channel] = String(r);
      }
      return next;
    });
  };

  const snapshot = (over: Record<string, string> = {}): TuneSnapshot => {
    const t: TuneSnapshot = {};
    for (const c of channels) {
      const raw = over[c.key] ?? vals[c.key];
      if (raw == null || raw === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n)) t[c.key] = n;
    }
    return t;
  };

  const entered = Object.keys(snapshot()).length;
  const groups = useMemo(() => {
    const m = new Map<string, typeof channels>();
    for (const c of channels) {
      if (!m.has(c.group)) m.set(c.group, []);
      m.get(c.group)!.push(c);
    }
    return [...m.entries()];
  }, [channels]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <div className="modal-title">Confirm the tune on the car</div>
            <div className="modal-sub">
              {lastTune
                ? 'Pre-filled from your last run — change only what you adjusted in the garage.'
                : 'First run for this car — enter what it\'s currently set to. Blank fields are just skipped.'}
              {' '}Recording starts when you confirm.
            </div>
          </div>
          <span className="pill info">
            {entered} set{drivetrain ? ` · ${String(drivetrain).toUpperCase()}` : ' · all channels'}
          </span>
        </header>

        <div className="event-pick">
          <span className="event-pick-label">Event</span>
          {EVENT_TYPES.map((e) => (
            <button key={e.key} className={`ev-chip${eventType === e.key ? ' on' : ''}`} onClick={() => setEventType(e.key)}>
              {e.label}
            </button>
          ))}
          {!eventType && <span className="event-pick-hint">Pick one, so this run is only compared with runs of the same kind.</span>}
        </div>

        <div className="event-pick">
          <span className="event-pick-label">Changes per run</span>
          <button className={`ev-chip${perRun === 'group' ? ' on' : ''}`} onClick={() => setPerRun('group')}
            title="One change per lever group (braking, throttle, gearing, chassis), never two for the same symptom">
            One per group
          </button>
          <button className={`ev-chip${perRun === 'one' ? ' on' : ''}`} onClick={() => setPerRun('one')}
            title="One change per run: slower, for when the car's balance is still far off">
            One
          </button>
        </div>

        {pending.length === 1 && (() => {
          const { pc, ch } = pending[0];
          return (
            <div className="note info modal-recbar">
              <span>
                Change <b>one thing</b> this run — the planner picked <b>{ch!.label}</b>
                {pc.from != null && pc.to != null
                  ? <> : {pc.from}{ch!.unit ?? ''} → <b>{pc.to}{ch!.unit ?? ''}</b></>
                  : null}
                {pc.why ? <span style={{ opacity: 0.8 }}> · {pc.why}</span> : null}
              </span>
              <button className="btn" onClick={applyPlanned}>Apply it</button>
            </div>
          );
        })()}
        {pending.length > 1 && (
          <div className="note info modal-recbar">
            <span>
              Change <b>these {pending.length} things</b> this run, one per lever group:
              {pending.map(({ pc, ch }) => (
                <span key={pc.channel} title={pc.why}>
                  {' '}· <span style={{ opacity: 0.8 }}>{GROUP_LABEL[leverGroup(pc.channel)]}</span> <b>{ch!.label}</b>
                  {pc.from != null && pc.to != null ? <> {pc.from}{ch!.unit ?? ''} → <b>{pc.to}{ch!.unit ?? ''}</b></> : null}
                </span>
              ))}
            </span>
            <button className="btn" onClick={applyPlanned}>Apply them</button>
          </div>
        )}
        {pending.length === 0 && plan?.status?.state === 'dialled-in' && (
          <div className="note info modal-recbar">
            <span>No symptom is above the action threshold — the car is dialled in. Change nothing and drive it.</span>
          </div>
        )}

        <div className="modal-body">
          {groups.map(([group, list]) => (
            <div key={group} className="tune-group">
              <div className="tune-group-h">{group}</div>
              {group === 'Gearing' && (
                <div className="tune-row">
                  <label htmlFor="tune-numGears">Total gears</label>
                  <input
                    id="tune-numGears"
                    className="car-input"
                    type="number"
                    step={1}
                    min={3}
                    max={10}
                    value={gearOverride ?? ''}
                    placeholder={String(detectedGears)}
                    onChange={(e) => setGears(e.target.value)}
                  />
                  <span className="rec-chip" title="Auto-detected from the highest gear you actually used in a previous run. Set this if you never reached top gear, or after a transmission swap.">
                    {gearOverride != null ? 'set' : `auto ${detectedGears}`}
                  </span>
                  <span />
                </div>
              )}
              {list.map((c) => {
                const rec = recs[c.key];
                const cur = vals[c.key] === '' || vals[c.key] == null ? null : Number(vals[c.key]);
                const differs = rec != null && (cur == null || Math.abs(cur - rec) > 1e-9);
                // A lever the planner has ruled out — at a rail, or measured to have made
                // the symptom worse. Show why instead of offering the value.
                const blockedWhy = blockedKeys.get(c.key) ?? null;
                const isPlanned = plannedKeys.has(c.key);
                const alongside = !isPlanned && gearingFree && leverGroup(c.key) === 'gearing';
                return (
                  <div key={c.key} className="tune-row">
                    <label htmlFor={`tune-${c.key}`}>{c.label}{c.unit ? ` (${c.unit})` : ''}</label>
                    <input
                      id={`tune-${c.key}`}
                      className="car-input"
                      type="number"
                      step={c.step}
                      value={vals[c.key] ?? ''}
                      placeholder="—"
                      onChange={(e) => setVals((p) => ({ ...p, [c.key]: e.target.value }))}
                    />
                    {blockedWhy ? (
                      <button className="rec-chip" disabled title={blockedWhy} style={{ opacity: 0.45, cursor: 'not-allowed' }}>
                        blocked
                      </button>
                    ) : rec != null ? (
                      <button
                        className={`rec-chip${differs && isPlanned ? ' on' : ''}`}
                        title={isPlanned
                          ? (plannedKeys.size > 1 ? "One of the planner's changes for this run" : "The planner's pick for this run — the one change to make")
                          : alongside
                            ? 'Solved by the Gearing section. Gearing is its own group and nothing else this run touches it, so applying it alongside is fine.'
                          : perRun === 'group'
                            ? 'Not this run\u2019s change. This run already changes a lever in the same group, or one aimed at the same symptom; moving several of those at once is what let a bad direction march unchecked.'
                            : 'Not this run\u2019s change. The planner picks ONE lever per run so the result stays attributable; moving several at once is what let a bad direction march unchecked.'}
                        style={differs && !isPlanned && !alongside ? { opacity: 0.55 } : undefined}
                        onClick={() => setVals((p) => ({ ...p, [c.key]: String(rec) }))}
                      >
                        {differs ? `rec ${rec}` : 'on rec'}
                      </button>
                    ) : <span />}
                    <span className="lim-pair">
                      <button
                        className={`lim-chip${limits[c.key] === 'min' ? ' on' : ''}`}
                        title={`Mark ${c.label} as at its LOWEST in-game value — the report will stop suggesting lower and move to the next lever.`}
                        onClick={() => toggleLimit(c.key, 'min')}
                      >MIN</button>
                      <button
                        className={`lim-chip${limits[c.key] === 'max' ? ' on' : ''}`}
                        title={`Mark ${c.label} as at its HIGHEST in-game value — the report will stop suggesting higher and move to the next lever.`}
                        onClick={() => toggleLimit(c.key, 'max')}
                      >MAX</button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <footer className="modal-foot">
          {!(askUnentered && unentered.length > 0) && <span className="modal-hint">
            Skipping is fine — but channels you leave blank can't learn a step size, so they keep the slower fixed nudge.
            Hit <b>MIN</b> or <b>MAX</b> on any lever that's already at that end of its in-game range — the report stops
            suggesting that direction and moves to the next lever.
          </span>}
          {askUnentered && unentered.length > 0 ? (
            <div className="note warn modal-confirm">
              <span>
                <b>{unentered.length === 1 ? "This run's planned change isn't" : `${unentered.length} of this run's planned changes aren't`} entered here:</b>
                {unentered.map((u) => (
                  <span key={u.channel}> · {u.label} <b>{u.entered ?? '—'}</b> → <b>{u.target}</b></span>
                ))}
                . Did you make {unentered.length === 1 ? 'it' : 'them'} in the game?
              </span>
              <div className="modal-actions">
                <button className="btn" onClick={() => setAskUnentered(false)}>Back</button>
                <button className="btn" onClick={() => onConfirm(snapshot(), limits, eventType)}>No, record as entered</button>
                <button className="btn rec" onClick={() => onConfirm(snapshot(Object.fromEntries(unentered.map((u) => [u.channel, String(u.target)]))), limits, eventType)}>
                  Yes, I made {unentered.length === 1 ? 'it' : 'them'}
                </button>
              </div>
            </div>
          ) : (
            <div className="modal-actions">
              <button className="btn" onClick={onCancel}>Cancel</button>
              <button className="btn" onClick={() => onConfirm({}, {}, eventType)}>Skip &amp; record</button>
              <button className="btn rec" onClick={() => (unentered.length ? setAskUnentered(true) : onConfirm(snapshot(), limits, eventType))}>Confirm &amp; record</button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
