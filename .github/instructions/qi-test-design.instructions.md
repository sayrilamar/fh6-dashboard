---
applyTo: "tests/**, **/*.test.*, **/*.spec.*, **/*Test.*"
description: "Assert.IQ test generation and design rules."
---

# Test design instructions

**When this applies:** generating, modifying, or reviewing automated tests —
any file matching `*Test.*`, `*.test.*`, `*.spec.*`, or living under
`tests/**` (Copilot loads via `applyTo`; Claude Code: apply whenever the
user is working with automated test code).

When generating, modifying, or reviewing tests, follow these rules.

## Required header on every generated test

Every generated test must begin with according to the project's idiomatic comment style, including the following metadata:

```
/// <qi-trace work-item: <ADO_ID or JIRA_KEY> />
/// <qi-trace acceptance-criteria: <AC reference> />
/// <qi-layer protection-strength />
/// <qi-generated-by assert-iq />
/// <qi-review-required true />
/// <qi-risk-tier <low|medium|high> />
```

## Framework conformance

Read `.assert-iq/config.yaml` to determine the active test framework. Do not
introduce a different framework. Supported frameworks include but are not limited
to: Playwright, Cypress, Selenium (Java/C#/Python), RestAssured, Postman/Newman,
JUnit, TestNG, NUnit, xUnit, pytest, Jest, Vitest, Mocha.

## Test design heuristics

1. Start from acceptance criteria, not from implementation.
2. Cover the happy path first, then negative paths, then edge cases.
3. Each test must be independently executable and idempotent.
4. Use the Page Object Model (UI) or Service Object pattern (API) where the
   project already does so. Do not invent new patterns.
5. Avoid hard waits. Prefer explicit waits or test-framework idioms.
6. Test data must be deterministic or generated through the project's existing
   data factory.

## What you must not do

- Do not generate tests that touch production endpoints.
- Do not embed credentials, tokens, or PII in test data.
- Do not silently skip or quarantine tests. Surface flakes and ask.
