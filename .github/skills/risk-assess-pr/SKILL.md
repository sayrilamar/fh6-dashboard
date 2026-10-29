---
name: risk-assess-pr
mode: agent
description: "Score a pull request across the QI four-layer signal model and post a structured risk comment."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
VCS host, tracker, CI system, language, framework, or team** — it
scores PRs against the QI four-layer model; it does not impose a
stack.

**How placeholders work**: the agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If a key is absent, the layer scores as **UNGRADED**
per the integrity rule — the skill never fabricates positive signal.

1. **VCS host** — inherits `vcs.host` (`github | azure_devops |
   gitlab | bitbucket | gitea | gerrit | phabricator | radicle |
   none`). Used to fetch the PR diff and post the risk comment.
   When `none`, the user pastes the diff and the comment is
   returned to chat only.

2. **Tracker** — inherits `tracker.system` (any of 15 systems
   including `none`). Used by the Outcome layer to look up escape
   defects on touched components.

3. **Diff source priority** — set
   `.assert-iq/config.yaml > risk_assessment.diff_source_order`
   (default `["mcp", "git", "user_paste"]`). The skill walks this
   list and uses the first source that responds; if all fail, it
   asks for the file list explicitly.

4. **Complexity ceilings** — the Low / Medium / High ladder (50 /
   500 lines) is a universal default. Override per team via
   `.assert-iq/config.yaml > risk_assessment.complexity`:
   ```yaml
   risk_assessment:
     complexity:
       low_max_lines: 50
       medium_max_lines: 500
       low_max_files: 1
       medium_max_services: 2
   ```

5. **Test discovery** — the Protection layer locates tests via
   five heuristics in order. Override the globs and patterns via
   `.assert-iq/config.yaml > risk_assessment.test_discovery`:
   ```yaml
   risk_assessment:
     test_discovery:
       traceability_first: true   # honour traceability.marker_style
       test_file_patterns:
         - "*Test*.*"
         - "*Tests.*"
         - "*Spec.*"
         - "*_test.*"
         - "*.spec.*"
       test_dirs: ["test", "tests", "__tests__", "spec"]
   ```

6. **Trust thresholds** — default 5% flake / 14-day block window
   are universal. Override via
   `.assert-iq/config.yaml > risk_assessment.trust_thresholds`:
   ```yaml
   risk_assessment:
     trust_thresholds:
       flake_pct_weak: 5
       block_lookback_days: 14
   ```
   The flake source itself inherits `flake_analysis.results_store`.

7. **Outcome window** — default 30 days. Override via
   `.assert-iq/config.yaml > risk_assessment.outcome_lookback_days`.

8. **Late-change materiality table** — the three tiers
   (cosmetic / behavior change / shared-config) are universal
   defaults. Extend per team via
   `.assert-iq/config.yaml > risk_assessment.late_change_extras`
   (e.g. flag any change to `**/security/**` as critical).

9. **Decision-band policy** — the GREEN / AMBER / RED matrix is
   universal. Override via
   `.assert-iq/config.yaml > risk_assessment.decision_policy`:
   - `strict`      — default; AMBER on any WEAK or UNGRADED
   - `pragmatic`   — GREEN allowed with 1 UNGRADED *non-Outcome* layer
   - `regulated`   — RED on any UNGRADED layer for regulated paths
     (paths from `risk_assessment.regulated_paths`)

10. **Comment posting** — set
    `.assert-iq/config.yaml > risk_assessment.post_comment`:
    - `true`   — post to the PR (when `vcs.host != none`)
    - `false`  — return the comment in chat only
    The comment **never** blocks the PR — assessment is advisory
    (see Governance).

11. **Report sink** — set
    `.assert-iq/config.yaml > risk_assessment.report_path`
    (default `./pr-risk-<pr-id>.md`) for an artifact copy of the
    comment.

12. **PII / sensitive-data redaction** — inherits
    `bug_reporter.pii_redaction_extras`. Used when summarising escape
    defects in the Outcome layer; verbatim quoting is forbidden.

13. **Platform notes** — deployment-model-agnostic. Works for
    monolith / microservices / serverless / mobile / firmware /
    ML model / data-pipeline PRs alike. The four layers map onto
    any change topology.

14. **Workspace topology** — inherits
    `.assert-iq/config.yaml > workspace.role` (`monorepo` |
    `prod` | `tests`, default `monorepo`). When `role=tests`,
    the **Change layer** (PR diff, blast radius, churn) lives in
    `workspace.companion_repo`; fetch via MCP → local path →
    manual paste per `.assert-iq/workspace-topology.md`. If the
    companion is unset or unreachable, the Change layer is
    reported as UNGRADED with `reason: "companion_repo_unset"`
    (or `"companion_repo_unreachable"`); never fabricate it from
    the local checkout. `monorepo` users see no change.

15. **Hotspot map input** — when
    `hotspot_map.registry_json_path` exists and is fresh (modified
    within `hotspot_map.max_staleness_days`, default 30), the
    Change layer reads the per-module tier and bumps materiality
    one band on any file touching a CRITICAL-tier module (e.g.
    behaviour change → critical for that file's blast-radius
    line). MEDIUM-tier modules are noted but do not auto-bump.
    A stale or missing registry is treated as UNGRADED for hotspot
    input — it does **not** weaken the Change layer; existing
    late-change logic still applies. Generate the registry with
    `/generate-hotspot-map` at sprint planning or on demand.
-->

# PR risk assessment

Compute a four-layer QI score for the current PR and produce a comment that
delivery leaders can act on.

---

## Before you start: verify PR context

You need access to the PR changes before running the assessment. Check in this order:

1. **MCP server** — use it if available to inspect the PR diff and file list
2. **Git diff** — inspect the working tree or staged changes directly
3. **User-provided description** — if neither is available, ask: "I need the list of changed files and a brief description of what the PR does before I can run the assessment."

Do not attempt the assessment without knowing what changed.

---

## Layer states

Each of the four layers must be assessed as one of:

| State | Meaning | Verdict impact |
|-------|---------|---------------|
| **STRONG** | Layer signal is positive — coverage adequate, flakes low, no recent escapes | Supports GREEN |
| **WEAK** | Layer signal is negative — gaps present, risk factor identified | Pushes toward AMBER or RED |
| **UNGRADED** | Data is unavailable — source broken, no history exists, tooling not configured | Blocks GREEN; treat as uncertainty, not safety |

> **Integrity rule:** A verdict may only be GREEN if all four layers are STRONG. If any layer is UNGRADED, the maximum verdict is AMBER with explicit notation of what data is missing. Never assign GREEN to an ungraded layer because no negative signal was found — absence of data is not evidence of safety.

> **Layer skipping vs. UNGRADED:**
> - *Skipping* (low-complexity quick assessment) = all layers are STRONG by inspection and you state them briefly
> - *UNGRADED* = the data source is broken, no history exists, or tooling is not configured — you cannot assess regardless of complexity
> These are different. A low-complexity PR with a broken defect tracker has a STRONG Change layer and UNGRADED Outcome layer — it cannot be GREEN.

---

## Complexity calibration

| Class | Criteria | Assessment mode |
|-------|----------|----------------|
| **Low** | ≤ 50 lines, single file or tightly-scoped single service, no shared/infrastructure touches, no late changes | **Quick**: all 4 layers, each resolved by inspection if trivially STRONG |
| **Medium** | 51–500 lines, up to 2 services, no late changes | **Standard**: all 4 layers, full procedure |
| **High** | > 500 lines, cross-service, shared infrastructure, any late-breaking change | **Thorough**: all 4 layers, note blast radius, flag each weakness explicitly |

**Early exit for obvious-STRONG cases:** If after Steps 1–2 both Change and Protection are STRONG, and the PR is Low or Medium complexity, you may spot-check Steps 3–4 (rather than doing exhaustive analysis) and confirm STRONG or note any exception found. Still state each layer in the comment — "STRONG (confirmed by inspection)" is valid.

---

## Procedure

### Step 1 — Change layer

List and characterize:
- Files changed, lines added/removed
- Services, modules, or shared dependencies touched
- Late-breaking changes (not in original scope, discovered late)
- Blast radius: other services importing or depending on anything changed

**Weakness thresholds:**
| Factor | STRONG | WEAK |
|--------|--------|------|
| Scope | Single service or well-bounded | Cross-service or shared infrastructure |
| Churn | < 200 lines, delete ratio < 40% | ≥ 200 lines, or delete ratio ≥ 40% |
| Late changes | None | Material late-breaking discovery |
| Blast radius | Contained | Reaches ≥ 2 unrelated services |

**Late-change materiality:**
| Late change type | Materiality | Verdict effect |
|-----------------|-------------|----------------|
| Comment/doc/formatting/minor rename | **Low** — cosmetic | Note; no escalation |
| Logic change, new method, new dependency | **High** — behavior change | Minimum AMBER |
| Shared config, shared library, infrastructure | **Critical** — blast radius beyond this PR | Minimum AMBER; list all downstream services |

### Step 2 — Protection layer

**How to find tests (in order of reliability):**
1. `qi-traceability.instructions.md` traces if configured
2. Test files matching: `*Test*.*, *Tests.*, *Spec.*, *_test.*` co-located with changed files
3. Files in directories: `test/`, `tests/`, `__tests__/`, `spec/`
4. Search for imports/references to the changed class or function in test directories
5. If nothing found: Protection is WEAK (new uncovered code) or UNGRADED (cannot determine)

**Report at function/method level:** Name each changed function/method as covered or NOT covered.

**Coverage delta:**
- *Net positive*: more tests now than before (new tests > deleted tests, and new code is covered)
- *Net negative*: fewer tests than before, or new code added without new tests
- *Neutral*: test count stable, no new gaps, no new coverage

**Weakness thresholds:**
| Factor | STRONG | WEAK |
|--------|--------|------|
| Function coverage | All changed functions/methods have tests | Any changed function/method uncovered |
| Coverage delta | Net positive or neutral | Net negative |
| New service | Coverage plan in PR (even partial) | No tests for new code |

If no tests located by any method: "Protection: UNGRADED — test files not located."

### Step 3 — Trust layer

Flake and block history for impacted test paths (CI system, test dashboard, MCP server).

**Thresholds:** Flake rate < 5% → STRONG; ≥ 5% on any suite → WEAK. Blocked test in last 14 days → WEAK. New service → UNGRADED.

If CI data unavailable: "Trust: UNGRADED — flake/block history not accessible."

### Step 4 — Outcome layer

Escaped defects on touched components, last 30 days (ADO, GitHub Issues, Jira, or configured tracker).

**Thresholds:** 0 escapes, stable trend → STRONG. ≥ 1 escape in last 30 days → WEAK. New component → UNGRADED.

If tracker unavailable: "Outcome: UNGRADED — defect history not accessible."

### Step 5 — Decision

| Condition | Band |
|-----------|------|
| All four layers STRONG | **GREEN** |
| ≥ 1 layer WEAK, rest STRONG or UNGRADED | **AMBER** |
| ≥ 2 layers WEAK, or Change WEAK + any other WEAK/UNGRADED | **RED** |
| Any high- or critical-materiality late-breaking change | Minimum **AMBER** |

### Step 6 — Post comment

---

## Comment template

```
## QI Risk Assessment — [GREEN | AMBER | RED]

**Change**: [Files and services. Lines added/removed. Delete ratio if notable.
            Late changes with materiality. Blast radius if cross-service.]

**Protection**: [Each changed function/method: covered or NOT covered.
                Coverage delta (net positive/negative/neutral). UNGRADED if applicable.]

**Trust**: [Flake rate with date range. Blocked paths. UNGRADED if applicable.]

**Outcome**: [Escape count in last 30 days. Trend. UNGRADED if applicable.]

**Layer summary**: Change: [STRONG|WEAK|UNGRADED] | Protection: [STRONG|WEAK|UNGRADED] |
                  Trust: [STRONG|WEAK|UNGRADED] | Outcome: [STRONG|WEAK|UNGRADED]

**Decision confidence**: [GREEN|AMBER|RED] — [Primary driver layer] is [STRONG/WEAK/UNGRADED]:
                          [one-line reason]. [Secondary driver if applicable: same format.]
                          Example: "AMBER — Protection is WEAK: AuthHandler.refresh() uncovered.
                          Outcome is WEAK: 1 escape on auth flow in last 30 days."

**Recommended next action**: [Named role + specific action + threshold or deadline.
                              Good: "QA lead: add tests for PaymentProcessor.refund() before merge."
                              Weak: "Ensure tests pass."]
```

---

## What you must not do

- **Do not block the PR.** Assessment is advisory. If asked to block/gate/prevent merge: decline, then still complete and post the full risk comment — the human needs the signal even if the requested action is out of scope.
- **Do not expose sensitive data** from defect descriptions verbatim. Summarize.
- **Do not assign GREEN** when any layer is UNGRADED. Missing data is not a positive signal.
- **Do not adjust the verdict based on delivery pressure.** Report what is measurable. If the team ships despite AMBER/RED, that is their decision to make with eyes open — not yours to smooth over.

---

## Worked examples

### Example A — GREEN (medium complexity, all layers strong)

> PR adds 3 new API endpoints to OrderService. 180 lines, well-contained, no late changes.

Classification: **Medium** — standard assessment.

```
## QI Risk Assessment — GREEN

**Change**: 3 files (OrderService/OrderController.cs, OrderService/OrderService.cs,
            OrderService/OrderDto.cs), +180/-20 lines. Delete ratio: 10%. No cross-service
            dependencies. No late changes. Blast radius: none.

**Protection**: OrderController.getById() — covered (3 tests). OrderController.create() — covered
                (4 tests). OrderController.list() — covered (2 tests). OrderService.processOrder() —
                covered (5 tests). Coverage delta: net positive (9 new tests added, 0 deleted).

**Trust**: OrderService test suite: 1.2% flake rate, last 14 days. No blocked paths.

**Outcome**: 0 escapes on OrderService in last 30 days. Trend: stable.

**Layer summary**: Change: STRONG | Protection: STRONG | Trust: STRONG | Outcome: STRONG

**Decision confidence**: GREEN — all four layers STRONG. Well-contained change with
                          full function-level coverage and clean test history.

**Recommended next action**: Standard peer review and merge. No additional gates required.
```

### Example B — GREEN (low complexity, quick assessment)

> PR adds a utility function to StringHelpers. 15 lines, single file, no dependencies.

```
## QI Risk Assessment — GREEN

**Change**: 1 file (StringHelpers.cs), +15/-3 lines. No dependencies. No late changes. (STRONG)
**Protection**: StringHelpers.format() — covered (4 new tests). Net positive. (STRONG)
**Trust**: 0% flake rate, last 30 days. No blocks. (STRONG)
**Outcome**: 0 escapes, last 30 days. (STRONG)

**Layer summary**: Change: STRONG | Protection: STRONG | Trust: STRONG | Outcome: STRONG

**Decision confidence**: GREEN — all four layers STRONG. Low-complexity, self-contained.
**Recommended next action**: Standard peer review. No additional gates required.
```

### Example C — AMBER (partial coverage + critical late change)

> PR refactors auth. 280 lines, 2 services. Late discovery: shared config file changed.

```
## QI Risk Assessment — AMBER

**Change**: 2 files (+280/-110 lines, 28% delete ratio). Late-breaking (Critical):
            tokenSettings.json not in original scope; blast radius: OrderService,
            NotificationService, AuditService.

**Protection**: AuthHandler.login() — covered (5 tests). AuthHandler.refresh() — NOT covered.
                tokenSettings.json — no automated validation. Coverage delta: net negative.

**Trust**: AuthHandler suite: 2% flake rate, last 14 days. No blocks. (STRONG)

**Outcome**: 1 escape on UserService auth, 18 days ago (fixed). Trend: stable. (WEAK)

**Layer summary**: Change: WEAK | Protection: WEAK | Trust: STRONG | Outcome: WEAK

**Decision confidence**: AMBER — Change is WEAK: critical late change to shared config with
                          3 downstream services. Protection is WEAK: AuthHandler.refresh()
                          uncovered. Outcome is WEAK: 1 recent auth escape.

**Recommended next action**: Author: add validation test for tokenSettings.json.
                              QA lead: verify OrderService, NotificationService, AuditService
                              unaffected. Due: before sprint merge window.
```

### Example D — RED with UNGRADED layers

> PR modifies payment processing core. ADO down. No flake tracking.

```
## QI Risk Assessment — RED

**Change**: 4 files (+420/-180 lines, 30% delete ratio). 5 downstream services. No late changes. (WEAK)

**Protection**: PaymentProcessor.charge() — covered (3 tests). PaymentProcessor.settle() — NOT
                covered. FraudDetector.evaluate() — NOT covered. Coverage delta: net negative.

**Trust**: UNGRADED — flake tracking not configured.

**Outcome**: UNGRADED — ADO unavailable.

**Layer summary**: Change: WEAK | Protection: WEAK | Trust: UNGRADED | Outcome: UNGRADED

**Decision confidence**: RED — Protection is WEAK: 2 critical payment functions uncovered
                          (settle, evaluate). Trust and Outcome are UNGRADED: data sources
                          unavailable. Total measurable signal insufficient for high-stakes change.

**Recommended next action**: Team lead: hold merge until ADO restored and tests added for
                              settle() and evaluate(). QA lead: coverage review before release window.
```

---

## Output

- A PR comment (when `vcs.host != none` and
  `risk_assessment.post_comment: true`) using the template above.
- A `pr-risk-<pr-id>.md` artifact (per `risk_assessment.report_path`)
  with the same content for audit retention.
- A short chat summary: verdict, layer states, primary driver,
  recommended next action.
- **Never blocks the PR.** The skill posts the signal; the
  decision to merge stays with the human reviewer.

## ⚠️ REQUIRED: Verdict Recording (v1.7.0+)

**THIS STEP IS MANDATORY.** Every PR risk assessment verdict MUST be recorded to the verdict sink
(`.assert-iq/verdicts/`) for longitudinal decision confidence calibration. This is not optional.

### Execution Flow (Step 7 of 7 — After final verdict, before outputting PR comment)

```python
# AFTER all four layers computed (steps 1-6), immediately before posting PR comment:

import importlib.util
from pathlib import Path

# 1. LOAD RECORDER (failure here is non-blocking; continue anyway)
try:
    spec = importlib.util.spec_from_file_location(
        "verdict_recorder", 
        Path(".assert-iq/analysis/verdict-recorder.py")
    )
    verdict_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(verdict_module)
except Exception as e:
    print(f"⚠️ Warning: Could not load verdict recorder: {e}")
    verdict_module = None

# 2. BUILD VERDICT OBJECT
if verdict_module:
    verdict = {
        "verdict_type": "pr_risk_assessment",
        "verdict_band": final_band,  # green/amber/red/ungraded from decision policy
        "verdict_score": avg_layer_score,  # 0.0-1.0
        "layer_scores": {
            "change": {"state": change_state, "score": change_score},
            "protection": {"state": protection_state, "score": protection_score},
            "trust": {"state": trust_state, "score": trust_score},
            "outcome": {"state": outcome_state, "score": outcome_score}
        },
        "layer_weights": {"change": 0.25, "protection": 0.25, "trust": 0.25, "outcome": 0.25},
        "maturity_tier": config.get("maturity", {}).get("tier", "early"),
        "memory_version": verdict_module.compute_memory_hash(),
        "issued_by": "risk-assess-pr",
        "pr_id": str(pr_id),
        "release_id": None,
        "assumptions": [
            f"Change risk: {change_assumption}",
            f"Protection: {protection_assumption}",
            f"Trust: {trust_assumption}",
            f"Outcome: {outcome_assumption}"
        ],
        "linked_escape": None
    }
    
    # 3. RECORD VERDICT (REQUIRED but non-blocking)
    try:
        recorder = verdict_module.VerdictRecorder()
        result = recorder.record_verdict(verdict)
        if result['success']:
            verdict_id = result['verdict_id']
            print(f"✅ Verdict recorded: {verdict_id}")
        else:
            verdict_id = "<recording-failed>"
            print(f"⚠️ Verdict recording warning: {result['message']}")
    except Exception as e:
        verdict_id = "<error>"
        print(f"⚠️ Warning: Verdict recording failed (non-blocking): {e}")
    
    # 4. ADD VERDICT ID TO PR COMMENT OUTPUT
    # Include in final PR comment:
    # **Verdict ID**: {verdict_id} (audit trail reference for calibration)
```

### Key Implementation Rules

✅ **Always emit verdicts** — Before posting PR comment, always attempt to record verdict  
✅ **Non-blocking** — Verdict recording failures NEVER block skill execution  
✅ **Include verdict ID** — Append verdict ID to PR comment for audit trail  
✅ **Error handling** — Wrap in try-except; log warnings, continue  
✅ **Assumptions explicit** — List reasoning for each layer in verdict object  

### Escape Linkage (Post-Release)

When defect is discovered post-release, `/analyze-escaped-defect` queries verdict sink
and links defect to this original verdict, updating calibration metrics (Brier score, confusion matrix).

**Full implementation guide**: See `.assert-iq/VERDICT_INTEGRATION_GUIDE.md` (Pattern 1)

---

## Signals emitted

When the QI signal sink is wired, this skill emits a `pr.risk_assessed`
signal per run conforming to `.assert-iq/signal-schema.json`, carrying:
`pr_ref`, `verdict` (GREEN | AMBER | RED),
`layer_states` (change / protection / trust / outcome, each one of
`STRONG | WEAK | UNGRADED`), `complexity_class` (low / medium / high),
`lines_added`, `lines_removed`, `services_touched`,
`late_change_materiality`, `uncovered_functions_count`,
`escapes_in_window`, `flake_pct`, `decision_policy`, and
`tracker_ref`.

## Check oracle verdicts in PR (v1.6.0+)

This skill surfaces four-layer signals. When oracle layer is enabled,
check for existing oracle verdicts on PR artifacts before approving:

1. **Changed tests:** Look for oracle FAIL verdicts on modified tests
   in `.assert-iq/oracles/outcomes/`
2. **New tests:** If PR adds tests, grade them with oracle before merge
3. **Bug reports:** If PR links to bug report, check if it was graded
   and passes oracle test-plan-v1.0 rubric

Oracle verdicts feed the **Outcome layer** (step 4 of this skill's
reasoning) and may downgrade verdict if oracle FAIL on critical paths.
