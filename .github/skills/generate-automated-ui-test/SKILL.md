---
name: generate-automated-ui-test
mode: agent
description: "Generate UI tests for a workflow — Page Object Model, stable selectors, explicit waits."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any UI
test framework, language, platform, browser/device target, or team** —
it generates tests in whatever UI runner your repo already uses; it does
not impose one. You'll get sharper, faster results if you fill in the
per-repo specifics below.

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
   idioms the agent will generate:
   - **Playwright** (TS / JS / Python / .NET / Java): `getByRole`,
     `getByTestId`, auto-wait
   - **Cypress** (JS / TS): `cy.get('[data-cy=...]')`, retry-ability
   - **WebdriverIO** (JS / TS): `$('aria/...')`, `waitForDisplayed`
   - **Selenium** (any language): `WebDriverWait` +
     `ExpectedConditions`
   - **Puppeteer** (JS / TS): `page.waitForSelector`
   - **TestCafe** (JS / TS): `Selector` + smart wait
   - **Appium** (any language): mobile contexts,
     `accessibility-id` selectors
   - **Espresso** (Android / Kotlin / Java): `onView(withId(...))`,
     `IdlingResource`
   - **XCUITest** (iOS / Swift): `XCUIApplication().buttons["id"]`
   - **Detox** (React Native): `by.id(...)`, automatic sync
   - **Maestro** (mobile): YAML flows with retries
   - **Robot Framework + SeleniumLibrary / Browser**: keyword-style
   - **Generic / other**: the universal patterns below still apply

2. **Page Object / structural pattern** — set
   `.assert-iq/config.yaml > test_framework.ui_structure`:
   - `page_object` (classic POM) — default for Selenium / WebdriverIO
   - `screenplay` — actor / task / question pattern (Serenity, Cucumber)
   - `component_object` — per-component classes (Cypress, Playwright
     fixtures)
   - `app_actions` (Cypress) — bypass UI for setup, drive UI for
     assertions
   - `inline` — small repos / smoke suites only; the agent flags this
     as a smell at higher maturity tiers
   - `auto` — detect existing pattern; if none, propose one before
     generating

3. **Selector-stability policy** — `.assert-iq/config.yaml >
   ui_debug.selector_policy` (shared with `debug-ui-tests`):
   - `test_id_first` (default) — prefer `data-testid` / `data-cy` /
     `accessibility-id` / `automation-id`
   - `role_first` — ARIA-role-based (`getByRole`)
   - `text_allowed` — text selectors when stable
   - `xpath_last_resort` — XPath only as final fallback
   When a stable selector is not available, the agent **recommends
   adding a test ID to production markup** rather than falling back to
   a brittle selector (the production-code change is a recommendation,
   not an autonomous edit).

4. **Wait-strategy policy** — `.assert-iq/config.yaml >
   ui_debug.wait_policy` (shared with `debug-ui-tests`):
   - `framework_auto` (default) — rely on auto-wait / retry-ability
   - `explicit_conditions` — require explicit `wait_for_*` /
     `ExpectedConditions`
   - `forbid_sleeps: true` — hard sleeps / `Thread.sleep` /
     `cy.wait(<ms>)` / `time.sleep` are never generated

5. **Environment policy** — set
   `.assert-iq/config.yaml > test_framework.ui_environments` with the
   allowed base URLs / environment names. **Production is never an
   allowed target** for UI test generation. Examples: `local`, `dev`,
   `qa`, `staging`, `ephemeral_pr`.

6. **Auth handling** — set
   `.assert-iq/config.yaml > test_framework.ui_auth_strategy`:
   - `ui_login` — drive the real login form (smoke only; slow)
   - `api_login_then_set_cookie` — log in via API, inject session
     (preferred for non-auth journeys)
   - `storage_state` (Playwright) / `cy.session` (Cypress) — cached
     authenticated state
   - `sso_bypass_token` — pre-issued service token in non-prod envs
   - `none` — anonymous flows only

7. **Test data** — set
   `.assert-iq/config.yaml > test_framework.data_factory`. The agent
   reuses what you already have. Examples: `factory_bot`, `faker`,
   `factory_boy`, `bogus`, `autofixture`, `mimesis`, `polyfactory`,
   `model_factory`, `none`. Falls back to the
   [`generate-test-data`](../generate-test-data/SKILL.md) skill when
   absent. Each generated test sets up and tears down its own state.

8. **Targeted-test command** — `{{TARGETED_TEST_COMMAND}}` — example
   per framework:
   - Playwright: `npx playwright test path/to/spec.ts`
   - Cypress: `npx cypress run --spec path/to/spec.cy.ts`
   - Selenium (pytest): `pytest tests/ui/test_journey.py`
   - WebdriverIO: `npx wdio run wdio.conf.ts --spec path/to/spec.ts`
   - Espresso: `./gradlew connectedDebugAndroidTest --tests <FQN>`
   - XCUITest: `xcodebuild test -only-testing:<Target>/<Class>`

9. **Traceability marker** — set
   `.assert-iq/config.yaml > traceability.marker_style` so the
   generated header matches your codebase idiom (XML doc comment,
   JSDoc, docstring, KDoc, Godoc, RustDoc, Robot tags, etc.). The
   agent emits a marker linking the test to its tracker work item.

10. **Coverage scope per AC** — by default, one happy path + one
    negative path + one boundary per acceptance criterion. Override
    via `.assert-iq/config.yaml > test_framework.ui_scenarios_per_ac`
    if your team uses a different policy. Visual-regression and
    accessibility checks are opt-in via
    `test_framework.ui_visual_regression` and
    `test_framework.ui_a11y_checks`.

11. **Platform notes** — this skill is platform-agnostic (desktop web,
    mobile web, native iOS, native Android, React Native, Electron,
    embedded WebView). If your runner needs a wrapper (`xvfb-run`,
    `docker compose exec`, simulator boot, device-farm CLI), include
    that wrapper inside `{{TARGETED_TEST_COMMAND}}`.
-->

# Generate automated UI test

Produce UI tests in the project's framework, structural pattern, and
selector idiom. UI tests are the most expensive layer in the test
pyramid — design for stability first, coverage second.

This skill is **framework-, language-, platform-, browser/device-, and
team-agnostic**. It generates tests in whatever UI runner your repo
exposes (see customization points 1–3 above).

## Pre-conditions

- A user journey or acceptance criterion is identified (workflow name,
  AC reference, or tracker work item).
- An environment policy is in place
  (`test_framework.ui_environments`) — generation against production
  is refused.
- Auth secrets, if any, are reachable via the project's secret manager
  (not embedded).

## Inputs you must collect

- **Workflow / journey** — the user-visible flow being tested.
- **Acceptance criteria** — the ACs the test must encode (one happy
  path + one negative + one boundary per AC by default).
- **Framework** — read from `test_framework.primary`. Ask if absent.
- **Structural pattern** — read from `test_framework.ui_structure`. If
  the repo has no pattern, **propose one before generating** — do not
  invent silently.
- **Target environment** — must be one of
  `test_framework.ui_environments`; never production.
- **Tracker reference** — the ADO ID / Jira key / issue number to
  embed in the traceability header.

## Procedure

1. **Map the journey.** List the pages / screens visited, the actions
   taken at each, and the meaningful assertions at each state
   transition. Distinguish *state-transition* assertions (the system
   moved to the next step) from *outcome* assertions (the user got
   what they asked for).

2. **Apply the structural pattern** from
   `test_framework.ui_structure`. Reuse existing page / component /
   actor objects when present. If none exists and the journey is
   non-trivial, propose the pattern and surface for review **before**
   generating tests.

3. **Select selectors** per `ui_debug.selector_policy`. When no stable
   anchor exists:
   - **Recommend adding a test ID to production markup** (output a
     diff suggestion; do not autonomously edit production code).
   - Do **not** fall back to CSS-path / nth-child / structural XPath
     to "make it work today."

4. **Apply waits** per `ui_debug.wait_policy`. Never generate hard
   sleeps. Prefer the framework's auto-wait / retry-ability; fall back
   to explicit conditions tied to observable state, not time.

5. **Handle auth** per `test_framework.ui_auth_strategy`. Prefer
   API-based session establishment over UI-driven login for any
   journey that isn't *itself* testing the login flow.

6. **Generate scenarios** — by default, per AC:
   - **Happy path** — the AC is satisfied; assert state transitions
     and final outcome.
   - **Negative path** — one realistic failure (validation, denied
     action, missing prerequisite) → assert the user-visible error
     surface.
   - **Boundary case** — one edge of the AC (empty input, maximum
     length, locale variation, viewport edge if responsive).
   Override the per-AC count via
   `test_framework.ui_scenarios_per_ac`.

7. **Set up and tear down state per test.** No shared mutable state
   between tests. Use `test_framework.data_factory` (or fall back to
   `generate-test-data`) for inputs. Clean up any created entities.

8. **Opt-in checks** if configured:
   - Visual regression (`test_framework.ui_visual_regression`):
     baseline screenshot per stable state.
   - Accessibility (`test_framework.ui_a11y_checks`): axe-core or
     framework-native a11y assertions on each visited page.

9. **Emit the traceability header** in the idiom set by
   `traceability.marker_style`, including the tracker reference.

## Stop conditions

- The configured target environment is production — refuse and
  surface.
- No stable selector exists and the team's policy forbids
  recommending production markup changes — refuse and surface the
  selector gap.
- Auth credentials would need to be embedded in source — refuse;
  require the project's secret manager.
- The journey covers PII / regulated data and only real customer data
  would reproduce it — refuse; require synthetic data.
- The repo has no structural pattern and the user declines to adopt
  one before generation.

## Governance

- **Never** generate UI tests targeting production endpoints. Confirm
  the target against `test_framework.ui_environments`.
- **Never** commit credentials, tokens, or session cookies. Use the
  project's secret manager.
- **Never** generate hard sleeps. Waits must be observable-state
  based.
- **Never** fall back to brittle selectors (CSS path, nth-child,
  structural XPath) silently — surface a recommendation to add a
  stable test ID instead.
- **Never** autonomously edit production markup — selector
  recommendations are diff suggestions for human review.
- Generated tests are **drafts** and require human review before
  merge, per the QI foundation.

## Output

A test file (or files) in the location your repo uses for UI tests,
written in `test_framework.primary`'s idiom, with:

- traceability header linking to the tracker work item
- structural pattern usage per `test_framework.ui_structure`
- selector idiom per `ui_debug.selector_policy`
- wait idiom per `ui_debug.wait_policy`
- one happy + one negative + one boundary per AC (or per
  `ui_scenarios_per_ac`)
- per-test setup / teardown using `test_framework.data_factory`
- (optional) visual-regression baselines or a11y assertions

When a stable selector is missing, a separate diff suggestion for the
production markup change (test ID to add, on which element) is
included alongside the test file — for human review, not autonomous
merge.

## Signals emitted

When the QI signal sink is wired, this skill emits a
`test.generated.ui` signal per generation conforming to
`.assert-iq/signal-schema.json`, carrying: `journey`, `framework`,
`structure_pattern`, `selector_policy`, `wait_policy`,
`scenarios_generated`, `auth_strategy`, `environment`,
`testid_recommendations`, and `tracker_ref`.

## Verify with oracle (v1.6.0+)

Generated UI tests are AI-authored. Verify Page Object Model patterns
and assertion focus before merge:

```
/grade-with-rubric <ui_test_file>  --rubric-id=test-unit-v1.0
```

Oracle provides feedback on:
- **Test independence:** Do tests share state or selectors?
- **Determinism:** Are waits explicit and timeout-safe?
- **Focus:** Does each test exercise one user path?
