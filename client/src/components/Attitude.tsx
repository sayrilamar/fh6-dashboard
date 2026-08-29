import { Panel } from './Panel';
import { Canvas } from './Canvas';
import { getLatest, useTick } from '../store';
import { fmt } from '../format';

function draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const f = getLatest();
  const roll = f?.t.roll ?? 0; // radians
  const pitch = f?.t.pitch ?? 0;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) / 2 - 4;

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();

  ctx.translate(cx, cy);
  ctx.rotate(-roll);
  const horizon = pitch * 120;

  // sky
  ctx.fillStyle = '#1d3a5f';
  ctx.fillRect(-r * 2, -r * 2, r * 4, r * 2 + horizon);
  // ground
  ctx.fillStyle = '#3a2a1a';
  ctx.fillRect(-r * 2, horizon, r * 4, r * 2);
  // horizon line
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-r * 2, horizon);
  ctx.lineTo(r * 2, horizon);
  ctx.stroke();
  ctx.restore();

  // fixed aircraft marker
  ctx.strokeStyle = '#f0c828';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.moveTo(cx + 6, cy);
  ctx.lineTo(cx + 22, cy);
  ctx.stroke();

  ctx.strokeStyle = '#2a3340';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

export function Attitude() {
  useTick(8);
  const t = getLatest()?.t;
  const deg = (r?: number) => fmt(((r ?? 0) * 180) / Math.PI, 1);
  return (
    <Panel title="Attitude" span={3}>
      <div style={{ height: 130 }}>
        <Canvas draw={draw} />
      </div>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <span className="k">Roll</span>
        <span className="v">{deg(t?.roll)}°</span>
        <span className="k">Pitch</span>
        <span className="v">{deg(t?.pitch)}°</span>
      </div>
    </Panel>
  );
}
