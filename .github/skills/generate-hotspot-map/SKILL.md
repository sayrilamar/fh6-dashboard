---
name: generate-hotspot-map
mode: agent
description: "Audit code volatility, complexity, and defect density to produce a Hotspot Risk Index registry that drives test prioritization. WHEN: hotspot map, identify high-risk modules, sprint zero risk audit, where should we focus testing, which modules are fragile, churn analysis."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, VCS host, tracker, complexity tool, or team** —
it operationalizes Layer 1 (Change Risk Surface) of the QI four-layer
model by computing a per-module Hotspot Risk Index (HRI) from three
independent signals: volatility (churn), structural complexity, and
historical defect density.

**How placeholders work**: the agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If a key is absent, the affected signal is reported as
**UNGRADED** with an explicit reason — the skill never fabricates a
score, never substitutes zero, and never assigns a tier from a single
signal alone.

1. **Refresh cadence** — set
   `.assert-iq/config.yaml > hotspot_map.refresh_cadence`:
   - `on_demand`  — only when invoked
   - `sprint`     — invoked at sprint planning (user-driven; the skill
                    does not schedule itself)
   - `both`       — default; both modes supported
   The skill itself is stateless on cadence; this key documents intent
   and feeds `hotspot_map.max_staleness_days` for consumer skills.

2. **Module granularity** — set
   `.assert-iq/config.yaml > hotspot_map.module_granularity`:
   - `directory`  — default; aggregate by directory under
                    `hotspot_map.module_globs`. Best for "magnetic
                    module" reasoning across hundreds of files.
   - `file`       — per-file rows. Use on small/critical repos.
   - `service`    — aggregate by service map declared in
                    `release.service_criticality`.

3. **Module scope** — set `hotspot_map.module_globs` (default: top-level
   directories under `src/`, `lib/`, `app/`, `services/`, `packages/`)
   and `hotspot_map.module_excludes` (default: build artifacts,
   generated code, node_modules, vendor).

4. **Volatility (V) inputs** — churn from VCS history.
   - `hotspot_map.volatility.lookback_days` (default `90`)
   - `hotspot_map.volatility.weight` (default `0.40`)
   - Source is always `git log` over the local checkout (or the
     companion repo when `workspace.role=tests`). Normalization is
     **percentile rank within the repo over the lookback window**, not
     absolute commit count — this keeps the 1–10 scale comparable
     across repos of any size.

5. **Complexity (C) inputs** — set `hotspot_map.complexity.source`:
   - `sonarqube` | `sonarcloud` | `codeclimate` | `eslint_complexity`
     | `radon` | `gocyclo` | `lizard` | `pmd` | `none`
   - `hotspot_map.complexity.report_path` — local artifact path
   - `hotspot_map.complexity.host` — when hosted (codeclimate /
     sonarcloud); reuses MCP → CLI → manual paste fallback
   - `hotspot_map.complexity.weight` (default `0.35`)
   When `source: none`, complexity is UNGRADED with reason
   `complexity_source_unset`. At Early tier this is expected and
   triggers churn-only mode (see point 9).

6. **Defect density (D) inputs** — inherits `tracker.type`.
   - `hotspot_map.defect_density.lookback_days` (default `180` —
     two quarters)
   - `hotspot_map.defect_density.weight` (default `0.25`)
   - `hotspot_map.defect_density.query` — tracker-specific filter
     template; defaults below per tracker.type:
     * `github`  → `is:issue label:bug closed:>=<since> involves:<path>`
     * `ado`     → WIQL: `[Work Item Type]='Bug' AND [Closed Date]>=<since>
                    AND [Area Path] UNDER '<component>'`
     * `jira`    → JQL: `issuetype = Bug AND resolved >= -180d AND
                    component = "<component>"`
     * `linear`  → `team:<TEAM> AND label:bug AND completedAt > -180d
                    AND project:<component>`
     * `none`    → Defect density UNGRADED with reason `tracker_none`
   The skill maps a defect to a module via (in order):
   tracker `component` field → file paths in linked PR/commit →
   text match on module name. If none of these resolves, the defect
   is excluded with a logged reason; **never** distributed evenly.

7. **HRI formula and reweighting** — the canonical formula is
   `HRI = (V * 0.40) + (C * 0.35) + (D * 0.25)` per the QI playbook.
   When a signal is UNGRADED, the missing weight is **redistributed
   proportionally across present signals** and the row records:
   - `hri_basis: "V+C+D" | "V+C" | "V+D" | "C+D" | "V_only" | "C_only" | "D_only"`
   A row with `hri_basis: "V_only"` (or any single-signal basis) is
   reported as a **Volatility Watchlist** entry, **not** a tiered HRI.
   See point 9 for tier assignment rules.

8. **Tier thresholds** — set `hotspot_map.tier_thresholds`:
   ```yaml
   hotspot_map:
     tier_thresholds:
       critical_min: 7.5     # HRI >= this → CRITICAL
       medium_min:   5.0     # HRI in [medium_min, critical_min) → MEDIUM
                             # HRI < medium_min                  → LOW
   ```
   Tiers are **only assigned when `hri_basis` includes at least two
   signals**. Single-signal rows surface on the Volatility Watchlist
   with no tier — fabricating a tier from one axis is forbidden.

9. **Maturity gating** — inherits `maturity.tier`:
   - `early`   — auto-applies `early_tier_mode: churn_only`. Output is
                 a Volatility Watchlist (top N most-churned modules,
                 advisory). No HRI tiers, no MEDIUM/CRITICAL labels.
                 Includes a promotion checklist (what would unlock
                 full HRI).
   - `mid`     — full HRI registry. Healing/enforcement still advisory.
   - `higher`  — full HRI registry. Consumers may treat CRITICAL as a
                 hard gate per their own policy (this skill remains
                 advisory).
   Override with `hotspot_map.early_tier_mode: full | churn_only`
   (default auto from tier).

10. **Outputs** — set:
    - `hotspot_map.registry_path` (default `./hotspot-map.md`) —
      human-readable registry table.
    - `hotspot_map.registry_json_path` (default `./hotspot-map.json`)
      — machine-readable form consumed by `risk-assess-pr`,
      `check-test-coverage`, `release-confidence`.

11. **Staleness** — set
    `hotspot_map.max_staleness_days` (default `30`). Consumer skills
    treat a registry older than this as UNGRADED for hotspot input
    rather than silently using stale data.

12. **PII / sensitive-data redaction** — inherits
    `bug_reporter.pii_redaction_extras`. Used when summarising defect
    titles in the registry; verbatim quoting is forbidden.

13. **Workspace topology** — inherits
    `.assert-iq/config.yaml > workspace.role` (`monorepo` | `prod` |
    `tests`, default `monorepo`). Volatility data lives on the
    **prod** side of a split; defect density may need either side
    depending on where component-to-code mapping lives.
    - `role: tests` — volatility UNGRADED unless `companion_repo`
      reachable (MCP → local path → manual paste). Reason:
      `companion_repo_unset` or `companion_repo_unreachable`.
    - `role: prod`  — volatility local; defect density may still
      need companion if work-item-to-code linkage lives there.
    - `role: monorepo` — no cross-repo behavior.
    Per `.assert-iq/workspace-topology.md`, never fabricate a
    missing layer.

14. **Platform notes** — language-, framework-, deployment-model-
    agnostic. Works across monolith / microservices / serverless /
    mobile / firmware / ML model / data-pipeline repos. The three
    signals are independent of the runtime.
-->

# Generate hotspot map

Operationalize Layer 1 (Change Risk Surface) of the QI four-layer
model by producing a **Hotspot Risk Index (HRI) registry** for the
repository — a per-module score derived from churn, structural
complexity, and historical defect density. The registry feeds
`risk-assess-pr` (Change-layer materiality), `check-test-coverage`
(risk-weighting), and `release-confidence` (Change-risk input
alongside `release.service_criticality`).

This skill is **language-, framework-, platform-, VCS-, tracker-,
and complexity-tool-agnostic**. It reads whatever your stack already
produces and degrades gracefully when a source is missing.

## Pre-conditions

- Git history is available for the volatility window.
- Tracker referenced in `.assert-iq/config.yaml > tracker` is
  reachable (MCP, CLI, or manual paste fallback) — otherwise defect
  density is UNGRADED.
- A complexity report exists per `hotspot_map.complexity.source` —
  otherwise complexity is UNGRADED.

## Inputs you must collect

- **Scope** — `full` (default), `module:<path>`, or
  `since:<ref>` (delta from a prior run).
- **Refresh trigger** — `sprint` (sprint-planning invocation) or
  `on_demand`. Recorded in the emitted signal; does not change
  procedure.
- **Maturity tier** — read from `.assert-iq/config.yaml > maturity.tier`.
  Determines whether the output is a full HRI registry or a churn-only
  Volatility Watchlist.

## Layer states (per signal)

Each of V / C / D is reported as one of:

| State    | Meaning                                                                 |
|----------|-------------------------------------------------------------------------|
| GRADED   | Signal computed from real data over the configured lookback window.     |
| UNGRADED | Source unavailable, unconfigured, or unreachable; reason captured.      |

Integrity rule (mirrors qi-foundation): a tier may only be assigned
when at least two of V / C / D are GRADED. Single-signal rows surface
on a Volatility Watchlist with no tier. Absence of data is never
treated as evidence of low risk.

## Procedure

### Step 1 — Volatility (V)

1. Resolve module list from `hotspot_map.module_globs` /
   `module_excludes` at the configured `module_granularity`.
2. For each module, run
   `git log --since=<lookback_days>.days.ago --name-only --pretty=format:` and
   aggregate per module:
   - commit count touching the module
   - lines added + deleted
3. Compute the **percentile rank** of each module's combined churn
   score (commits + LOC weighted) within the repo. Map percentile to
   a 1–10 score:
   - 90th+ → 10, 80th → 9, …, <10th → 1
4. Record `volatility_state: GRADED` (or `UNGRADED` with reason if
   git history is unreachable, e.g. shallow clone, or the companion
   repo is unset under `workspace.role=tests`).

### Step 2 — Complexity (C)

1. Read `hotspot_map.complexity.source`. If `none` → record
   `complexity_state: UNGRADED, reason: complexity_source_unset` and
   move on. **Do not substitute zero.**
2. Otherwise, parse the report:
   - SonarQube/SonarCloud → `complexity` measure per file
   - Code Climate → `cyclomatic_complexity`
   - ESLint complexity → `complexity` rule output
   - radon / gocyclo / lizard / pmd → tool-native CSV/JSON
3. Aggregate to module granularity (mean cyclomatic complexity
   weighted by file size, plus max nesting depth).
4. Map to a 1–10 score by percentile rank within the repo (same
   approach as V, for consistency).
5. Record `complexity_state: GRADED` and the underlying numbers.

### Step 3 — Defect density (D)

1. Read `hotspot_map.defect_density` config and `tracker.type`. If
   tracker is `none` → record `defect_density_state: UNGRADED,
   reason: tracker_none`.
2. Run the configured query (default templates per tracker; see
   customization point 6) for closed bugs over
   `defect_density.lookback_days`.
3. Map each defect to a module using (in order): tracker
   `component` field → file paths in linked PR/commit → exact text
   match on module name. Defects that resolve to none are **excluded
   with a logged reason** — never distributed evenly across modules.
4. Score each module 1–10 by percentile rank of (count × severity
   weight). Severity weights default to `{critical: 4, high: 3,
   medium: 2, low: 1}`; override via
   `hotspot_map.defect_density.severity_weights`.
5. Apply `bug_reporter.pii_redaction_extras` to any defect titles that
   surface in the registry.

### Step 4 — Compute HRI per module

1. Determine `hri_basis` from which of V / C / D are GRADED.
2. Compute HRI:
   - All three GRADED:
     `HRI = V*0.40 + C*0.35 + D*0.25`
   - Two GRADED — redistribute the missing weight proportionally:
     * V+C: `HRI = V*(0.40/0.75) + C*(0.35/0.75)`
     * V+D: `HRI = V*(0.40/0.65) + D*(0.25/0.65)`
     * C+D: `HRI = C*(0.35/0.60) + D*(0.25/0.60)`
   - One GRADED — **no HRI computed; row goes on Volatility
     Watchlist (or Complexity Watchlist / Defect Watchlist) with
     no tier.**
3. Round HRI to one decimal.

### Step 5 — Tier assignment

| Condition                                                | Tier         |
|----------------------------------------------------------|--------------|
| `hri_basis` has ≥ 2 signals AND HRI ≥ `critical_min`     | 🔴 CRITICAL  |
| `hri_basis` has ≥ 2 signals AND HRI ≥ `medium_min`       | 🟡 MEDIUM    |
| `hri_basis` has ≥ 2 signals AND HRI <  `medium_min`      | 🟢 LOW       |
| `hri_basis` is single-signal                             | (no tier; watchlist) |

### Step 6 — Maturity gating

- If `maturity.tier == early` and `hotspot_map.early_tier_mode` is
  `churn_only` (default at early): output the **Volatility
  Watchlist** only — top 10 modules by V, no HRI, no tiers — plus a
  promotion checklist explaining what would unlock the full
  registry.
- If `maturity.tier` is `mid` or `higher`, or `early_tier_mode:
  full` is set: output the full HRI registry.

### Step 7 — Emit registry artifacts

1. Write the markdown registry to `hotspot_map.registry_path`
   (default `./hotspot-map.md`).
2. Write the JSON sibling to `hotspot_map.registry_json_path`
   (default `./hotspot-map.json`).
3. Both artifacts include:
   - `generated_at` timestamp (ISO-8601)
   - `commit_sha` of HEAD
   - `maturity_tier`
   - `refresh_trigger`
   - per-row: module, V, C, D, HRI, hri_basis, tier, suggested
     control, contributing-defect count
   - footer: tier counts, hri_basis distribution, ungraded reasons
4. Return a chat summary: top 5 CRITICAL/MEDIUM modules, tier
   counts, what is UNGRADED and why.

---

## Registry markdown template

```
# Hotspot Risk Registry

Generated: <ISO-8601>
Commit: <sha>
Maturity tier: <early|mid|higher>
Refresh trigger: <sprint|on_demand>
HRI basis distribution: V+C+D=<n>, V+C=<n>, V+D=<n>, C+D=<n>, single-signal=<n>
Ungraded signals: <list with reasons>

| Module | V | C | D | HRI | Basis | Tier | Suggested control |
|--------|---|---|---|-----|-------|------|-------------------|
| /core/checkout/payment-gateway | 9 | 8 | 10 | 8.9 | V+C+D | 🔴 CRITICAL | Mandatory full E2E + API regression on every PR touching this path |
| /auth/session/token-manager    | 3 | 9 | 4  | 5.4 | V+C+D | 🟡 MEDIUM   | Static & security scan + senior reviewer |
| /ui/components/marketing-banner| 8 | — | 1  | —   | V+D   | (watchlist) | (no tier — only 2 signals; track via watchlist) |
```

The "Suggested control" column is advisory text. Consumer skills
(`risk-assess-pr`, `check-merge`) decide what to do with the tier.

---

## What you must not do

- **Do not assign a tier when `hri_basis` is single-signal.** A
  high churn score alone is a watchlist entry, not a CRITICAL
  module.
- **Do not substitute zero for an UNGRADED signal.** Reweight the
  formula, mark the basis, and explain the reason.
- **Do not gate merges or block PRs.** This skill is advisory.
  Consumers (e.g. `check-merge`) make their own gating decisions.
- **Do not modify** `.assert-iq/config.yaml` or any complexity/
  tracker tooling configuration without explicit user confirmation.
- **Do not distribute defects evenly** across modules when mapping
  fails. Exclude with a logged reason.
- **Do not expose verbatim defect descriptions** in the registry —
  apply `bug_reporter.pii_redaction_extras`.
- **Do not invent a registry** when the workspace is `tests` and
  the companion repo is unreachable. Volatility is UNGRADED;
  output a partial-signal registry with the reason.

---

## Output

- Markdown registry at `hotspot_map.registry_path`.
- JSON registry at `hotspot_map.registry_json_path`.
- Chat summary: top CRITICAL/MEDIUM modules, tier counts,
  ungraded reasons, registry path.
- **Never blocks a PR or release.** Advisory signal only.

## Signals emitted

When the QI signal sink is wired, this skill emits a
`hotspot.map_generated` signal per run conforming to
`.assert-iq/signal-schema.json`, carrying: `run_id`, `commit_sha`,
`maturity_tier`, `refresh_trigger`, `module_count`,
`tier_counts {critical, medium, low, watchlist}`,
`hri_basis_distribution`, `ungraded_signals[]` (with reasons),
`registry_path`, `registry_json_path`, `volatility_lookback_days`,
`defect_density_lookback_days`.
