---
name: analyze-flaky-test
mode: agent
description: "Analyze flake patterns over run history — find the systemic cause, not just diagnose one failure."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, platform, CI system, or team** — the flake-pattern
taxonomy and root-cause discipline are universal; only the data source and
test runner change. You'll get sharper results if you fill in the per-repo
specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each placeholder). If the key is absent, the agent infers from repo
signals or asks you. Wire the values once in `.assert-iq/config.yaml`
and they flow into every skill that references them — no per-skill
editing required.

1. **Test-results store** — `{{RESULTS_STORE}}` is where historical run
   data lives. Examples:
   - CI provider native: GitHub Actions (Artifacts + Checks API), Azure
     Pipelines (Test Plans / TRX), GitLab CI (JUnit XML artifacts),
     Jenkins (JUnit / xUnit publisher), CircleCI (test metadata), Buildkite
     (`buildkite-test-collector`), TeamCity
   - Test-analytics platforms: Datadog CI Visibility, Launchable,
     BuildPulse, Allure TestOps, ReportPortal, Trunk Flaky Tests, Foresight,
     Currents (Cypress), Sauce Labs Insights, BrowserStack Insights,
     Microsoft Playwright Service
   - Self-hosted: Elasticsearch / OpenSearch index of JUnit XML, ClickHouse
     test-results table, BigQuery / Snowflake warehouse of CI exports
   Wire access in `.assert-iq/config.yaml > flake_analysis.results_store`.

2. **Query mechanism** — `{{RESULTS_QUERY}}` is how the agent fetches
   history. Options in priority order:
   - MCP server (Datadog MCP, GitHub MCP, Azure DevOps MCP, etc.) — preferred.
   - REST / GraphQL API call with a stored credential reference.
   - CLI wrapper (`gh run list`, `az pipelines runs test results list`,
     `glab ci list`).
   - Local file glob over JUnit / TRX / xUnit XML artifacts.
   - Manual paste — the user pastes recent runs inline.

3. **Test identifier format** — `{{TEST_ID_FORMAT}}` is how a test is named
   in your results store. Examples:
   - JUnit: `com.example.MyTest#testMethod`
   - pytest: `tests/test_foo.py::TestClass::test_method`
   - xUnit / NUnit / MSTest: `Namespace.ClassName.MethodName`
   - Go: `TestFunctionName` (with `pkg/path` prefix)
   - Jest / Vitest / Mocha: `describe › nested describe › it name`
   - Playwright / Cypress: spec file + test title path
   This determines how the agent groups runs into a single test history.

4. **History window** — `{{HISTORY_DAYS}}` is the default lookback.
   Default is `30`. Set in `.assert-iq/config.yaml >
   flake_analysis.history_days`. Increase for low-velocity repos, decrease
   for very-high-frequency CI.

5. **Flake threshold** — what counts as "flaky" in your team's vocabulary.
   Default is **pass rate between 5% and 95% on the same commit SHA, or ≥2
   alternating pass/fail transitions in the window**. Override in
   `.assert-iq/config.yaml > flake_analysis.flake_threshold`.

6. **Environment / dimensions to correlate** — `{{CORRELATION_DIMS}}` is
   the list of axes the analyzer slices flake by. Defaults: branch,
   environment, runner type, time-of-day, day-of-week, parallel-shard
   index. Add team-specific dimensions (region, browser, device profile,
   feature flag, tenant) in
   `.assert-iq/config.yaml > flake_analysis.correlation_dimensions`.

7. **Mitigation libraries** — the recommendations in step 5 of the
   Procedure call out generic patterns (explicit waits, factory isolation,
   contract mocks, etc.). If your framework has a preferred library
   (e.g. Playwright `expect.toPass`, Awaitility for JVM, `pytest-retry`,
   `Polly` for .NET, `tenacity` for Python), record it under
   `.assert-iq/config.yaml > flake_analysis.preferred_mitigations` so
   the agent recommends your team's idiom.

8. **Quarantine policy** — by default this skill **refuses** to quarantine
   or `@Skip` a test as a fix. If your team uses a structured
   quarantine workflow (label, tag, separate suite, dashboard), document
   it under `.assert-iq/config.yaml > flake_analysis.quarantine_workflow`
   so the agent can recommend it with the required expiry and owner
   fields. The governance rule below remains: quarantine is **containment,
   not a fix**.

9. **Report sink** — by default the report is written to
   `flake-analysis-report.md` at the repo root. Override the path in
   `.assert-iq/config.yaml > flake_analysis.report_path`. (Structured
   QI signal emission is separate — see the `signals` section in
   `.assert-iq/config.yaml`.)

10. **Five Whys discipline** — `.assert-iq/config.yaml >
    flake_analysis.five_whys`:
    - `max_depth` (default `7`) — runaway guard only. A short chain
      that reaches an evidence-exhausted root is correct.
    - `require_evidence_per_link` (default `true`, recommended locked)
      — every "why" must cite a concrete fact: metric, cluster
      correlation, log line, commit SHA, runner config, environment
      variable, query result, code line. Unevidenced links are marked
      `[ASSUMPTION]` and pause the chain.
    - `anti_pattern_capture` (default `ask`) — `ask` prompts before
      appending to the Anti-Patterns appendix below; `off` disables
      capture. `auto` is deliberately not offered — silent self-edits
      to the skill are forbidden.
-->

# Analyze flaky test

This skill operates over **historical run
data** to find *patterns* of flake (timing, environment, data,
concurrency) rather than diagnose a single failure.

This skill is **framework-, language-, platform-, and CI-agnostic** — it
queries whatever results store and runner your team already uses (see
`{{RESULTS_STORE}}`, `{{RESULTS_QUERY}}`, and `{{TEST_ID_FORMAT}}` in the
customization block above).

## Inputs

- **Scope** — a single test ID in `{{TEST_ID_FORMAT}}`, a suite / file /
  tag glob, or "all flakes in the last N days."
- **History window** — defaults to `{{HISTORY_DAYS}}` (configurable via
  `.assert-iq/config.yaml > flake_analysis.history_days`).
- **Optional dimension filter** — limit analysis to a branch, environment,
  runner, or any axis in `{{CORRELATION_DIMS}}`.

## Procedure

1. **Pull run history** for the scope from `{{RESULTS_STORE}}` via
   `{{RESULTS_QUERY}}`. If none is wired, ask the user where flake data
   lives and fall back to a manual paste.

2. **Compute flake metrics** per test:
   - Pass rate over the window
   - Failure clustering across `{{CORRELATION_DIMS}}` (time-of-day,
     day-of-week, branch, environment, runner, shard, region, browser,
     etc.)
   - Failure-signature diversity (is it the same error every time, or many?)
   - Co-failure correlation (does it flake alongside other tests?)
   - First-seen / last-seen and trend (worsening, stable, recovering)

3. **Run the Five Whys causal chain — MANDATORY on every analysis,
   including obvious patterns.** Non-skippable. Discipline over depth.
   A short chain that terminates early at a genuine root is correct;
   skipping is not. The chain prevents pattern-match-to-known-fix drift.

   Before starting, check the **Anti-Patterns** appendix at the bottom
   of this skill for a matching flake signature. If a match is found,
   note the signature ID, then still run a (short) chain to *ratify*
   the match against the current metrics — never shortcut purely on
   pattern recognition.

   Chain rules:

   - **Start from the observed pattern** (the dominant metric or
     cluster from step 2 — e.g. "fails 60% on `runner-eu-1` Mondays
     08:00–10:00"), not from a hypothesis.
   - **Each "why" must cite concrete evidence**: a metric value, a
     cluster correlation, a log line, a commit SHA, a runner config,
     an environment variable, a query result, or a line of code.
     Cite inline (`pass_rate=0.42 on shard=3`, `commit abc123 added
     parallel I/O`, `runner image rebuilt 2024-10-15`).
   - **Tag each link's confidence**: `evidenced` (artifact cited),
     `inferred` (reasoned from cited evidence), `assumed` (no
     evidence — pauses the chain).
   - **Render the chain inline in the working response**, not only in
     the final report, so the user can intervene precisely at the
     drifting link.
   - **Stop rule = evidence exhaustion**, not layer boundary. Keep
     asking "why" until the next answer cannot be backed by evidence
     in the results store, repo, infra config, or wired MCP sources.
     Test code, production code, infra, third-party services, and
     team conventions are all in-scope for the chain. The action
     scope (mitigation vs. escalation) is bounded separately in
     step 5.
   - **Runaway guard**: depth cap `flake_analysis.five_whys.max_depth`
     (default 7). If reached without exhausting evidence, declare
     insufficient evidence per the Stop conditions.
   - **Contradictory evidence mid-chain**: single chain only — pick
     the higher-confidence branch, continue, log the discarded
     branch in the report. No parallel chains.
   - **When the user pushes back**: revise the specific challenged
     link with new evidence. Do **not** restart the chain or swap
     the classification to please the user. Hold position when every
     link is `evidenced`; defer or re-investigate only when any link
     is `inferred` or `assumed`.
   - **When the user states the root cause**: still produce the chain
     from the observed pattern to validate or contradict. No
     shortcutting on user authority.

   Record the terminal link as the **systemic root cause**. The next
   step's classification falls out of where evidence ran out.

4. **Classify the flake pattern**. The category must follow from the
   root cause identified in step 3 — do **not** select a category
   before the chain terminates.
   - **Timing** — race conditions, animations, async ordering, missing waits
   - **Environment** — flake correlates with environment instability,
     pipeline runner, or specific agent
   - **Data** — flake correlates with shared test data or order-dependent
     setup
   - **Concurrency** — flake correlates with parallel execution / shard
   - **External dependency** — flake correlates with third-party service
     latency or availability
   - **Genuine intermittent bug** — production code has a real race or
     non-determinism

5. **Recommend mitigation** per pattern, preferring the team's idioms
   from `flake_analysis.preferred_mitigations` when set:
   - Timing → explicit wait / idempotent setup
     (e.g. Playwright `expect.toPass`, Awaitility, `pytest-retry`)
   - Environment → infrastructure ticket, runner pinning, image rebuild
   - Data → test isolation, per-test factory regeneration, transaction
     rollback
   - Concurrency → serialize, fix shared state, scope fixtures correctly
   - External → contract mock, retry-with-backoff at the boundary,
     circuit breaker (Polly / resilience4j / tenacity)
   - Genuine bug → escalate to engineering; do **not** patch in test

6. **Output a flake-pattern report** containing:
   - Scope and history window
   - Flake metrics and trend
   - **The full Five Whys chain** with per-link evidence citations,
     confidence tags (`evidenced` / `inferred` / `assumed`), and the
     stop reason
   - Discarded-branch log (if contradictory evidence was encountered)
   - Pattern classification with confidence, tied to the terminal
     link of the chain
   - Recommended mitigation, owner, and target sprint
   - Any cross-test pattern detected
   - Traceability reference if the test carries a tracker ID
   - Anti-Patterns lookup result: matched signature ID, or the
     proposed-new-signature row awaiting confirmation (see step 7)

7. **Capture learning — update the Anti-Patterns appendix.** After
   the report is produced:
   - If the chain matched an existing signature, increment its
     `Recurrences` count and update `Last seen`. This may be done in
     the same turn; surface the change in the response.
   - If the chain produced a **new** signature, draft the proposed
     row (signature, root cause, diagnostic shortcut, first seen,
     recurrences = 1) and **ask the user before appending**. Asking
     is mandatory — `auto` capture is not offered. If the response
     would end before the append can be performed, include the
     proposed row and the explicit ask as the final block of the
     response so the user can approve next turn.
   - Entries must be paraphrased / pattern-level. **Never** paste
     raw stack traces, log dumps, PII, secrets, internal URLs, or
     customer data into the appendix.
   - The goal is to make the skill sharper over time — a matched
     signature in step 3 lets future invocations reach the root
     faster without sacrificing the discipline of the chain.

## Stop conditions

- The Five Whys chain hits an `[ASSUMPTION]` link that cannot be
  resolved with available evidence — pause the chain, surface the
  unevidenced link, and recommend the specific data needed (more
  history, additional dimension, runner config, infra log) before
  continuing. Do **not** advance the chain by guessing.
- The chain reaches `max_depth` without exhausting evidence — declare
  insufficient evidence; recommend escalation rather than acting on a
  half-formed root.

## Governance

- Do **not** quarantine or skip the test as a fix. Quarantine is
  **temporary containment**; if recommended, it must follow the workflow
  in `flake_analysis.quarantine_workflow` and carry an explicit **expiry
  date and owner**.
- If the root cause is a **genuine production bug**, escalate. Do **not**
  propose test-side workarounds for production issues.
- Surface flake patterns that span **multiple tests** as systemic issues;
  a per-test fix is the wrong altitude. Recommend the cross-cutting
  remediation explicitly.
- Preserve any existing traceability comments (`AB#`, Jira key, etc.) on
  tests touched by the recommendations.

### Five Whys discipline (anti-drift)

- The chain is **mandatory** on every analysis, including obvious
  patterns. Skipping is forbidden; short chains are fine when the
  root is reached early.
- Every link must be evidenced or explicitly tagged `[ASSUMPTION]`.
  Unevidenced advancement is forbidden.
- The classification (step 4) must follow from the terminal link of
  the chain. **Never** pick a category before the chain terminates.
- When challenged by the user, revise the specific link with new
  evidence — do **not** restart the chain or swap the classification
  to satisfy the user. Hold position when every link is `evidenced`;
  defer or re-investigate only when any link is `inferred` or
  `assumed`.
- When the user states the root cause directly, still produce the
  chain from the observed pattern to validate or contradict.
- Contradictory evidence mid-chain: single chain only — pick the
  higher-confidence branch and log the discarded branch in the
  report. No parallel chains.

### Self-update discipline (Anti-Patterns appendix)

- Anti-Patterns table edits are **user-gated**. The agent may
  **never** append, edit, or reorder rows without explicit
  confirmation in the same turn. `auto` capture mode is not offered.
- Recurrence increments on a clear signature match may be applied in
  the same turn, but must be surfaced in the response.
- Entries are paraphrased and pattern-level. **No** raw stack traces,
  log dumps, PII, secrets, internal URLs, or customer data.
- If the response would end before the proposed row can be appended,
  include the proposed row and the explicit ask as the final block of
  the response so the user can approve next turn.
- The appendix is the skill's long-term memory. Prefer updating an
  existing signature over creating a near-duplicate, and propose
  retiring rows that have not recurred in 12 months.

## Output

A `flake-analysis-report.md` artifact (or the path configured in
`.assert-iq/config.yaml > flake_analysis.report_path`) with the
sections listed in step 6, including the full Five Whys chain and the
Anti-Patterns lookup result. No silent edits to test files —
recommendations are presented for human review unless the maturity tier
explicitly allows autonomous mitigation.

## Signals emitted

When the QI signal sink is wired, this skill emits a `test.flake_analysis`
signal per run conforming to `.assert-iq/signal-schema.json`, carrying:
`scope`, `history_window_days`, `flake_count`, `pattern_classification`,
`confidence`, `correlation_dimensions[]`, `recommended_action`,
`cross_test_pattern_detected`, `tracker_ref`, `causal_chain_depth`,
`causal_chain_stop_reason`
(`evidence_exhausted` | `actionable_root` | `depth_cap`
| `insufficient_evidence`), `unevidenced_links_count`,
`anti_pattern_match` (signature ID or `null`), and
`anti_pattern_proposed` (boolean — true when a new signature was
proposed for user confirmation).

## Verify fixes with oracle (v1.6.0+)

After flake analysis identifies the root cause and you apply a fix,
verify that the remediation improved test quality without introducing
new brittleness:

```
/grade-with-rubric <fixed_test>  --rubric-id=test-unit-v1.0
```

Oracle grading checks if the fix:
- Maintains assertion clarity (fix didn't obscure intent?)
- Preserves test independence (fix didn't couple tests?)
- Improves determinism (actually less flaky now?)
- Keeps focus (fix is surgical, not broad?)

**Workflow:** Run analyze-flaky-test → apply fix → grade with oracle
to validate fix quality. Oracle verdicts feed `/check-merge` to gate
the fix before merge.

## Anti-Patterns appendix

The skill's long-term memory. Each row is a reusable flake signature
with its evidence-backed systemic root cause and a diagnostic shortcut
for future invocations. Rows are added **only with user confirmation**
(see step 7 and the Self-update discipline section). Recurrence
increments may be applied automatically on a clear match but must be
surfaced in the response.

| Signature | Root cause | Diagnostic shortcut | First seen | Last seen | Recurrences |
| --- | --- | --- | --- | --- | --- |
| _(empty — seeded by user-confirmed captures from step 7)_ | | | | | |
