---
name: debug-ui-tests
mode: agent
description: "Diagnose failing UI tests — distinguish flaky vs brittle vs broken vs regression."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
UI test framework, language, platform, browser/device target, CI host, or
team** — it diagnoses whatever UI test runner your repo already uses; it
does not impose one. You'll get sharper, faster results if you fill in
the per-repo specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each placeholder). If the key is absent, the agent infers from repo
signals or asks you. Wire the values once in `.assert-iq/config.yaml`
and they flow into every skill that references them — no per-skill
editing required.

1. **UI test framework** — set
   `.assert-iq/config.yaml > test_framework.primary`. Examples and the
   selector/wait idioms the agent will assume:
   - **Playwright** (TS/JS/Python/.NET/Java): `getByRole`, `getByTestId`,
     `expect(locator).toBeVisible()` auto-wait
   - **Cypress** (JS/TS): `cy.get('[data-cy=...]')`, retry-ability
     built-in
   - **WebdriverIO** (JS/TS): `$('aria/...')`, `waitForDisplayed`
   - **Selenium** (any language): `WebDriverWait` + `ExpectedConditions`
   - **Puppeteer** (JS/TS): `page.waitForSelector`
   - **TestCafe** (JS/TS): smart wait + `Selector`
   - **Appium** (any language): `accessibility-id` selectors, mobile
     contexts
   - **Espresso** (Android / Kotlin / Java): `onView(withId(...))`,
     `IdlingResource`
   - **XCUITest** (iOS / Swift): `XCUIApplication().buttons["id"]`,
     `waitForExistence`
   - **Detox** (React Native): `by.id(...)`, automatic sync
   - **Maestro** (mobile): YAML flows with retries
   - **Robot Framework + SeleniumLibrary / Browser**: keyword-style
   - **Generic / other**: the universal taxonomy below still applies

2. **Targeted-test command** — `{{TARGETED_TEST_COMMAND}}` runs the
   single failing UI test. Examples by framework:
   - Playwright: `npx playwright test path/to/spec.ts:42`
   - Cypress: `npx cypress run --spec path/to/spec.cy.ts`
   - Selenium (pytest): `pytest tests/ui/test_login.py::test_happy_path`
   - WebdriverIO: `npx wdio run wdio.conf.ts --spec path/to/spec.ts`
   - Espresso: `./gradlew connectedDebugAndroidTest --tests <FQN>`
   - XCUITest: `xcodebuild test -only-testing:<Target>/<Class>/<Test>`
   - Generic: whatever your CI invokes

3. **Run-history source** — set
   `.assert-iq/config.yaml > flake_analysis.results_store` (this skill
   reuses the same store as `analyze-flaky-test`). Options:
   `ci_native` | `junit_glob` | `datadog` | `launchable` | `buildpulse`
   | `allure` | `reportportal` | `trunk` | `elasticsearch` |
   `clickhouse` | `bigquery` | `snowflake`. Preferred fallback chain:
   MCP → CLI → manual paste.

4. **Artifact retrieval** — UI debugging hinges on visual evidence. Set
   `.assert-iq/config.yaml > ui_debug.artifact_sources` to a list of
   where the skill should look for screenshots, video, traces, DOM
   snapshots, logs. Defaults cover common locations:
   `./test-results/**`, `./playwright-report/**`, `./cypress/screenshots/**`,
   `./cypress/videos/**`, `./build/reports/androidTests/**`,
   CI-host artifact URLs when MCP is wired.

5. **Selector-stability policy** — `.assert-iq/config.yaml >
   ui_debug.selector_policy`:
   - `test_id_first` (default) — prefer `data-testid` / `data-cy` /
     `accessibility-id` / `automation-id`
   - `role_first` — prefer ARIA-role-based selectors
     (`getByRole`, accessibility identifiers)
   - `text_allowed` — allow text-based selectors when stable
   - `xpath_last_resort` — only when no other anchor exists

6. **Wait-strategy policy** — `.assert-iq/config.yaml >
   ui_debug.wait_policy`:
   - `framework_auto` (default) — rely on framework's built-in retry /
     auto-wait (Playwright, Cypress)
   - `explicit_conditions` — require explicit `wait_for_*` /
     `ExpectedConditions` calls
   - `forbid_sleeps` — flag any hard sleep / `Thread.sleep` /
     `cy.wait(<ms>)` / `time.sleep` as 🔴 (default true for new edits)

7. **Maturity tier** — set `maturity_tier` in `.assert-iq/config.yaml`.
   `early` → diagnose and recommend, no edits. `mid` → suggest-only
   patches. `higher` → autonomous test-side fixes within bounds (never
   production code).

8. **Production code is off-limits** — regardless of tier, this skill
   **never** patches production code. Regressions escalate.

9. **Debug-report sink** — by default the report is written to
   `ui-debug-report.md` at the repo root. Override the path in
   `.assert-iq/config.yaml > ui_debug.report_path`. (Structured QI
   signal emission is separate — see the `signals` section in
   `.assert-iq/config.yaml`.)

10. **Platform notes** — this skill is platform-agnostic (desktop web,
    mobile web, native iOS, native Android, React Native, Electron,
    embedded WebView, VR/AR harness). If your runner needs a wrapper
    (`xvfb-run`, `docker compose exec`, `npx playwright test`,
    `flutter drive`, `gradle connectedAndroidTest`, simulator boot),
    include that wrapper inside `{{TARGETED_TEST_COMMAND}}`.

11. **Five Whys discipline** — `.assert-iq/config.yaml >
    ui_debug.five_whys`:
    - `max_depth` (default `7`) — runaway guard only, not a target. A
      short chain that reaches an evidence-exhausted root is correct.
    - `require_evidence_per_link` (default `true`, recommended locked)
      — every "why" must cite a concrete artifact (log line, stack
      frame, screenshot region, trace event, DOM snapshot, history
      pattern, commit SHA, query result, selector, line of code).
      Unevidenced links are marked `[ASSUMPTION]` and pause the chain.
    - `anti_pattern_capture` (default `ask`) — `ask` prompts before
      appending a new row to the Anti-Patterns appendix below;
      `off` disables capture. `auto` is deliberately not offered —
      silent self-edits to the skill are forbidden.
-->

# Debug UI tests

Diagnose a failing or unstable UI test. Produce a root-cause
classification and the minimal corrective action.

This skill is **framework-, language-, platform-, browser/device-, and
CI-host-agnostic**. It reads whatever artifacts your UI runner already
produces (see customization points 1, 3, 4 above).

## Pre-conditions

- A failing or unstable UI test is identified (path, fully-qualified
  name, or runner-native selector).
- The runner produces at least one of: structured failure output,
  screenshot / video / trace, DOM snapshot, or console / device log.
- Run history is reachable via `flake_analysis.results_store` OR the
  user is prepared to paste it manually.

## Inputs you must collect

- **Failing test identifier** — required.
- **Recent run history** — last N runs (default 5), pulled from
  `flake_analysis.results_store`. If unavailable, ask the user to
  paste; note the gap in the report.
- **Artifact set for the latest failure** — screenshots, video, trace,
  DOM snapshot, console / device logs. Fetch from
  `ui_debug.artifact_sources`.
- **Tracker reference** when the test carries a traceability comment
  (see `traceability.marker_style`) — preserve it on any edit.

## Procedure

1. **Pull the test file and the failing assertion / error.** Capture
   the full failure signature (stack, message, screenshot reference,
   trace reference, browser / device, runner version, last green
   commit).

2. **Pull the last N runs** from `flake_analysis.results_store`
   (default 5). Note the pass/fail pattern, the commit SHA range, and
   any environment dimension that correlates (branch, browser, device,
   shard, runner, time of day).

3. **Run the Five Whys causal chain — MANDATORY on every failure,
   including obvious ones.** This step is non-skippable. A short chain
   that terminates early at a genuine root is correct; a skipped chain
   is not. Discipline over depth — the requirement enforces consistency
   and prevents pattern-match-to-known-fix drift.

   Before starting, check the **Anti-Patterns** appendix at the bottom
   of this skill for a matching failure signature. If a match is found,
   note the signature ID, then still run a (short) chain to *ratify*
   the match against the current evidence — never shortcut purely on
   pattern recognition.

   Chain rules:

   - **Start from the literal symptom** (the failing assertion or
     error message), not from a hypothesis.
   - **Each "why" must be backed by concrete evidence**: log line,
     stack frame, screenshot region, trace event, DOM snapshot,
     history pattern, commit SHA, query result, selector, or line of
     code. Cite the artifact inline (`see trace.zip:event#42`,
     `LoginPage.ts:88`, `runs 4/5 fail on commit abc123`).
   - **Tag each link's confidence**: `evidenced` (artifact cited),
     `inferred` (reasoned from cited evidence but not directly
     observed), `assumed` (no evidence — pauses the chain).
   - **Render the chain inline in the working response, not only in
     the final report**, so the user can intervene precisely at the
     drifting link without waiting for completion.
   - **Stop rule = evidence exhaustion**, not layer boundary. Keep
     asking "why" until the next answer cannot be backed by evidence
     available in the repo, artifacts, history, or wired MCP sources.
     Production code, infra, third-party causes, and process / team
     conventions are all in-scope for the chain. The stop rule is:
     evidence runs out, not ownership changes.
   - **Action scope is bounded separately from chain scope.** The
     chain may identify a production-code root; the *fix* still
     escalates (see step 8). Finding the true root is more important
     than making the test pass.
   - **Runaway guard**: depth cap `ui_debug.five_whys.max_depth`
     (default 7). If reached without exhausting evidence, halt and
     declare insufficient evidence per the Stop conditions.
   - **Contradictory evidence mid-chain**: pick the higher-confidence
     branch, continue, and log the discarded branch with its evidence
     in the report. No parallel chains.
   - **When the user pushes back**: revise the specific challenged
     link with new evidence. Do **not** restart the chain or
     re-shuffle the category to please the user. Hold position when
     every link is `evidenced`; defer or re-investigate when any link
     is `inferred` or `assumed`.
   - **When the user states the root cause**: still produce the chain
     from the symptom to validate or contradict. No shortcutting.

   Record the terminal link as the **root cause**. The next step's
   classification falls out of where evidence ran out.

4. **Classify the failure** into exactly one of four universal
   categories. The category must follow from the root cause identified
   in step 3 — do **not** select a category before the chain
   terminates.
   - **Flaky** — root is non-determinism in test, fixture, wait, or
     shared state. Symptoms: passes/fails on the same code; timing,
     animations, race conditions, hard sleeps, network/data
     variability, viewport / device variance.
   - **Brittle** — root is selector / data / locale coupling. Symptoms:
     passes today, breaks on minor UI changes; fragile selectors (CSS
     path, nth-child, generated IDs), hard-coded test data,
     environment coupling.
   - **Broken** — root is the assertion itself encoding the wrong
     intent. Test logic is incorrect or outdated; assertion no longer
     matches the intended behavior.
   - **Regression** — root is in production code. The test is correct;
     production broke the contract the test encodes.

5. **For flaky** — propose a minimal test-side fix:
   - replace hard sleeps with framework-native waits / retry-ability
     (per `ui_debug.wait_policy`)
   - isolate shared state (fresh fixtures, per-test data factory,
     storage reset)
   - stabilize ordering (no inter-test dependency)
   - if the root cause is genuinely a product timing bug, escalate as
     **Regression** instead

6. **For brittle** — propose selector / data hardening:
   - migrate the selector to the policy in `ui_debug.selector_policy`
   - replace hard-coded data with factories / deterministic seeds (see
     `generate-test-data`)
   - decouple from environment-specific text where possible

7. **For broken** — surface the assertion drift; propose the updated
   expectation, citing the work item or PR that changed the intended
   behavior. Do **not** simply re-record golden values to "make it
   pass" — confirm the new behavior is correct first.

8. **For regression — STOP.** Escalate to the developer with the
   evidence chain. Do **not** patch production code under any maturity
   tier. Do **not** weaken the assertion to mask the regression.

9. **Emit a debug report** containing:
   - failure signature (stack, screenshots / trace references, env)
   - run-history slice with the correlation dimension
   - **the full Five Whys chain** with per-link evidence citations and
     confidence tags, and the stop reason
   - discarded-branch log (if contradictory evidence was encountered)
   - classification + confidence + reasoning, explicitly tied to the
     terminal link of the chain
   - artifact links (screenshots, video, trace, DOM)
   - recommended corrective action (test edit OR escalation)
   - tracker reference preserved from the test header
   - Anti-Patterns lookup result: matched signature ID, or the
     proposed-new-signature row awaiting confirmation (see step 10)

10. **Capture learning — update the Anti-Patterns appendix.** After
    the report is produced:
    - If the chain matched an existing signature in the appendix,
      increment its `Recurrences` count and update `Last seen`. This
      may be done in the same turn; surface the change in the
      response.
    - If the chain produced a **new** signature, draft the proposed
      row (signature, root cause, diagnostic shortcut, first seen,
      recurrences = 1) and **ask the user before appending**. Asking
      is mandatory — `auto` capture is not offered. If the response
      would end before the append can be performed (tool unavailable,
      conversation closing), include the proposed row and the
      explicit ask as the final block of the response so the user can
      approve in the next turn.
    - Entries must be paraphrased / pattern-level. **Never** paste
      raw stack traces, full DOM dumps, PII, secrets, internal URLs,
      or customer data into the appendix.
    - The goal of this loop is to make the skill sharper over time —
      a matched signature in step 3 lets future invocations reach the
      root faster without sacrificing the discipline of the chain.

## Stop conditions

- The Five Whys chain hits an `[ASSUMPTION]` link that cannot be
  resolved with available evidence — pause the chain, surface the
  unevidenced link to the user, and recommend the specific artifact
  needed (additional run, trace, video, query) before continuing. Do
  **not** advance the chain by guessing.
- The chain reaches `max_depth` without exhausting evidence — declare
  insufficient evidence; recommend escalation rather than acting on a
  half-formed root.
- Classification cannot be determined with confidence — surface the
  ambiguity to the user; recommend additional artifacts (more runs,
  trace, video) before acting.
- A **regression** is detected — escalate; do **not** patch production
  code.
- The proposed fix would weaken the assertion's intent (e.g. removing
  the failing check, broadening the matcher to swallow the defect) —
  refuse and surface as regression-class.
- The fix requires changes beyond the test file and approved fixtures
  — escalate.

## Governance

- **Never** modify production code from this skill. Regressions
  escalate. This is non-negotiable across all maturity tiers.
- **Never** silently skip, quarantine, or `@Ignore` a test. Quarantine
  is containment, not a fix — it requires human sign-off, an owner,
  and an expiry recorded in the report (see
  `flake_analysis.quarantine_workflow`).
- **Never** re-record a golden / snapshot value to mask a real
  behavior change — confirm intent first, cite the work item.
- Selector and wait edits must conform to
  `ui_debug.selector_policy` and `ui_debug.wait_policy`.
- The blameless principle applies: classify the failure, don't blame
  the author.

### Five Whys discipline (anti-drift)

- The chain is **mandatory** on every failure, including obvious
  ones. Skipping is forbidden; short chains are fine when the root is
  reached early.
- Every link must be evidenced or explicitly tagged `[ASSUMPTION]`.
  Unevidenced advancement is forbidden.
- The classification (step 4) must follow from the terminal link of
  the chain. **Never** pick a category before the chain terminates.
- When challenged by the user, revise the specific link with new
  evidence — do **not** restart the chain or swap the category to
  satisfy the user. Hold position when every link is `evidenced`;
  defer or re-investigate only when any link is `inferred` or
  `assumed`.
- When the user states the root cause directly, still produce the
  chain from the symptom to validate or contradict. No shortcutting
  on user authority.
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
  DOM dumps, PII, secrets, internal URLs, or customer data.
- If the response would end before the proposed row can be appended,
  the agent must include the proposed row and the explicit ask as the
  final block of its response so the user can approve next turn.
- The appendix is the skill's long-term memory. Bloat is a real risk:
  prefer updating an existing signature over creating a near-duplicate,
  and propose retiring rows that have not recurred in 12 months.

## Output

A `ui-debug-report.md` artifact (or the path configured in
`.assert-iq/config.yaml > ui_debug.report_path`) containing:

- failure signature and environment
- run-history slice and correlation dimension
- **the full Five Whys chain** with per-link evidence citations,
  confidence tags (`evidenced` / `inferred` / `assumed`), and the
  stop reason
- discarded-branch log when contradictory evidence was encountered
- classification + confidence, tied to the terminal link of the chain
- artifact links (screenshots, video, trace, DOM)
- recommended corrective action (test edit OR escalation)
- tracker reference preserved from the test header
- Anti-Patterns lookup result: matched signature ID, or the
  proposed-new-signature row awaiting user confirmation
- the corrected test file(s) when the proposed fix is test-side

## Signals emitted

When the QI signal sink is wired, this skill emits a `test.ui_debug`
signal per run conforming to `.assert-iq/signal-schema.json`, carrying:
`test_id`, `framework`, `classification`
(`flaky` | `brittle` | `broken` | `regression`), `confidence`,
`history_window`, `correlation_dimension`, `action`
(`test_fix` | `escalate` | `await_artifacts`), `selector_changes`,
`wait_changes`, `tracker_ref`, `causal_chain_depth`,
`causal_chain_stop_reason`
(`evidence_exhausted` | `actionable_root` | `depth_cap`
| `insufficient_evidence`), `unevidenced_links_count`,
`anti_pattern_match` (signature ID or `null`), and
`anti_pattern_proposed` (boolean — true when a new signature was
proposed for user confirmation).

## Verify UI test brittleness with oracle (v1.6.0+)

After diagnosing and fixing a UI test failure, grade the test with
oracle to detect if it's prone to future brittleness:

```
/grade-with-rubric <fixed_ui_test>  --rubric-id=test-unit-v1.0
```

Oracle reveals if brittleness is due to:
- **Independence issues:** Test depends on state from other tests?
- **Determinism gaps:** Waits still insufficient?
- **Focus drift:** Test now over-coupled to implementation?

Oracle CONDITIONAL/FAIL verdicts indicate the fix is temporary — more
architectural work needed (Page Object refactor, selector hardening,
wait strategy).

## Anti-Patterns appendix

The skill's long-term memory. Each row is a reusable failure
signature with its evidence-backed root cause and a diagnostic
shortcut for future invocations. Rows are added **only with user
confirmation** (see step 10 and the Self-update discipline section).
Recurrence increments may be applied automatically on a clear match
but must be surfaced in the response.

| Signature | Root cause | Diagnostic shortcut | First seen | Last seen | Recurrences |
| --- | --- | --- | --- | --- | --- |
| _(empty — seeded by user-confirmed captures from step 10)_ | | | | | |
