# MEMORY.md — Project Memory Index

_Last consolidated: 2026-10-30 (after PR #13: FH6-22 to FH6-28)_

<!--
Long-term memory INDEX for the Assert.IQ Dreaming feature (loaded at session
start, index only). Maintained by the /dream consolidation pass:
  - Hard cap: 200 lines; one-line pointers into topics/.
  - Absolute dates only. Facts/decisions/preferences, not transcript excerpts.
Hand-edit freely; the instruction files under .github/instructions/ are the
immutable rules tier and are never modified by dreaming.
-->

## Active Gotchas

- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **tire pressure moves neither tire temperature nor grip in FH6** (26 vs 34 psi, tarmac and dirt, FH6-27). Pressure is manual; temps are information only; never reintroduce a temperature → pressure loop (FH6-26). (2026-10-30)
- [Recurring defects](topics/recurring-defects.md) — **confounded data**: the toe correlation, "temp follows speed" on an unrecognized dirt race (retracted after the user's correction), dirt front slip that was cornering intensity. Ask the event/surface first; A|B|A|B with a control. (3×, 2026-08-30 → 2026-10-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **toe: NEGATIVE = toe-IN, POSITIVE = toe-OUT**, front and rear, as the menu labels it. **Measured** from straight-line slip angles; fixed in FH6-17 (`443ab76`). (2026-10-29)
- [Recurring defects](topics/recurring-defects.md) — the toe sign flipped three times on reasoning alone, and FH6-3's tests pinned the wrong one. Settle conventions by measurement; grep strings, comments and defaults too. (2026-08-28 → 2026-10-29)
- [Recurring defects](topics/recurring-defects.md) — **parallel code paths drift**: report surfaces, duplicate logic, row label vs target, marked limits, history pools still grouped by car only, advice outside the named code. Grep every copy. (≥9×, 2026-08-28 → 2026-10-30)
- [Recurring defects](topics/recurring-defects.md) — **rounding and float noise**: a hold returns the entered value; targets keep tenths; check rendered text for `\d\.\d{6,}`. (FH6-17/18/19, 2026-10-29)
- [Recurring defects](topics/recurring-defects.md) — recommendations must derive from the **recorded run**, never an editable field (final drive chased its own output 4.07 → 5.57+). (2026-08-30)
- [Recurring defects](topics/recurring-defects.md) — stale browser bundle mimics "the fix didn't work"; hard-refresh Cmd+Shift+R before investigating. (2026-08-28)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — **iCloud**: dataless `node_modules` hang tools at 0% CPU; "name 2" conflict copies inside `.git` broke `git fetch`. Check both first. (multi-session)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — the user runs `npm start` from the **worktree**, so recordings land there; server changes need a restart, and killing their server was refused. Verify on a second instance at :8091 (`fh6-verify`). (2026-10-30)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — this workspace also hosts unrelated non-FH6 work; check a transcript's subject before mining it for signal. (2026-08-29)

## Workflow

- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **never use lap/track times as a tuning signal** (controller, unreliable); judge by car performance only. (decided 2026-08-28)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **one lever per run**: attribution and backfire detection only work when exactly one channel moved. (2026-08-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **like-for-like runs**: the driver labels each run's event type; every history pool uses `sameEventType()`, and unlabelled runs match anything. (FH6-28, 2026-10-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **a marked MIN or MAX is a hard threshold** for every target; the user's own words are in the topic. (FH6-25, 2026-10-29)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **measuring a lever**: A|B|A|B on one route, the planner's 2-SE noise test, the untouched axle as control, matched conditions, tune confirmed on the pre-run card. (2026-08-29, 2026-10-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — the user's **bisection** formula, plus guards: recency wins contradictions, never step against advice, cap at 3× advised step; **not** for gearing. (2026-08-28 → 2026-08-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — gears **solved for minimum time** against the measured power band; user A/B-tested on track and preferred it. (2026-08-29)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — settings have **0.1 resolution**; every report row and its pre-fill share `handlingMove()` / `damperMove()`. (FH6-18/19/22/23/24, 2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — "Start FH6-n" = implement, mutation-check, verify live, close the story, leave uncommitted; "commit and push" = per-story commits → PR `[FH6-n]` → fast-forward `main`, push, test on main (PRs #1–#13). (2026-10-30)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — work is tracked as **markdown stories** in `stories/todo` / `stories/done` (`FH6-<n>`); escapes are `type: bug`, label `escape`. (decided 2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — **Vitest suite**: 127 tests at `f96a06e`; `Sessions.tsx` and the recorder have no unit tests (the recorder waits on FH6-6); still **no CI**, so Trust stays UNGRADED. (2026-10-30)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — Assert.IQ pack is **committed and public** at v2.2.0; dream logs/counter are untracked (pack `e93c955`) and live in the main checkout; `/dream` runs in the worktree. (2026-10-30)

## Architecture

- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — 323-byte base, **324 bytes observed**, so FH6 **never** sends tire wear (needs ≥339). Tire temps are raw °F; no car-name string. (2026-08-28)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — **one rear tire temperature for both rear wheels** on every car checked (#634 RWD, Mazda 787B AWD); fronts differ. (2026-10-30)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — **no event/track/surface field**; `rumble` reads 0 on dirt and tarmac; water (`puddle`) cools tires ~45 °F; dirt fronts ~70–90 °F, tarmac ~136 °F. (2026-10-29/30)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — undecoded bytes are recorded raw since FH6-28: placeholder int32 read 32 throughout one dirt run, trailing byte 0; meaning unknown. (2026-10-30)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — race end = **`distanceTraveled` reset**; `isRaceOn` blips ~15 s and `currentRaceTime` keeps counting. (measured 2026-08-30)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — the **pre-race screen** reports `isRaceOn` with the real car and a running race clock; only `racePosition > 0` proves a race (FH6-15, `aa0305b`). (measured 2026-10-29)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — axes: `accel.x > 0` = right turn, `steer` + = right, `slipAngle` + = wheel aimed right of travel; toe shows as a straight-line slip offset. (measured 2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — Node `dgram`/`ws`/`http` + React/Vite/TS canvas. (2026-08-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — `npm run sim` can **record** since `2fe4ca1`. Car **#999999** is reserved for sim runs; clean up `sessions/` and `fh6.*.c.999999` afterwards. The sim sends tire wear, which live FH6 never does. (2026-10-29)

## Open questions

- Should a consistent but tiny move near a metric's floor (rear rebound balance error 0.03 → 0.06) count as "backfired" and block that direction? Raised in FH6-16; see [conventions](topics/tuning-engine-conventions.md). (2026-10-29)
- The 6:24 PM run of 2026-10-29 lasted 39 s but shows a race time of 11:58.599 — a suspected race-time bug, with no story yet. (noticed 2026-10-30)
- Does rear pressure affect traction? FH6-27 tested front pressure only, and the wheelspin fix still suggests −1 to −2 psi rear. (2026-10-30)
- Live telemetry stopped reaching the Mac on 2026-10-06: Xbox (192.168.1.229) not reachable at the network level, "UPnP not successful". Cause never found; recording has worked since 2026-10-29. See [workspace topic](topics/workspace-and-delivery.md).
- Public repo has **no LICENSE**, so default copyright grants no reuse rights — raised 2026-08-29, still undecided 2026-10-30.
- Claude's separate user-level memory records the packet as "323B base + tire-wear", which conflicts with the verified finding that FH6 sends 324 bytes and no wear block. That store is outside the dream write-sandbox and was left untouched. (flagged 2026-08-29)
