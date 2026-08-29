import { Panel } from './Panel';
import { Canvas } from './Canvas';
import { getLatest, getPowerBand, getShiftInfo, useTick } from '../store';
import { fmt } from '../format';

function draw(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const pad = { l: 34, r: 38, t: 10, b: 18 };
  const pts = getPowerBand();
  const f = getLatest();
  const maxRpm = f?.t.engineMaxRpm || 8000;

  const x = (rpm: number) => pad.l + (rpm / maxRpm) * (w - pad.l - pad.r);
  const plotH = h - pad.t - pad.b;

  // axes
  ctx.strokeStyle = '#2a3340';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, h - pad.b);
  ctx.lineTo(w - pad.r, h - pad.b);
  ctx.stroke();

  // rpm gridlines
  ctx.fillStyle = '#6b7787';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  const step = maxRpm > 9000 ? 2000 : 1000;
  for (let v = 0; v <= maxRpm; v += step) {
    const px = x(v);
    ctx.strokeStyle = '#1c242f';
    ctx.beginPath();
    ctx.moveTo(px, pad.t);
    ctx.lineTo(px, h - pad.b);
    ctx.stroke();
    ctx.fillStyle = '#6b7787';
    ctx.fillText(String(v / 1000), px, h - 5);
  }

  if (pts.length < 2) {
    ctx.fillStyle = '#6b7787';
    ctx.textAlign = 'center';
    ctx.fillText('Hold full throttle to map the power band…', w / 2, h / 2);
    return;
  }

  const maxHp = Math.max(...pts.map((p) => p.hp), 1);
  const maxTq = Math.max(...pts.map((p) => p.torque), 1);
  const scaleTop = Math.max(maxHp, maxTq) * 1.1;

  const yHp = (v: number) => pad.t + plotH * (1 - v / scaleTop);

  // torque line (amber)
  ctx.strokeStyle = '#f0c828';
  ctx.lineWidth = 2;
  ctx.beginPath();
  pts.forEach((p, i) => {
    const px = x(p.rpm);
    const py = yHp(p.torque);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.stroke();

  // power line (cyan)
  ctx.strokeStyle = '#34d3ff';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const px = x(p.rpm);
    const py = yHp(p.hp);
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  });
  ctx.stroke();

  // peak power marker
  const peak = pts.reduce((a, b) => (b.hp > a.hp ? b : a), pts[0]);
  const ppx = x(peak.rpm);
  ctx.strokeStyle = '#34d3ff';
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(ppx, pad.t);
  ctx.lineTo(ppx, h - pad.b);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#34d3ff';
  ctx.textAlign = 'left';
  ctx.fillText(`peak ${Math.round(peak.hp)}hp @ ${Math.round(peak.rpm)}`, ppx + 4, pad.t + 10);

  // average shift point (green dashed) — where the driver is actually upshifting
  const { redline, avgShiftRpm } = getShiftInfo();
  if (avgShiftRpm > 0) {
    const sx = x(avgShiftRpm);
    ctx.strokeStyle = '#3cdc5a';
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(sx, pad.t);
    ctx.lineTo(sx, h - pad.b);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#3cdc5a';
    ctx.textAlign = 'right';
    ctx.fillText(`shift ${Math.round(avgShiftRpm)}`, sx - 4, pad.t + 22);
  }

  // redline (red) at the engine's max rpm
  if (redline > 0) {
    const rx = x(redline);
    ctx.strokeStyle = '#f03232';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, pad.t);
    ctx.lineTo(rx, h - pad.b);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // current rpm cursor
  const rpm = f?.t.currentRpm || 0;
  const cx = x(rpm);
  ctx.strokeStyle = '#ffffff55';
  ctx.beginPath();
  ctx.moveTo(cx, pad.t);
  ctx.lineTo(cx, h - pad.b);
  ctx.stroke();
}

export function PowerBand() {
  useTick(6);
  const f = getLatest();
  const { redline, avgShiftRpm, lastShiftRpm } = getShiftInfo();
  return (
    <Panel title="Power Band — gearing & shift points" span={7}>
      <div style={{ height: 200 }}>
        <Canvas draw={draw} />
      </div>
      <div className="stat-row" style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
        <span style={{ color: 'var(--accent)' }}>■ Power (hp)</span>
        <span style={{ color: 'var(--amber)' }}>■ Torque (lb·ft)</span>
        <span>now {fmt(f?.t.currentRpm)} rpm</span>
      </div>
      <div className="stat-row" style={{ fontSize: 11, marginTop: 4 }}>
        <span style={{ color: 'var(--red)' }}>redline {redline ? fmt(redline) : '—'}</span>
        <span style={{ color: 'var(--green)' }}>
          shift {avgShiftRpm ? `~${fmt(avgShiftRpm)}` : '—'}
          {lastShiftRpm ? <span style={{ color: 'var(--muted)' }}> (last {fmt(lastShiftRpm)})</span> : null}
        </span>
      </div>
    </Panel>
  );
}
