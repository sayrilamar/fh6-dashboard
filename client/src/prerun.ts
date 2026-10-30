// Pre-run card rules that don't need the component (FH6-34).

// qi-trace: work-item="FH6-34" acceptance-criteria="AC-1, AC-3" risk-tier="high" test-coverage="tests/unit/prerun-confirm.test.ts"
// This run's planned changes that the card's boxes don't hold yet. A change made in the
// game but not typed into the card is recorded at its old value, and the next report
// repeats it as if it never happened: brake balance 61 % was set in the game before the
// 14:34 run of 2026-10-30, the card still held 67, and the report said 67 → 61 again.
// A planned change counts only when the card has a target for it (its suggested value).
export function unenteredChanges(
  planned: { channel: string; label: string }[],
  boxes: Record<string, string | undefined>,
  targets: Record<string, number>,
): { channel: string; label: string; entered: number | null; target: number }[] {
  const out: { channel: string; label: string; entered: number | null; target: number }[] = [];
  for (const p of planned) {
    const target = targets[p.channel];
    if (target == null) continue;
    const raw = boxes[p.channel];
    const entered = raw == null || raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw);
    if (entered != null && Math.abs(entered - target) <= 1e-9) continue;
    out.push({ channel: p.channel, label: p.label, entered, target });
  }
  return out;
}
