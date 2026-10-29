---
name: generate-bug-report
mode: agent
description: "Convert a failure into a tracker-ready defect — duplicate-checked, severity-justified, PII-stripped."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
tracker, severity scheme, team, language, or compliance posture** —
it writes defects in whatever issue tracker your repo already uses; it
does not impose one. You'll get sharper, faster results if you fill in
the per-repo specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If the key is absent, the agent infers from repo signals
or asks you. Wire the values once in `.assert-iq/config.yaml` and they
flow into every skill that references them — no per-skill editing
required.

1. **Tracker** — set `.assert-iq/config.yaml > tracker.system`. The
   skill ships with format templates for:
   - `azure_devops` (ADO Work Items, `AB#1234`)
   - `jira` (`PROJ-123`)
   - `github_issues` (`#123` or `owner/repo#123`)
   - `gitlab_issues` (`#123` or `group/project#123`)
   - `linear` (`ENG-123`)
   - `bitbucket_issues`
   - `shortcut` (`sc-123`)
   - `pivotal_tracker`
   - `redmine`
   - `trello` (card URL)
   - `notion` (database row)
   - `markdown_only` — output a `.md` file for repos with no tracker
   The agent uses the right field names and link syntax for the
   configured tracker; the ADO + Jira templates below are illustrative
   defaults — the skill will adapt them.

2. **Auto-create threshold** — set
   `.assert-iq/config.yaml > bug_reporter.auto_create_threshold`:
   `low` | `medium` (default) | `high` | `critical`. Findings at or
   below the threshold are filed via API / MCP; findings above are
   presented as drafts requiring human confirmation. Critical and
   security-class bugs **always** require confirmation regardless of
   threshold.

3. **Duplicate-check window** — set
   `.assert-iq/config.yaml > bug_reporter.duplicate_lookback_days`
   (default `30`). Controls how far back the duplicate search reaches.

4. **Severity scheme** — the default is
   `critical | high | medium | low`. Override via
   `.assert-iq/config.yaml > bug_reporter.severity_scheme`:
   - `sev1_sev5` (Sev 1 / Sev 2 / Sev 3 / Sev 4 / Sev 5)
   - `p0_p4` (single dimension combining severity and priority)
   - `s1_s4_with_p1_p4` (separate severity + priority, default)
   - `custom` — define your own labels in
     `bug_reporter.severity_custom`.

5. **Component identification** — set
   `.assert-iq/config.yaml > bug_reporter.component_taxonomy`:
   - `area_path` (ADO classic)
   - `component_field` (Jira, Linear, GitHub labels)
   - `codeowners` — infer from `.github/CODEOWNERS` /
     `.gitlab/CODEOWNERS`
   - `freeform` — text component name in the body

6. **PII / data-protection policy** — set
   `.assert-iq/config.yaml > governance.mask_secrets` and
   `.assert-iq/config.yaml > bug_reporter.pii_redaction_extras` if
   your compliance posture (HIPAA, PCI, GDPR, FedRAMP, SOX) requires
   additional redaction classes beyond the default table in `## Data
   protection` below.

7. **Telemetry source** — if your team files bugs from observability
   alerts, set
   `.assert-iq/config.yaml > bug_reporter.telemetry_sources` (e.g.
   `application_insights`, `datadog`, `new_relic`, `splunk`,
   `grafana`, `sentry`, `rollbar`, `honeycomb`). The agent uses the
   appropriate query/link idiom in the alert template.

8. **Regression linkage** — set
   `.assert-iq/config.yaml > bug_reporter.regression_label` (default
   `regression`). Used as the tag/label when a closed bug is
   re-opened-as-new.

9. **Incident integration** — set
   `.assert-iq/config.yaml > bug_reporter.incident_system` if your
   team has one separate from the issue tracker (e.g. `pagerduty`,
   `opsgenie`, `incident_io`, `firehydrant`, `statuspage`,
   `none`). When an active incident is found, the agent links rather
   than files a duplicate.

10. **Output sink when no tracker is wired** — set
    `.assert-iq/config.yaml > bug_reporter.draft_path` (default
    `./bug-drafts/`). When `tracker.system: markdown_only` or no API
    access is available, the formatted bug is written to a file in
    this directory for human review and manual filing.
-->

# Generate bug report

Convert a failure into a tracker-ready defect that requires zero rework. A good defect saves multiple cycle hours; a bad defect spawns clarification threads.

This skill is **tracker-, language-, platform-, and team-agnostic**. It
writes defects in whatever issue tracker your repo uses (see
customization point 1 above). The ADO and Jira templates below are
illustrative defaults — the skill adapts them to the configured
tracker.

---

## Scope check

Before generating, verify this IS a defect:

| Signal | Route | Action |
|--------|-------|--------|
| Something worked before and now doesn't | **Defect** | Proceed |
| Expected behavior never existed | **Feature request** | Decline: "This is missing functionality, not a defect. Want me to draft a feature request/user story instead?" |
| Behavior matches spec but user dislikes it | **Enhancement** | Decline: "This works as designed. Want me to draft an enhancement request?" |
| Works as designed but UX is poor/confusing | **UX issue** | Decline: "This is a UX improvement, not a functional defect. Want me to draft a UX work item?" |
| Already reported — open | **Duplicate** | Link: "Found existing [ID] — adding your context as a comment." |
| Already reported — closed/resolved | **Regression** | Proceed as defect, tag regression, link to closed item: "This was fixed in [ID] but has regressed." |
| Test failed but has known flake history | **Flaky test** | "This test has flake history — filing as test-reliability issue, not product defect." |
| Active incident in progress | **Incident** | Attach to incident: "Linked to active incident [ID]." |
| Multiple symptoms, one root cause | **Compound** | File ONE bug for root cause, list all symptoms. |
| Unclear whether defect or gap | **Clarify** | "Is this something that previously worked and broke, or functionality that was never built?" |

**Compound failure rule:** One root cause = one bug listing all symptoms. Independent root causes = separate bugs. When unsure: file one, note "May split if investigation reveals independent causes."

---

## Inputs

- **Failure source:** test failure, manual finding, telemetry alert, or production incident
- **Target tracker:** read from `.assert-iq/config.yaml > tracker.system`; otherwise ask. Supports ADO, Jira, GitHub Issues, GitLab Issues, Linear, Bitbucket, Shortcut, Pivotal, Redmine, Trello, Notion, and markdown-only output.

---

## Procedure

### 1. Capture failure context

Gather what's available. Mark unknowns — never fabricate.

| Field | Source | If unknown |
|-------|--------|-----------|
| Action / scenario | Test name, alert, tester report | `[TBD — needs reproduction]` |
| Expected behavior | Assertion, spec, previous behavior | `[TBD — needs spec review]` |
| Observed behavior | Error output, screenshots, metrics | **Required** — cannot file without |
| Environment | CI config, tester setup, deploy info | `[Environment not captured]` |
| Build / commit | CI metadata, release notes | `[Build unknown]` |
| Stack trace | Logs, test output, telemetry | Sanitize if present; omit if unavailable |

**Minimum viable report:** Observed behavior + suspected component.

### 2. Write the title

Let a developer decide whether to click without reading the body.

**Format:** `[Component] Verb describing what's broken — context`

| Quality | Example | Why |
|---------|---------|-----|
| Good | `[PricingService] Discount calculates 10% instead of 15% for orders over $500` | Component, symptom, condition |
| Good | `[OrderAPI] NullReferenceException in ValidateShippingAddress after v2.4.1 deploy` | Component, error type, trigger |
| Bad | `Bug in pricing` | No component, no specifics |
| Bad | `Test failed` | No information content |
| Bad | `System.NullReferenceException was thrown` | Error type without context |

### 3. Reproduction

| Source | Format |
|--------|--------|
| **Test failure** | Test command, seed/config, assertion line |
| **Manual finding** | Numbered steps from clean state |
| **Telemetry alert** | Alert query + time window + deployment correlation |
| **Production incident** | Link to incident + time window + impact count |

**Quality bar:**
- Starts from known state (logged in as X, on page Y, with data Z)
- One action per step (not "configure and submit")
- Specific trigger data (not "enter some data")
- Explicit observation point ("Click Submit → observe error toast, not redirect")

**When unknown:** "Intermittent — reproduction not confirmed. Context: [what was happening]. Investigation area: [where to look]."

**Environment-specific failures** (fails in CI but not locally, or vice versa):
- Note both environments and the difference: "Fails on Ubuntu 22.04 CI runner. Passes locally on macOS 14."
- Include environment-specific factors: locale, timezone, available services, network, permissions
- Tag with `env-specific` if confirmed environment-dependent

### 4. Classify severity and priority

**Severity** = impact if unresolved. **Priority** = urgency of fix (may differ).

| Severity | Criteria | Examples |
|----------|----------|----------|
| **Critical** | Breaks critical workflow, no workaround, data loss/security risk | Payment down; data corruption; auth bypass |
| **High** | Degrades critical workflow OR breaks non-critical, no workaround | Checkout 10x slower; export broken |
| **Medium** | Non-critical degradation, workaround available | Report formatting wrong; search duplicates |
| **Low** | Cosmetic, edge-case, minimal impact | Typo in error; 1px alignment |

**Priority guidance:**
| Severity | Typical Priority | Differs when |
|----------|-----------------|-------------|
| Critical | P1 (immediate) | Almost never |
| High | P2 (next sprint) | P1 if affects release/SLA |
| Medium | P3 (backlog) | P2 if easy fix during related work |
| Low | P4 (if time) | P3 if high-visibility area |

**When ambiguous:** State both:
> "Severity: High (could argue Critical — 847 users, but performance degradation not total failure)"

**Impact multipliers:**
- \> 100 users in < 1 hour → consider escalating
- Data corruption/loss → minimum High
- Auth/authz bypass → Critical
- Blocks revenue → Critical

### 5. Identify component

Stop at first match:
1. **Stack trace** → file/class/method
2. **Error message** → service, endpoint, module
3. **Area of failure** → UI area, API route, job name
4. **Deployment correlation** → what was just deployed?
5. **Recent commits** → only if above yields nothing

### 6. Duplicate check

Search tracker for:
- Same component + similar error message
- Same stack trace signature
- Similar title keywords in last 30 days

| Found | State | Action |
|-------|-------|--------|
| Match | Open | Link as duplicate, add context as comment |
| Match | Closed/Resolved | File new as **regression**, link to closed, tag `regression` |
| No match | — | Proceed to create |

### 7. Format for tracker

#### ADO format

```
Title: [Component] Verb describing what's broken — context

## Repro Steps
1. [Precondition / starting state]
2. [Action]
3. [Action]
4. Observe: [What goes wrong]

## Expected Result
[What should happen at observation step]

## Actual Result
[What actually happens, including exact error]

## System Info
- Environment: [OS, browser/runtime version]
- Build: [Build number or commit SHA]
- Date observed: [ISO timestamp]
- Frequency: [Always (deterministic) / Intermittent (N of M) / Once observed]

## Additional Context
- Severity: [Critical/High/Medium/Low] — [justification]
- Priority: [P1/P2/P3/P4]
- Suspected component: [Name + file/method if known]
- Impact: [User count, revenue impact, scope]
- Related items: [Incidents, related bugs, work items]
- Deployment correlation: [Release/commit if timing suggests cause]
- Area Path: [Per `bug_reporter.component_taxonomy = area_path`]
- Iteration Path: [Current iteration]
- Tags: [regression, security, data-loss, env-specific — as applicable]
```

#### ADO format — telemetry-sourced

```
Title: [Component] Error description — deployment/time correlation

## Alert Details
- Alert: [Alert name/rule]
- Query: [KQL or monitoring query]
- Time window: [Start → End ISO]
- Error rate: [X% over Y minutes]

## Deployment Context
- Last deployment: [Release, commit, deploy time]
- Time between deploy and alert: [duration]
- Hypothesis: [Deploy caused / Unrelated because...]

## Impact
- Users affected: [count]
- Error count: [total in window]
- Affected endpoint/service: [specific]

## Stack Trace (sanitized)
[Exception type and call stack, PII removed]

## Severity & Priority
[Level] — [justification] | Priority: [P1-P4]

## Assignment
- Area Path: [Current Project Area]
- Iteration Path: [Current iteration]

## Suggested Action
[Rollback? Hotfix? Investigation? Feature flag disable?]

## Assignment
- Area Path: [Per `bug_reporter.component_taxonomy`]
- Iteration Path: [Current iteration]
```

#### Jira format

```
Summary: [Component] Verb describing what's broken — context

Description:
h3. Steps to Reproduce
# [Precondition / starting state]
# [Action]
# [Action]
# Observe: [What goes wrong]

h3. Expected
[What should happen]

h3. Actual
[What actually happens]

h3. Environment
- OS/Browser: [details]
- Version: [build/commit]
- Frequency: [Always (deterministic) / Intermittent / Once]

h3. Impact
- Users affected: [count or scope]
- Workaround: [Available — describe / None]

Priority: [Highest/High/Medium/Low]
Component/s: [Component name]
Labels: [bug, regression, severity-X, env-specific, area-tag]
```

#### GitHub Issues / GitLab Issues / Linear / other Markdown trackers

For trackers that accept Markdown bodies (GitHub Issues, GitLab Issues,
Linear, Bitbucket, Shortcut, Notion, etc.), use the ADO body structure
above rendered as plain Markdown:

```
Title: [Component] Verb describing what's broken — context

## Reproduction
1. ...
2. ...

## Expected
...

## Actual
...

## Environment
- OS / runtime: ...
- Build / commit: ...
- Frequency: Always | Intermittent (N of M) | Once

## Impact
- Users affected: ...
- Workaround: ...

## Severity & Priority
[Critical/High/Medium/Low] — [justification] | Priority: [P1-P4]

## Suspected component
...

---
Labels: bug, regression?, severity-X, env-specific?, <component-label>
Assignees: <inferred from CODEOWNERS when `component_taxonomy = codeowners`>
```

### 8. Delivery

| Condition | Action |
|-----------|--------|
| Severity Critical or High | **Never auto-create.** Present draft, require confirmation. |
| Security-class bug (auth bypass, data leak, privilege escalation) | **Never auto-create regardless of severity.** Present draft. |
| Active incident exists in `bug_reporter.incident_system` | Link to incident, add as comment. |
| Likely duplicate (open) | Link, add context as comment. |
| Likely duplicate (closed) | File as regression, link to closed item, tag with `bug_reporter.regression_label`. |
| Severity ≤ `bug_reporter.auto_create_threshold` AND tracker API/MCP available | Create via API/MCP, return ID. |
| No tracker access OR `tracker.system: markdown_only` | Write formatted draft to `bug_reporter.draft_path`. |

---

## Handling incomplete information

When input is vague or missing critical fields:

1. **Produce what you can** — fill known fields, mark unknowns with `[TBD]`
2. **Append clarification section** with specific questions and who to ask
3. **Classify severity provisionally** with confidence qualifier
4. **Suggest investigation direction** — even without repro steps, point developers at where to look:
   - Which logs to check (application logs, browser console, network tab)
   - Which component likely owns the behavior
   - What data conditions might trigger the issue
5. **File if minimum viable** (observed behavior + component); otherwise present draft with questions

**Applies to all source types:** Telemetry alerts with partial context (alert fired but no stack trace, or stack trace but no user impact count) follow the same pattern — fill what's known, [TBD] the rest, provide investigation direction.

### Worked example — incomplete input

**Input:** "The export button doesn't work sometimes. I think it was on the reports page. Maybe Chrome?"

**Output:**
```
Title: [Reports] Export button intermittently non-functional — reproduction TBD

## Repro Steps
1. Navigate to Reports page
2. Click Export button
3. Observe: [TBD — unresponsive? Error shown? Wrong file downloaded?]

## Expected Result
[TBD — expected: file downloads / dialog appears / new tab opens]

## Actual Result
Export button "doesn't work" — specific failure mode not yet captured

## System Info
- Environment: Chrome [version TBD], OS [TBD]
- Build: [TBD]
- Date observed: ~[yesterday/day before] per reporter
- Frequency: Intermittent ("sometimes")

## Additional Context
- Severity: Medium (provisional — non-critical feature, intermittent, workaround unknown)
- Priority: P3
- Suspected component: Reports / Export functionality
- Impact: [Single reporter — unknown if widespread]

## Investigation Suggestions
- Check browser console for JS errors when Export is clicked
- Check network tab for failed API calls to export endpoint
- Check if export works in incognito (extension interference?)
- Check server logs for the export endpoint around reported times

## Needs Clarification
- [ ] What exactly happens? (No response? Error? Wrong file?)
- [ ] Chrome version and OS
- [ ] Can you reproduce now? Steps that trigger it?
- [ ] Works in another browser?
- [ ] Frequency estimate (1 in 3? Once a day?)
```

---

## Data protection

Strip before including in any report:

| PII type | Replace with |
|----------|-------------|
| Email addresses | `[REDACTED-EMAIL]` |
| Phone numbers | `[REDACTED-PHONE]` |
| SSN / national IDs | `[REDACTED-ID]` |
| Payment card numbers | `[REDACTED-CARD]` |
| Physical addresses | `[REDACTED-ADDRESS]` |
| Customer names | `[CUSTOMER]` or anonymized ref |
| Auth tokens / secrets | `[REDACTED-TOKEN]` |
| Internal URLs | `[INTERNAL-URL]` |
| IP addresses (user) | `[REDACTED-IP]` |

**Rule:** When in doubt, redact. Too much redaction is fixable; leaked PII is a compliance incident.

After redaction: `⚠️ PII redacted. Contact [source] for unredacted details if needed for debugging.`

---

## Self-check before delivery

- [ ] Title: `[Component] Verb — context` format, scannable
- [ ] No PII/secrets in any field
- [ ] Severity justified (not just a label)
- [ ] Priority set (or noted as TBD if org norms unknown)
- [ ] Reproduction specific enough to attempt (or TBD with investigation suggestions)
- [ ] Duplicate check done (or noted as pending)
- [ ] Correctly routed — not a feature request, enhancement, flaky test, or UX issue
- [ ] Regression tagged if previously-fixed issue
- [ ] Environment-specific factors noted if applicable

---

## Output

One of:

- A tracker work item created via the configured tracker's API / MCP
  (when severity ≤ `bug_reporter.auto_create_threshold` and not a
  security-class bug), with the work item ID and URL returned.
- A formatted draft printed inline for human review and confirmation
  (when severity exceeds the threshold, or when the bug is
  security-class).
- A `.md` file written to `bug_reporter.draft_path` (when
  `tracker.system: markdown_only` or no API access).

All outputs respect the data-protection rules above.

## Signals emitted

When the QI signal sink is wired, this skill emits a `defect.filed`
signal per generation conforming to `.assert-iq/signal-schema.json`,
carrying: `tracker_id` (when filed), `severity`, `priority`,
`component`, `regression` (boolean), `source`
(`test_failure` | `manual` | `telemetry` | `incident`), `auto_created`
(boolean), `duplicate_check_result`
(`none` | `linked_open` | `linked_closed_regression`),
`pii_redactions_applied`, and `incident_ref` (when linked).

## Verify with oracle (v1.6.0+)

Generated bug reports are AI-authored drafts. Before filing in your
tracker (especially high-severity reports), verify the report quality
with oracle grading:

```
/grade-with-rubric <bug_report.md>  --rubric-id=bug-report-v1.0
```

This produces independent oracle feedback on:
- Reproducibility (can others follow the steps to recreate?)
- Expected vs. actual clarity (is the gap unmistakable?)
- Severity justification (is the business impact clear?)

**When to grade:** Always for security/P1 bugs; optionally for P2/P3
reports. Oracle FAIL verdicts should block filing until addressed.
