import { Panel } from './Panel';
import { Canvas } from './Canvas';
import { getLatest, getHistory, useTick } from '../store';
import { fmt, clamp } from '../format';

const G_MAX = 2.0;

function drawTraction(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 8;

  // grid rings (0.5g each)
  ctx.strokeStyle = '#222b36';
  ctx.fillStyle = '#6b7787';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  for (let g = 0.5; g <= G_MAX; g += 0.5) {
    const rr = (g / G_MAX) * r;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
  ctx.stroke();

  // LOAD-TRANSFER view: BOTH axes are negated, so the dot sits on the corner of
  // the car the weight is transferring ONTO — the load the tires actually take,
  // which is what you tune against. Turn right, the dot swings left (outside);
  // brake, it moves forward (up); get on the power, it settles back (down).
  const X = (lat: number) => cx - clamp(lat / G_MAX, -1, 1) * r;
  const Y = (lon: number) => cy + clamp(lon / G_MAX, -1, 1) * r;

  // trailing dots (grip history)
  const hist = getHistory();
  const tail = hist.slice(-120);
  tail.forEach((s, i) => {
    ctx.fillStyle = `rgba(52,211,255,${(i / tail.length) * 0.5})`;
    ctx.beginPath();
    ctx.arc(X(s.gLat), Y(s.gLong), 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // current
  const f = getLatest();
  if (f) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(X(f.d.g.lat), Y(f.d.g.long), 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#6b7787';
  ctx.fillText('BRAKE', cx, cy - r + 8);
  ctx.fillText('ACCEL', cx, cy + r - 4);
}

export function GripBalance() {
  useTick(10);
  const f = getLatest();
  const d = f?.d;
  const bal = d?.balance.angleBalance ?? 0;
  // -ve understeer, +ve oversteer; map to -100..100
  const balPct = clamp(bal * 20, -100, 100);
  const tendency = Math.abs(bal) < 1 ? 'Neutral' : bal > 0 ? 'Oversteer' : 'Understeer';
  const tendColor = Math.abs(bal) < 1 ? 'var(--green)' : bal > 0 ? 'var(--red)' : 'var(--amber)';

  return (
    <Panel title="Grip & Balance" span={4}>
      <div style={{ height: 150 }}>
        <Canvas draw={drawTraction} />
      </div>

      <div className="bar" style={{ marginTop: 8, position: 'relative' }}>
        <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: '#fff5' }} />
        <span
          style={{
            position: 'absolute',
            left: balPct >= 0 ? '50%' : `${50 + balPct / 2}%`,
            width: `${Math.abs(balPct) / 2}%`,
            background: tendColor,
            height: '100%',
          }}
        />
      </div>
      <div className="balance-label">
        <b style={{ color: tendColor }}>{tendency}</b>
        <span style={{ color: 'var(--muted)' }}> · F {fmt(d?.balance.frontSlipAngle, 1)}° / R {fmt(d?.balance.rearSlipAngle, 1)}°</span>
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Lat G</span>
        <span className="v">{fmt(d?.g.lat, 2)}</span>
        <span className="k">Long G</span>
        <span className="v">{fmt(d?.g.long, 2)}</span>
        <span className="k">Grip used</span>
        <span className="v">{fmt((d?.gripUsage.max ?? 0) * 100)}%</span>
        <span className="k">Wheelslip</span>
        <span className="v">{fmt((d?.driven.drivenSlip ?? 0) * 100)}%</span>
      </div>
    </Panel>
  );
}
