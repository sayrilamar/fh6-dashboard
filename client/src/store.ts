import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Frame, RecordingStatus, SessionSummary } from './types';

// ---- WebSocket URL --------------------------------------------------------
// Same-origin in production (server serves the built client). In Vite dev the
// page is on :5173 while the server WS is on :8080.
function wsUrl(): string {
  const env = (import.meta as any).env?.VITE_WS_URL;
  if (env) return env;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const port = location.port === '5173' ? '8080' : location.port || '8080';
  return `${proto}//${location.hostname}:${port}`;
}

// ---- Mutable singleton state ----------------------------------------------
const HISTORY_LEN = 900; // ~15s at 60Hz

export interface Sample {
  ts: number;
  throttle: number;
  brake: number;
  clutch: number;
  steer: number;
  gLat: number;
  gLong: number;
  rpm: number;
  hp: number;
  torque: number;
  speedKph: number;
}

let latest: Frame | null = null;
const history: Sample[] = [];
const powerBand = new Map<number, { hp: number; torque: number }>();
let curCarOrdinal = -1;

// Live shift-point tracking: rpm captured at each upshift (rolling window).
const shiftRpms: number[] = [];
let prevGear: number | null = null;
let prevRpm = 0;

// g-g traction envelope: max grip radius used per angle bin, over clean frames
// this session. Reset on car change. Builds the "hull" of grip the car has used.
const GG_BINS = 72; // 5° each
const ggEnv = new Float32Array(GG_BINS);
let ggPeakLat = 0;
let ggPeakAccel = 0;
let ggPeakBrake = 0;

function ggClean(f: Frame): boolean {
  const t = f.t;
  if (!t.isRaceOn) return false;
  const r = t.rumble, p = t.puddle, cs = t.combinedSlip;
  if (r && Math.max(r.fl, r.fr, r.rl, r.rr) > 0.1) return false;
  if (p && Math.max(p.fl, p.fr, p.rl, p.rr) > 0.1) return false;
  if (Math.max(Math.abs(cs.fl), Math.abs(cs.fr), Math.abs(cs.rl), Math.abs(cs.rr)) > 1.0) return false;
  if (f.d.g.combined > 3.0) return false;
  return true;
}

// Meta (low-frequency) state for React via useSyncExternalStore
let meta = {
  connected: false,
  recording: { recording: false } as RecordingStatus,
  sessions: [] as SessionSummary[],
  lastSession: null as SessionSummary | null,
  wsOpen: false,
};
const metaListeners = new Set<() => void>();
function setMeta(patch: Partial<typeof meta>) {
  meta = { ...meta, ...patch };
  metaListeners.forEach((l) => l());
}

export function getLatest(): Frame | null {
  return latest;
}
export function getHistory(): Sample[] {
  return history;
}
export function getPowerBand(): { rpm: number; hp: number; torque: number }[] {
  return [...powerBand.entries()].sort((a, b) => a[0] - b[0]).map(([rpm, v]) => ({ rpm, ...v }));
}
export function getGGEnvelope(): { points: { lat: number; long: number }[]; peakLat: number; peakAccel: number; peakBrake: number } {
  const points: { lat: number; long: number }[] = [];
  for (let i = 0; i < GG_BINS; i++) {
    const r = ggEnv[i];
    if (r <= 0) continue;
    const a = (i + 0.5) * ((Math.PI * 2) / GG_BINS) - Math.PI;
    points.push({ lat: r * Math.cos(a), long: r * Math.sin(a) });
  }
  return { points, peakLat: ggPeakLat, peakAccel: ggPeakAccel, peakBrake: ggPeakBrake };
}
export function getShiftInfo(): { redline: number; lastShiftRpm: number; avgShiftRpm: number } {
  const redline = latest?.t.engineMaxRpm || 0;
  const last = shiftRpms.length ? shiftRpms[shiftRpms.length - 1] : 0;
  const avg = shiftRpms.length
    ? Math.round(shiftRpms.reduce((a, b) => a + b, 0) / shiftRpms.length)
    : 0;
  return { redline, lastShiftRpm: last, avgShiftRpm: avg };
}

function ingest(frame: Frame) {
  latest = frame;
  const { t, d } = frame;

  if (t.carOrdinal !== curCarOrdinal) {
    curCarOrdinal = t.carOrdinal;
    powerBand.clear();
    shiftRpms.length = 0;
    prevGear = null;
    ggEnv.fill(0);
    ggPeakLat = ggPeakAccel = ggPeakBrake = 0;
  }

  // g-g envelope: bin the clean accel vector by angle, keep the max radius.
  if (ggClean(frame)) {
    const lat = d.g.lat, lon = d.g.long;
    const rad = Math.hypot(lat, lon);
    const ang = Math.atan2(lon, lat) + Math.PI; // 0..2π
    const bin = Math.min(GG_BINS - 1, Math.floor((ang / (Math.PI * 2)) * GG_BINS));
    if (rad > ggEnv[bin]) ggEnv[bin] = rad;
    ggPeakLat = Math.max(ggPeakLat, Math.abs(lat));
    if (lon > 0) ggPeakAccel = Math.max(ggPeakAccel, lon);
    else ggPeakBrake = Math.max(ggPeakBrake, -lon);
  }

  // Capture the rpm just before each upshift (ignore downshifts / N / R).
  if (t.isRaceOn) {
    if (prevGear != null && prevGear >= 1 && t.gear > prevGear && prevRpm > 0) {
      shiftRpms.push(prevRpm);
      if (shiftRpms.length > 12) shiftRpms.shift();
    }
    prevGear = t.gear;
    prevRpm = t.currentRpm;
  }

  history.push({
    ts: frame.ts,
    throttle: t.throttle,
    brake: t.brake,
    clutch: t.clutch,
    steer: t.steer,
    gLat: d.g.lat,
    gLong: d.g.long,
    rpm: t.currentRpm,
    hp: d.powerHp,
    torque: d.torqueLbFt,
    speedKph: d.speedKph,
  });
  if (history.length > HISTORY_LEN) history.shift();

  if (t.isRaceOn && t.throttle > 0.9 && t.currentRpm > 0) {
    const bin = Math.round(t.currentRpm / 200) * 200;
    const cur = powerBand.get(bin) || { hp: 0, torque: 0 };
    cur.hp = Math.max(cur.hp, d.powerHp);
    cur.torque = Math.max(cur.torque, d.torqueLbFt);
    powerBand.set(bin, cur);
  }
}

// ---- Connection -----------------------------------------------------------
let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

export function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  try {
    ws = new WebSocket(wsUrl());
  } catch {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => setMeta({ wsOpen: true });
  ws.onclose = () => {
    setMeta({ wsOpen: false, connected: false });
    scheduleReconnect();
  };
  ws.onerror = () => ws?.close();
  ws.onmessage = (ev) => {
    let msg: any;
    try { msg = JSON.parse(ev.data); } catch { return; }
    switch (msg.type) {
      case 'telemetry':
        ingest(msg as Frame);
        if (!meta.connected) setMeta({ connected: true });
        break;
      case 'hello':
        setMeta({
          connected: !!msg.connected,
          recording: msg.recording || { recording: false },
          sessions: msg.sessions || [],
        });
        if (msg.last) ingest(msg.last);
        break;
      case 'status':
        setMeta({ connected: !!msg.connected, recording: msg.recording || { recording: false } });
        break;
      case 'recording':
        setMeta({ recording: msg.status || { recording: false } });
        break;
      case 'session-saved':
        setMeta({ sessions: msg.sessions || [], lastSession: msg.summary || null });
        break;
      case 'sessions':
        setMeta({ sessions: msg.sessions || [] });
        break;
    }
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 1500);
}

export function send(cmd: object) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(cmd));
}

// Clear the auto-shown tuning report so a previous run can't be mistaken for a
// new one. The saved-session history is untouched and still selectable.
export function dismissReport() {
  setMeta({ lastSession: null });
}

// ---- React hooks ----------------------------------------------------------
export function useMeta() {
  return useSyncExternalStore(
    (cb) => {
      metaListeners.add(cb);
      return () => metaListeners.delete(cb);
    },
    () => meta
  );
}

// Re-render at a fixed cadence (for numeric readouts) without re-rendering per packet.
export function useTick(fps = 12): number {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);
  const ref = useRef(0);
  return ++ref.current;
}

// Drive a canvas draw callback via requestAnimationFrame.
export function useAnimationFrame(cb: () => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      cbRef.current();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
}
