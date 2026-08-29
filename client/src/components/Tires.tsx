import { Panel } from './Panel';
import { getLatest, useTick } from '../store';
import { fmt, tireColor } from '../format';
import { TIRE } from '../constants';
import type { Corners } from '../types';

const CORNERS: { key: keyof Corners; label: string }[] = [
  { key: 'fl', label: 'FRONT LEFT' },
  { key: 'fr', label: 'FRONT RIGHT' },
  { key: 'rl', label: 'REAR LEFT' },
  { key: 'rr', label: 'REAR RIGHT' },
];

function Tire({ ck }: { ck: keyof Corners }) {
  const f = getLatest();
  const t = f?.t;
  const tempF = t?.tireTempF[ck] ?? 0;
  const slip = Math.abs(t?.slipRatio[ck] ?? 0);
  const angle = Math.abs(t?.slipAngle[ck] ?? 0);
  const wear = t?.tireWear ? t.tireWear[ck] * 100 : null;
  const heatPct = Math.max(0, Math.min(100, ((tempF - 104) / (TIRE.critical - 104)) * 100));

  return (
    <div className="tire">
      <div className="corner">{CORNERS.find((c) => c.key === ck)!.label}</div>
      <div className="temp" style={{ color: tireColor(tempF) }}>
        {fmt(tempF)}°<span style={{ fontSize: 12, color: 'var(--muted)' }}>F</span>
      </div>
      <div className="heatbar">
        <div style={{ height: '100%', width: `${heatPct}%`, background: tireColor(tempF), borderRadius: 3 }} />
      </div>
      <div className="sub">
        <span>slip {fmt(slip * 100)}%</span>
        <span>∠{fmt(angle, 1)}°</span>
        {wear != null && <span>wear {fmt(wear)}%</span>}
      </div>
    </div>
  );
}

export function Tires() {
  useTick(10);
  return (
    <Panel title="Tire Thermals & Grip" span={4}>
      <div className="tire-grid">
        {CORNERS.map((c) => (
          <Tire key={c.key} ck={c.key} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8, textAlign: 'center' }}>
        ideal window {TIRE.cold}–{TIRE.hot}°F · blue cold · green ideal · red hot
      </div>
    </Panel>
  );
}
