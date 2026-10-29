---
name: generate-traceability-matrix
mode: agent
description: "Build a req ↔ code ↔ test matrix from traceability headers — surface orphan tests, untraceable code, uncovered ACs."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, tracker, or repository layout** — it scans for
whatever traceability marker your team has standardised on. You'll
get sharper, faster results if you fill in the per-repo specifics
below.

**How placeholders work**: the agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If a key is absent, the agent infers from repo signals
or asks you. Wire values once and they flow into every skill that
references them.

1. **Tracker** — set `.assert-iq/config.yaml > tracker.system`. The
   agent uses the right ID syntax (`AB#1234`, `PROJ-123`, `#123`,
   `ENG-123`) when validating work items. Supported: ADO, Jira,
   GitHub Issues, GitLab, Linear, Bitbucket, Shortcut, Pivotal,
   Redmine, Trello, Notion.

2. **Traceability marker style** — set
   `.assert-iq/config.yaml > traceability.marker_style`. Supported
   styles (use whichever is idiomatic for your language):
   - `qi_trace_xml` — `///<qi-trace: WORK-ITEM />` (C# / XAML doc
     comments — pack default)
   - `qi_trace_yaml` — leading YAML block (`qi-trace:` then
     `work-item: ...`) — used by manual cases & exploratory charters
   - `tracker_id_inline` — `// AB#1234`, `// PROJ-123`, `# ENG-123`
     (universal one-liner)
   - `jsdoc_tag` — `@qi-trace PROJ-123` (JS/TS/Java docblocks)
   - `python_decorator` — `@qi_trace("PROJ-123")` (decorator on tests
     / functions)
   - `attribute` — `[QiTrace("AB#1234")]` (.NET attribute) /
     `#[qi_trace("PROJ-123")]` (Rust) / `@QiTrace(...)` (Java)
   - `custom_regex` — any team-specific pattern; pair with
     `traceability.marker_regex`
   - `auto` — agent detects from repo signals

3. **Marker regex** (when `marker_style: custom_regex`) — set
   `.assert-iq/config.yaml > traceability.marker_regex` to a
   capture-group regex; the first capture must be the work item ID.

4. **Code scan globs** — set
   `.assert-iq/config.yaml > traceability.code_globs`. Examples:
   - .NET: `["**/*.cs", "**/*.xaml"]`
   - JS/TS: `["**/*.{js,jsx,ts,tsx}"]`
   - Python: `["**/*.py"]`
   - Java/Kotlin: `["**/*.{java,kt}"]`
   - Go: `["**/*.go"]`
   - Rust: `["**/*.rs"]`
   - Ruby: `["**/*.rb"]`
   - Swift: `["**/*.swift"]`
   - Mixed / polyglot: list every relevant glob
   - `auto` — agent infers from repo language signals
   Excludes (e.g. generated code, vendor dirs) belong in
   `traceability.code_excludes`.

5. **Test scan globs** — set
   `.assert-iq/config.yaml > traceability.test_globs`. Examples:
   - `["tests/**", "**/*Test.*", "**/*.test.*", "**/*.spec.*"]` —
     covers most ecosystems
   - .NET: `["**/*Tests.cs", "**/*.UnitTests/**", "**/*.IntegrationTests/**"]`
   - Python: `["tests/**", "**/test_*.py", "**/*_test.py"]`
   - Go: `["**/*_test.go"]`
   - Manual / exploratory artifacts: include the configured
     `manual_test_management.output_path` and
     `exploratory_charter.output_path` so non-code traces are
     picked up.

6. **Traceability rules reference** — set
   `.assert-iq/config.yaml > traceability.rules_path` to a markdown
   file documenting which code MUST carry a trace (defaults to
   "any code that implements an AC"). The agent uses this to
   classify "untraceable code" gaps.

7. **Output formats** — set
   `.assert-iq/config.yaml > traceability.output_formats` (array).
   Supported: `markdown` (default), `csv`, `html`, `json`,
   `sarif` (for IDE/CI surfacing), `excel`, `confluence_table`,
   `notion_table`.

8. **Output path** — set
   `.assert-iq/config.yaml > traceability.output_path` (default
   `./traceability-matrix.md`). Multiple formats produce
   matching siblings (`traceability-matrix.csv`, etc.).

9. **Scope mode** — pass one of these at invocation time:
   - `repo` (default) — full repository
   - `path:<glob>` — a module/path subset
   - `release:<id-list>` — a set of work items (release scope)
   - `pr:<number>` — only files touched by a PR

10. **Compliance lock** — set
    `.assert-iq/config.yaml > traceability.compliance_lock`:
    - `none` (default)
    - `release_freeze` — at release time, the matrix is written
      as an immutable audit artifact (filename includes release
      tag + commit SHA)
    - `regulatory` — additionally emits a `.sha256` digest beside
      every output for tamper-evidence
    Required for SOX / FDA / GxP / ISO 13485 / HIPAA / PCI
    workflows.

11. **Platform notes** — platform-agnostic. The scan is a plain
    filesystem walk + tracker MCP validation; works on any OS,
    monorepo or polyrepo, with any CI.

12. **Workspace topology** — inherits
    `.assert-iq/config.yaml > workspace.role` (`monorepo` |
    `prod` | `tests`, default `monorepo`). The matrix spans three
    sides: requirement (tracker), code (prod repo), test (tests
    repo). When `role=prod`, the test column is fetched from
    `workspace.companion_repo`; when `role=tests`, the code column
    is fetched from the companion. Use MCP → local path → manual
    paste per `.assert-iq/workspace-topology.md`. If the companion
    is unavailable, the matrix is still emitted with the missing
    column flagged — each affected row is marked
    `trace_state: "partial"` with
    `reason: "companion_repo_unset"`; do **not** mark a
    requirement "untested" or "unimplemented" just because the
    other side isn't reachable.
-->

# Generate traceability matrix

Build a requirement ↔ code ↔ test matrix by scanning for traceability
markers across the repository. Surfaces three gap classes that
compliance teams, release leaders, and QI maturity assessments care
about: **uncovered ACs**, **orphan tests**, and **untraceable code**.

This skill is **language-, framework-, tracker-, and
platform-agnostic** (see customization points 1–5 above).

## Pre-conditions

- A traceability marker convention exists (or
  `traceability.marker_style: auto` will infer one).
- Code and test glob patterns resolve at least one file in scope.
  Empty scopes produce an empty matrix plus a "no files matched"
  diagnostic — not a fabricated result.
- Tracker MCP is available, or the agent runs in **structural mode**
  (validates marker syntax and cross-references locally, flags
  unverified work item IDs).

## Inputs you must collect

- **Scope** — repo / path / release / PR per customization point 9.
  Default: `repo`.
- **Output formats** — defaults to `traceability.output_formats`;
  override per-invocation.
- **Compliance lock** — defaults to `traceability.compliance_lock`;
  set `release_freeze` at release-tag time.

## Procedure

1. **Resolve scan inputs**:
   - Marker style + regex from config (or detected).
   - Code globs and excludes.
   - Test globs (incl. manual / exploratory artifact paths).
   - Scope filter (repo / path / release / PR).

2. **Scan in scope** for traceability markers. For each hit,
   extract:
   - Work item ID (in the tracker's native syntax)
   - Acceptance criterion reference (if present)
   - Risk tier (if present in the marker payload)
   - File path + line + (for code) enclosing function/class/symbol
   - Artifact kind: `code` | `automated_test` | `manual_test` |
     `exploratory_charter`

3. **Validate work items via tracker MCP** (when available):
   - The work item exists.
   - The AC referenced is present on the work item.
   - The work item is in scope (when a release scope was specified).
   When MCP is unavailable, mark validation `unverified` and emit a
   structural-only diagnostic.

4. **Build the matrix**:

   | Work Item | AC | Code references | Test references | Status |
   |-----------|----|-----------------|-----------------|--------|
   | PROJ-123  | AC-1 | `src/payments/charge.<ext>:42` | `tests/.../charge.spec.<ext>` | Covered |
   | PROJ-123  | AC-2 | `src/payments/refund.<ext>:18` | (none) | Uncovered |
   | PROJ-124  | AC-1 | (none) | `manual/refund.md` | Orphan test |
   | (none)    | —  | `src/billing/legacy.<ext>:101` | — | Untraceable code |

5. **Surface the three gap classes**:
   - **Uncovered ACs** — AC has code references but no test
     reference of any kind (automated, manual, or exploratory).
   - **Orphan tests** — test references a work item or AC that does
     not exist (or is out of scope when a release filter is
     applied).
   - **Untraceable code** — code in scope without a marker, where
     the rules at `traceability.rules_path` say a marker is
     required.

6. **Compute coverage metrics**:
   - **AC coverage** — % of in-scope ACs with ≥1 test reference.
   - **Traceability density** — % of in-scope code files / symbols
     that carry the marker per the rules file.
   - **Orphan rate** — % of test references pointing to invalid
     or out-of-scope work items.
   - **Validation rate** — % of references confirmed via tracker
     MCP (vs. `unverified`).

7. **Emit outputs** in every format listed in
   `traceability.output_formats`, written to
   `traceability.output_path` (and matching siblings for non-md
   formats). When `compliance_lock` is set, also write the
   immutable artifact + `.sha256` digest.

8. **Recommend next actions**:
   - Per uncovered AC, propose a route (`generate-tests-from-ac`).
   - Per orphan test, propose either re-association (if the work
     item was renamed/merged) or a controlled-removal review.
   - Per untraceable code block, recommend adding the marker — but
     **never** auto-insert; markers must be human-authored to
     remain audit-credible.

## Stop conditions

- Scope resolves to zero files — surface "no files in scope" with the
  resolved globs and exit cleanly.
- Marker style cannot be determined and `auto` detection finds
  multiple conflicting conventions — surface the conflict and ask
  the user to pin `traceability.marker_style` before continuing.
- Tracker MCP is required by `compliance_lock: regulatory` but
  unavailable — refuse to write the locked artifact (an audit
  artifact built on `unverified` data is worse than none).

## Governance

- **Do not fabricate traces.** If code lacks a trace, surface it as a
  gap. Never invent a `qi-trace` header to close a coverage hole.
- **Do not remove orphan tests.** Surface them and recommend
  re-association or controlled removal — orphan ≠ delete.
- **Do not silently downgrade an AC to "covered"** because a
  near-match test exists. The trace must be explicit.
- **Do not auto-insert markers** into production or test code, even
  when the rules file says one is required. Markers must be
  human-authored to remain audit-credible.
- For **regulated industries** (SOX / FDA / GxP / ISO 13485 / HIPAA /
  PCI), pair `compliance_lock: regulatory` with the release tag.
  The agent emits the matrix as an immutable artifact with a sha256
  digest at release time.

## Output

- Matrix file(s) in every configured format, written to
  `traceability.output_path` (and matching siblings).
- A **gap summary report** listing uncovered ACs, orphan tests,
  untraceable code blocks, each with a recommended next action.
- **Coverage metrics** block (AC coverage / density / orphan rate /
  validation rate).
- When `compliance_lock != none`, an additional immutable artifact
  (and `.sha256` digest under `regulatory`) suitable for audit
  retention.

## Signals emitted

When the QI signal sink is wired, this skill emits a
`test.traceability` signal per run conforming to
`.assert-iq/signal-schema.json`, carrying: `scope`,
`marker_style`, `ac_coverage_pct`, `traceability_density_pct`,
`orphan_rate_pct`, `validation_rate_pct`, `uncovered_acs`,
`orphan_tests`, `untraceable_files`, `compliance_lock`, and
`release_tag` (when applicable).
