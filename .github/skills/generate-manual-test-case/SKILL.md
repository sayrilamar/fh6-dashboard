---
name: generate-manual-test-case
mode: agent
description: "Convert acceptance criteria into scripted manual test cases formatted for the team's manual test management tool."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
tracker, manual-test management tool, team, language, or platform** —
it writes scripted manual cases in whatever import format your tool
accepts; it does not impose one. You'll get sharper, faster results if
you fill in the per-repo specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If the key is absent, the agent infers from repo signals
or asks you. Wire the values once in `.assert-iq/config.yaml` and they
flow into every skill that references them — no per-skill editing
required.

1. **Manual-test management tool** — set
   `.assert-iq/config.yaml > manual_test_management.tool`. Supported
   tools and the export format the agent will produce:
   - `markdown` (default) — human-readable `.md` files
   - `azure_devops_test_plans` — ADO Test Case XML
   - `testrail` — TestRail CSV import
   - `xray` (Jira) — Xray REST JSON
   - `zephyr` (Jira) — Zephyr Scale or Squad JSON (asks which)
   - `qase` — Qase API JSON
   - `practitest` — PractiTest API JSON
   - `tricentis_qtest` — qTest import
   - `notion` / `confluence` — wiki page rows
   - `none` — markdown only

2. **Output path** — for the `markdown` tool, set
   `.assert-iq/config.yaml > manual_test_management.output_path`
   (default `./tests/_qi/manual/`). For tracker-backed tools, files
   are created via API / MCP at the configured location.

3. **Tracker** — set `.assert-iq/config.yaml > tracker.system` (ADO,
   Jira, GitHub Issues, GitLab, Linear, Bitbucket, Shortcut,
   Pivotal, Redmine, Trello, Notion). The agent uses the right ID
   syntax (`AB#1234`, `PROJ-123`, `#123`, `ENG-123`) when pulling AC
   and embedding work-item references.

4. **Risk-tier model** — set
   `.assert-iq/config.yaml > manual_cases.risk_tier_model`:
   - `priority_severity` (default) — derive from work-item priority
     + severity fields
   - `wsjf` — Weighted Shortest Job First
   - `rice` — Reach / Impact / Confidence / Effort
   - `custom` — point to a file under `manual_cases.risk_tier_path`
   The risk tier drives case-depth (see the table in Step 3).

5. **Proliferation guardrail** — set
   `.assert-iq/config.yaml > manual_cases.max_cases_per_ac` (default
   `8`). When an AC would produce more, the agent consolidates
   boundary cases into a single multi-input case.

6. **Routing categories** — the agent ships with the universal
   `subjective | uat | accessibility-cognitive | novel-area |
   one-time | automation-noted` routing taxonomy. Extend via
   `.assert-iq/config.yaml > manual_cases.routing_categories_extras`
   if your team tracks others (e.g. `compliance-audit`,
   `cross-cultural-review`, `pricing-validation`).

7. **App URL placeholder** — when an environment URL is unknown the
   agent writes `[APP_URL]/path`. Set
   `.assert-iq/config.yaml > manual_cases.app_url_template` to the
   pattern your team prefers (e.g. `https://{env}.example.com`,
   `http://localhost:{port}`).

8. **Test-data store** — set
   `.assert-iq/config.yaml > test_framework.data_factory` (shared
   with the automated-generation skills). Manual cases reference
   factory IDs / dataset names rather than embedding production-like
   data inline.

9. **Traceability marker** — the qi-trace YAML header below is the
   universal idiom. The header schema is fixed; the `work-item`
   value uses the tracker's native ID format from `tracker.system`.

10. **Work-item comment delivery** — set
    `.assert-iq/config.yaml > manual_cases.update_work_item_default`:
    - `ask` (default) — ask the user each time
    - `always` — always offer to post the execution checklist
    - `never` — produce files only
    The interactive-checkbox comment format works in ADO, Jira,
    GitHub Issues, GitLab Issues, Linear, and most Markdown trackers.

11. **Platform / language notes** — manual cases are
    language-agnostic by definition (steps are written in user
    language, not code). The skill works for web, mobile, desktop,
    embedded, API, ML model, and infrastructure targets.
-->

# Generate manual test case

Convert acceptance criteria or test plan into scripted manual test cases formatted for
the team's manual test management tool.

This skill is **tracker-, tool-, language-, platform-, and
team-agnostic** (see customization points 1–3 above). The ADO + Xray +
TestRail + Zephyr examples below are illustrative defaults — the
skill adapts them to the configured tool.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Work item ID | tracker per `.assert-iq/config.yaml > tracker.system` — fetch via MCP if available | Yes (or pasted ACs) |
| Target tool | `manual_test_management.tool` from `.assert-iq/config.yaml` | Yes (default: `markdown`) |
| Risk tier | Derive per `manual_cases.risk_tier_model`, or user-specified | No (default: `medium`) |
| Test Plan / Suite ID | For ADO Test Plans / Xray / TestRail — user-provided or from config | No |

### When MCP is unavailable

Ask the user to paste acceptance criteria, title, and priority. Set `source: user-provided` in qi-trace. Vague descriptions → treat as ambiguous AC (Step 2). Non-English ACs → work with them as-is but write test cases in the project's primary language; note the original AC language in qi-trace if different.

---

## Procedure

### Step 1: Parse, classify, and route ACs

For every AC:

| Field | Question |
|-------|----------|
| Testability | Specific enough for pass/fail? |
| Determinism | Outcome purely deterministic? |
| Routing | Manual, automation, UAT, or exploratory? |
| Boundary signals | Ranges, thresholds, transitions, limits? |

**Routing decision matrix:**

| AC characteristic | Route | routed-to-manual-because |
|---|---|---|
| Subjective judgment (UX, visual) | Manual | `subjective` |
| Business-owner validation | UAT script | `uat` |
| Accessibility/cognitive | Manual | `accessibility-cognitive` |
| Novel area, no stable interface | Exploratory | `novel-area` |
| One-time verification | Manual | `one-time` |
| **Purely deterministic, automatable** | **Manual + automation note** | `automation-noted` |

**When an AC routes to automation:**

> "⚡ **Automation recommended for AC-[ref]:** Deterministic ([reason]). This AC is a strong candidate for automation."

- Always generate the manual test case regardless — note the automation recommendation in the routing report.
- Set `routed-to-manual-because: automation-noted`
- Never skip manual test creation. The automation note is informational for future planning.

### Step 2: Handle ambiguous ACs

When an AC is too vague to test:

1. Surface with concrete options:
> "AC says '[vague phrase].' Not testable because [reason]. Did you mean:
> (a) [specific interpretation 1]
> (b) [specific interpretation 2]
> (c) Something else?"

2. User clarifies → use their interpretation.
3. "Just do your best" → pick most reasonable, set `ac-interpretation: assumed`, document in preconditions: "**Assumed interpretation:** [what and why]." (See Example D.)

If an AC is both ambiguous AND references an unreleased feature, resolve the ambiguity first, then add the "Requires [feature] deployed" precondition. Don't let compound ambiguity cause a silent skip.

### Step 3: Generate test cases per AC

For each AC (including those noted for automation):

| Case type | When | Count |
|-----------|------|-------|
| Positive (happy path) | Always | 1 |
| Negative (failure path) | Always | 1+ |
| Boundary | AC has boundary signals | 1+ per signal |

**Boundary derivation — look for these signals:**
- **Numeric ranges** → min, max, min−1, max+1
- **Time windows** → at deadline, just before, just after
- **State transitions** → each valid + invalid transitions
- **String constraints** → empty, max length, special characters
- **Collections** → empty, single, max items
- No signals → skip boundary cases.
- **Stop** when additional cases test the same code path. More cases ≠ more coverage.

**Risk-tier depth:**

| Risk | Positive | Negative | Boundary | Extra |
|------|----------|----------|----------|-------|
| Low | 1 | 1 | Only if obvious | — |
| Medium | 1 | 1–2 | Where AC implies | — |
| High | 1–2 | 2–3 | Exhaustive | Data variation, concurrency |

**Proliferation guardrail:** If an AC produces more than
`manual_cases.max_cases_per_ac` (default ~8) cases, consolidate. Merge boundary cases testing the same validation into a single multi-input case (see Example D). A work item with 3 ACs should yield roughly 6–15 cases, not 30+.

### Step 4: Apply format and headers

Every case uses the qi-trace header and follows `qi-manual-test-design.instructions.md`.

**qi-trace header:**
```yaml
---
qi-trace:
  work-item: <ID or "user-provided">
  acceptance-criteria: <AC reference>
  layer: protection-strength
  type: scripted-manual
  generated-by: assert-iq
  review-required: true
  risk-tier: <low | medium | high>
  routed-to-manual-because: <subjective | uat | accessibility-cognitive | novel-area | one-time | automation-noted>
  ac-interpretation: <literal | assumed>
  source: <mcp | user-provided>
---
```

**Case structure:**
```
**Title**: [Work-item-ID] [AC-ref] — <descriptive name>
**Preconditions**: <environment, data, state — concrete>
**Test Data**: <specific inputs — test data store refs for production-like data>
**Steps**:
  1. <user-language action> → **Expected**: <single observable outcome>
  2. <user-language action> → **Expected**: <single observable outcome>
**Postconditions**: <cleanup — restore state for shared environments>
**Acceptance criteria validated**: <AC references>
```

**Steps are mandatory.** Every test case must include explicit numbered steps with expected results. Never output a test case without steps — a case without steps is not executable.

**Rules:**
- User language ("select Save") not implementation language ("trigger onClick")
- One expected outcome per step — split compound steps
- Concrete preconditions: "Logged in as admin on staging.example.com" not "User is logged in"
- Unknown URL → `[APP_URL]/path` placeholder noted in preconditions
- Feature not deployed → precondition: "Requires [feature] deployed. If unavailable, mark Blocked."
- Test data → project test data store for production-like data

### Step 5: Format for configured tool

| Tool | Format |
|------|--------|
| `markdown` | Human-readable per case structure above |
| `azure_devops_test_plans` | Markdown **plus** ADO Test Case XML (see Example B) |
| `xray` | Xray JSON import — follow [Xray REST API format](https://docs.getxray.app/display/XRAY/Import+Execution+Results+-+REST) |
| `testrail` | TestRail CSV (Case ID, Title, Steps, Expected Result) |
| `zephyr` | Ask which variant (Scale vs Squad) — import formats differ. Best-effort JSON. |
| `qase` | Qase API JSON |
| `practitest` | PractiTest API JSON |
| `tricentis_qtest` | qTest import |
| `notion` / `confluence` | Wiki page rows |
| Unknown / `none` | `markdown` + note: "No import spec for [tool]." |

### Step 6: Organize multi-AC output

**One file per AC.** Each AC and its related test cases go into a separate markdown file:
- Filename: `AC-[n]-[short-title].md` (e.g., `AC-1-email-validation.md`)
- `[short-title]` = kebab-case summary of the AC (3–5 words max)
- Each file contains: qi-trace header, all test cases for that AC (with full steps), and postconditions.
- For single-AC work items, one file is sufficient.

**Additionally, output a routing report** (can be shown inline or as a summary file):
```markdown
## Routing Report
| AC | Route | Reason | Cases | File |
|----|-------|--------|-------|------|
| AC-1 | Manual | subjective | 3 (positive, negative, boundary) | `AC-1-bulk-delete-accounts.md` |
| AC-2 | Manual | one-time | 2 (positive, negative) | `AC-2-confirmation-dialog.md` |
| AC-3 | Manual + ⚡ Automation noted | Deterministic | 2 (positive, negative) | `AC-3-api-auth-response.md` |
| **Total** | | | **7 manual cases** | |
```

**Within each file:**
1. **Group by AC** under section headings
2. **Order by risk** — highest-risk first
3. **Flag dependencies** — note in preconditions if AC-B depends on AC-A
4. **Deduplicate** — shared setup noted once, referenced

### Step 7: Self-review

- [ ] Every step → one expected outcome
- [ ] Preconditions concrete (environment, URL/placeholder, user role)
- [ ] Test data defined (not "valid data")
- [ ] No implementation language
- [ ] Governance followed (destructive, UAT, review-required)
- [ ] Every case traces to AC + work item in title
- [ ] qi-trace header complete on every case
- [ ] Routing report accounts for every AC
- [ ] Total case count proportionate (not proliferating)

### Step 8: Deliver and follow up

- Per `manual_cases.update_work_item_default`:
  - `ask` — "Would you like me to update a specific testing task with these test cases and steps? If so, provide the child Task / sub-issue ID and I'll add them as a comment."
  - `always` — offer the work-item-comment delivery proactively.
  - `never` — produce files only.
- Note ACs flagged for automation — these still have manual cases but are candidates for future automation
- Confirm assumptions on ambiguous ACs

**When the user opts to update a work item**, add a comment to that work item with:
1. A test execution checklist grouped by AC, with clickable pass/fail checkboxes
2. Each test case title, its steps (summarized), and a checkbox

**Work item comment format:**
```markdown
## Manual Test Cases — [Work Item Title]

### AC-1: [AC description]

- [ ] **PASS** | [12345] AC-1 — Invalid email shows validation message
  - Steps: Enter invalid email → verify validation message appears within 2s
- [ ] **PASS** | [12345] AC-1 — Valid email accepted (no false positive)
  - Steps: Enter valid email → verify no validation message
- [ ] **PASS** | [12345] AC-1 — Boundary email formats
  - Steps: Enter edge-case emails (no TLD, no local part) → verify validation

### AC-2: [AC description]

- [ ] **PASS** | [12345] AC-2 — Confirmation dialog appears on delete
  - Steps: Select items, click Delete → verify dialog
- [ ] **PASS** | [12345] AC-2 — Cancel aborts deletion
  - Steps: Click Cancel on dialog → verify no deletion

---
⚡ AC-3 noted for automation — manual cases generated but recommend `generate-automated-api-test`.
```

The `- [ ]` checkbox syntax renders as interactive checkboxes in ADO, GitHub, GitLab, Linear, and most markdown-based trackers — users can click to mark pass/fail during execution.

---

## Output

One or more case files in the format set by
`manual_test_management.tool`, written to
`manual_test_management.output_path` (markdown) or created via API /
MCP in the tracker (ADO / TestRail / Xray / Zephyr / Qase / PractiTest
/ qTest / Notion).

Additionally:
- **Routing report** — inline or summary file (see Step 6)
- **Work-item comment** with interactive checkboxes per
  `manual_cases.update_work_item_default`
- **Automation notes** — surfaced for ACs flagged
  `automation-noted`, with a `generate-automated-*-test` follow-up
  recommendation

## Signals emitted

When the QI signal sink is wired, this skill emits a
`test.generated.manual` signal per generation conforming to
`.assert-iq/signal-schema.json`, carrying: `work_item`, `tool`,
`acs_processed`, `cases_generated`, `routing_breakdown` (counts per
route category), `risk_tier`, `ambiguous_acs_assumed`,
`automation_candidates`, `destructive_cases` (count), and
`tracker_ref`.

## Verify with oracle (v1.6.0+)

Generated manual test cases are AI-authored. Before handoff to QA,
verify case clarity and testability with oracle grading:

```
/grade-with-rubric <test_cases.md>  --rubric-id=test-unit-v1.0
```

Oracle scores on:
- **Assertion clarity:** Are steps unambiguous?
- **Independence:** Is each case self-contained?
- **Focus:** Does each case test one scenario?

Oracle CONDITIONAL/FAIL verdicts should prompt case refinement before
QA handoff.

---

## Governance

- Every case is a draft: `review-required: true`.
- Surface ACs for UAT when business-owner validation is needed.
- **Destructive actions on shared environments:**
  - ⚠️ in title
  - Precondition: "Requires isolated environment — NOT safe for shared staging"
  - Postcondition: "Verify [data/state] restored via [method]"
  - Test accounts only, counts before/after, rollback steps
- Destructive action IS the test subject → maximum safety preconditions (see Example B).

---

## Worked examples

### Example A: Single AC, markdown format

**Input:** #12345. AC: "When a user enters an invalid email in the registration form, a validation message appears below the field within 2 seconds." Tool: `markdown`. Risk: medium.

**Step 1:** Testable, subjective (visual timing) → manual.

**Routing Report:**
| AC | Route | Reason | Cases |
|----|-------|--------|-------|
| AC-1 | Manual | subjective — visual timing | 3 (positive, negative, boundary) |

**Output:**

```yaml
---
qi-trace:
  work-item: 12345
  acceptance-criteria: AC-1
  layer: protection-strength
  type: scripted-manual
  generated-by: assert-iq
  review-required: true
  risk-tier: medium
  routed-to-manual-because: subjective
  ac-interpretation: literal
  source: mcp
---
```

**Title**: [12345] AC-1 — Invalid email shows validation message
**Preconditions**: Registration page at staging.example.com/register. No user logged in.
**Test Data**: Email: "not-an-email"
**Steps**:
  1. Enter "not-an-email" in Email field → **Expected**: Field border turns red
  2. Click outside Email field → **Expected**: Validation message "Please enter a valid email address" appears below field within 2 seconds
**Postconditions**: None — no state change.
**Acceptance criteria validated**: AC-1

---

**Title**: [12345] AC-1 — Valid email accepted (no false positive)
**Preconditions**: Same as above.
**Test Data**: Email: "user@example.com"
**Steps**:
  1. Enter "user@example.com" in Email field → **Expected**: No validation message
  2. Click outside Email field → **Expected**: Field remains neutral/green
**Postconditions**: None.
**Acceptance criteria validated**: AC-1

---

**Title**: [12345] AC-1 — Boundary email formats
**Preconditions**: Same as above.
**Test Data**: "user@domain" (no TLD), "@domain.com" (no local), "user@domain.c" (1-char TLD)
**Steps**:
  1. Enter "user@domain", click away → **Expected**: Validation message within 2 seconds
  2. Clear field, enter "@domain.com", click away → **Expected**: Validation message
**Postconditions**: None.
**Acceptance criteria validated**: AC-1

### Example B: Multi-AC, destructive, ADO format, shared staging

**Input:** #55555. AC-1: "Admin can delete all user accounts in bulk." AC-2: "Bulk delete shows confirmation dialog." Tool: `ado_test_plans`. Risk: high. Shared staging.

**Step 1:** AC-1 destructive on shared env → safety rails. AC-2 UI → standard manual.

**Routing Report:**
| AC | Route | Reason | Cases |
|----|-------|--------|-------|
| AC-1 | Manual | Destructive — safety preconditions | 1 (positive with safety) |
| AC-2 | Manual | subjective — dialog behavior | 2 (confirm + cancel) |
| **Total** | | | **3 manual cases** |

**Markdown for AC-1:**

**Title**: ⚠️ [55555] AC-1 — Bulk delete user accounts (ISOLATED ENV REQUIRED)
**Preconditions**:
  - Isolated test environment — **NOT shared staging**
  - 5 test accounts: test-user-001 through 005
  - Admin logged in at [APP_URL]/admin
  - Record total user count before test: ___
**Test Data**: Test accounts only — never production accounts
**Steps**:
  1. Navigate to Admin > User Management → **Expected**: User list shows test accounts
  2. Select all 5 test accounts via bulk select → **Expected**: 5 highlighted, "Delete Selected" enabled
  3. Click "Delete Selected" → **Expected**: Confirmation dialog appears (cross-ref AC-2)
  4. Confirm deletion → **Expected**: All 5 test accounts removed
  5. Verify user count = (pre-test count − 5) → **Expected**: Count matches
**Postconditions**: Re-create test accounts via admin API or seed script. Verify count restored.
**Acceptance criteria validated**: AC-1

**ADO XML for AC-1:**
```xml
<TestCase>
  <Title>⚠️ [55555] AC-1 — Bulk delete user accounts (ISOLATED ENV REQUIRED)</Title>
  <Priority>1</Priority>
  <Steps>
    <Step id="1">
      <Action>Navigate to Admin > User Management</Action>
      <ExpectedResult>User list displays including test-user-001 through 005</ExpectedResult>
    </Step>
    <Step id="2">
      <Action>Select all 5 test accounts using bulk select</Action>
      <ExpectedResult>5 accounts highlighted, "Delete Selected" enabled</ExpectedResult>
    </Step>
    <Step id="3">
      <Action>Click "Delete Selected"</Action>
      <ExpectedResult>Confirmation dialog appears</ExpectedResult>
    </Step>
    <Step id="4">
      <Action>Click "Confirm"</Action>
      <ExpectedResult>All 5 test accounts removed from list</ExpectedResult>
    </Step>
    <Step id="5">
      <Action>Check total user count</Action>
      <ExpectedResult>Count equals pre-test count minus 5</ExpectedResult>
    </Step>
  </Steps>
  <LinkedWorkItems>
    <WorkItem id="55555" type="Tested By" />
  </LinkedWorkItems>
</TestCase>
```

### Example C: Automation routing — manual case still generated

**Input:** #11111. AC-1: "API returns HTTP 200 with {status: 'success'} for valid auth token." Tool: `markdown`.

**Step 1:** Purely deterministic → note automation recommendation, still generate manual case.

**Message:**
> ⚡ **Automation recommended for AC-1:** Deterministic — fixed JSON for valid token. This AC is a strong candidate for automation.

**Routing Report:**
| AC | Route | Reason | Cases |
|----|-------|--------|-------|
| AC-1 | Manual + ⚡ Automation noted | Deterministic — fixed API response | 2 (positive, negative) |

**Output:**

```yaml
---
qi-trace:
  work-item: 11111
  acceptance-criteria: AC-1
  layer: protection-strength
  type: scripted-manual
  generated-by: assert-iq
  review-required: true
  risk-tier: medium
  routed-to-manual-because: automation-noted
  ac-interpretation: literal
  source: mcp
---
```

**Title**: [11111] AC-1 — Valid auth token returns success ⚡
**Preconditions**: API running at [APP_URL]/api. Valid auth token available.
**Test Data**: Token: valid-test-token-001
**Steps**:
  1. Send GET request with valid auth token in Authorization header → **Expected**: HTTP 200 response
  2. Inspect response body → **Expected**: `{"status": "success"}`
**Postconditions**: None.
**Acceptance criteria validated**: AC-1

---

**Title**: [11111] AC-1 — Invalid auth token returns error ⚡
**Preconditions**: Same as above.
**Test Data**: Token: expired-token-999
**Steps**:
  1. Send GET request with invalid/expired auth token → **Expected**: HTTP 401 response
  2. Inspect response body → **Expected**: Error message (not success)
**Postconditions**: None.
**Acceptance criteria validated**: AC-1

> 💡 **Next step:** This AC is a strong candidate for automation via `generate-automated-api-test`.

### Example D: Ambiguous AC, no MCP, high risk, assumed interpretation

**Input:** #99999 (user-pasted). AC: "The system should handle large files appropriately." Tool: `markdown`. Risk: high.

**Step 2:** Ambiguous — surfaced:
> "AC says 'handle large files appropriately.' Not testable because 'large' and 'appropriately' are undefined. Did you mean:
> (a) Files over 100MB upload within 60 seconds
> (b) Files over size limit show error with max allowed size
> (c) Something else?"

**User: "just do your best."**

**Output:**

```yaml
---
qi-trace:
  work-item: user-provided
  acceptance-criteria: AC-1
  layer: protection-strength
  type: scripted-manual
  generated-by: assert-iq
  review-required: true
  risk-tier: high
  routed-to-manual-because: subjective
  ac-interpretation: assumed
  source: user-provided
---
```

**Title**: [99999] AC-1 — Large file upload succeeds
**Preconditions**:
  - **Assumed interpretation:** "Large" = files over 50MB. "Appropriately" = uploads without timeout or corruption. Assumed because AC didn't define thresholds — 50MB chosen as typical web upload boundary.
  - Upload page at [APP_URL]/upload
  - Test files: 50MB, 100MB, 500MB (in `/test-data/files/`)
**Test Data**: 50MB PDF, 100MB ZIP, 500MB video
**Steps**:
  1. Select 50MB file, click Upload → **Expected**: Upload completes, success message
  2. Verify uploaded file checksum → **Expected**: Matches original
**Postconditions**: Delete uploaded test files.
**Acceptance criteria validated**: AC-1 (assumed)

---

**Title**: [99999] AC-1 — File exceeding limit shows error
**Preconditions**: **Assumed:** Files over limit show user-friendly error. Same environment.
**Test Data**: 1GB file
**Steps**:
  1. Select 1GB file, click Upload → **Expected**: Error "File exceeds maximum size of [X]MB"
  2. Verify no partial/corrupt file stored → **Expected**: Storage unchanged
**Postconditions**: Verify no orphaned files.
**Acceptance criteria validated**: AC-1 (assumed)

---

**Title**: [99999] AC-1 — Boundary file sizes (high risk — consolidated)
**Preconditions**: Same environment. Boundary cases consolidated into one multi-input case per proliferation guardrail.
**Test Data**: 0KB (empty), 1KB, 49MB, 50MB, 51MB
**Steps**:
  1. Upload 0KB file → **Expected**: Error "File is empty" or graceful rejection
  2. Upload 49MB file → **Expected**: Upload succeeds
  3. Upload 50MB file → **Expected**: Upload succeeds (at boundary)
  4. Upload 51MB file → **Expected**: Error or success (document which)
**Postconditions**: Clean up all test files.
**Acceptance criteria validated**: AC-1 (assumed)
