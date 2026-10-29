---
name: generate-test-plan
mode: agent
description: "Produce a one-page operating test plan a delivery team can actually use — calibrated to scope, risk-weighted, signal-based exit criteria."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, platform, tracker, manual-test tool, or team**
— it produces a markdown plan by default and adapts to whatever
test-plan management tool your team uses. You'll get sharper, faster
results if you fill in the per-repo specifics below.

**How placeholders work**: the agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If a key is absent, the agent infers from repo signals
or asks you. Wire values once and they flow into every skill that
references them.

1. **Tracker** — set `.assert-iq/config.yaml > tracker.system`. The
   agent uses the right ID syntax (`AB#1234`, `PROJ-123`, `#123`,
   `ENG-123`) when linking ACs and owners. Supported: ADO, Jira,
   GitHub Issues, GitLab, Linear, Bitbucket, Shortcut, Pivotal,
   Redmine, Trello, Notion.

2. **Test-plan management tool** — set
   `.assert-iq/config.yaml > manual_test_management.tool` (shared
   key). Supported outputs:
   - `markdown` (default) — the plan as a `.md` file
   - `azure_devops_test_plans` — markdown **plus** ADO Test Plan
     structure (suites + plan import)
   - `xray` / `zephyr` / `testrail` / `qase` / `practitest` /
     `tricentis_qtest` — markdown **plus** plan-level import
     skeleton for the tool
   - `notion` / `confluence` — wiki page format
   - `none` — markdown only

3. **Plan output path** — set
   `.assert-iq/config.yaml > test_plan.output_path` (default
   `./tests/_qi/plans/`). For tracker-backed tools, files are created
   via API / MCP.

4. **Complexity ceilings** — the trivial / feature / release /
   program target line counts (30 / 80 / 150 / 250) are universal
   starting points. Override per-team via
   `.assert-iq/config.yaml > test_plan.complexity_ceilings`.

5. **Approach distribution heuristics** — the auto/manual/exploratory
   percentages in the table below are starting points by project
   type. Override defaults via
   `.assert-iq/config.yaml > test_plan.approach_defaults` keyed by
   `api | ui | data | integration | security | mobile | embedded |
   ml | infra`.

6. **Risk model** — the agent uses the configured
   `manual_cases.risk_tier_model` (`priority_severity` | `wsjf` |
   `rice` | `custom`) to weight risk areas. No separate config
   needed here.

7. **Risk-history source** — the agent pulls escape / churn /
   coverage-gap data from the same sinks the other QI skills use:
   `escape_analysis.results_store`, `flake_analysis.results_store`,
   `coverage_analysis.results_store`. If none exist, the plan notes
   "structural-only assessment".

8. **Environments catalogue** — set
   `.assert-iq/config.yaml > test_plan.environments` (free-form
   array, e.g. `["local", "dev", "staging", "pre-prod", "prod"]`).
   The agent prefers your real environments to generic placeholders.

9. **Exit-criteria policy** — set
   `.assert-iq/config.yaml > test_plan.exit_criteria_policy`:
   - `strict_measurable` (default) — reject any non-measurable
     criterion ("tests look good", "QA signs off")
   - `prefer_measurable` — measurable wherever possible; allow
     judgement gates when explicitly justified

10. **Maturity-aware behaviour** — the agent respects
    `.assert-iq/config.yaml > maturity_tier`:
    - `early` — emits the plan but adds a "this team has limited
      historical signals" disclaimer
    - `mid` — weights risks with available signals
    - `higher` — enforces signal-based exit criteria strictly

11. **Platform notes** — the plan is platform-agnostic. For mobile
    add device-matrix; for embedded add hardware-rig matrix; for
    ML add model-evaluation gates; for data add data-quality
    gates. The templates below absorb these via the Environments
    and Risk Areas sections.
-->

# Generate test plan

Produce a working test plan. Not a 30-page document; a one-page operating plan a delivery team can actually use.

## When to use this skill

| Request type | Route |
|---|---|
| "Test plan for [feature/sprint/release]" | **This skill** — proceed below |
| "Write test cases for [feature]" / specific steps requested | **Not this skill** — redirect to test case generation |
| "What should we test?" without scope/timeline context | **Clarify** — ask for scope before proceeding |
| "Review our testing approach" / feedback on existing plan | **Not this skill** — provide feedback directly |

If the request is about test case steps:
> "You're asking for test cases (execution steps), not a test plan (strategy document). Want me to generate test cases instead, or do you need a test plan for the broader feature?"

## Inputs

| Input | Required | Source |
|-------|----------|--------|
| Scope | Yes | Feature name, sprint, release, or work-item set |
| Audience | Yes | Embedded QE pod, stakeholder, or both |
| Work items / ACs | Preferred | MCP if available; otherwise ask user or work from feature description |
| Risk context | Preferred | Recent escapes, churn areas, known gaps |
| Constraints | If any | Timeline, environment limitations, team capacity |

**When MCP is unavailable:** Work from whatever the user provides. State assumptions explicitly.

**When risk context is unknown:** Ask: "Any recent defects, high-churn areas, or known gaps I should weight?" If unavailable, state: "Risk assessment structural only (new integrations, complexity, dependency count). Validate priorities with the team."

**When scope is unstable:** Surface instability as the primary finding. Produce a partial plan for known items and explicitly list what's needed before the plan can be completed. Do not fabricate confidence.

**When scope is contradictory:** If the user asks for a test plan that includes items outside the stated scope (e.g., "test plan for feature X" but also mentions testing Y and Z), clarify: "Your scope says X but you've also mentioned Y and Z. Should the plan cover all three, or just X?"

## Complexity calibration

| Level | Signals | Template target | Sections to include |
|-------|---------|-----------------|---------------------|
| **Trivial** | Single bug fix, config change, ≤ 1 day | ≤ 30 lines | Objective, Scope, Approach (1 line), Exit Criteria |
| **Feature** | Single feature, clear boundaries, 1-2 sprints | ≤ 80 lines | All sections, concise |
| **Release** | Multi-feature, cross-team, multiple envs | ≤ 150 lines | All sections + per-feature risk differentiation |
| **Program** | Multi-release, 3+ months, org-wide | ≤ 250 lines | Full template + phased schedule + checkpoints |

Match output length to complexity.

## Procedure

1. **Gather context.** MCP if available; otherwise work from provided inputs.
2. **Assess complexity** using the calibration table.
3. **Aggregate ACs** across scope. Classify by test approach.
4. **Identify high-risk areas:**
   - Components with recent escapes (if known)
   - High-churn areas (if observable)
   - New integrations or vendor dependencies
   - Weak existing coverage
   - Ambiguous or missing ACs
5. **For multi-feature releases:** Prioritize by risk. Effort proportional to risk, not equal.
6. **Generate the plan** using the template. Drop empty/speculative sections.
7. **Verify** output matches complexity calibration target. Trim if over.
8. **Output as markdown.** When `manual_test_management.tool` is set to a tracker-backed tool (ADO Test Plans, Xray, Zephyr, TestRail, Qase, PractiTest, qTest), additionally produce the importable plan structure for that tool.

## Approach distribution heuristics

Starting points — adjust with rationale:

| Project type | Auto | Manual | Exploratory | Why |
|---|---|---|---|---|
| API / backend | 70% | 10% | 20% | Deterministic I/O; explore for integration unknowns |
| UI-heavy | 30% | 40% | 30% | Visual/UX manual-heavy; explore device/browser edges |
| Data pipeline | 60% | 20% | 20% | Validation rules automate; manual for data quality |
| New integration | 40% | 20% | 40% | Unknowns demand exploration; automate contract boundaries |
| Security-sensitive | 50% | 15% | 35% | Automate known patterns; explore novel attack surfaces |

## Output template

```markdown
# Test Plan: [Name]

## Objective
One sentence: what this plan proves and why it matters now.

## Scope
| In | Out | Rationale |
|----|-----|-----------|

## Approach
| Type | % | Focus areas | Rationale |
|------|---|-------------|-----------|

## Risk Areas
| # | Area | Level | Signal Layer | Mitigation |
|---|------|-------|-------------|------------|

## Environments & Prerequisites
- Environment: ...
- Data: ...
- Dependencies: ...

## Schedule (milestone-aligned)
| Milestone | Activities | Gate |

## Entry Criteria
- [Measurable]

## Exit Criteria
- [Measurable, signal-based]

## Decision Points
| When | Decision | Evidence Required |

## Owners
| Activity | Owner |
```

### Section rules

- **Objective:** One sentence. Anti-pattern: "This test plan aims to ensure quality..."  Better: "Prove [X] is safe to ship by validating [Y]."
- **Scope:** Always include Out with rationale. Anti-pattern: "Out of scope: everything else."
- **Approach:** Must sum to ~100%. Rationale mandatory. Use heuristics as starting points.
- **Risk areas:** Include mitigation for every HIGH+ risk. Anti-pattern: risks without mitigations.
- **Exit criteria:** Measurable only. Reject: "tests look good," "QA signs off." Accept: "0 P1/P2 open," "regression suite green."
- **Decision points:** Evidence required, not just dates.
- **Drop sections** that would be empty.

### Constraint Analysis section (when conflicts exist)

```markdown
## Constraint Analysis
| Constraint | Conflicts With | Consequence |
|------------|---------------|-------------|

**Residual risks that cannot be fully mitigated:**
1. [Risk] — because [constraint]. Accepted by: [who].
```

### Adaptation rules

| Scenario | Adaptation |
|----------|-----------|
| No test environment | Shift to production validation (canary, feature flags, monitoring). State residual risk. |
| No team capacity info | Omit Owners. Note: "Assign owners once allocation confirmed." |
| Fast turnaround (< 3 days) | Trivial template. Entry + Exit criteria only. |
| Constraints conflict | Add Constraint Analysis section. |
| Risk history unavailable | Note structural-only assessment. Recommend team validation. |

## Governance

- Do not pad. Drop empty sections.
- Exit criteria must be measurable.
- Surface gaps rather than fabricate confidence.
- When constraints conflict, surface tensions, state residual risk, propose pragmatic mitigation.
- Multi-feature releases: effort proportional to risk.

## Worked examples

### Example A: Feature-level

**Input:** "Test plan for payment retry feature. Retries failed payments 3x with exponential backoff. Touches payment + notification services. P1 last month: duplicate charges from retries."

**Complexity:** Feature. Target: ≤ 80 lines.

```markdown
# Test Plan: Payment Retry Feature

## Objective
Prove retry logic is safe (no duplicate charges) and effective (recovers transient failures).

## Scope
| In | Out | Rationale |
|----|-----|-----------|
| Retry logic (1-3 attempts, backoff) | Provider internals | We control retry, not provider |
| Idempotency (duplicate prevention) | Notification design | Integration only |
| Notification on final failure | Config tuning | Ship defaults, tune later |

## Approach
| Type | % | Focus | Rationale |
|------|---|-------|-----------|
| Automation | 60% | Retry sequences, idempotency, timing | Deterministic, regression-critical |
| Manual | 15% | Notification delivery, admin UI | UX verification |
| Exploratory | 25% | Race conditions, concurrent retries | P1 history demands exploration |

## Risk Areas
| # | Area | Level | Mitigation |
|---|------|-------|------------|
| 1 | Duplicate charges | CRITICAL | Idempotency validation + exploratory charter |
| 2 | Backoff under load | HIGH | Load test retry sequences |
| 3 | Notification coupling | MEDIUM | Contract test at boundary |

## Exit Criteria
- 0 duplicate charges across all retry scenarios
- Retry automation green (all patterns)
- Exploratory findings dispositioned
- Notification verified for final-failure path

## Decision Points
| When | Decision | Evidence |
|------|----------|----------|
| Automation complete | Proceed to exploratory? | Retry/idempotency tests green |
| After exploratory | Ship? | Findings dispositioned, 0 P1/P2 |
```

38 lines.

### Example B: Trivial-level

**Input:** "Test plan for bumping session timeout from 30→60 min."

**Complexity:** Trivial. Target: ≤ 30 lines.

```markdown
# Test Plan: Session Timeout Change (30→60 min)

## Objective
Confirm timeout change takes effect without breaking session management.

## Scope
| In | Out | Rationale |
|----|-----|-----------|
| Session expiry at 60 min | Auth flows | Only timeout changed |
| Idle vs. active behavior | Load testing | Config, not capacity |

## Approach
Automation only — verify timeout in integration suite. ≤ 2 hours effort.

## Exit Criteria
- Integration test confirms 60 ± 1 min expiry
- No regression in session create/destroy tests
- Verified in staging browser
```

14 lines.

### Example C: Release-level (multi-feature)

**Input:** "Test plan for Release 3.0: payment gateway swap (high-risk, new vendor), reporting dashboard (medium-risk, new data source), admin role cleanup (low-risk, config only). 3-week window, staging + pre-prod available."

**Complexity:** Release. Target: ≤ 150 lines.

```markdown
# Test Plan: Release 3.0

## Objective
Validate three features ship safely with confidence proportional to risk — highest on payment gateway swap.

## Scope
| In | Out | Rationale |
|----|-----|-----------|
| Payment gateway: full transaction lifecycle | Vendor internals | Boundary at our API |
| Reporting: new data source integration | Report content accuracy | Product owns content |
| Admin roles: config migration | User provisioning | Separate system |

## Approach (per-feature, risk-proportional)
| Feature | Auto | Manual | Exploratory | Rationale |
|---------|------|--------|-------------|-----------|
| Payment gateway | 60% | 15% | 25% | New vendor = unknowns; automate regression |
| Reporting | 50% | 30% | 20% | Data accuracy needs spot-checks |
| Admin roles | 80% | 20% | 0% | Config migration is deterministic |

## Risk Areas
| # | Feature | Risk | Level | Mitigation |
|---|---------|------|-------|------------|
| 1 | Payment | New vendor, zero prod track record | HIGH | Sandbox end-to-end + canary |
| 2 | Payment | Transaction data integrity | HIGH | Reconciliation tests |
| 3 | Reporting | Data source latency impacts | MED | Performance threshold tests |
| 4 | Admin | Role migration breaks access | LOW | Pre/post migration diff |

## Environments
| Env | Purpose | Prerequisite |
|-----|---------|-------------|
| Staging | Feature validation | Vendor sandbox credentials |
| Pre-prod | RC validation | Prod-like data volume |

## Schedule
| Milestone | Week | Gate |
|-----------|------|------|
| Feature complete | W1 | All code merged, staging green |
| Integration validated | W2 | Cross-feature tests pass, 0 P1 |
| RC1 on pre-prod | W3 | Exit criteria met |

## Exit Criteria
- Payment: 0 transaction failures in end-to-end suite, reconciliation balanced
- Reporting: data accuracy ≥ 99.5%, latency < 3s P95
- Admin: role migration verified (pre/post diff clean)
- Overall: 0 P1, ≤ 2 P2 with documented mitigations

## Decision Points
| When | Decision | Evidence |
|------|----------|----------|
| End W1 | Proceed to integration? | Feature tests green |
| End W2 | Cut RC1? | Integration green, 0 blockers |
| End W3 | Ship? | All exit criteria met |

## Owners
| Activity | Owner |
|----------|-------|
| Payment automation + exploratory | QE-1 |
| Reporting validation | QE-2 |
| Admin migration verification | QE-3 |
| Pre-prod coordination | QE Lead |
| Release sign-off | QE Lead + PM |
```

62 lines — well within 150-line release target.

### Example D: Adversarial — constrained (no test env + zero automation)

**Input:** "Test plan for API migration. Moving from REST to GraphQL. No staging environment, must test in production with feature flags. No existing test automation. Ship in 4 weeks."

**Complexity:** Feature, but constrained. Target: ≤ 80 lines. Constraint Analysis required.

```markdown
# Test Plan: REST→GraphQL API Migration

## Constraint Analysis
| Constraint | Conflicts With | Consequence |
|------------|---------------|-------------|
| No staging env | Need to validate before prod exposure | All validation happens in prod behind flags |
| Zero automation | Regression detection at scale | Manual-only until automation built |
| 4-week deadline | Building automation from zero | Automation available mid-cycle at best |

**Residual risks that cannot be fully mitigated:**
1. Production exposure during validation — because no isolated environment. Accepted by: [Engineering Manager].
2. Late-found regressions — because automation won't exist until week 2-3. Accepted by: [Tech Lead].

## Objective
Migrate API from REST to GraphQL without breaking existing consumers, validated in production behind feature flags.

## Scope
| In | Out | Rationale |
|----|-----|-----------|
| GraphQL equivalents for all REST endpoints | New GraphQL-only features | Migration parity first |
| Consumer backward compatibility | Performance optimization | Ship correct, tune later |
| Feature flag rollout/rollback | Flag infrastructure itself | Assumed working |

## Approach
| Type | % | Focus | Rationale |
|------|---|-------|-----------|
| Automation | 40% | Build contract tests weeks 1-2, use thereafter | Invest early for regression safety |
| Manual | 25% | Consumer compatibility spot-checks | Until automation catches up |
| Exploratory | 35% | Edge cases in query translation, error handling | New integration = unknowns |

## Risk Areas
| # | Risk | Level | Mitigation |
|---|------|-------|------------|
| 1 | Consumer breakage in prod | HIGH | Feature flag at 1% → 10% → 50% → 100% with rollback |
| 2 | No regression net weeks 1-2 | HIGH | Prioritize contract test creation, manual smoke tests |
| 3 | Query translation edge cases | MED | Exploratory charters per endpoint group |

## Exit Criteria
- All REST endpoints have GraphQL equivalents (contract tests green)
- Feature flag at 100% for ≥ 1 week with no rollbacks triggered
- 0 consumer-reported issues at full rollout
- Error rate ≤ pre-migration baseline

## Decision Points
| When | Decision | Evidence |
|------|----------|----------|
| End week 2 | Begin rollout? | Contract tests green, manual smoke pass |
| At 10% traffic | Expand? | Error rate stable, no consumer complaints |
| At 100% for 1 week | Migration complete? | All exit criteria met |
```

55 lines. Constraint Analysis makes trade-offs visible; plan remains actionable despite limitations.

---

## Output

- A markdown plan written to
  `.assert-iq/config.yaml > test_plan.output_path` (default
  `./tests/_qi/plans/<scope-slug>.md`).
- When `manual_test_management.tool` is tracker-backed, additionally
  the import structure for that tool (ADO suites JSON, Xray plan
  JSON, TestRail CSV, etc.).
- When the scope is incomplete or contradictory, a partial plan
  plus an explicit "pending" list — never fabricated confidence.

## Signals emitted

When the QI signal sink is wired, this skill emits a
`test.plan_generated` signal per generation conforming to
`.assert-iq/signal-schema.json`, carrying: `scope`, `complexity`,
`approach_distribution` (auto/manual/exploratory percentages),
`risk_areas` (count by level), `exit_criteria_count`,
`measurable_exit_criteria_count`, `constraints_flagged`,
`residual_risks_accepted`, `tracker_ref`.

## Verify with oracle (v1.6.0+)

Generated test plans are AI-authored strategy documents. Verify plan
quality against Assert.IQ's defensible rubric before commitment:

```
/grade-with-rubric <plan.md>  --rubric-id=plan-v1.0
```

This produces oracle feedback on:
- Scope clarity (is the "what" unmistakable?)
- Signal orientation (are success criteria testable + outcome-focused?)
- Risk acknowledgment (are blind spots identified explicitly?)

**When to grade:** Always before socializing plan with stakeholders.
Oracle CONDITIONAL verdicts should prompt refinement; FAIL verdicts
indicate scope/signal misalignment.
