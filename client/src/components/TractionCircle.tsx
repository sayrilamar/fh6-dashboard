import { Panel } from './Panel';
import { Canvas } from './Canvas';
import { getLatest, getHistory, getGGEnvelope, useTick } from '../store';
import { fmt, clamp } from '../format';

const G_MAX = 2.5; // full-scale of the diagram (g)

function draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 14;
  const scale = r / G_MAX;
  // accel vector → screen: +lateral right, +long (accel) up, -long (brake) down.
  const X = (lat: number) => cx + clamp(lat / G_MAX, -1, 1) * r;
  const Y = (lon: number) => cy - clamp(lon / G_MAX, -1, 1) * r;

  // grip rings every 0.5 g
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  for (let g = 0.5; g <= G_MAX; g += 0.5) {
    ctx.strokeStyle = g === Math.round(G_MAX) ? '#384150' : '#222b36';
    ctx.beginPath();
    ctx.arc(cx, cy, g * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#4a5666';
    ctx.fillText(`${g.toFixed(1)}`, cx + g * scale + 7, cy + 3);
  }
  // axes
  ctx.strokeStyle = '#2a3340';
  ctx.beginPath();
  ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
  ctx.stroke();

  // session envelope hull (grip the car has actually used, clean frames)
  const env = getGGEnvelope();
  if (env.points.length >= 3) {
    ctx.beginPath();
    env.points.forEach((p, i) => {
      const px = X(p.lat), py = Y(p.long);
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(52,211,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(52,211,255,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // recent trail
  const tail = getHistory().slice(-150);
  tail.forEach((s, i) => {
    ctx.fillStyle = `rgba(240,200,40,${(i / tail.length) * 0.5})`;
    ctx.beginPath();
    ctx.arc(X(s.gLat), Y(s.gLong), 1.6, 0, Math.PI * 2);
    ctx.fill();
  });

  // current g dot
  const f = getLatest();
  if (f) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(X(f.d.g.lat), Y(f.d.g.long), 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // quadrant labels
  ctx.fillStyle = '#6b7787';
  ctx.fillText('ACCEL', cx, cy - r + 9);
  ctx.fillText('BRAKE', cx, cy + r - 2);
  ctx.textAlign = 'left';
  ctx.fillText('LAT →', cx + 6, cy - 5);
  ctx.textAlign = 'right';
  ctx.fillText('← LAT', cx - 6, cy - 5);
}

export function TractionCircle() {
  useTick(8);
  const f = getLatest();
  const combined = f?.d.g.combined ?? 0;
  return (
    <Panel title="Traction Circle — g-g (live + session hull)" span={4}>
      <div style={{ height: 220 }}>
        <Canvas draw={draw} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
        <span style={{ color: '#fff' }}>● now</span> · <span style={{ color: 'var(--amber)' }}>trail</span> ·{' '}
        <span style={{ color: 'var(--accent)' }}>session grip hull</span> (clean frames; resets per car)
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Now combined</span>
        <span className="v">{fmt(combined, 2)} g</span>
      </div>
    </Panel>
  );
}
