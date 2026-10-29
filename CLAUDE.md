# Assert.IQ / Quality Intelligence — Claude Code entrypoint

This repository is governed by the Quality Intelligence (QI) operating model.
QI is the strategic frame; Assert.IQ is the accelerator. This file is the
Claude Code counterpart to `.github/copilot-instructions.md`.

## Operating contract — load first

The shared rulebook (Core principles, Maturity awareness, Governance,
Output standards, Workspace topology, Four-layer reasoning order) lives
in `@.github/instructions/qi-foundation.instructions.md`. That file is
the single source of truth for both Copilot and Claude Code — read it
at the start of every interaction. Do not duplicate its rules here.

Client-specific configuration is read from `.assert-iq/`: `config.yaml`,
`governance.md`, `maturity-profile.md`, `signal-schema.json`.

## Scoped guidance (load when relevant)

Copilot loads these automatically through their `applyTo` frontmatter globs.
In Claude Code, treat them as scope-conditional guidance — read the file
referenced below when the user's task matches the "When this applies" header
inside each file.

- @.github/instructions/qi-foundation.instructions.md — **always-on**;
  baseline reasoning order for any quality/testing/release/risk question.
- @.github/instructions/qi-traceability.instructions.md — apply when adding
  or modifying **production source code in any language** tied to a work item.
  The marker style comes from `.assert-iq/config.yaml >
  traceability.marker_style`, not from the file's examples.
- @.github/instructions/qi-test-design.instructions.md — apply when working
  with automated tests (`tests/**`, `*Test.*`, `*.test.*`, `*.spec.*`).
- @.github/instructions/qi-manual-test-design.instructions.md — apply when
  authoring manual test cases or exploratory charters under
  `tests/_qi/manual/**` or `tests/_qi/exploratory/**`.
- @.github/instructions/qi-signal-emission.instructions.md — apply when
  editing CI configuration (GitHub Actions, Azure Pipelines, GitLab CI,
  Jenkinsfile).
- @.github/instructions/qi-oracle.instructions.md — apply when authoring or
  applying Oracle-layer rubrics (`/define-quality-rubric`,
  `/grade-with-rubric`) or interpreting oracle verdicts.

## Capabilities surface

- **Subagents** — `.claude/agents/assert-iq.md` (default Assert.IQ
  subagent, full tools) and `.claude/agents/assert-iq-plan.md`
  (read-only planning sibling).
  **v2.0+**: 8 specialist subagents in `.claude/agents/specialists/` (risk-scorer,
  coverage-analyst, flake-adjudicator, oracle-grader, calibration-specialist,
  memory-curator, traceability-auditor, hotspot-analyzer) provide isolated,
  parallel analysis when lead agent orchestrates quality decisions.
  **These 8 files are the single source of truth for both harnesses.** The
  Copilot equivalents in `.github/agents/specialists/` are GENERATED from them
  by `scripts/sync-agents.sh` (or `sync-agents.ps1` on Windows), which maps tool
  names between the two schemas. After editing a specialist, re-run the sync —
  checks P5/P6 in `.assert-iq/tests/_qi/automated/e2e-agent-parity.sh` fail if you
  don't. The lead and planner agents are deliberately NOT generated: their prose
  is harness-specific and hand-authored on both sides.
- **Skills** — `.github/skills/` (canonical) is mirrored at `.claude/skills`
  so Claude auto-discovers all 32 QI skills (code review, test generation,
  bug reports, traceability matrix, release confidence, hotspot map, business
  metrics dashboard, etc.). **v2.0+**: Includes `/measure-qi-impact` for
  quarterly business ROI reporting.
- **Dreaming** — a markdown memory store at `.assert-iq/memory/`, consolidated
  by the `/dream` skill. Session events (recorder + gate) are wired through
  `.claude/settings.json`, rendered from
  `.assert-iq/dreaming/session-events.template.json`. Run `bash install.sh`
  (or `install.ps1` on Windows) after dropping the pack into a repo to sync the
  session events, scaffold the memory store, and create the skills symlink.
- **Per-client config** — `.assert-iq/config.yaml`,
  `.assert-iq/governance.md`, `.assert-iq/maturity-profile.md`,
  `.assert-iq/signal-schema.json`.
- **Workspace bootstrap** — `scripts/bootstrap.sh` /
  `scripts/bootstrap.ps1`, invoked by the `/assert-iq-bootstrap` skill.
  Three install modes:
  - `--mode=committed` — files visible to git (team adoption).
  - `--mode=trial` — files added to `.git/info/exclude` (local-only;
    the codebase `.gitignore` is **never** touched). User graduates
    later with `scripts/bootstrap.sh --graduate`.
  - `--mode=ask` (default in TTY) — interactive prompt.
  Pre-existing user files are preserved via SHA256 compare + interactive
  conflict resolver. Every install records
  `.assert-iq/.install-manifest.json` (version, mode, paths).

## v2.0+ Multi-Agent Orchestration & Commercial Instrumentation

**Multi-Agent Orchestration**: When a quality or release decision is needed, the lead agent (assert-iq.md) now orchestrates 8 isolated specialist subagents:
- **Parallel batch** (run simultaneously): risk-scorer, coverage-analyst, flake-adjudicator, hotspot-analyzer
- **Serial specialists** (after parallel completes): oracle-grader, calibration-specialist, memory-curator, traceability-auditor
- Each returns structured JSON; lead agent synthesizes findings into narrative + decision
- Audit trail preserved in `.assert-iq/agent-runs/`

**Commercial Instrumentation**: New `/measure-qi-impact` skill (v2.0+) converts QI verdicts + baseline metrics into **VP-ready HTML dashboards** showing quarterly business impact:
- Escape reduction % (vs. baseline)
- Triage hours reclaimed (engineer-hours saved)
- Release cycle acceleration (days faster)
- Total economic ROI (escape cost + triage cost savings)

Configure in `.assert-iq/config.yaml` → `business_metrics` section. Baseline metrics in `.assert-iq/business-metrics/baseline.json`. Reports output to `.assert-iq/business-metrics/reports/` (excluded from git).

## Companion files

- `.github/copilot-instructions.md` — the Copilot-side equivalent of this
  file. If you change behavior here, update the Copilot file too (or vice
  versa) to keep tools in lockstep.
- `AGENTS.md` — generic agent-spec pointer for non-Copilot, non-Claude
  tooling (Codex CLI, Cursor, Aider).
