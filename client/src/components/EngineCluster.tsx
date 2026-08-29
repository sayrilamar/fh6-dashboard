import { Panel } from './Panel';
import { Canvas } from './Canvas';
import { getLatest, useTick } from '../store';
import { fmt, gearLabel } from '../format';

const TAU = Math.PI * 2;
const START = Math.PI * 0.75; // 135deg
const SWEEP = Math.PI * 1.5; // 270deg

function drawTach(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const f = getLatest();
  const cx = w / 2;
  const cy = h * 0.92;
  const r = Math.min(w / 2, h) * 0.92;

  const maxRpm = f?.t.engineMaxRpm || 8000;
  const idle = f?.t.engineIdleRpm || 800;
  const rpm = f?.t.currentRpm || 0;
  const frac = maxRpm > 0 ? Math.min(1, rpm / maxRpm) : 0;
  const redlineFrac = 0.92;
  const shift = frac > 0.95;

  // Track
  ctx.lineCap = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#222b36';
  ctx.beginPath();
  ctx.arc(cx, cy, r, START, START + SWEEP);
  ctx.stroke();

  // Redline zone
  ctx.strokeStyle = '#5a1414';
  ctx.beginPath();
  ctx.arc(cx, cy, r, START + SWEEP * redlineFrac, START + SWEEP);
  ctx.stroke();

  // Value arc
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#34d3ff');
  grad.addColorStop(0.7, '#34d3ff');
  grad.addColorStop(1, '#f0c828');
  ctx.strokeStyle = shift ? '#f03232' : grad;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(cx, cy, r, START, START + SWEEP * frac);
  ctx.stroke();

  // Ticks + labels
  ctx.fillStyle = '#6b7787';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = maxRpm > 9000 ? 2000 : 1000;
  for (let v = 0; v <= maxRpm; v += step) {
    const a = START + SWEEP * (v / maxRpm);
    const x1 = cx + Math.cos(a) * (r - 22);
    const y1 = cy + Math.sin(a) * (r - 22);
    ctx.fillText(String(Math.round(v / 1000)), x1, y1);
  }

  // Shift light bar
  if (shift) {
    ctx.fillStyle = '#f03232';
    ctx.fillRect(cx - 40, cy - r - 6, 80, 6);
  }

  // Center readout
  ctx.fillStyle = shift ? '#ff6464' : '#e6edf3';
  ctx.font = '700 30px monospace';
  ctx.fillText(String(Math.round(rpm)), cx, cy - r * 0.42);
  ctx.fillStyle = '#6b7787';
  ctx.font = '10px monospace';
  ctx.fillText('RPM', cx, cy - r * 0.42 + 20);

  void idle;
}

export function EngineCluster() {
  useTick(12);
  const f = getLatest();
  const d = f?.d;
  const t = f?.t;

  return (
    <Panel title="Powertrain" span={5}>
      <div style={{ height: 150 }}>
        <Canvas draw={drawTach} />
      </div>
      <div className="cluster">
        <div className="gear-box">{t ? gearLabel(t.gear) : '–'}</div>
        <div style={{ flex: 1 }}>
          <div className="stat-grid">
            <span className="k">Power</span>
            <span className="v">{fmt(d?.powerHp)} hp</span>
            <span className="k">Torque</span>
            <span className="v">{fmt(d?.torqueLbFt)} lb·ft</span>
            <span className="k">Boost</span>
            <span className="v">{fmt(d?.boostPsi, 1)} psi</span>
          </div>
        </div>
        <div className="speed">
          <div className="big">{fmt(d?.speedMph)}</div>
          <div className="lbl">mph</div>
        </div>
      </div>
    </Panel>
  );
}
