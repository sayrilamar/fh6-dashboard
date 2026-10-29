# MEMORY.md — Project Memory Index

_Last consolidated: 2026-08-29_

<!--
Long-term memory INDEX for the Assert.IQ Dreaming feature (loaded at session
start, index only). Maintained by the /dream consolidation pass:
  - Hard cap: 200 lines; one-line pointers into topics/.
  - Absolute dates only. Facts/decisions/preferences, not transcript excerpts.
Hand-edit freely; the instruction files under .github/instructions/ are the
immutable rules tier and are never modified by dreaming.
-->

## Architecture

- [FH6 telemetry contract](topics/fh6-telemetry-contract.md) — live-verified packet format: 323-byte base, **324 bytes observed**, so FH6 **never** sends tire wear (needs ≥339). Tire temps are raw °F; no car-name string is transmitted. (2026-08-28)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — Node `dgram`/`ws`/`http` + React/Vite/TS canvas; `npm run sim` exercises the full pipeline with no console attached. (2026-08-29)

## Workflow

- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **never use lap/track times as a tuning signal** (controller, unreliable); judge by car performance only. (decided 2026-08-28)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — the user's **bisection stepping algorithm** and its explicit carve-out: do NOT apply it to gearing. (2026-08-28)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — published public to github.com/sayrilamar/fh6-dashboard on `main`; auth is `gh` CLI over HTTPS, no SSH key. (2026-08-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — Assert.IQ pack is **trial mode**, hidden via `.git/info/exclude`, never pushed; `--graduate` to publish. (2026-08-29)

## Active Gotchas

- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — **toe sign is inverted from intuition: negative = toe-IN, positive = toe-OUT**, front and rear. The app shipped this backwards once. (corrected 2026-08-28)
- [Tuning-engine conventions](topics/tuning-engine-conventions.md) — tire pressure is a grip lever, **not** a temperature lever: +17.5 psi moved temp only +0.5 °F. Advice to "raise psi for heat" is unsound. (multi-session)
- [Recurring defects](topics/recurring-defects.md) — **recommendation desync** across report headline / report body / record popup; verify all three surfaces after any plan-logic change. (≥3 occurrences, 2026-08-28)
- [Recurring defects](topics/recurring-defects.md) — stale browser bundle mimics "the fix didn't work"; hard-refresh Cmd+Shift+R before investigating. (2026-08-28)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — **no test suite and no CI exist.** Protection and Trust layers are genuinely UNGRADED; do not synthesize a score from absent tests. (2026-08-29)
- [Workspace, stack, and delivery setup](topics/workspace-and-delivery.md) — this workspace also hosts unrelated non-FH6 work; check a transcript's subject before mining it for signal. (2026-08-29)

## Open questions

- Public repo has **no LICENSE**, so default copyright grants no reuse rights — raised with the user 2026-08-29, undecided.
- Claude's separate user-level memory records the packet as "323B base + tire-wear", which conflicts with the verified finding that FH6 sends 324 bytes and no wear block. That store is outside the dream write-sandbox and was left untouched. (flagged 2026-08-29)
