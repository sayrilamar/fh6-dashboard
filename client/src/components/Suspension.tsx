import { Panel } from './Panel';
import { getLatest, useTick } from '../store';
import { fmt } from '../format';
import type { Corners } from '../types';

const CORNERS: { key: keyof Corners; label: string }[] = [
  { key: 'fl', label: 'FL' },
  { key: 'fr', label: 'FR' },
  { key: 'rl', label: 'RL' },
  { key: 'rr', label: 'RR' },
];

function travelColor(n: number): string {
  if (n > 0.95 || n < 0.05) return 'var(--red)';
  if (n > 0.85 || n < 0.15) return 'var(--amber)';
  return 'var(--green)';
}

export function Suspension() {
  useTick(12);
  const f = getLatest();
  const t = f?.t;
  const vel = f?.d.susp.vel;

  return (
    <Panel title="Suspension — travel & damping" span={4}>
      {CORNERS.map(({ key, label }) => {
        const n = t?.normSusp[key] ?? 0.5;
        const inches = (t?.suspTravelM[key] ?? 0) * 39.3701;
        const v = (vel?.[key] ?? 0) * 39.3701; // in/s
        return (
          <div key={key} className="input-row">
            <span className="name">{label}</span>
            <div className="bar" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#fff3' }} />
              <span style={{ width: `${n * 100}%`, background: travelColor(n) }} />
            </div>
            <span className="pct" style={{ width: 92, fontSize: 10, color: 'var(--muted)' }}>
              {fmt(inches, 2)}in {v >= 0 ? '↓' : '↑'}{fmt(Math.abs(v), 1)}
            </span>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        0 = full droop · 1 = bottoming. Red = at travel limit (adjust ride height / springs / bump).
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Front avg</span>
        <span className="v">{fmt((f?.d.susp.frontTravel ?? 0) * 100)}%</span>
        <span className="k">Rear avg</span>
        <span className="v">{fmt((f?.d.susp.rearTravel ?? 0) * 100)}%</span>
      </div>
    </Panel>
  );
}
