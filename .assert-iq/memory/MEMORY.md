# MEMORY.md — Project Memory Index

_Last consolidated: 2026-10-29 (second pass, after PR #3)_

<!--
Long-term memory INDEX for the Assert.IQ Dreaming feature (loaded at session
start, index only). Maintained by the /dream consolidation pass:
  - Hard cap: 200 lines; one-line pointers into topics/.
  - Absolute dates only. Facts/decisions/preferences, not transcript excerpts.
Hand-edit freely; the instruction files under .github/instructions/ are the
immutable rules tier and are never modified by dreaming.
-->

## Active Gotchas

- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **toe: NEGATIVE = toe-IN, POSITIVE = toe-OUT**, front and rear, as the menu labels it. **Measured** from straight-line slip angles; the "labels are swapped" theory is disproven. Fixed in FH6-17 (`443ab76`). (2026-10-29)
- [Recurring defects](topics/recurring-defects.md) — the toe sign flipped three times on reasoning alone, and FH6-3's tests pinned the wrong one. Settle conventions by measurement; grep strings, comments, and field defaults too. (2026-08-28 → 2026-10-29)
- [Recurring defects](topics/recurring-defects.md) — **parallel code paths drift**: report headline / body / pre-run popup, duplicate logic, and a row's label vs its target (FH6-19). Verify every surface after a plan-logic change. (≥6 occurrences, 2026-08-28 → 2026-10-29)
- [Recurring defects](topics/recurring-defects.md) — **rounding and float noise**: whole-number rounding of 0.1-resolution settings made phantom moves on "hold" rows; raw floats printed `0.30000000000000004`. A hold returns the entered value. (FH6-17/18/19, 2026-10-29)
- [Recurring defects](topics/recurring-defects.md) — recommendations must derive from the **recorded run**, never an editable field (final drive chased its own output 4.07 → 5.57+). (2026-08-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — tire pressure is a grip lever, **not** a temperature lever: +17.5 psi moved temp only +0.5 °F. (multi-session)
- [Recurring defects](topics/recurring-defects.md) — stale browser bundle mimics "the fix didn't work"; hard-refresh Cmd+Shift+R before investigating. (2026-08-28)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — **iCloud**: dataless `node_modules` hang tools at 0% CPU; "name 2" conflict copies inside `.git` broke `git fetch`. Check both first. (multi-session; `.git` case 2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — recordings land in `sessions/` of **whichever checkout runs the server** (a worktree on 2026-10-29). (2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — this workspace also hosts unrelated non-FH6 work; check a transcript's subject before mining it for signal. (2026-08-29)

## Workflow

- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **never use lap/track times as a tuning signal** (controller, unreliable); judge by car performance only. (decided 2026-08-28)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **one lever per run**: attribution and backfire detection only work when exactly one channel moved. (2026-08-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — the user's **bisection** formula, plus guards: recency wins contradictions, never step against advice, cap at 3× advised step; **not** for gearing. (2026-08-28 → 2026-08-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — gears **solved for minimum time** against the measured power band; user A/B-tested on track and preferred it. (2026-08-29)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — FH6 alignment, ARB and damper settings have **0.1 resolution**; targets keep tenths. (2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — commit only on "commit and push"; then per-story commits → PR (`[FH6-n]`) → fast-forward `main` and push (PRs #1–#3). (2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — work is tracked as **markdown stories** in `stories/todo` / `stories/done` (`FH6-<n>`); escapes are `type: bug`, label `escape`. (decided 2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — **Vitest unit suite** in `tests/unit/` (`npm run test:unit`, 59 tests at `e97b934`); still **no CI** and no UI tests, so Trust stays UNGRADED. (2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — Assert.IQ pack is **committed and public** at v2.2.0 (`1052af1`); upgrade via `~/assert-iq-agent-pack` after checking its branch. (2026-10-29)

## Architecture

- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — 323-byte base, **324 bytes observed**, so FH6 **never** sends tire wear (needs ≥339). Tire temps are raw °F; no car-name string. (2026-08-28)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — race end = **`distanceTraveled` reset**; `isRaceOn` blips ~15 s and `currentRaceTime` keeps counting. (measured 2026-08-30)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — the **pre-race screen** reports `isRaceOn` with the real car and a running race clock; only `racePosition > 0` proves a race (FH6-15, `aa0305b`). (measured 2026-10-29)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — axes: `accel.x > 0` = right turn, `steer` + = right, `slipAngle` + = wheel aimed right of travel; toe shows as a straight-line slip offset. (measured 2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — Node `dgram`/`ws`/`http` + React/Vite/TS canvas. (2026-08-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — `npm run sim` can **record** since `2fe4ca1`. Car **#999999** is reserved for sim runs; clean up `sessions/` and `fh6.*.c.999999` afterwards. The sim sends tire wear, which live FH6 never does. (2026-10-29)

## Open questions

- Should a consistent but tiny move near a metric's floor (rear rebound balance error 0.03 → 0.06) count as "backfired" and block that direction? Raised in FH6-16; see [conventions](topics/tuning-engine-conventions.md). (2026-10-29)
- Live telemetry stopped reaching the Mac on 2026-10-06: Xbox (192.168.1.229) not reachable at the network level, "UPnP not successful". Suspected Wi-Fi isolation or a second router; unresolved. Recording worked again on 2026-10-29. See [workspace topic](topics/workspace-and-delivery.md).
- Public repo has **no LICENSE**, so default copyright grants no reuse rights — raised 2026-08-29, still undecided 2026-10-29.
- Claude's separate user-level memory records the packet as "323B base + tire-wear", which conflicts with the verified finding that FH6 sends 324 bytes and no wear block. That store is outside the dream write-sandbox and was left untouched. (flagged 2026-08-29)
