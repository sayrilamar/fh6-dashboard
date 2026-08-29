import { Panel } from './Panel';
import { getLapDelta, getLatest, useTick } from '../store';
import { fmt, lapTime } from '../format';

export function Laps() {
  useTick(10);
  const t = getLatest()?.t;
  const cur = t?.currentLap ?? 0;
  const best = t?.bestLap ?? 0;
  // Gap to the best lap AT THIS POINT ON TRACK. Comparing the running lap clock
  // to the best lap's total is not a delta — it just counts up to the best time,
  // reading "ahead" for the whole lap and only turning red once the lap is lost.
  const { delta, refLapTime } = getLapDelta();

  return (
    <Panel title="Lap Timing" span={3}>
      <div className="readout" style={{ marginBottom: 6 }}>
        <span className="val" style={{ color: 'var(--accent)' }}>{lapTime(cur)}</span>
        <span className="lbl">current</span>
      </div>
      <div className="stat-grid">
        <span className="k">Best</span>
        <span className="v">{lapTime(best)}</span>
        <span className="k">Last</span>
        <span className="v">{lapTime(t?.lastLap)}</span>
        <span className="k">Delta</span>
        <span className="v" style={{ color: delta == null ? 'var(--muted)' : delta <= 0 ? 'var(--green)' : 'var(--red)' }}>
          {delta == null ? '–' : `${delta >= 0 ? '+' : ''}${delta.toFixed(3)}`}
        </span>
        <span className="k">Lap</span>
        <span className="v">{t?.lapNumber ?? 0}</span>
        <span className="k">Position</span>
        <span className="v">P{t?.racePosition ?? '–'}</span>
        <span className="k">Distance</span>
        <span className="v">{fmt((t?.distanceTraveled ?? 0) / 1609.344, 2)} mi</span>
        <span className="k">Fuel</span>
        <span className="v">{fmt((t?.fuel ?? 0) * 100)}%</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
        {refLapTime != null
          ? `delta vs best lap (${lapTime(refLapTime)}) at this point on track`
          : 'delta available once a reference lap is completed'}
      </div>
    </Panel>
  );
}
