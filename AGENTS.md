# Agents.md — Assert.IQ / Quality Intelligence

This repository ships an agent pack for Quality Intelligence (QI). Any
AI agent operating here (Codex CLI, Cursor, Aider, or other
`AGENTS.md`-aware tooling) must follow the rules below.

Tool-specific entry points: Claude Code → `CLAUDE.md`; GitHub Copilot
Chat → `.github/copilot-instructions.md`. Both delegate the operating
contract to `.github/instructions/qi-foundation.instructions.md`.

## Core principles

1. Quality = Velocity × Customer Satisfaction × System Resilience.
2. Reason through the four-layer signal model — Change risk, Protection
   strength, Signal trustworthiness, Outcome evidence — then synthesize
   Decision Confidence. Never reduce a release decision to a single number.
3. Distinguish a metric (what happened) from a signal (decision-grade
   evidence).
4. AI-generated code and tests are drafts. A human review gate is
   mandatory before merge.
5. Honor the client's existing frameworks, branching model, and tracker.
   Do not introduce new dependencies without explicit confirmation.

## Workspace topology

Default `workspace.role: monorepo` — no cross-repo behavior. When the
role is `prod` or `tests`, read `.assert-iq/workspace-topology.md` for
the fetch fallback chain (MCP → local path → manual paste) and the
UNGRADED contract. Never fabricate a missing signal.

## Configuration

Per-client behavior lives in `.assert-iq/`: `config.yaml` (maturity tier,
tracker, framework, signal sinks), `governance.md` (compliance posture),
`maturity-profile.md` (Early / Mid / Higher tier rationale),
`signal-schema.json`. Read `maturity-profile.md` before acting.

## Scoped instructions

Detailed scope-conditional rules live in `.github/instructions/*.md` —
each begins with a **"When this applies"** section. The always-on file
is `qi-foundation.instructions.md`.

## Skills

32 QI skills under `.github/skills/`. Each `SKILL.md` carries a
`description` field that triggers auto-routing in compatible agents.
Key skills: `code-review`, `risk-assess-pr`, `release-confidence`,
`generate-automated-unit-test`, `generate-traceability-matrix`,
`generate-hotspot-map`, `agentic-heal`, `measure-qi-impact` (v2.0+),
`estimate-story`.

## v2.0+ Multi-Agent Orchestration & Commercial Instrumentation

**Multi-Agent Orchestration (v2.0+)**: When a quality or release decision is needed, the lead agent now orchestrates 8 isolated specialist agents:
- **Parallel batch** (run simultaneously): risk-scorer, coverage-analyst, flake-adjudicator, hotspot-analyzer
- **Serial specialists** (after parallel completes): oracle-grader, calibration-specialist, memory-curator, traceability-auditor
- Each returns structured JSON; lead agent synthesizes findings into narrative + decision
- Audit trail preserved in `.assert-iq/agent-runs/`

**Commercial Instrumentation (v2.0+)**: New `/measure-qi-impact` skill converts QI verdicts + baseline metrics into VP-ready HTML dashboards showing quarterly business impact:
- Escape reduction % (vs. baseline)
- Triage hours reclaimed (engineer-hours saved)  
- Release cycle acceleration (days faster)
- Total economic ROI (escape cost + triage cost savings)

Configure in `.assert-iq/config.yaml` → `business_metrics` section. Baseline metrics in `.assert-iq/business-metrics/baseline.json`. Reports output to `.assert-iq/business-metrics/reports/`.

## Governance

- Every generated test carries a traceability comment linking to a work
  item (ADO `AB#1234` or Jira key).
- No prompt may exfiltrate code, secrets, or proprietary data outside
  the IDE / CI boundary.
- Refuse requests that violate `.assert-iq/governance.md` and explain why.
