import { Panel } from './Panel';
import { Canvas } from './Canvas';
import { getHistory, getLatest, useTick } from '../store';
import { fmt } from '../format';

function drawTrace(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const hist = getHistory();
  if (hist.length < 2) return;
  const n = Math.min(hist.length, 600);
  const data = hist.slice(-n);
  const x = (i: number) => (i / (n - 1)) * w;

  // midline for steering
  ctx.strokeStyle = '#1c242f';
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.stroke();

  const line = (get: (s: (typeof data)[0]) => number, color: string, mapY: (v: number) => number) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    data.forEach((s, i) => {
      const px = x(i);
      const py = mapY(get(s));
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.stroke();
  };

  const yPct = (v: number) => h - v * h; // 0..1 -> bottom..top
  line((s) => s.throttle, '#3cdc5a', yPct);
  line((s) => s.brake, '#f03232', yPct);
  line((s) => (s.steer + 1) / 2, '#34d3ff', (v) => h - v * h);
}

export function Inputs() {
  useTick(12);
  const f = getLatest();
  const t = f?.t;
  const bar = (v: number, color: string) => (
    <div className="bar">
      <span style={{ width: `${Math.max(0, Math.min(1, v)) * 100}%`, background: color }} />
    </div>
  );

  return (
    <Panel title="Driver Inputs" span={4}>
      <div style={{ height: 90, marginBottom: 8 }}>
        <Canvas draw={drawTrace} />
      </div>
      <div className="input-row">
        <span className="name" style={{ color: 'var(--green)' }}>Throttle</span>
        {bar(t?.throttle ?? 0, 'var(--green)')}
        <span className="pct">{fmt((t?.throttle ?? 0) * 100)}</span>
      </div>
      <div className="input-row">
        <span className="name" style={{ color: 'var(--red)' }}>Brake</span>
        {bar(t?.brake ?? 0, 'var(--red)')}
        <span className="pct">{fmt((t?.brake ?? 0) * 100)}</span>
      </div>
      <div className="input-row">
        <span className="name" style={{ color: 'var(--amber)' }}>Clutch</span>
        {bar(t?.clutch ?? 0, 'var(--amber)')}
        <span className="pct">{fmt((t?.clutch ?? 0) * 100)}</span>
      </div>
      <div className="input-row">
        <span className="name" style={{ color: 'var(--accent)' }}>Steer</span>
        <div className="bar" style={{ position: 'relative' }}>
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 1, background: '#fff3' }} />
          <span
            style={{
              position: 'absolute',
              left: (t?.steer ?? 0) >= 0 ? '50%' : `${50 + (t?.steer ?? 0) * 50}%`,
              width: `${Math.abs(t?.steer ?? 0) * 50}%`,
              background: 'var(--accent)',
              height: '100%',
            }}
          />
        </div>
        <span className="pct">{fmt((t?.steer ?? 0) * 100)}</span>
      </div>
    </Panel>
  );
}
