---
id: FH6-25
title: Treat a marked MIN or MAX as a hard threshold for every target
type: bug
labels: [escape, tuning-report]
modules: [client/src/limits.ts, client/src/plan.ts, client/src/handling.ts, client/src/damping.ts, client/src/components/Sessions.tsx, client/src/components/PreRunTune.tsx, tests/unit]
depends_on: [FH6-22]
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate: null        # not run through /estimate-story
---

# FH6-25 — Treat a marked MIN or MAX as a hard threshold for every target

As the driver, I want a setting I've marked at its in-game maximum or minimum
to never be recommended past that value, so that the report doesn't ask for a
change the game won't accept.

## What happened (escape, found 2026-10-29)

On the 6:09 PM run (car #634), front downforce was marked **MAX at 120** on the
pre-run card. The Tuning Report's Front · Downforce row showed **"→ 138, +15%"**
right beside "blocked · you've marked this at its maximum (120)".

- **Where the marks live:** every setting on the pre-run card has MIN/MAX chips,
  gear ratios and final drive included. They are saved with the run as
  `meta.limits`.
- **Only the planner read them.** It **blocked** the lever, but it left the
  candidate's target at the over-the-limit value (`to` = 120 × 1.15 = 138).
- **Everything else defers to the planner's target.** Every report row and
  every section's saved next-run recommendation calls `targetFromPlan()`, so
  each one showed or saved 138.
- **Rows that compute their own target never looked at the marks at all.**

The user's rule: **whatever is marked as the maximum is the threshold, and the
same for the minimum.**

## Acceptance criteria

- **AC-1** A setting marked MAX never gets a target above the value it was
  marked at. A setting marked MIN never gets one below it. This holds in four
  places:
  - the planner: a lever blocked by the mark targets the marked value
  - every Tuning Report row
  - the recommendation each section saves for the next run's pre-run card
  - the pre-run card's "rec" chips, using the card's own marks and values
- **AC-2** A row held at its mark reads "hold", and the planner still lists
  the lever as blocked by the mark.
- **AC-3** Moves away from the limit are unaffected: MAX still allows a
  decrease, and MIN still allows an increase.
- **AC-4** Unit tests cover the threshold rule, the planner's blocked target,
  and `handlingMove` / `damperMove` with a limit. Restoring the old behaviour
  fails them.
- **AC-5** On the 6:09 PM run, the Front · Downforce row shows 120 and "hold"
  beside the "blocked · … maximum (120)" chip.

## Notes

- The threshold is the value the setting was **marked at**: the run's
  confirmed tune in the report, and the value currently in the box on the
  pre-run card.
- Out of scope: the next-run pre-fill's forward simulation for runs **without**
  a confirmed tune (`inheritSettings` → `*Target(cur, analytics)`). A run with
  no confirmed tune has no marks either.

## Done (2026-10-29)

- **New `client/src/limits.ts`** with `markedLimit()` (a mark, at the value it
  was marked on) and `clampToLimit()` (cut a target back to the mark; a MAX
  still allows a decrease, a MIN an increase). It carries a `qi-trace` marker.
- **Planner** (`plan.ts` › `decorate`): a lever blocked by a mark now targets
  the marked value (`to = from`). It is still listed as blocked, with the same
  reason (AC-1, AC-2).
- **Shared row functions:** `handlingMove()` and `damperMove()` take an
  optional mark and hold to it. That covers the alignment, ARB, spring,
  ride-height, downforce and damper rows (AC-1, AC-3).
- **`Sessions.tsx`, every section**, using the run's confirmed tune via
  `limitOf(s)`:
  - Diff, brakes and tire pressure clamp their inline targets (FH6-23/24 will
    keep the clamp when they extract them).
  - Gear ratios clamp each solved ratio to its gear's mark.
  - Final drive holds at its mark, reads "hold", says why, and drops the
    "— shorten/lengthen" heading.
  - The seven `*Target()` pre-fill functions take an optional `lim`, so the
    recommendation each section saves for the next run is held too (AC-1).
- **`PreRunTune.tsx`:** the card's "rec" chips are held to the card's own
  MIN/MAX marks, at the value in each box (AC-1).
- **`tests/unit/limits.test.ts`:** 9 tests covering the rule, `handlingMove`
  (`pct` and `abs`), `damperMove`, and the planner for both a MAX (front
  downforce at 120) and a MIN (rear ARB at 1) (AC-4).
  - Suite: 83/83; build passes.
  - Five mutants each fail tests: the planner leaving the target past the
    mark, a no-op clamp, MIN/MAX swapped, `handlingMove` ignoring the mark,
    and `damperMove` ignoring it.
- **Live check, 6:09 PM run (AC-5):** Front · Downforce shows **120 / hold**
  beside "blocked · you've marked this at its maximum (120)". The saved
  next-run recommendation is `frontAero: 120` (it was 138). On the pre-run
  card the Front downforce row shows box 120, MAX on, and "on rec" (no 138
  offer); the card was cancelled, nothing recorded. All other rows' targets
  are unchanged, and the page shows no float noise.

