---
name: check-test-coverage
description: "Coverage analysis with QI risk weighting — not just %, but coverage where it matters."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, platform, coverage tool, or team** — it reads whatever
coverage report your test runner already produces; it does not impose one.
You'll get sharper, faster results if you fill in the per-repo specifics
below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each placeholder). If the key is absent, the agent infers from repo
signals or asks you. Wire the values once in `.assert-iq/config.yaml`
and they flow into every skill that references them — no per-skill
editing required.

1. **Coverage command** — `{{COVERAGE_COMMAND}}` is the command that
   produces a coverage report. Set
   `.assert-iq/config.yaml > test_framework.coverage_command`. Examples
   by ecosystem:
   - JavaScript / TypeScript: `npm run coverage`, `npx jest --coverage`,
     `vitest run --coverage`, `nyc npm test`, `c8 npm test`
   - Python: `pytest --cov=. --cov-report=xml`,
     `coverage run -m pytest && coverage xml`
   - .NET: `dotnet test /p:CollectCoverage=true /p:CoverletOutputFormat=cobertura`
   - Java / Kotlin: `mvn verify` (JaCoCo), `gradle jacocoTestReport`,
     `gradle koverXmlReport`
   - Go: `go test ./... -coverprofile=coverage.out`
   - Rust: `cargo tarpaulin --out Xml`, `cargo llvm-cov --cobertura`
   - Ruby: `bundle exec rspec` with SimpleCov
   - Swift: `xcodebuild test -enableCodeCoverage YES` + `xcov` / `slather`
   - PHP: `vendor/bin/phpunit --coverage-clover coverage.xml`
   - Generic: whatever your CI already runs

2. **Coverage report format & path** — set
   `.assert-iq/config.yaml > coverage_analysis.report_format` and
   `coverage_analysis.report_artifact`. Supported formats (universal):
   `cobertura` | `lcov` | `jacoco` | `clover` | `opencover` |
   `coverage.py` | `go-cover` | `sonar-generic` | `json-summary`. The
   skill auto-detects when a single canonical artifact path is present.

3. **External coverage host** (optional) — if coverage lives in a hosted
   service rather than a local file, set `coverage_analysis.host`:
   `codecov` | `coveralls` | `sonarqube` | `sonarcloud` | `codeclimate` |
   `azure_devops` | `github_actions_artifact` | `gitlab_coverage` |
   `none`. The skill prefers MCP → CLI → manual paste fallback.

4. **Scope** — `{{SCOPE}}` defaults to the current diff. Override per
   invocation: `diff` (default) | `full` | `module:<path>` |
   `package:<name>`. Configure default via
   `coverage_analysis.scope_default`.

5. **Risk weighting inputs** — the agent computes risk weights from three
   independent signals. Configure
   `.assert-iq/config.yaml > coverage_analysis.risk_weights`:
   - `business_criticality` — from `{{TRACKER_PRIORITY_FIELD}}` (Jira
     `priority`, ADO `Microsoft.VSTS.Common.Priority`, GitHub label
     prefix, Linear `priority`, etc.). Set `tracker.priority_field`.
   - `escape_history` — count of escaped defects on the touched
     component within `coverage_analysis.escape_lookback_days`
     (default 90), pulled from
     `escape_analysis.pattern_lookup.tracker_query`.
   - `churn` — commits touching the file in
     `coverage_analysis.churn_lookback_days` (default 90), from
     `git log`.

   Weights are blended; defaults sum to 1.0 (criticality 0.4, escapes
   0.4, churn 0.2). Override per team.

6. **Traceability marker** — `{{TRACE_MARKER}}` is how your codebase ties
   a unit of production code to a work item. Set
   `.assert-iq/config.yaml > traceability.marker_style`. Examples:
   - C# / .NET XML doc: `/// <qi-trace work-item="AB#1234" />`
   - Java / Kotlin Javadoc: `/** @qi-trace AB#1234 */`
   - TypeScript / JavaScript JSDoc: `/** @qi-trace JIRA-1234 */`
   - Python docstring: `""":qi-trace: JIRA-1234"""` or decorator
     `@qi_trace("JIRA-1234")`
   - Go: comment line `// qi-trace: GH-1234`
   - Rust: doc comment `/// qi-trace: LIN-1234`
   - Ruby: comment `# qi-trace: SHORTCUT-1234`
   - Swift: `/// - qi-trace: PROJ-1234`
   - Generic: `// qi-trace: <WORK-ITEM>`

7. **Tracker & work-item lookup** — already configured in
   `.assert-iq/config.yaml > tracker`. Used to resolve the work item
   referenced by `{{TRACE_MARKER}}` and pull priority for criticality.

8. **Thresholds** — read from
   `.assert-iq/config.yaml > merge_gate.coverage.line_min` and
   `merge_gate.coverage.risk_weighted_min` so this skill and the merge
   gate share one source of truth. Override per-invocation if you need
   to experiment without changing the merged policy.

9. **Coverage-report sink** — by default the human-readable report is
   written to `coverage-report.md` at the repo root. Override the path
   in `.assert-iq/config.yaml > coverage_analysis.report_path`.
   (Structured QI signal emission is separate — see the `signals`
   section in `.assert-iq/config.yaml`.)

10. **Platform notes** — this skill is platform-agnostic (monorepo,
    polyrepo, mobile, browser, embedded, serverless). If your coverage
    tool emits per-shard reports, point
    `coverage_analysis.report_artifact` at the merge command
    (`lcov-result-merger`, `coverage combine`, etc.) or a directory
    glob — the skill aggregates before analyzing.

11. **Workspace topology** — inherits
    `.assert-iq/config.yaml > workspace.role` (`monorepo` |
    `prod` | `tests`, default `monorepo`). Coverage analysis needs
    **both** the coverage report (tests side) and the source paths
    it references (prod side). When `role=prod`, the coverage
    report and test inventory live in `workspace.companion_repo`;
    when `role=tests`, the source files referenced by the report
    live in the companion. Fetch via MCP → local path → manual
    paste per `.assert-iq/workspace-topology.md`. If the companion
    side is unavailable, the Protection layer is reported as
    UNGRADED with `reason: "companion_repo_unset"`; partial reports
    that cannot resolve a source path mark those files
    `coverage_resolution: unresolved` rather than inferring 0%.

12. **Hotspot tier input** — when
    `coverage_analysis.hotspot_tier_input: true` and the registry
    at `hotspot_map.registry_json_path` is fresh (within
    `hotspot_map.max_staleness_days`, default 30), the risk-weight
    blend gains a fourth multiplier from
    `coverage_analysis.hotspot_tier_multipliers` (default
    `{critical: 1.5, medium: 1.2, low: 1.0}`). Defaults to off so
    existing users see no change. A stale or missing registry is
    UNGRADED for hotspot input; the existing three-signal blend
    runs unchanged. Generate the registry with
    `/generate-hotspot-map`.
-->

# Check test coverage

Coverage analysis through the QI lens. Raw coverage % is a **metric**;
risk-weighted coverage is a **signal**. This skill turns the metric into a
decision-grade signal by weighting coverage gaps by business criticality,
recent escape history, and code churn — and by surfacing untraceable code
as a first-class gap.

This skill is **framework-, language-, platform-, and coverage-tool-
agnostic**. It reads whatever report `{{COVERAGE_COMMAND}}` produces (see
the customization block above).

## Pre-conditions

- `{{COVERAGE_COMMAND}}` runs to completion and produces a report in one
  of the supported formats (see customization point 2), OR a hosted
  coverage service is wired via `coverage_analysis.host`.
- Git history is available for churn computation.
- The tracker referenced in `.assert-iq/config.yaml > tracker` is
  reachable (MCP, CLI, or manual paste fallback).

## Inputs you must collect

- **Scope** — `{{SCOPE}}`: `diff` (default), `full`, `module:<path>`,
  or `package:<name>`. Pull default from
  `coverage_analysis.scope_default`.
- **Baseline ref** — when scope is `diff`, the ref to diff against.
  Defaults to the merge base with the trunk branch from
  `vcs.default_branch`.
- **Threshold overrides** — optional per-invocation overrides for
  `line_min` and `risk_weighted_min`. If omitted, read from
  `merge_gate.coverage`.

## Procedure

1. **Produce or fetch the coverage report.** Run `{{COVERAGE_COMMAND}}`,
   OR fetch from the configured host (`coverage_analysis.host`) via
   MCP → CLI → manual paste. Parse using the format declared in
   `coverage_analysis.report_format` (auto-detected when unambiguous).

2. **Identify changed surfaces** in `{{SCOPE}}`. For `diff` scope, derive
   the file × line set from `git diff <baseline>...HEAD`. For `module:` /
   `package:` scope, glob the relevant tree.

3. **Compute three coverage views**:
   - **Line coverage on changed code** — raw % across the changed
     line set.
   - **Risk-weighted coverage** — coverage % weighted by:
     - **business criticality** of the workflow the code participates in,
       sourced from `{{TRACKER_PRIORITY_FIELD}}` on the work item linked
       via `{{TRACE_MARKER}}`
     - **recent escape history** on the component, from
       `escape_analysis.pattern_lookup.tracker_query` over
       `coverage_analysis.escape_lookback_days`
     - **change churn** on the file, from `git log` over
       `coverage_analysis.churn_lookback_days`

     Apply the blend in `coverage_analysis.risk_weights`.
   - **Traceability coverage** — % of changed functions / classes /
     modules that carry a `{{TRACE_MARKER}}` resolving to a real work
     item in the tracker.

4. **Surface gaps in this strict order** (do not reorder — the order
   encodes the QI priority):
   1. Uncovered code on a **critical workflow with recent escapes**.
   2. Uncovered code with **high churn**.
   3. **Untraceable** code (no work-item linkage).
   4. Standard low-coverage gaps.

5. **Recommend specific tests to author** for each gap. Where possible,
   propose the route per gap:
   - **automation** — deterministic, fast, repeatable
   - **manual scripted** — UI-heavy, judgment-heavy, or low-frequency
   - **exploratory charter** — novel area, ambiguous AC, or recent
     escape cluster

   Cite the relevant skill (`generate-automated-unit-test`,
   `generate-automated-api-test`, `generate-automated-ui-test`,
   `generate-exploratory-charter`).

6. **Emit a coverage report** containing:
   - the three views with numbers
   - the ranked gap list
   - per-gap recommended route and skill
   - threshold verdict against `merge_gate.coverage.line_min` and
     `merge_gate.coverage.risk_weighted_min`
   - the work-item references found (and the untraceable surfaces)

## Governance

- Do **not** optimize for raw % over risk-weighted coverage. Surface
  both; lead with risk-weighted. A repo can be 90% covered and still
  ship blind on the critical path.
- Do **not** modify the coverage tool's configuration, the test runner,
  the threshold values, or `.assert-iq/config.yaml` without explicit
  user confirmation.
- Do **not** propose lowering a threshold to make a gap "pass". If the
  threshold is wrong, raise it as a separate discussion with rationale —
  never as a silent edit.
- Quarantining or excluding files from coverage requires the same
  expiry + owner discipline as quarantining a test (see
  `flake_analysis.quarantine_workflow`).

## Output

A `coverage-report.md` artifact (or the path configured in
`.assert-iq/config.yaml > coverage_analysis.report_path`) with the
three views, ranked gaps, and recommended next actions.

## Signals emitted

When the QI signal sink is wired, this skill emits a `coverage.analysis`
signal per run conforming to `.assert-iq/signal-schema.json`, carrying:
`scope`, `line_coverage`, `risk_weighted_coverage`,
`traceability_coverage`, `gap_count_by_class`, `threshold_verdict`, and
`top_gaps[]` (with file, line range, risk score, and recommended route).
