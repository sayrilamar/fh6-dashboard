import { useMemo, useState } from 'react';
import { getLatest, useMeta, useTick } from '../store';
import { channelsFor, recommendedFor, VALID_DRIVETRAINS, isGearRatioKey } from '../tune';
import { solveGearing, finalDriveAdvice, contextFromAnalytics } from '../gearing';
import type { TuneSnapshot, TuneLimits } from '../types';

// Pre-run tune capture. Recording what's ACTUALLY on the car before the run (instead of
// inferring it afterwards) is what makes the (settings → outcome) pairs real — which is
// what the adaptive step size is learned from. It also means one entry per car: after
// the first time the card pre-fills from your last run, so you only touch what changed.
export function PreRunTune({ onConfirm, onCancel }: { onConfirm: (t: TuneSnapshot, l: TuneLimits) => void; onCancel: () => void }) {
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
    const sol = solveGearing(ratios, numGears, contextFromAnalytics(a));
    if (sol) for (let n = 1; n <= numGears; n++) if (sol.ratios[n] != null) out[`gear${n}`] = sol.ratios[n];

    // FINAL DRIVE IS SOLVED RELATIVE TO THE RUN, NOT TO THE FORM.
    //
    // solveFinalDrive returns a SCALE, and that scale is only meaningful against the
    // final drive that was on the car for the run being analysed — the same run whose
    // power band and speed-per-rpm mapping the solve is built on. Scaling whatever
    // happens to be typed in the box made the recommendation chase itself: applying it
    // rewrote the input, the memo recomputed off the new input, and the target moved
    // again. Every click bumped the number and the "rec" chip never cleared, because
    // the suggestion could never equal the field it was derived from.
    //
    // The ratios come from the run for the same reason: the speed-per-rpm mapping is
    // calibrated on the recorded box's top gear, so pairing it with edited ratios would
    // silently mis-map rpm to road speed.
    const runTune = lastGearing?.meta?.tune;
    const runFd = runTune?.finalDrive;
    const runRatios: Record<number, number> = {};
    for (let n = 1; n <= 10; n++) {
      const v = runTune?.[`gear${n}`];
      if (typeof v === 'number' && v > 0) runRatios[n] = v;
    }
    const adv = finalDriveAdvice(
      a.gearing.finalDrive,
      Object.keys(runRatios).length >= 2 ? runRatios : ratios,
      contextFromAnalytics(a),
    );
    if (typeof runFd === 'number' && runFd > 0 && adv.pct !== 0) {
      out.finalDrive = Math.round(runFd * adv.scale * 100) / 100;
    }
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
    return { ...o, ...gearRecs };
  }, [channels, carOrdinal, gearRecs]);

  const pendingRecs = channels.filter((c) => {
    const r = recs[c.key];
    if (r == null) return false;
    const cur = vals[c.key] === '' || vals[c.key] == null ? null : Number(vals[c.key]);
    return cur == null || Math.abs(cur - r) > 1e-9;
  });

  const applyAllRecs = () => {
    setVals((p) => {
      const n = { ...p };
      for (const c of pendingRecs) n[c.key] = String(recs[c.key]);
      return n;
    });
  };

  const snapshot = (): TuneSnapshot => {
    const t: TuneSnapshot = {};
    for (const c of channels) {
      const raw = vals[c.key];
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

        {pendingRecs.length > 0 && (
          <div className="note info modal-recbar">
            <span>
              The report has {pendingRecs.length} recommended value{pendingRecs.length === 1 ? '' : 's'} you haven't entered yet.
            </span>
            <button className="btn" onClick={applyAllRecs}>Apply all recommended</button>
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
                    {rec != null ? (
                      <button
                        className={`rec-chip${differs ? ' on' : ''}`}
                        title="Use the report's recommended value"
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
          <span className="modal-hint">
            Skipping is fine — but channels you leave blank can't learn a step size, so they keep the slower fixed nudge.
            Hit <b>MIN</b> or <b>MAX</b> on any lever that's already at that end of its in-game range — the report stops
            suggesting that direction and moves to the next lever.
          </span>
          <div className="modal-actions">
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn" onClick={() => onConfirm({}, {})}>Skip &amp; record</button>
            <button className="btn rec" onClick={() => onConfirm(snapshot(), limits)}>Confirm &amp; record</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
