---
name: release-confidence
mode: agent
description: "Aggregate QI signals across an upcoming release and produce a go/no-go report."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, deployment model, tracker, VCS, observability
stack, or team**. The QI four-layer model (Change / Protection /
Trust / Outcome) is the engine — you wire it to your own data
sources.

**How placeholders work**: the agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next
to each point). If a key is absent, the agent runs in **partial-
signal mode** with explicit confidence reduction — it never
fabricates.

1. **Release identifier source** — set
   `.assert-iq/config.yaml > release.identifier_source`:
   - `tag`       — git tag (`v1.2.3`)
   - `branch`    — release branch (`release/2026.05`)
   - `build`     — CI build number
   - `commit`    — raw SHA
   - `manual`    — user supplies the ID each run
   The skill accepts any of these per-invocation regardless.

2. **VCS host** — inherits `vcs.host` (github / azure_devops /
   gitlab / bitbucket / gitea / gerrit / phabricator / radicle /
   none). Used to fetch the PR list in scope.

3. **Tracker** — inherits `tracker.system`. Used to resolve
   work-item scope and to look up incident links.

4. **Change-risk inputs** — the agent computes Change risk from:
   - PRs in release range (via `vcs.host` MCP)
   - Service criticality map at
     `.assert-iq/config.yaml > release.service_criticality`
     (free-form: `{ payments: critical, billing: critical,
     notifications: low, ... }`)
   - Reversibility hints at `release.irreversible_paths` (e.g.
     migrations, schema changes, public API removals)
   - **Hotspot tier (optional)** — when
     `hotspot_map.registry_json_path` is fresh (within
     `hotspot_map.max_staleness_days`, default 30), the per-module
     CRITICAL / MEDIUM tier supplements (does not replace) the
     manual `service_criticality` map. Stale or missing registry
     is UNGRADED for hotspot input; manual map alone still applies.
     Generate via `/generate-hotspot-map`.

5. **Protection inputs** — inherits `coverage_analysis.*` and
   `traceability.*`. The skill reuses whatever sink those skills
   already produce.

6. **Trust inputs** — inherits `flake_analysis.results_store`
   (CI native / JUnit glob / Datadog / Launchable / etc.). Pass
   rates, flake rates, override counts.

7. **Outcome inputs** — set
   `.assert-iq/config.yaml > release.outcome_sources`. Supported:
   - `prometheus` / `datadog` / `new_relic` / `splunk` /
     `azure_monitor` / `cloudwatch` / `honeycomb` / `sentry` /
     `bugsnag` / `pagerduty` / `opsgenie` / `incident_io` /
     `firehydrant` / `statuspage` / `custom_csv` / `none`
   - When `none`, the Outcome layer is scored "Unable to assess".
   - **Oracle verdicts (v1.6.0+):** When oracle layer is enabled
     (`.assert-iq/config.yaml > oracle.enabled: true`), verdicts from
     `/grade-with-rubric` on release artifacts (tests, reports, plans)
     contribute to Outcome layer per maturity-tier weighting (early: 0%,
     mid: 20%, higher: 50%). Any FAIL verdicts without mitigations
     downgrade Outcome to Medium at minimum.

8. **Score thresholds** — the High/Medium/Low coverage and flake
   thresholds (≥80%, 60–80%, <60%; <2%, 2–5%, >5%) are universal
   QI defaults. Override per team via
   `.assert-iq/config.yaml > release.score_thresholds`:
   ```yaml
   release:
     score_thresholds:
       protection: { high_pct: 80, medium_pct: 60 }
       trust:      { high_flake_pct: 2, medium_flake_pct: 5 }
   ```

9. **Red-flag policy** — the 8 red flags in Step 3 are universal
   defaults. Extend via
   `.assert-iq/config.yaml > release.red_flags_extras` (array of
   `{ id, signal, impact }` entries).

10. **Verdict policy** — strict GO requires all-High; mid-tier
    relaxes to 3 High + 1 Medium. Override the policy bands via
    `.assert-iq/config.yaml > release.verdict_policy`:
    - `strict`        (default; requires all-High for plain GO)
    - `pragmatic`     (allows 1 Medium for GO when no red flags)
    - `enterprise`    (HOLD on any unmitigated Medium on a
      critical-criticality service)

11. **Report sink** — set
    `.assert-iq/config.yaml > release.report_path` (default
    `./release-confidence-<release-id>.md`). The agent can also
    post the report to the configured `vcs.host` as a release-tag
    comment when set to do so.

12. **Compliance / audit hold** — set
    `.assert-iq/config.yaml > release.compliance_lock`
    (`none | release_freeze | regulatory`). Matches
    `traceability.compliance_lock`. Under `regulatory`, the
    report is written as an immutable artifact with a sha256
    digest beside it.

13. **Platform notes** — deployment-model-agnostic. The report
    works for monolith / microservices / serverless / mobile app
    store releases / firmware / ML model rollouts / data
    pipelines. The Outcome layer simply reads from whichever
    telemetry source is wired.

14. **Workspace topology** — inherits
    `.assert-iq/config.yaml > workspace.role` (`monorepo` |
    `prod` | `tests`, default `monorepo`). When `role=tests`, the
    **Change layer** (release diff, included commits, blast
    radius) lives in `workspace.companion_repo`; when `role=prod`,
    the **Protection** and **Trust** layers (test results, flake
    history) live in the companion. Fetch via MCP → local path →
    manual paste per `.assert-iq/workspace-topology.md`. If the
    companion is unavailable, the affected layer is reported as
    UNGRADED with `reason: "companion_repo_unset"`. This skill
    already supports `partial_signal_mode: true` — the verdict
    card flags topology-driven UNGRADED layers explicitly so the
    release decision is made with full awareness of the gap.
-->

# Release confidence report

Produce a release readiness report for a candidate release artifact (tag, build,
or release branch). Aggregates signals across the QI four-layer model and delivers
an evidence-based go/no-go recommendation.

## Scope boundary

This skill assesses **release-level** confidence (multiple PRs, a release scope).

| Request | Action |
|---|---|
| Release/tag/build + feature scope | Proceed with report below |
| Single PR risk assessment | Redirect: "That's PR-level scope — use `risk-assess-pr`. For release confidence, provide the release candidate (tag/build/branch) and the set of features included." |
| "Should we deploy?" + release context | Proceed |
| "Is this PR safe?" / single change | Redirect: "Single-change assessment uses `risk-assess-pr`. Release confidence aggregates across all changes in a release." |
| Sprint/milestone with no specific artifact | Ask: "Which build/tag/branch represents the release candidate?" |

## Inputs

- **Release identifier** — tag, branch, or build number
- **Scope** — explicit in-scope IDs by type: Epics, Features, User Stories, Bugs,
  Tasks, and PRs (fetch via MCP; otherwise ask user to provide IDs or a query)
- **Available signals** — what data sources are accessible (CI, coverage, telemetry, incident history)
- **Evidence contract** — for each in-scope work item, capture at least one factual
  evidence link (PR, file diff, test run, incident, or reviewer trace)

## Procedure

### Step 1: Gather signals

| Layer | Sources | What to look for |
|---|---|---|
| **Change risk** | PR list, diff scope, files touched, services impacted | Criticality of workflows, blast radius, reversibility |
| **Protection** | Coverage, traceability, PR reviews | Coverage on impacted code, requirement-to-test mapping |
| **Signal trust** | Test results, flake history, CI status | Pass rates, flake/block counts, overrides, test age |
| **Outcome evidence** | Prod telemetry, incident history, oracle verdicts, escaped defects | Recent incidents, error rate trends, SLO status, oracle grading results

**If a signal source is unavailable:** Note it explicitly. Don't fabricate. Score that layer with reduced confidence.

### Step 1A: Build the work-item evidence ledger (required)

Before scoring, enumerate all in-scope items by type and map each to evidence:

| Type | Required evidence |
|---|---|
| **Epic / Feature** | Child stories/tasks + PR mapping + impacted component summary |
| **User Story** | Acceptance criteria status + covering tests (or explicit gap) |
| **Bug** | State/severity + repro/escape relevance + fix/mitigation status |
| **Task** | Delivery artifact or verification proof (code/test/config/doc) |
| **PR** | Diff scope + review status + CI/test outcomes |

Rules:
1. Do not collapse types into a single aggregate bucket.
2. Do not infer completion from parent-only status.
3. If a type has zero items in scope, state `None in scope` explicitly.
4. If any in-scope item lacks evidence, mark it `Unverified` and apply a confidence penalty.

### Step 2: Score each layer

Score each layer **High / Medium / Low**:

| Layer | High | Medium | Low |
|---|---|---|---|
| **Change** | Low-criticality, small scope, fully reversible | Mixed criticality, moderate scope, mostly reversible | High-criticality workflows, large scope, irreversible |
| **Protection** | ≥80% coverage on impacted code, full traceability | 60-80% coverage, partial traceability | <60% coverage, no traceability, bypassed reviews |
| **Trust** | <2% flake rate, no overrides, tests well-aged | 2-5% flake rate, minor overrides | >5% flake, overridden failures, untested new tests |
| **Outcome** | No incidents on touched components (30d), oracle verdicts all PASS/CONDITIONAL | Minor incidents, slight variance, oracle CONDITIONAL verdicts with mitigations | Recent P1/P2 on touched components, degrading trends, oracle FAIL verdicts |

#### Intra-layer aggregation

When a layer has mixed signals across services/components:

1. **Weight by criticality** — payment pipeline at 60% coverage matters more than admin dashboard at 60%
2. **Worst-critical-path rule** — the layer score cannot exceed the score of its most critical component
3. **Example:** Auth 94% + Payments 78% + Notifications 60%. If payments is highest-criticality → Protection score is driven by payments (78% → Medium). Notifications at 60% reinforces Medium. Overall: **Medium**.

### Step 3: Validate signals (red-flag check)

Before computing verdict, check for patterns that invalidate surface metrics:

| Red flag | Signal | Impact |
|---|---|---|
| Coverage spike (>20% jump in <1 week) | Tests may be shallow/quantity-over-quality | Protection → Medium max |
| New tests >30% of covering suite (<48h old) | Unproven test reliability | Trust → downgrade one level |
| Overridden/skipped CI checks | Signals actively suppressed | Trust → Low |
| Key personnel unavailable post-deploy | Can't triage issues | Add operational mitigation |
| No rollback plan for irreversible changes | Recovery impossible | Cannot be GO without plan |
| No production baseline (new product area) | Cannot assess Outcome layer | Outcome → "Unable to assess"; increase Protection weight |
| Business pressure to ship | External factor | Note in report; never adjusts layer scores |
| Deploy window risk (Friday PM, holiday eve) | Reduced response capacity | Add operational mitigation |

### Step 4: Determine verdict

| Verdict | Criteria |
|---|---|
| **GO** | All layers High, OR 3 High + 1 Medium with no red flags, and all in-scope work-item types are evidence-complete (no `Unverified` items) |
| **GO-WITH-MITIGATION** | At least 2 High, no Low, mitigations address Medium areas, and every `Unverified` item has a dated owner/action |
| **HOLD** | Any layer Low, OR unmitigatable red flag, OR multiple Medium + red flags, OR missing evidence for in-scope work items without a credible mitigation plan |

**Completeness gate:** A verdict cannot be based on a high-level sweep. It must cite item-level evidence across all in-scope types (Epic, Feature, Story, Bug, Task, PR), or explicitly state `None in scope` per type.

**HOLD framing:** "What needs to happen before this ships" — list specific resolution criteria.

**Low layer + mitigation?** Only if mitigation fully resolves the Low (e.g., "add rollback plan" resolves "no rollback plan"). If Low comes from fundamental coverage/quality gaps, mitigation can't substitute → HOLD.

### Step 5: Assess operational readiness

Beyond code quality — supplementary factors that can add mitigations or caveats:
- On-call capacity and domain expertise coverage
- Rollback plan existence and test status
- Monitoring/alerting for impacted paths
- Communication plan for customer-facing changes
- Deploy window appropriateness

These don't override layer verdicts but can add mitigations to a GO verdict.

### Step 6: Produce report

```markdown
# Release Confidence Report — <release-id>

**Verdict:** GO | GO-WITH-MITIGATION | HOLD
**Date:** <date>
**Signals available:** <what was assessable>
**Signal gaps:** <what's missing, if any> → <impact on confidence>

## Layer Scores

| Layer | Score | Key Evidence |
|---|---|---|
| Change risk | High/Med/Low | <1-2 sentences with data> |
| Protection | High/Med/Low | <coverage %, traceability, reviews> |
| Signal trust | High/Med/Low | <pass rate, flakes, overrides, test age> |
| Outcome evidence | High/Med/Low | <incidents, trends, or "unable to assess — no baseline"> |

## Work-Item Evidence Ledger (required)

| Type | In Scope Count | Assessed Count | Unverified Count | Evidence Links |
|---|---:|---:|---:|---|
| Epic | <n/none> | <n> | <n> | <links> |
| Feature | <n/none> | <n> | <n> | <links> |
| User Story | <n/none> | <n> | <n> | <links> |
| Bug | <n/none> | <n> | <n> | <links> |
| Task | <n/none> | <n> | <n> | <links> |
| PR | <n/none> | <n> | <n> | <links> |

## Red Flags
- [Flag]: [Evidence] → [Scoring impact]
(or "None identified")

## Operational Readiness
- On-call: [status]
- Rollback: [exists/tested/missing]
- Monitoring: [adequate/gaps]
- Deploy window: [appropriate/risky]

## Mitigations Required (GO-WITH-MITIGATION)
| # | Mitigation | Owner | By When | Addresses |
|---|---|---|---|---|
| 1 | <action> | <person/team> | <date> | <layer/risk> |

## Blocking Items (HOLD)
| # | Blocker | Resolution Criteria | Layer |
|---|---|---|---|
| 1 | <blocker> | <what specifically must change> | <layer> |

## Explicit Risk Acceptance
- <risk> — accepted by <name/role> — rationale: <why>

## What Would Change the Verdict
- <signal shift that flips recommendation>
- <e.g., "Coverage on payment path → 80% upgrades Protection to High → GO">
```

### Partial-signal mode

When signals are incomplete, add to report header:
```markdown
**Confidence modifier:** Reduced — [layer(s)] could not be independently verified.
**Assumptions:** <what was assumed in absence of data>
```

For unassessable layers:
> "[Layer]: Unable to assess — [source] unavailable. Assuming Medium for verdict calculation. Verify [specific data needed] before shipping."

### Low-risk fast-path

If initial scan shows: all changes are low-criticality (UI copy, config, styling), scope is small (≤5 PRs, single service), no red flags visible → abbreviated report:

```markdown
# Release Confidence — <id>
**Verdict:** GO (low-risk fast-path)
**Rationale:** [N] low-criticality changes, [service] only, all signals green, no red flags.
**Caveat:** Fast-path applied due to low complexity. Full assessment not performed.
```

## Governance

- Never GO when any layer is Low without a mitigation that fully resolves the Low.
- Low + incomplete mitigation = HOLD.
- Business pressure noted in report but never adjusts layer scores.
- All risk acceptances require a named person/role.
- HOLD includes specific resolution criteria (not just "fix it").
- Verdict must be justified by layer scores — no overriding the framework with "gut feel."
- Verdict conclusion must include item-level evidence across all in-scope work-item types; high-level sweeps are not acceptable.
- Any in-scope item without evidence is `Unverified` and must either block GO or be covered by explicit owner/date mitigation.

## Worked examples

### Standard release — GO-WITH-MITIGATION

```
Release: v2.4.1 — 12 PRs, Auth + Payments + Notifications services

Step 1-2 (Gather + Score):
  Change: Mixed criticality (auth=high, notifications=low), moderate scope, reversible → Medium
  Protection: Auth 94%, Payments 78%, Notifications 60%. Payments is highest-criticality.
    → Worst-critical-path: Payments 78% = Medium. Notification 60% reinforces. → Medium.
  Trust: 1.2% flake rate, no overrides, tests aged 3+ months → High
  Outcome: No incidents on auth/payments (30d), 1 minor on notifications (resolved) → High

Step 3 (Red flags): None identified.

Step 4 (Verdict): 2 High (Trust, Outcome) + 2 Medium (Change, Protection), no Low, no flags
  → GO-WITH-MITIGATION (need mitigations for Medium areas)

Mitigations:
  1. Add integration test for payments edge case (78% gap area) — owner: @payments-team — by: before deploy
  2. Feature flag on auth changes for instant rollback — owner: @platform — by: deploy time

What would change: "Payments coverage → 80% upgrades Protection to High → plain GO."
```

### Partial signals — degraded mode

```
Release: v1.2.0 — 4 PRs, UI theming + accessibility fixes, single frontend service.
No MCP available. No coverage tool integrated. Manual review only.

Step 1-2 (Gather + Score):
  Change: Low-criticality (styling, a11y), small scope, fully reversible → High
  Protection: Unable to assess — no coverage tool. Code reviews: all 4 PRs approved by 2+ reviewers.
    → Unable to assess independently. Reviews suggest adequate. Assuming Medium.
  Trust: Manual test pass on staging. No automated suite metrics available.
    → Unable to assess independently. Manual pass noted. Assuming Medium.
  Outcome: No prior incidents on frontend theming (90d). → High

Step 3 (Red flags): None.

Step 4 (Verdict): 2 High (Change, Outcome) + 2 assumed-Medium (Protection, Trust), no flags.
  → GO-WITH-MITIGATION (reduced confidence)

Confidence modifier: Reduced — Protection and Trust could not be independently verified.
Assumptions: Coverage adequate based on review approval; tests reliable based on manual pass.

Mitigations:
  1. Manual smoke test of themed pages across browsers — owner: @frontend-qa — by: deploy day
  2. Staged rollout (internal → 10% → 100%) — owner: @platform — by: deploy sequence

What would change: "Integrating coverage tool would allow independent Protection verification."
```

### Adversarial / conflicting signals — don't be fooled

```
Release: v3.0.0-beta — 100% CI pass, 89% coverage (was 45% last week),
all core authors on vacation, business must-ship deadline, new product area.

Step 2 (initial): Change=Medium (new area, moderate scope), Protection=High (89%!),
                  Trust=High (100% pass!), Outcome=N/A (new area).

Step 3 (red flags):
  - Coverage spike: 45% → 89% in one week → Protection capped at Medium
  - New tests: >40% of suite added in 48h → Trust downgraded to Medium
  - No baseline: new product → Outcome unable to assess (assume Medium)
  - Key personnel: unavailable → operational mitigation needed
  - Business pressure: noted, scores unchanged

Step 4: Revised scores: Change=Medium, Protection=Medium, Trust=Medium, Outcome=Medium.
        Multiple Medium + red flags → Verdict: GO-WITH-MITIGATION (borderline HOLD)

Mitigations: Manual smoke test of critical paths (covers Protection gap),
             senior engineer on-call arrangement (covers personnel gap),
             staged rollout (10% → 50% → 100%) instead of full deploy.

What would change: "If coverage jump is verified as meaningful (tests cover real scenarios,
not just line coverage gaming), Protection upgrades → stronger GO."
```
---

## HTML rendering (required deliverable)

Every Release Confidence Report must ALSO be produced as a standalone,
self-contained HTML file, in addition to the Markdown. This is the
preferred artifact for Go/No-Go meetings and for sharing.

- **Template (authoritative):** reproduce
  [`references/release-confidence-template.html`](references/release-confidence-template.html)
  exactly — keep the `<style>` block verbatim and swap only the
  `{{TOKEN}}` content. Do not invent a new layout; this is the
  approved look and feel.
- **Verdict color:** set the `.verdict` background to `var(--go)`
  (GO), `var(--gomit)` (GO-WITH-MITIGATION), or `var(--hold)` (HOLD).
  Match each layer's bar width/color to its band (High ≈ 85% green,
  Medium ≈ 55% orange, Low ≈ 28% red; unable-to-assess uses the
  `s-na` pill).
- **Self-contained:** inline CSS only, no external assets, print/PDF
  friendly. Save next to the Markdown report (same `release.report_path`
  directory) as `release-confidence-<release-id>.html`.
- **Redaction:** never embed PII, driver/consignee data, COD/payment
  values, secrets, or employee IDs in the HTML. For external audiences,
  generalize client/work-item specifics on request.


## Output

- A `release-confidence-<release-id>.md` (or `release.report_path`)
  containing the full report shell from Step 6, including any
  partial-signal mode header and operational-readiness section.
- A standalone `release-confidence-<release-id>.html` rendered from
  [`references/release-confidence-template.html`](references/release-confidence-template.html)
  (see **HTML rendering** above) — the meeting-ready artifact.
- When `release.compliance_lock` is `release_freeze` or
  `regulatory`: an immutable copy of the report tagged with the
  release identifier (plus `.sha256` digest under `regulatory`)
  for audit retention.
- Optional: a release-tag comment on the configured VCS host
  (`vcs.host`) summarising the verdict and linking to the full
  report.
- A short chat summary: verdict, top blockers (HOLD) or
  mitigations (GO-WITH-MITIGATION), what would change the
  verdict.

## Signals emitted

When the QI signal sink is wired, this skill emits a
`release.confidence_assessed` signal per run conforming to
`.assert-iq/signal-schema.json`, carrying: `release_id`, `verdict`
(GO / GO-WITH-MITIGATION / HOLD), `layer_scores` (4 scores +
unable-to-assess flags), `red_flags_triggered`, `mitigations_count`,
`blockers_count`, `risks_accepted`, `partial_signal_mode`,
`compliance_lock`, and `tracker_ref` (release work-item or tag).

## ⚠️ REQUIRED: Verdict Recording (v1.7.0+)

**THIS STEP IS MANDATORY.** Every release confidence verdict MUST be recorded to the verdict sink
for longitudinal decision confidence calibration. This is not optional.

### Execution Flow (Step 7 of 7 — After Step 6 decision synthesis, before outputting report)

After synthesizing all four layers (Change / Protection / Trust / Outcome) and computing
final decision confidence:

```python
# 1. LOAD RECORDER (failure here is non-blocking; continue anyway)
try:
    import importlib.util
    from pathlib import Path
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
    # Map verdict band: GO → green, GO-WITH-MITIGATION → amber, HOLD → red
    band_map = {"GO": "green", "GO-WITH-MITIGATION": "amber", "HOLD": "red"}
    
    verdict = {
        "verdict_type": "release_confidence",
        "verdict_band": band_map.get(final_verdict, "red"),
        "verdict_score": avg_layer_confidence,  # 0.0-1.0
        "layer_scores": {
            "change": {"state": change_state, "score": change_score},
            "protection": {"state": protection_state, "score": protection_score},
            "trust": {"state": trust_state, "score": trust_score},
            "outcome": {"state": outcome_state, "score": outcome_score}
        },
        "layer_weights": {"change": 0.25, "protection": 0.25, "trust": 0.25, "outcome": 0.25},
        "maturity_tier": config.get("maturity", {}).get("tier", "early"),
        "memory_version": verdict_module.compute_memory_hash(),
        "issued_by": "release-confidence",
        "pr_id": None,
        "release_id": str(release_id),
        "assumptions": [
            f"Change: {change_assumption}",
            f"Protection: {protection_assumption}",
            f"Trust: {trust_assumption}",
            f"Outcome: {outcome_assumption}",
            f"Decision policy: {decision_policy}"
        ],
        "linked_escape": None  # Populated later if escape discovered
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
    
    # 4. ADD VERDICT ID TO REPORT OUTPUT
    # Include in both Markdown and HTML:
    # **Verdict ID**: {verdict_id} (audit trail reference for calibration)
```

### Key Implementation Rules

✅ **Always emit verdicts** — Before posting release report, always attempt to record verdict  
✅ **Non-blocking** — Verdict recording failures NEVER block skill execution  
✅ **Include verdict ID** — Append verdict ID to both Markdown and HTML reports  
✅ **Error handling** — Wrap in try-except; log warnings, continue  
✅ **Assumptions explicit** — List reasoning for each layer + decision policy  
✅ **Band mapping** — GO→green, GO-WITH-MITIGATION→amber, HOLD→red  

**Full implementation guide**: See `.assert-iq/VERDICT_INTEGRATION_GUIDE.md` (Pattern 2)