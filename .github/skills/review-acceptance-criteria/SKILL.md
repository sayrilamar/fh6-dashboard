---
name: review-acceptance-criteria
mode: agent
description: "Review acceptance criteria for testability before generation — catches bad ACs early, prevents wasted downstream work."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
tracker, AC format, language, framework, or team** — it reviews
requirements text; it does not depend on the system under test.

**How placeholders work**: the agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If a key is absent, the agent infers from context or asks.

1. **Tracker** — inherits `tracker.system`
   (`ado | jira | github | gitlab | linear | shortcut | asana |
   trello | rally | youtrack | pivotal | clubhouse | redmine |
   monday | notion | airtable | csv | none`). The skill uses your
   tracker's MCP / CLI to fetch ACs; if `none`, the user pastes the
   ACs at invocation.

2. **Work-item ID format** — inherits `tracker.id_format`
   (e.g. `AB#1234` for ADO, `PROJ-1234` for Jira, `#1234` for GitHub).
   Used in report headers and downstream skill hand-off cues.

3. **AC format convention** — set
   `.assert-iq/config.yaml > ac_review.preferred_format`:
   - `gwt`         — Given / When / Then (default; BDD)
   - `numbered`    — numbered acceptance list
   - `bullets`     — flat bullets
   - `bdd_table`   — Gherkin Scenario Outline / Examples table
   - `imperative`  — "The system shall…" (NFR / safety / regulated)
   - `user_story`  — As a / I want / So that + acceptance bullets
   - `freeform`    — accept whatever the team writes
   Rewrites are proposed in this format unless the format itself is
   the problem.

4. **SMART-T policy** — the five SMART-T checks (Specific, Measurable,
   Achievable, Relevant, Testable) are universal QI defaults.
   Extend / replace per team via
   `.assert-iq/config.yaml > ac_review.criteria_extras` (array of
   `{ id, name, description, severity_default }` entries).

5. **Severity policy** — Critical / Major / Minor are universal.
   Override the gate behaviour via
   `.assert-iq/config.yaml > ac_review.gating_policy`:
   - `strict`     — any Critical blocks downstream generation (default)
   - `pragmatic`  — Critical warns; user may force-proceed
   - `regulated`  — any Critical OR Major blocks (safety / compliance)

6. **Failure-mode taxonomy** — the 7 failure modes (ambiguous wording,
   missing oracle, compound criteria, implementation in disguise,
   missing negative paths, missing NFRs, missing data conditions)
   are universal defaults. Extend via
   `.assert-iq/config.yaml > ac_review.failure_modes_extras` (e.g.
   `localization_unstated`, `consent_model_unstated`,
   `data_retention_unstated`).

7. **NFR scan list** — when scanning for missing non-functional
   requirements, set
   `.assert-iq/config.yaml > ac_review.nfr_checklist`:
   ```yaml
   ac_review:
     nfr_checklist:
       - "performance"   # latency, throughput, p95
       - "accessibility" # WCAG, screen reader
       - "security"      # authz, input validation, secrets
       - "privacy"       # PII, consent, retention
       - "reliability"   # error rate, retry, idempotency
       - "i18n"          # locale, RTL, currency, date format
       - "observability" # logs, metrics, traces
   ```
   Drop the items that don't apply to your domain.

8. **Domain-specific gap checks** — set
   `.assert-iq/config.yaml > ac_review.domain_gap_checks` (array of
   prompts the agent runs against the AC set). Examples:
   - finance: "Are rounding / currency / FX rules specified?"
   - healthcare: "Is PHI handling specified per HIPAA?"
   - e-commerce: "Is inventory / pricing concurrency specified?"
   - iot/firmware: "Is OTA rollback / recovery specified?"
   - ml: "Are model-drift / fallback behaviours specified?"

9. **Report sink** — set
   `.assert-iq/config.yaml > ac_review.report_path` (default
   `./ac-review-<work-item-id>.md`).

10. **Hand-off destinations** — the routing table in `## Scope
    boundary` references three downstream skills. Override the names
    via `.assert-iq/config.yaml > ac_review.handoff_skills`:
    - `route`     — default `generate-tests-from-ac`
    - `automated` — default `generate-automated-unit-test`
    - `manual`    — default `generate-manual-test-case`

11. **Tracker write-back policy** — set
    `.assert-iq/config.yaml > ac_review.tracker_writeback`:
    - `none`            — never edit the work item (default)
    - `comment`         — post the report as a comment
    - `attach_artifact` — attach the report as a file
    The skill **never** rewrites AC text in the tracker — proposed
    rewrites are always suggestions for PO / BA review.
-->

# Review acceptance criteria

You are the Assert.IQ AC reviewer. Most bad tests are downstream symptoms of
bad acceptance criteria. Run this before any generation skill to surface ACs
that need rewriting before tests are authored.

## Scope boundary

This skill **reviews** acceptance criteria. It does not generate tests.

| User intent | Action |
|---|---|
| "Review my ACs," "are these testable," "check these criteria" | Proceed with review |
| "Write tests for these ACs," "generate test cases" | Review first, then hand off: "These ACs have [N] issues. Here's my review — resolve, then `generate-tests-from-ac` or `generate-automated-unit-test`." |
| "Write tests" + ACs are all READY | Brief confirmation + route: "ACs are solid — proceed with `generate-tests-from-ac`." |
| "Is this a good user story?" / general quality | ACs only — story quality (title, sizing) is out of scope, say so |

## Inputs

- Work item identifier (ADO ID or Jira key). Fetch via MCP if available;
  otherwise ask the user to paste the ACs.
- Raw AC text (any format: GWT, numbered, bullets, prose).

### Input-quality triage

| Input quality | Handling | Example |
|---|---|---|
| Formal ACs (structured, clear format) | Full review | "Given a user..., When..., Then..." |
| Informal/vague (recalled, paraphrased) | Flag as raw requirements, review what's provided, recommend fetching ticket | "The dashboard should load fast" |
| Single AC or trivial (≤ 2 ACs) | Abbreviated inline findings, skip full report | "User can log in" |
| Large set (10+) | Group by theme, prioritize by severity, summary table first | Epic-level ticket |
| Apparent mismatch (ID ≠ content) | Flag before reviewing: "ACs don't match [ID]. Verify first." | ID says "Login" but ACs describe "Payment" |
| Mixed quality (some formal, some vague) | Review all; note inconsistency as meta-finding | 3 GWT + 2 vague bullets |

**Rule:** Always proceed with what's provided — don't block waiting for perfect input. Surface quality issues as meta-findings separate from AC-level findings.

## Procedure

### Step 1: Extract and quick-scan

Fetch via MCP or accept pasted text. Parse each AC. Preserve numbering (assign if absent).

**Quick-scan gate:** If every AC has (a) structured format with actor + action + outcome, (b) a verifiable oracle, and (c) the set includes at least one error/negative path → fast-path to **READY** verdict:

> "All [N] ACs pass SMART-T. [What makes them good — e.g., 'Consistent GWT format with measurable outcomes and good error-path coverage.'] [1-2 minor suggestions at most.] Ready for `generate-tests-from-ac`."

If **any** AC fails any of those three checks → proceed to full evaluation below.

### Step 2: Evaluate each AC against SMART-T

- **Specific** — names actor, action, and observable outcome
- **Measurable** — clear pass/fail oracle (tester can say yes/no)
- **Achievable** — within system capability and team scope
- **Relevant** — tied to user value or business rule
- **Testable** — verifiable mechanically or via deliberate manual exercise

### Step 3: Flag failure modes

| Failure mode | Severity | Trigger | Example |
|---|---|---|---|
| **Ambiguous wording** | Critical | Subjective/relative terms, no threshold | "fast," "user-friendly," "correctly" |
| **Missing oracle** | Critical | No observable outcome | "System processes the request" |
| **Compound criteria** | Major | AND/OR joining distinct behaviors | "search AND filter AND sort" |
| **Implementation in disguise** | Major | How, not what | "Use Redis" vs. "Sessions persist" |
| **Missing negative paths** | Major | Happy-path only on risky feature | Login without failed-login |
| **Missing NFRs** | Minor–Major | No perf/a11y/security where warranted | Payment without timeout |
| **Missing data conditions** | Minor | Preconditions unstated | "sees orders" (which user? empty?) |

**Severity:**
- **Critical** = blocks generation (cannot write meaningful test)
- **Major** = tests will be incomplete/misleading
- **Minor** = tests possible but with known gaps

**Evidence depth:** Critical → 1-2 sentences (what's missing, why it blocks). Major → 1 sentence. Minor → brief note.

### Step 4: Cross-AC consistency check

- **Contradictions** — cannot both be true (always Critical, always escalate)
- **Redundancy** — same behavior restated
- **Coverage gaps** — scenario clusters missing error/boundary paths
- **Priority conflicts** — contradictory priority orderings

### Step 5: Classify, rewrite, suggest

1. Classify each AC: `READY` | `NEEDS-REWRITE` | `MISSING`
2. Propose rewrites for `NEEDS-REWRITE` in the project's existing format (GWT default; BDD table for data-driven; imperative for NFRs). Only switch formats if the current one causes the problem.
3. Suggest missing ACs as proposals: "Consider adding: [scenario] — no AC covers [gap]."

Gaps to check: error paths, boundaries (empty/max/null), permissions, concurrency, accessibility (UI), security (data).

### Step 6: Output report

**Standard report** (issues found):
```
## AC Review: [Work Item ID/Name]

**Verdict:** NEEDS-PRODUCT-INPUT
**Input quality:** [Normal | Informal — reviewed as-provided, recommend fetching actual ticket]

### Summary
[N] ACs reviewed. [X] Critical, [Y] Major, [Z] Minor issues. [Cross-AC issues if any.]

### Per-AC Findings

| # | AC (abbreviated) | Status | Severity | Issue |
|---|---|---|---|---|
| 1 | User clicks forgot pw... | NEEDS-REWRITE | Critical | Missing oracle — no success criteria |
| 2 | System sends reset link... | READY | — | — |
| 3 | User sets new password... | NEEDS-REWRITE | Major | Missing negative path (expired link) |
| 4 | Password complexity... | NEEDS-REWRITE | Critical | Ambiguous — "complexity" undefined |

### Cross-AC Issues

**Contradiction (Critical):** AC 1 ("send all channels") conflicts with AC 3 ("user can disable channels"). Resolution needed: priority hierarchy? Override rules?

### Proposed Rewrites

**AC 1 → rewritten:**
> Given a registered user on the login page,
> When they click "Forgot Password" and enter their registered email,
> Then the system sends a reset email within 60s with a single-use link (24h expiry) and displays "Check your email."

**AC 4 → rewritten:**
> Given a user setting a new password,
> When they enter < 8 chars, no uppercase, no digit, or no special character,
> Then the system rejects and shows which requirements are unmet.

### Suggested Missing ACs
- Unregistered email → what does user see? (negative path)
- Expired/used link → error handling
- Rate limiting on reset requests (security NFR)

### Recommendation
Resolve Critical items with PO. Three Amigos (PO + dev + tester, 15 min) before generation.
```

**Brief confirmation** (all READY):
```
## AC Review: [Work Item ID/Name]

**Verdict:** READY-FOR-GENERATION

All [N] ACs pass SMART-T. [What makes them good — e.g., "Consistent GWT with measurable outcomes and negative-path coverage."]

Minor suggestions (optional):
- [1-2 at most]

Ready for `generate-tests-from-ac`.
```

## Governance

- Never silently rewrite ACs in the tracker — surface proposals for PO/BA.
- Never generate tests against `NEEDS-REWRITE` ACs without explicit user confirmation.
- `NEEDS-PRODUCT-INPUT` → recommend Three Amigos before generation.
- Contradictions always escalate to `NEEDS-PRODUCT-INPUT` regardless of individual AC quality.
- On handoff to downstream skills, state verdict and caveats for the generation skill.
- Tracker write-back follows `ac_review.tracker_writeback` — default is `none`.
- Under `ac_review.gating_policy: regulated`, any Critical **or** Major issue blocks downstream generation.

## Output

- An `ac-review-<work-item-id>.md` (or `ac_review.report_path`)
  containing the per-AC findings table, cross-AC issues, proposed
  rewrites, suggested missing ACs, and the final verdict
  (`READY-FOR-GENERATION` | `NEEDS-PRODUCT-INPUT` |
  `NEEDS-REWRITE`).
- A short chat summary: verdict, counts by severity, top 1–3
  blockers, recommended next step (proceed to which generation
  skill, or Three Amigos).
- Optional tracker comment / attachment per
  `ac_review.tracker_writeback`.

## Signals emitted

When the QI signal sink is wired, this skill emits an
`ac.reviewed` signal per run conforming to
`.assert-iq/signal-schema.json`, carrying: `work_item_ref`,
`ac_count`, `verdict`, `critical_count`, `major_count`,
`minor_count`, `cross_ac_issues_count`, `rewrites_proposed`,
`missing_acs_proposed`, `gating_policy`, and `handoff_target`.
