# MEMORY.md — Project Memory Index

_Last consolidated: 2026-10-29_

<!--
Long-term memory INDEX for the Assert.IQ Dreaming feature (loaded at session
start, index only). Maintained by the /dream consolidation pass:
  - Hard cap: 200 lines; one-line pointers into topics/.
  - Absolute dates only. Facts/decisions/preferences, not transcript excerpts.
Hand-edit freely; the instruction files under .github/instructions/ are the
immutable rules tier and are never modified by dreaming.
-->

## Active Gotchas

- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **toe: POSITIVE = toe-IN, NEGATIVE = toe-OUT**, front and rear. Forza's slider labels are swapped; the app shipped it inverted twice. (corrected 2026-08-30, r = −0.67 over 14 runs)
- [Recurring defects](topics/recurring-defects.md) — the old toe sign also hid in help strings, a comment, and the Rear · Toe **baseline default**; all were fixed together on 2026-10-29. Grep strings, comments, and field defaults when touching a sign. (2026-10-29)
- [Recurring defects](topics/recurring-defects.md) — **parallel code paths drift**: report headline / report body / pre-run popup, and duplicate logic copies. Verify all three surfaces after any plan-logic change. (≥5 occurrences, 2026-08-28 → 2026-08-30)
- [Recurring defects](topics/recurring-defects.md) — recommendations must derive from the **recorded run**, never an editable field (final drive chased its own output 4.07 → 5.57+). (2026-08-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — tire pressure is a grip lever, **not** a temperature lever: +17.5 psi moved temp only +0.5 °F. (multi-session)
- [Recurring defects](topics/recurring-defects.md) — stale browser bundle mimics "the fix didn't work"; hard-refresh Cmd+Shift+R before investigating. (2026-08-28)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — **no test suite and no CI.** Protection and Trust layers are genuinely UNGRADED; the oracle is the user's recorded live runs. (re-checked 2026-10-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — this workspace also hosts unrelated non-FH6 work; check a transcript's subject before mining it for signal. (2026-08-29)

## Workflow

- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **never use lap/track times as a tuning signal** (controller, unreliable); judge by car performance only. (decided 2026-08-28)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **one lever per run**: attribution and backfire detection only work when exactly one channel moved. (2026-08-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — the user's **bisection** formula, plus guards: recency wins contradictions, never step against advice, cap at 3× advised step; **not** for gearing. (2026-08-28 → 2026-08-30)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — gears **solved for minimum time** against the measured power band; user A/B-tested on track and preferred it. (2026-08-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — commits land on `main` only when the user says "commit and push"; on 2026-10-29 the agent's push was blocked and the user pushed. (multi-session)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — Assert.IQ pack is **committed and public** at v2.2.0 (`1052af1`); upgrade via `~/assert-iq-agent-pack` after checking its branch. (2026-10-29)

## Architecture

- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — 323-byte base, **324 bytes observed**, so FH6 **never** sends tire wear (needs ≥339). Tire temps are raw °F; no car-name string. (2026-08-28)
- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — race end = **`distanceTraveled` reset**; `isRaceOn` blips ~15 s and `currentRaceTime` keeps counting. (measured 2026-08-30)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — Node `dgram`/`ws`/`http` + React/Vite/TS canvas. (2026-08-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — `npm run sim` can **record** only since the 2026-10-29 fix. Car **#999999** is reserved for sim runs; clean up `sessions/` and `fh6.*.c.999999` afterwards. The sim sends tire wear, which live FH6 never does. (2026-10-29)

## Open questions

- Live telemetry stopped reaching the Mac on 2026-10-06: Xbox (192.168.1.229) not reachable at the network level, "UPnP not successful". Suspected Wi-Fi isolation or a second router; unresolved. See [workspace topic](topics/workspace-and-delivery.md).
- Public repo has **no LICENSE**, so default copyright grants no reuse rights — raised 2026-08-29, still undecided 2026-10-29.
- Claude's separate user-level memory records the packet as "323B base + tire-wear", which conflicts with the verified finding that FH6 sends 324 bytes and no wear block. That store is outside the dream write-sandbox and was left untouched. (flagged 2026-08-29)
