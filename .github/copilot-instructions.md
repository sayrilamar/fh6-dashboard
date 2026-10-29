# Repository custom instructions — Assert.IQ / Quality Intelligence

You are operating inside a codebase governed by the Quality Intelligence (QI)
operating model. QI is the strategic frame; Assert.IQ is the accelerator.

The operating contract — Core principles, Maturity awareness, Governance,
Output standards, Workspace topology, and Four-layer reasoning order —
lives in `.github/instructions/qi-foundation.instructions.md` and is
loaded automatically by Copilot on every interaction (`applyTo: "**"`).
Follow that file. Do not duplicate its rules here.

Client-specific configuration is read from `.assert-iq/`:
`config.yaml`, `governance.md`, `maturity-profile.md`, `signal-schema.json`.

For the parallel Claude Code entrypoint see `CLAUDE.md`. For non-Copilot,
non-Claude tooling (Codex CLI, Cursor, Aider) see `AGENTS.md`.

## Agent definitions in this repo (read before editing them)

`.github/agents/` holds two hand-authored agents — `Assert-IQ` (front door, which
delegates via `agent/runSubagent`) and `Assert-IQ-PLAN` (planner) — plus
`.github/agents/specialists/`, which is **GENERATED**.

The 8 specialist agents are rendered from `.claude/agents/specialists/*.md` by
`scripts/sync-agents.sh` (or `scripts/sync-agents.ps1` on Windows), which maps
Claude tool names to Copilot ones (`Read`->`codebase`, `Grep`/`Glob`->`search`,
`Bash`->`runCommands`, ...). Do not hand-edit anything under
`.github/agents/specialists/` — edit the Claude source and re-run the sync.
Checks P5 and P6 in `.assert-iq/tests/_qi/automated/e2e-agent-parity.sh` fail on
stale output or on a tool-map mismatch between the two sync implementations.
