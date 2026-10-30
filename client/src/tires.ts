// Tire-pressure advice from tire temperature, out of Sessions.tsx so the unit suite can check
// it (FH6-28). The rule itself is under review: FH6-27 measures what pressure moves in FH6,
// and FH6-26 waits on it.

import { eventLabel, isLooseSurface } from './events';
import type { EventType, SessionAnalytics } from './types';

// qi-trace: work-item="FH6-28" acceptance-criteria="AC-4" risk-tier="high" test-coverage="tests/unit/events.test.ts"
export function tireDeltas(a: SessionAnalytics, ev?: EventType): Record<string, { d: number; why: string }> {
  const tp = a.tires;
  const o: Record<string, { d: number; why: string }> = {};
  if (!tp) return o;
  // The temperature window is a tarmac rule. On dirt a water crossing alone cools the
  // tires ~45 °F, so hold until FH6-27 measures what pressure does there (FH6-28).
  if (isLooseSurface(ev)) {
    const why = `${eventLabel(ev)} event — the tire-temperature window isn't measured on loose surfaces, so pressure holds`;
    return { frontPsi: { d: 0, why }, rearPsi: { d: 0, why } };
  }
  const half = (n: number) => Math.round(n * 2) / 2; // 0.5-psi steps
  // PRESSURE → TEMPERATURE DIRECTION. Pressure controls sidewall FLEX, and flex is what
  // generates heat, so this runs the real-world way in FH6:
  //   LOWER psi → more flex → tires HEAT UP.   RAISE psi → less flex → tires COOL DOWN.
  // This was inverted here originally ("cold → RAISE pressure to warm them"), which drove
  // cold tires further out of the window on every run. FH6 community physics guides state
  // the real-world direction explicitly: lower 0.5 psi when tires stay cold, raise 0.5 psi
  // when they overheat.
  const end = (temp: number, label: string): { d: number; why: string } => {
    const err = temp - tp.idealF; // + = hot, − = cold
    if (err > 15) return { d: Math.min(3, Math.max(0.5, half(err / 15))), why: `${label} tires run hot (${temp}°F vs ${tp.idealF} ideal) — RAISE pressure to cut sidewall flex so they stop building heat` };
    if (err < -15) return { d: -Math.min(3, Math.max(0.5, half(-err / 15))), why: `${label} tires run cold (${temp}°F vs ${tp.idealF} ideal) — LOWER pressure so the sidewall flexes more and builds heat` };
    return { d: 0, why: `${label} tires in the grip window (${temp}°F) — hold` };
  };
  o.frontPsi = end(tp.frontTempF, 'Front');
  o.rearPsi = end(tp.rearTempF, 'Rear');
  return o;
}
