import { TIRE } from './constants';

export const fmt = (n: number | undefined | null, d = 0): string =>
  n == null || !isFinite(n) ? '–' : n.toFixed(d);

export function lapTime(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || sec <= 0) return '--:--.---';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}

export function gearLabel(gear: number): string {
  if (gear === 0) return 'R';
  if (gear === 11) return 'N';
  return String(gear);
}

// Map a tire temp (F) to a heat color across cold->ideal->hot->critical.
export function tireColor(f: number): string {
  if (f < TIRE.cold) {
    const t = clamp((f - 68) / (TIRE.cold - 68), 0, 1); // 68F..cold
    return mix([40, 90, 200], [40, 200, 180], t); // deep blue -> teal
  }
  if (f < TIRE.ideal) {
    const t = (f - TIRE.cold) / (TIRE.ideal - TIRE.cold);
    return mix([40, 200, 180], [60, 220, 90], t); // teal -> green
  }
  if (f < TIRE.hot) {
    const t = (f - TIRE.ideal) / (TIRE.hot - TIRE.ideal);
    return mix([60, 220, 90], [240, 200, 40], t); // green -> amber
  }
  const t = clamp((f - TIRE.hot) / (TIRE.critical - TIRE.hot), 0, 1);
  return mix([240, 200, 40], [240, 50, 40], t); // amber -> red
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function mix(a: number[], b: number[], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}
