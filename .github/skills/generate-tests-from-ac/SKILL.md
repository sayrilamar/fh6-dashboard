---
name: generate-tests-from-ac
mode: agent
description: "Route acceptance criteria to test artifacts: automation, manual scripted, or exploratory charter. Input: work item ID or pasted ACs. Not for bug reports or general test requests."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal **router**. It classifies each AC and
dispatches to the right generation skill. It works out of the box
for **any tracker, framework, language, manual-test tool, or team**
— because it delegates the actual artifact generation to the
automation / manual / exploratory sub-skills, which are themselves
universal templates.

**How placeholders work**: the agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If a key is absent, the agent infers from repo signals
or asks you. Wire values once and they flow into every skill.

1. **Tracker** — set `.assert-iq/config.yaml > tracker.system` (ADO,
   Jira, GitHub Issues, GitLab, Linear, Bitbucket, Shortcut,
   Pivotal, Redmine, Trello, Notion). The agent uses the right ID
   syntax (`AB#1234`, `PROJ-123`, `#123`, `ENG-123`) when fetching
   the work item.

2. **AC fetch path** — by default the agent uses the configured
   tracker MCP. If MCP is unavailable, the agent asks the user to
   paste ACs. No additional config needed.

3. **Automation framework** — set `.assert-iq/config.yaml >
   test_framework.unit`, `test_framework.api`, `test_framework.ui`,
   etc. The sub-skill (`generate-automated-*-test`) picks the right
   block based on the AC's nature (unit / API / UI).

4. **Manual-test management tool** — set
   `.assert-iq/config.yaml > manual_test_management.tool`. The
   manual sub-skill emits in that tool's import format.

5. **Routing taxonomy** — the classification table below is the
   universal default. Extend the table or override per-AC via
   `.assert-iq/config.yaml > routing.classification_overrides`
   (keyed by AC keyword or regex → route).

6. **Tie-breaking policy** — the defaults below (Automation wins
   over Manual; Manual wins over Exploratory) reflect QI rigor
   preference. Override via
   `.assert-iq/config.yaml > routing.tie_break_policy`:
   - `prefer_automation` (default)
   - `prefer_exploratory_when_novel`
   - `prefer_manual_when_subjective`

7. **Maturity-aware behaviour** — set
   `.assert-iq/config.yaml > maturity_tier`:
   - `early` — also produce a manual fallback for each automation-
     routed AC (insurance while automation matures)
   - `mid` — route as classified
   - `higher` — route as classified; flag manual-routed ACs as
     automation-backlog candidates when feasible

8. **Artifact output paths** — inherited from each sub-skill's
   config. Defaults:
   - automation → `test_framework.<api|ui|unit>.output_path`
   - manual → `manual_test_management.output_path`
   - exploratory → `exploratory_charter.output_path`

9. **AC slug convention** — artifact names use
   `AC<N>-<kebab-slug>`. Override via
   `.assert-iq/config.yaml > routing.artifact_naming` if your team
   uses a different convention.

10. **Parallel dispatch** — independent ACs are dispatched in
    parallel by default. Set
    `.assert-iq/config.yaml > routing.dispatch: sequential` to
    serialize (useful for small repos or rate-limited MCP).

11. **Platform notes** — platform-agnostic. For mobile/embedded/ML
    scopes the sub-skills add platform-specific scaffolding; this
    router does not need to know the platform.
-->

# Generate tests from acceptance criteria

You are the Assert.IQ test generation router. For each acceptance criterion in a work item, classify it and generate the right test artifact.

---

## Step 0: Confirm scope

| Input type | Action |
|---|---|
| Work item ID (any tracker per `tracker.system`) or pasted ACs | Proceed |
| Bug report / defect description | "This skill routes acceptance criteria to test artifacts. For a bug report, use the `generate-bug-report` skill, or share the ACs from the original story." |
| Vague request without ACs ("generate tests for the dashboard") | "Can you share the work item ID, or paste the acceptance criteria? (e.g., Given/When/Then statements or a numbered list works great)" |
| Work item fetched but no ACs found | "I fetched [ID] but found no acceptance criteria. Please paste them directly, or confirm this is the right item." |

---

## Step 1: Collect inputs

- **Work item ID** — fetch via MCP if available. If MCP unavailable or returns no ACs, ask user to paste ACs directly.
- **Config** — read `.assert-iq/config.yaml` for tracker, test framework, manual tool, and routing knobs.
- **Maturity profile** — read `.assert-iq/maturity-profile.md` for routing adjustment.
---

## Step 2: Parse, number, and quality-check ACs

Extract ACs from the work item. If not numbered, assign 1, 2, 3…

Before classifying, note these quality issues in the routing report's "Flagged for review" section:

| AC pattern | Flag |
|---|---|
| Vague assertion: "should be fast", "should look nice", "should work correctly", "should feel responsive" | Untestable as written. Route to Exploratory; recommend author add a measurable criterion (e.g., "< 300 ms"). |
| Compound AC: single AC contains AND/OR with two distinct test conditions | Will produce two test cases. Split before routing each part. |
| Missing test data: "shows an error message" without specifying which error | Proceed with best-effort; note in routing report that test data needs to be confirmed. |

---

## Step 3: Classify each AC

| AC characteristic | Route |
|---|---|
| Deterministic, measurable, repeatable, no human judgment | Automation |
| API contract, data transformation, calculation, business rule | Automation |
| UI state with stable selectors and stable test data | Automation |
| Performance threshold with numeric bound ("< 2 s", "99.9% uptime") | Automation |
| Keyboard navigation with defined behavior ("without a mouse", "keyboard accessible", "focus visible", "tab order") | Automation |
| Measurable accessibility criterion (contrast ratio, heading count, ARIA roles, focus order) | Automation (flag if automated tooling support is uncertain) |
| Subjective UX, content quality, perceived performance ("feel", "look", "experience") | Manual scripted |
| Accessibility cognitive (screen reader reading-order narrative, color meaning beyond ratios) | Manual scripted |
| UAT / business-owner validation | Manual scripted (UAT) |
| Novel area, limited prior coverage, integration unknowns | Exploratory charter |
| Recent escape history on touched component | Exploratory charter |
| Ambiguous — matches multiple rows or cannot be classified | Exploratory charter (explain why in routing report) |

**Tie-breaking:**
- AC matches Automation AND Manual → **Automation** (higher rigor)
- AC matches Manual AND Exploratory → **Manual**, add exploratory angle note in routing report
- Genuinely unresolvable → **Exploratory**, explain why

**Maturity adjustment (from `.assert-iq/maturity-profile.md`):**
- `early`: for each Automation-routed AC, also produce a Manual scripted fallback
- `mid`: route as classified
- `higher`: route as classified; flag Manual-routed ACs as automation backlog candidates where applicable

---

## Step 4: Dispatch

Include `AC<N>-<slug>` in all artifact names and headers (e.g., `AC1-login-valid-credentials.<ext>`). Independent ACs can be dispatched in parallel (per `routing.dispatch`).

| Route | Sub-skill | Output location |
|---|---|---|
| Automation — unit | `generate-automated-unit-test` | `test_framework.unit.output_path` |
| Automation — API | `generate-automated-api-test` | `test_framework.api.output_path` |
| Automation — UI | `generate-automated-ui-test` | `test_framework.ui.output_path` |
| Manual scripted | `generate-manual-test-case` | `manual_test_management.output_path` (in configured tool's format) |
| Exploratory | `generate-exploratory-charter` | `exploratory_charter.output_path` |

If a referenced sub-skill is not available, produce a best-effort test outline with: test name, preconditions, step-by-step actions, expected result. Note the missing dependency in the routing report.

---

## Step 5: Routing report

Produce this report at the end of every run:

```markdown
## Routing Report: [Work Item ID] — [Work Item Title]

| AC # | Summary | Route | Reason |
|------|---------|-------|--------|
| 1 | Valid credentials → login < 2 s | Automation | Performance threshold with numeric bound; deterministic input/output pair |
| 2 | Invalid credentials → error message shown | Automation | Deterministic: specific error text is verifiable, no human judgment required |
| 3 | Account locked after 5 failed attempts | Automation | Business rule with exact numeric trigger and measurable outcome |
| 4 | Login page should "feel responsive" on mobile | Exploratory | Vague assertion — no measurable criterion; see flag below |
| 5 | Business owner validates login flow | Manual (UAT) | Requires stakeholder judgment; cannot be automated |

### Artifacts generated
- `<test_framework.ui.output_path>/AC1-login-valid-credentials.<ext>`
- `<test_framework.ui.output_path>/AC2-login-invalid-credentials.<ext>`
- `<test_framework.api.output_path>/AC3-account-lockout.<ext>`
- `<exploratory_charter.output_path>/AC4-mobile-responsiveness.charter.md`

### ACs flagged for review
- **AC 4**: "feel responsive" — vague. Recommend: add measurable threshold (e.g., "< 300 ms to first interaction") or document as intentional subjective test. Routed to Exploratory until criterion is defined.
```

**Reason column:** One sentence — name the matching table row and state the key characteristic that confirms the match. Keep it under 15 words.

---

## Governance

- All generated artifacts are drafts — `review-required: true`.
- Do not generate tests against production endpoints.
- ACs that cannot be tested mechanically receive exploratory charter coverage, not silence.

## Output

- One or more artifacts per AC, written by the dispatched sub-skill
  to its configured output path.
- A routing report (Step 5) inline in chat, plus optionally
  persisted to `routing.report_path` when set.
- For tracker-backed manual tools, work-item links updated per the
  manual sub-skill's `update_work_item_default` policy.

## Signals emitted

When the QI signal sink is wired, this skill emits a
`test.routing` signal per run conforming to
`.assert-iq/signal-schema.json`, carrying: `work_item`, `ac_count`,
`route_breakdown` (counts per route: automation‐unit / automation‐api
/ automation‐ui / manual / exploratory), `flagged_for_review`,
`maturity_tier`, `tie_breaks_applied`, `tracker_ref`. Each
dispatched sub-skill emits its own generation signal in addition.

## Verify generated artifacts with oracle (v1.6.0+)

After this skill routes ACs and generates tests, verify quality of
automated artifacts before merge. For each generated test file:

```
/grade-with-rubric <test_file>  --rubric-id=test-unit-v1.0  # unit tests
/grade-with-rubric <test_file>  --rubric-id=test-integration-v1.0  # integration
```

**Recommended workflow:**
1. Generate tests from ACs (this skill)
2. Grade each automated artifact
3. Remediate on CONDITIONAL/FAIL verdicts
4. Merge only when oracle grades PASS

This ensures AC→test traceability is backed by defensible test quality.
