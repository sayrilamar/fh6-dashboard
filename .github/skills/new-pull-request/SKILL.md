---
name: new-pull-request
mode: agent
description: "Open a PR with a QI-aware body — risk band, AC linkage, traceability, reviewer guidance."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
VCS host, tracker, language, framework, or team** — it produces a PR
on whatever host your repo uses and links to whatever tracker your
team uses. You'll get sharper, faster results if you fill in the
per-repo specifics below.

**How placeholders work**: the agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If a key is absent, the agent infers from repo signals
or asks you. Wire values once and they flow into every skill.

1. **VCS host** — set `.assert-iq/config.yaml > vcs.host`. The agent
   uses the right MCP / CLI to open the PR. Supported:
   - `github`            (PRs)
   - `azure_devops`      (PRs)
   - `gitlab`            (Merge Requests)
   - `bitbucket`         (PRs)
   - `gitea`             (PRs)
   - `gerrit`            (Changes)
   - `phabricator`       (Diffs / Revisions)
   - `radicle`           (Patches)
   - `none`              — the agent prints a paste-ready body

2. **Tracker** — set `.assert-iq/config.yaml > tracker.system`. The
   agent uses the right ID syntax (`AB#1234`, `PROJ-123`, `#123`,
   `ENG-123`) for AC linkage and branch-name extraction.

3. **Default target branch** — set
   `.assert-iq/config.yaml > vcs.default_branch` (default `main`).
   Common alternatives: `develop`, `master`, `trunk`, `release/*`.

4. **Branch → work-item extraction** — set
   `.assert-iq/config.yaml > vcs.branch_workitem_regex`. Default:
   `(AB#\d+|[A-Z]+-\d+|#\d+|GH-\d+)`. Override per team naming
   (e.g. `feature/ENG-\d+`, `bug/JIRA-\d+`, `dev/AB#\d+`).

5. **PR-template behaviour** — the agent auto-detects
   `.github/pull_request_template.md`,
   `.azuredevops/pull_request_template.md`,
   `.gitlab/merge_request_templates/*.md`, or
   `docs/pull_request_template.md`. Override the search path via
   `.assert-iq/config.yaml > vcs.pr_template_path`.

6. **Traceability marker style** — inherits from
   `.assert-iq/config.yaml > traceability.marker_style`. The
   examples below use the pack's default XML-doc marker; the agent
   substitutes your configured style automatically.

7. **Credential-scan patterns** — the universal list below catches
   AWS / Azure / GCP / OAuth-style keys. Extend per team via
   `.assert-iq/config.yaml > vcs.credential_patterns_extras`
   (array of regexes).

8. **Risk-band thresholds** — the line-count amber threshold (200)
   and the touch-list (auth / payment / data-export / external
   API) are universal QI defaults. Override via
   `.assert-iq/config.yaml > pr.risk_thresholds`:
   - `lines_amber: 200`
   - `lines_red: 500`
   - `sensitive_paths: [...]`  (path globs that auto-bump to amber)

9. **Draft policy** — set
   `.assert-iq/config.yaml > pr.draft_when_acs_incomplete` (default
   `ask`):
   - `ask` — prompt the user
   - `always_draft` — auto-draft
   - `never_draft` — open ready-for-review

10. **Risk-assess integration** — when `risk-assess-pr` has been run,
    the agent reuses its band. Set
    `.assert-iq/config.yaml > pr.use_risk_assess_pr` (default
    `true`).

11. **Reviewer / label policy** — set
    `.assert-iq/config.yaml > pr.auto_reviewers` and
    `pr.auto_labels` (CODEOWNERS-aware on hosts that support it).
    Leave empty to let the host's own routing handle it.

12. **Platform notes** — PR creation is platform-agnostic. For
    monorepos, the agent scopes the diff to the changed paths in
    the current branch only.
-->

# New pull request

Create a PR on the configured VCS host using the Assert.IQ template.
Reviewers should see the risk picture before they read a line of code.

This skill is **VCS-, tracker-, language-, and platform-agnostic**
(see customization points 1–3 above). Examples below show GitHub /
ADO / Jira flavours; the agent uses whatever you've configured.

## Inputs

- Target branch (default: `vcs.default_branch` from config).
- Work item ID. Auto-detect from branch name using `vcs.branch_workitem_regex` (e.g., `feature/PROJ-123-...`); otherwise ask. If no work item exists (housekeeping, hotfix, spike), skip AC sections — that's fine.

## Pre-flight checks

Run before anything else. **Blockers stop PR creation; fix them first, then re-run.**

| Check | Blocker? | Action |
|---|---|---|
| Hardcoded credentials in diff | **Yes — block** | "Found credential at [file:line]. Remove it, then re-run this skill." |
| Incomplete ACs, no draft signal | Warn | Apply `pr.draft_when_acs_incomplete` policy (default `ask`). |
| Work item not found via MCP | No | Proceed; note in body |
| Tracker / VCS MCP unavailable | No | Generate body as text; provide paste instructions |
| Work item found but tracker MCP fails | No | Same as above — produce the body, note MCP failure |

**Credential patterns to scan (universal defaults; extend via `vcs.credential_patterns_extras`):** string literals containing `key=`, `token=`, `password=`, `secret=`, `api_key=`, `apikey=`, `bearer `; random-looking strings ≥ 20 chars; cloud key prefixes: `AKIA` (AWS), `AccountKey=` (Azure), `ya29.` (GCP OAuth), `ghp_` / `gho_` / `ghs_` (GitHub PATs), `xox[abp]-` (Slack), `glpat-` (GitLab PATs), `-----BEGIN [A-Z ]+PRIVATE KEY-----` (PEM keys).

## PR type

| Situation | PR type |
|---|---|
| All in-scope ACs complete | Ready for review |
| Any AC deferred (not yet implemented) or user wants early feedback | **Draft PR** |
| Explicit `--draft` | Draft PR |

## Procedure

### Step 1: Fetch context

1. Fetch work item via MCP (if available): title, description, ACs.
2. Identify ACs **covered** by this branch vs. **deferred** (out of scope or not yet done).
3. If no work item: mark AC fields as `N/A — no linked work item`, proceed.

### Step 2: Self-assess risk

Use `/risk-assess-pr` output if available (controlled by `pr.use_risk_assess_pr`). Otherwise:

| Signal | Contribution |
|---|---|
| Changed lines > `pr.risk_thresholds.lines_amber` (default 200) | +amber |
| Changed lines > `pr.risk_thresholds.lines_red` (default 500) | +red |
| Touches `pr.risk_thresholds.sensitive_paths` (auth / payment / data-export / external API) | +amber → red |
| Credential in diff | **Red — blocker (should have been caught in pre-flight)** |
| Changes beyond linked ACs (scope creep) | +amber |
| Pure deletion / dead-code removal | −green |
| Good automated test coverage | −green |

Final band: **🟢 Green** / **🟡 Amber** / **🔴 Red** — plus a one-line rationale.

### Step 3: Generate PR title and body

**Title format:**
- With work item: `[WORK-ITEM] Imperative description` → `[PROJ-456] Add payment retry with exponential backoff`
- No work item: plain imperative → `Remove dead code from DataExportService`

**Standard body template:**

```markdown
## Summary
[One paragraph: what changed and why, in plain language.]

## Work item
- **Linked:** [PROJ-456 — Payment retry](link)  |  or  `N/A — no linked work item`
- **ACs covered:** AC1 ✅, AC2 ✅
- **ACs deferred:** AC3 — not yet implemented (scoped to PROJ-460)  |  or  `N/A`

## Risk band
**🟡 Amber** — Retry logic touches payment flow; 240 lines changed across 4 files.

## Tests
| AC | Test | Type |
|---|---|---|
| AC1 | `PaymentServiceTests.cs > RetryLogicTests` | Automated |
| AC2 | Manual: cart payment failure flow (see test plan) | Manual |
| N/A | No tests needed — pure deletion | N/A |

## Traceability
- Traceability marker (per `traceability.marker_style`) on the changed symbols implementing the ACs. Examples in the configured style:
  - `qi_trace_xml`: `///<qi-trace: PROJ-456 />` on `PaymentService.ProcessPayment`
  - `tracker_id_inline`: `// PROJ-456` next to the changed function
  - `jsdoc_tag`: `@qi-trace PROJ-456` in the docblock
  - `python_decorator`: `@qi_trace("PROJ-456")` on the function
- Intentional exceptions: none  |  or: `N/A — no linked work item`

## Reviewer guidance
- **Start here:** `PaymentService.RetryWithBackoff` — retry count and backoff multiplier
- **Watch for:** off-by-one on max retries; concurrent retry race condition
- **Out of scope:** refund flow, payment method switching
- **Scope notes:** none  |  or: `Includes JSON export (not in ACs) — added because [reason]`
```

**No-work-item example (abbreviated):**
```markdown
## Summary
Deleted ~300 lines of commented-out code and unused helpers across 8 files. No behavior change.

## Work item
N/A — no linked work item

## Risk band
**🟢 Green** — pure deletion; no logic changed; automated tests pass.

## Tests
No tests needed — no behavior changed.

## Traceability
N/A — no linked work item

## Reviewer guidance
- **Start here:** any file with ≥ 50 lines deleted
- **Watch for:** any deletion that turns out to be used via reflection or dynamic dispatch
- **Out of scope:** refactoring, renaming — only deletions
```

### Step 4: Handle repo PR template

If a PR template exists at the path configured by `vcs.pr_template_path` (auto-detects `.github/pull_request_template.md`, `.azuredevops/pull_request_template.md`, `.gitlab/merge_request_templates/*.md`, or `docs/pull_request_template.md`):

1. Populate the template's existing fields — don't leave placeholder text.
2. **Overlapping sections:** embed QI content *inside* the template's section rather than duplicating.
3. **QI sections with no template equivalent:** add them after the last template section under `<!-- QI additions -->`.
4. Never remove template checkboxes or required fields.
5. **If template has a `## Risk` section:** enrich it with the risk band assessment (same rule as any overlapping section).
6. **If template has no sections at all:** add QI structure as labeled sections after the template's free-form content.

**Merge example** (template: `## What changed` / `## Testing` / `## Checklist`):
```markdown
## What changed
Added retry logic to PaymentService with exponential backoff (AC1) and UI error message (AC2).
Risk: 🟡 Amber — payment flow touched, 240 lines changed.

## Testing
| AC | Test | Type |
|---|---|---|
| AC1 | `PaymentServiceTests.cs > RetryLogicTests` | Automated |
| AC2 | Manual: cart payment failure flow | Manual |

## Checklist
- [x] Tests added
- [x] No hardcoded credentials
- [x] Work item linked

<!-- QI additions -->
## Traceability
- `///<qi-trace: PROJ-456 />` on: `PaymentService.ProcessPayment`, `PaymentService.RetryWithBackoff`

## Reviewer guidance
- **Start here:** `RetryWithBackoff` — retry count and backoff multiplier
- **Watch for:** off-by-one on max retries; concurrent retry race condition
```

### Step 5: Open PR

Open via the configured VCS MCP (`vcs.host`):
- `title`: Step 3
- `body`: Steps 3–4
- `draft`: true if draft PR
- `base`: target branch
- `reviewers` / `labels`: from `pr.auto_reviewers` / `pr.auto_labels` (when set)

**If MCP unavailable or fails at any point:** Produce the complete PR body as formatted markdown and say: "MCP unavailable — copy the body below and paste it into a new PR on [host]" (substituting GitHub / Azure DevOps / GitLab / Bitbucket / Gitea per `vcs.host`).

## Governance

- Do not auto-merge. Do not bypass required reviewers.
- Block PR creation if a credential or secret is in the diff. Fix it, then re-run.
- Do not include PII from work item descriptions (names, emails, internal data).
- Scope creep must appear in "Scope notes" — never silently include out-of-AC changes.

## Output

- A PR / MR / Change opened on the host configured by `vcs.host`,
  with the QI-aware body, optional draft flag, target branch, and
  auto-reviewers / labels applied.
- When MCP is unavailable: a paste-ready markdown body plus the
  exact CLI command for the host (e.g. `gh pr create`, `glab mr
  create`, `az repos pr create`).
- A short on-screen summary: risk band, ACs covered/deferred,
  test-coverage line, scope-creep notes (if any).

## Signals emitted

When the QI signal sink is wired, this skill emits a
`pr.opened` signal per PR conforming to
`.assert-iq/signal-schema.json`, carrying: `host`, `pr_number`
(or `unknown` when MCP unavailable), `tracker_ref`, `acs_covered`,
`acs_deferred`, `risk_band`, `lines_changed`, `sensitive_paths_touched`,
`credential_blockers` (always 0 — PR is blocked otherwise),
`draft`, `scope_creep_flagged`.

## Pre-flight oracle grading (v1.6.0+)

Before opening PR, optionally grade generated artifacts in the branch
with oracle to catch quality issues early:

```
/grade-with-rubric <test_file>  --rubric-id=test-unit-v1.0
```

**Recommended workflow:** Generate → Grade with oracle → Fix on verdict
→ Open PR. This reduces reviewer churn and keeps oracle verdict history
in `.assert-iq/oracles/outcomes/` for traceability.
