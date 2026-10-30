// Changes per run (FH6-30): one per lever group (the default) or one. Remembered in this
// browser; the report and the pre-run card re-plan together when it changes.

import { useSyncExternalStore } from 'react';
import type { PerRun } from './plan';

const KEY = 'fh6.perRun';
const listeners = new Set<() => void>();

export function getPerRun(): PerRun {
  try { return localStorage.getItem(KEY) === 'one' ? 'one' : 'group'; } catch { return 'group'; }
}

export function setPerRun(v: PerRun) {
  try { localStorage.setItem(KEY, v); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function usePerRun(): PerRun {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, getPerRun);
}
