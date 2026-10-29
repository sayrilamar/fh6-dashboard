---
applyTo: "tests/_qi/manual/**, tests/_qi/exploratory/**"
description: "QI manual test design and exploratory charter rules."
---

# Manual test design instructions

**When this applies:** authoring, modifying, or reviewing files under
`tests/_qi/manual/**` or `tests/_qi/exploratory/**` (Copilot loads via
`applyTo`; Claude Code: apply when the user is working with manual test cases
or exploratory charters in those locations).

When generating, modifying, or reviewing manual test cases or exploratory
charters, follow these rules.

## Required header on every generated manual test case or charter

```
---
qi-trace:
  work-item: <ADO_ID or JIRA_KEY>
  acceptance-criteria: <AC reference>
  layer: protection-strength
  type: <scripted-manual | exploratory-charter | uat-script | accessibility-check>
  generated-by: assert-iq
  review-required: true
  risk-tier: <low | medium | high>
  routed-to-manual-because: <subjective | uat | accessibility-cognitive | novel-area | one-time | other>
---
```

The `routed-to-manual-because` field is mandatory. It records why this AC
was not routed to automation. This protects against manual cases growing
where automation should be invested instead.

## Scripted manual test case format

Use this structure (compatible with ADO Test Plans, Xray, TestRail import):

```
**Title**: <one-line description>
**Preconditions**: <environment, data, state>
**Test Data**: <inputs, references>
**Steps**:
  1. <action> → **Expected**: <outcome>
  2. <action> → **Expected**: <outcome>
**Postconditions**: <cleanup, state to restore>
**Acceptance criteria validated**: <AC-1, AC-3>
```

Rules:
- Steps must be unambiguous to a tester unfamiliar with the feature.
- Avoid implementation language ("click the React component") in favor of
  user language ("select the Save button").
- Each step has exactly one expected outcome. Compound steps must be split.
- Test data references must point to the project's test data store, not
  raw values, when production-like data is implied.

## Exploratory charter format

Use a session-based test management style:

```
**Charter**: Investigate <area> for <risk> using <approach>.
**Time-box**: <30 | 60 | 90 minutes>
**Mission focus**: <bullets — what to learn, not what to verify>
**Areas to cover**: <user flows, edge conditions, integrations>
**Oracles**: <heuristics, comparable products, spec, business rules>
**Risks under investigation**: <which signal-layer risks this targets>
**Deliverables**: session notes, defects, follow-up areas, coverage delta.
```

A charter is a mission, not a script. Do not pre-script the steps.

## What you must not do

- Do not generate a manual case for an AC that is purely deterministic and
  testable through the automation framework. Surface a recommendation to
  automate instead.
- Do not duplicate cases across automated and manual unless explicitly
  requested as part of a regression-confidence strategy.
- Do not generate UAT scripts that include developer-only language unless
  the user is the UAT business owner.
- Do not silently downgrade a higher-risk AC to manual when automation is
  feasible — flag it.
