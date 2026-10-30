---
id: FH6-4
title: Move the final-drive target calculation out of PreRunTune
type: chore
labels: [refactor, testability, gearing]
modules: [client/src/components/PreRunTune.tsx, client/src/gearing.ts]
depends_on: []
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate:
  id: ed7a1327-e6e0-4bbe-8f4a-277d2fa4f2d2
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-4 — Move the final-drive target calculation out of `PreRunTune`

As the developer, I want the final-drive target computed by a pure function,
so that the 4.07 → 5.57 feedback loop (fixed in `5cf8628`) can be pinned by a
unit test (FH6-5).

Split out of the original Story 1, whose gearing criterion assumed this was
already testable. It isn't: `finalDriveAdvice` never sees the live value, and
the loop lived in the pre-run screen's `useMemo`.

## Acceptance criteria

- **AC-1** The block in `PreRunTune.tsx` (around lines 132–158) moves into an
  exported function in `client/src/gearing.ts`, for example
  `finalDriveTarget(runTune, analytics, fallbackRatios)`. That block turns the
  recorded run's final drive and the solved scale into `out.finalDrive`.
- **AC-2** The function's inputs are the recorded run's tune, the analytics,
  and the fallback ratios the block uses today. No form value for the final
  drive is an input.
- **AC-3** `PreRunTune` calls the function, and the diff shows only the moved
  block replaced by the call. The explanatory comment moves with the code.
- **AC-4** `npm --prefix client run build` passes.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1): a
two-file edit to existing code, which also overlaps the very fix it protects.

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | Modifies `PreRunTune.tsx` (4 of 12 commits in 90 days; churn fallback). |
| Protection | WEAK | `PreRunTune.tsx` has no tests. |
| Trust | UNGRADED | `flake_history_unavailable`. |
| Outcome | WEAK | Pre-run screen escapes: the final-drive loop, the 41 % vs 75 % brake-balance mismatch, and the planner bypass. |

Team fit: dev. Bus factor: one deep slot on `client/src/components`.

## Done (2026-10-29)

- **New `finalDriveTarget(runTune, analytics, fallbackRatios)` in
  `client/src/gearing.ts`** (AC-1). It returns the recorded run's final drive
  times the solved scale, rounded to 2 decimals, or `null`. Its inputs are the
  run's tune, the analytics and the form's gears as fallback ratios. No form
  value for the final drive is an input (AC-2).
- **`PreRunTune.tsx`** (AC-3): the block is replaced by the call. The
  explanatory comment ("FINAL DRIVE IS SOLVED RELATIVE TO THE RUN, NOT TO THE
  FORM") moved with the code, and a two-line pointer remains. The import now
  takes `finalDriveTarget` instead of `finalDriveAdvice`.
- **Build:** `npm --prefix client run build` passes (AC-4). The unit suite is
  still 59/59.
- **Equivalence check:** a temporary test, deleted afterwards, ran the old
  inline block and the new function side by side. It covered all 12 recorded
  runs on 2026-10-29, each with five variants: as recorded, no final drive,
  one gear, no tune, and an empty form. All 60 comparisons matched, and 27 of
  them produce a target. The 6:09 PM run still gets 2.44.
- **Traceability:** `finalDriveTarget` carries a `qi-trace` marker for FH6-4
  with `test-coverage="TODO(qi-trace): FH6-5 adds the tests"`. FH6-5 should
  replace that with its test file path.

### Scope notes

- **Parallel path, not changed** (AC-3 limits the diff to `PreRunTune`). The
  Tuning Report's `FinalDrive` section in `Sessions.tsx` computes its own
  target. When the run has no recorded final drive, it scales the box's value
  (`cur * adv.scale`). That value can be the auto-written `.c.` recommendation
  from an earlier render, which is the same chase-your-own-output shape that
  `5cf8628` fixed here. Calling `finalDriveTarget` from the report would remove
  the second copy; candidate follow-up.
- **Unrelated files left uncommitted.** At 2026-10-30T02:15Z an Assert.IQ
  bootstrap from `~/assert-iq-agent-pack` (branch
  `dreaming-runtime-local-only`, `e93c955`) rewrote
  `.assert-iq/.install-manifest.json` and `.github/skills/dream/SKILL.md` in
  this worktree. They are not part of this story.
