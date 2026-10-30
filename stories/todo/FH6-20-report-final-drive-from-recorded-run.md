---
id: FH6-20
title: Make the report's final-drive target come from the recorded run
type: bug
labels: [tuning-report, gearing]
modules: [client/src/components/Sessions.tsx, tests/unit]
depends_on: [FH6-4, FH6-5]
created: 2026-10-29
started: null
completed: null
points: null
estimate:
  id: 144a01f2-d2e7-4de3-a4a1-df65821bbb59
  date: 2026-10-29
  range: "1-8"
  confidence: low
  verdict: estimable
  anchor: "5cf8628 (1)"
---

# FH6-20 — Make the report's final-drive target come from the recorded run

As the driver, I want the Tuning Report's final-drive target to match the
pre-run screen's for the same run, so that the two screens never disagree
and the report can't chase its own recommendation.

## What's wrong (latent, found in review 2026-10-29)

FH6-4 moved the pre-run screen's final-drive target into
`finalDriveTarget()`, and FH6-5 pinned it to the recorded run. The Tuning
Report's `FinalDrive` section (`client/src/components/Sessions.tsx`, around
lines 1145–1195 at `c80e1a3`) still computes its own target, and it differs
in three ways:

- **It scales the box value when the run has no recorded final drive**
  (`cur * adv.scale`). That is the shape of the `5cf8628` loop. On mount,
  `cur` can come from `fh6.finaldrive.c.<car>`, which this same section
  auto-writes from its target. So for runs without a confirmed tune, each
  fresh render can scale the previous render's recommendation again.
- **Its percentage is the advice's**, not the move from the box value to the
  target. If the box differs from the recorded final drive, the arrow and
  the percentage describe two different moves. This is the label/target
  mismatch that FH6-19 removed from the alignment rows.
- **It is a second copy of the rule** ([[recurring-defects]] § parallel code
  paths). The two copies agree today only because both use the recorded
  final drive when there is one.

Not yet observed on a real run: every race recorded on 2026-10-29 had a
confirmed tune with a final drive. The ratio source is already equivalent:
the report's `tuneToRatios(s.meta.tune)` gives the same advice as
`finalDriveTarget(s.meta.tune, s.analytics, {})`, since fewer than two gears
falls back to the rev-limit rule either way.

## Acceptance criteria

- **AC-1** The report's target is
  `finalDriveTarget(s.meta?.tune, s.analytics, {})`, so the report and the
  pre-run screen show the same number for the same run. On the 6:09 PM run
  of 2026-10-29 both show 2.44.
- **AC-2** When the run has no recorded final drive, the report shows the
  advice (direction and %) but no target number. It says to confirm the
  tune before the next run to get one, and it never multiplies the box
  value.
- **AC-3** `fh6.finaldrive.c.<car>` is written only when there is a
  recorded-run target.
- **AC-4** The percentage beside the target describes the move from the box
  value to the target. When the box is empty, it shows the advice's %.
- **AC-5** The report's no-target and percentage rules are unit-tested.
  Extract them to a pure function if that's what makes them testable.
  `npm run test:unit` passes, and putting the `cur * adv.scale` fallback
  back fails a test.

## Notes

- Keep FH6-4's rule intact: no form value for the final drive is an input
  to the target.
- `finalDriveTarget`'s tests (`tests/unit/final-drive-target.test.ts`)
  already cover the target itself. This story adds the report's display
  rules on top.

## Estimate (2026-10-29)

Range **1–8** · confidence low · verdict estimable · anchor `5cf8628` (1): the same kind
of work as the pre-run final-drive fix, in one existing component plus a test.

| Layer | State | Why |
|---|---|---|
| Change risk | WEAK | Modifies `Sessions.tsx` (V=10, top of the watchlist at `c80e1a3`). |
| Protection | WEAK | `Sessions.tsx` has no tests in place; the report's display rules need a new testable seam. |
| Trust | UNGRADED | `flake_history_unavailable`. The ACs have Minor issues only. |
| Outcome | WEAK | Escape cluster on `Sessions.tsx` (FH6-17, 18 and 19); `history_insufficient`. |

Team fit: dev, plus QA (no QA slot). Bus factor: one deep slot on
`client/src/components`. Full report: `story-estimate.md`.
