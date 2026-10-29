---
name: agentic-heal
mode: agent
description: "Agentic Healing — autonomously diagnose, repair, and re-execute failing tests within bounded retries."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, platform, or team** — it drives whatever test runner
your repo already uses; it does not impose one. You'll get sharper, faster
results if you fill in the per-repo specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each placeholder). If the key is absent, the agent infers from repo
signals or asks you. Wire the values once in `.assert-iq/config.yaml`
and they flow into every skill that references them — no per-skill
editing required.

1. **Test command** — `{{TEST_COMMAND}}` is the command that runs your
   whole suite. Examples by ecosystem:
   - JavaScript / TypeScript: `npm test`, `pnpm test`, `yarn test`, `vitest run`
   - Python: `pytest`, `python -m unittest`, `tox`
   - .NET: `dotnet test`
   - Java / Kotlin: `mvn test`, `gradle test`
   - Go: `go test ./...`
   - Rust: `cargo test`
   - Ruby: `bundle exec rspec`, `rake test`
   - Swift: `swift test`, `xcodebuild test`
   - PHP: `vendor/bin/phpunit`, `vendor/bin/pest`
   - Shell / generic: whatever your CI invokes

2. **Targeted-test command** — `{{TARGETED_TEST_COMMAND}}` runs a single
   test by name or path. Examples:
   - `pytest path/to/test.py::TestClass::test_name`
   - `npm test -- -t "test name"`
   - `dotnet test --filter "FullyQualifiedName~MyTest"`
   - `go test ./pkg -run TestName`
   - `cargo test test_name`
   - `mvn test -Dtest=ClassName#methodName`

3. **Maturity tier** — set `maturity_tier` in `.assert-iq/config.yaml`.
   `early` disables this skill; `mid` runs in suggest-only mode; `higher`
   runs autonomously within retry bounds.

4. **Retry bound** — default is `3`. Override per-invocation or set
   `agentic_healing.max_retries` in `.assert-iq/config.yaml`.

5. **Change-scope policy** — by default the skill modifies test code only.
   To allow fixture/data changes, pass `test-plus-fixtures` at invocation.
   Production code is **never** modified without explicit human approval,
   regardless of tier.

6. **Failure-classification taxonomy** — the four categories below
   (flaky / environmental / assertion drift / regression) are universal.
   Extend the list under `## Procedure` step 2 if your team tracks
   additional categories (e.g. infrastructure outage, data-contract drift,
   third-party API change).

7. **Healing-report sink** — by default the report is written to
   `healing-report.md` at the repo root. Override the path in
   `.assert-iq/config.yaml > agentic_healing.report_path`. (Structured
   QI signal emission is separate — see the `signals` section in
   `.assert-iq/config.yaml`.)

8. **Platform notes** — this skill is platform-agnostic (local dev,
   container, CI runner, mobile simulator, browser harness, etc.). If your
   test runner needs a wrapper (e.g. `xvfb-run`, `act`, `docker compose
   exec`, `npx playwright test`), include that wrapper inside
   `{{TEST_COMMAND}}`.
-->

# Agentic Healing

Operationalizes the QI healing pattern: when a test fails, diagnose the root
cause, propose a minimal correction, re-execute, and iterate until the test
passes or the retry bound is exhausted.

This skill is **framework-, language-, and platform-agnostic**. It drives
whatever test runner your repo already uses (see `{{TEST_COMMAND}}` and
`{{TARGETED_TEST_COMMAND}}` in the customization block above).

## Pre-conditions

- Maturity tier in `.assert-iq/config.yaml` must be `mid` (suggest-only) or
  `higher` (autonomous within bounds). On `early`, this skill explains why
  it is disabled and exits.
- The repository must expose an executable test command (`{{TEST_COMMAND}}`)
  and a way to target a single test (`{{TARGETED_TEST_COMMAND}}`).
- The working tree should be clean, or the user must explicitly accept that
  uncommitted changes will be amended by healing edits.

## Inputs you must collect

- **Failing test identifier** (path, fully-qualified name, or runner-native
  selector) — required.
- **Retry bound** (default: `3`, or value from
  `.assert-iq/config.yaml > agentic_healing.max_retries`).
- **Allowed change scope**: `test-only` (default) or `test-plus-fixtures`.
  Never `production-code` without explicit user confirmation captured in
  the healing report.
- **Tracker reference** (ADO `AB#1234` or Jira key) when the failing test
  carries a traceability comment — preserve it on any edited file.

## Procedure

1. **Capture the current failure signature**: stack trace, assertion diff,
   runner exit code, last green commit, environment fingerprint (OS,
   runtime version, relevant env vars). Run `{{TARGETED_TEST_COMMAND}}` to
   reproduce locally before changing anything.
2. **Classify the failure** (extend this list for your team if needed):
   - **flaky** — retry-able without code change (timing, ordering, shared state)
   - **environmental** — configuration, data, secrets, or runner setup issue
   - **assertion drift** — test expectation outdated against current correct behavior
   - **regression** — production code broke the contract the test encodes
3. **Pick the minimal corrective action** consistent with the allowed change
   scope. Prefer the smallest diff that resolves the signature.
4. **Apply, re-execute** with `{{TARGETED_TEST_COMMAND}}`, observe the new
   failure signature (or pass).
5. **Repeat** until pass **or** retry bound reached **or** a stop condition
   (below) is hit.
6. **Validate** by running the broader suite via `{{TEST_COMMAND}}` (or a
   scoped subset) to confirm no neighbouring tests regressed.
7. **Emit a healing report** containing:
   - failure signatures observed (one per iteration)
   - actions taken (diff summary per iteration)
   - final outcome (pass / give-up / escalate)
   - confidence level and rationale
   - human-review recommendation
   - tracker reference preserved from the test header

## Stop conditions

- Retry bound reached.
- Two consecutive iterations produce identical failure signatures (no progress).
- A **regression** is detected — escalate to the developer; do **not** patch
  production code under any maturity tier.
- The change required would exceed the allowed change scope.
- The failure classification cannot be determined with confidence.

## Output

A `healing-report.md` artifact (or the path configured in
`.assert-iq/config.yaml > agentic_healing.report_path`) with the
iteration log, plus the corrected test file(s). **Never** silently
quarantine, skip, or `@Ignore` a test — quarantine decisions require human
sign-off and must be recorded in the report with an owner and an expiry.

## Signals emitted

When the QI signal sink is wired, this skill emits a `test.healing` signal
per run conforming to `.assert-iq/signal-schema.json`, carrying:
`test_id`, `iterations`, `final_outcome`, `classification_history`,
`change_scope`, `confidence`, and `tracker_ref`.

## Verify healed tests with oracle (v1.6.0+)

After agentic healing succeeds, verify that the fix doesn't sacrifice
test quality. Grade the healed test independently:

```
/grade-with-rubric <healed_test>  --rubric-id=test-unit-v1.0
```

This surfaces if the healing:
- Introduced assertion clarity issues (brittle fix?)
- Compromised test independence (now coupled to other state?)
- Reduced determinism (added flakiness elsewhere?)
- Lost focus (testing too much now?)

**Maturity behavior:** Higher tiers can auto-gate healed tests on
oracle PASS; mid tier receives informational verdict; early tier
advisory. Oracle FAIL means the heal worked but the test quality
declined — human review recommended.
