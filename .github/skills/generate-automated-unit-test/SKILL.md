---
name: generate-automated-unit-test
mode: agent
description: "Generate unit tests for a function, class, or module — happy path, edge cases, error handling."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, unit-test framework, mocking library, or team** — it generates
tests in whatever runner your repo already uses; it does not impose one.
You'll get sharper, faster results if you fill in the per-repo specifics
below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each placeholder). If the key is absent, the agent infers from repo
signals or asks you. Wire the values once in `.assert-iq/config.yaml`
and they flow into every skill that references them — no per-skill
editing required.

1. **Unit test framework** — set
   `.assert-iq/config.yaml > test_framework.unit`. Examples and the
   idioms the agent will generate:
   - **xUnit / NUnit / MSTest** (.NET): `[Fact]` / `[Test]` / `[TestMethod]`
   - **JUnit 5 / TestNG** (Java / Kotlin): `@Test`, `@ParameterizedTest`
   - **pytest** (Python): function-based + fixtures; or **unittest**
   - **Jest / Vitest / Mocha + Chai** (JS / TS): `describe` / `it`
   - **Jasmine** (JS / TS): `describe` / `it` + spy framework
   - **RSpec / minitest** (Ruby): `describe` / `it` BDD
   - **Go testing** (Go): `func TestXxx(t *testing.T)` + table tests
   - **cargo test / nextest** (Rust): `#[test]` + `#[cfg(test)]`
   - **XCTest** (Swift): `func testXxx()`
   - **Kotest** (Kotlin): `StringSpec`, `BehaviorSpec`
   - **PHPUnit / Pest** (PHP): `test('...')` or class-based
   - **Catch2 / GoogleTest** (C++): `TEST_CASE` / `TEST`
   - **Tcl / shunit2 / bats** (shell): assertion-style
   - **Generic / other**: the universal patterns below still apply

2. **Mocking library** — set
   `.assert-iq/config.yaml > test_framework.unit_mocking`. The agent
   reuses what your repo uses; never introduces a new library.
   Examples: `moq` | `nsubstitute` | `fakeiteasy` | `mockito` |
   `mockk` | `unittest.mock` | `pytest-mock` | `jest_mocks` |
   `sinon` | `vitest_mocks` | `testify_mock` | `gomock` | `mockall`
   | `cucumber-stubs` | `rspec-mocks` | `phpunit-mocks` |
   `gmock` | `none`.

3. **Targeted-test command** — `{{TARGETED_TEST_COMMAND}}` runs a
   single generated test. Examples:
   - xUnit: `dotnet test --filter "FullyQualifiedName~MyTest"`
   - JUnit: `mvn test -Dtest=ClassName#methodName`
   - pytest: `pytest path/to/test.py::TestClass::test_name`
   - Jest: `npx jest path/to/file.test.ts -t "test name"`
   - Go: `go test ./pkg -run TestName`
   - Rust: `cargo test test_name`
   - RSpec: `bundle exec rspec spec/path_spec.rb -e "name"`

4. **Test layout convention** — set
   `.assert-iq/config.yaml > test_framework.unit_layout`:
   - `colocated` — `foo.ts` ↔ `foo.test.ts` next to source (JS/TS, Go)
   - `mirrored_tree` — `src/foo/Bar.cs` ↔ `tests/foo/BarTests.cs`
     (.NET, Java)
   - `tests_dir` — flat `tests/` directory (Python, pytest default)
   - `module_internal` — Rust `#[cfg(test)] mod tests` inside the
     source file
   - `auto` — detect from existing tests; if no tests exist yet,
     propose a layout before generating

5. **Test-name idiom** — set
   `.assert-iq/config.yaml > test_framework.unit_naming`:
   - `should_xxx_when_yyy` (BDD-ish)
   - `MethodName_Scenario_ExpectedBehavior` (.NET community)
   - `given_xxx_when_yyy_then_zzz`
   - `snake_case_describes_behavior` (Python / Ruby idiom)
   - `it_xxx` (Mocha / RSpec / Jasmine)
   - `auto` — match existing tests in the repo

6. **Parameterization style** — set
   `.assert-iq/config.yaml > test_framework.unit_parameterization`:
   - `inline_data` — `[Theory] [InlineData]` (xUnit),
     `@ParameterizedTest @CsvSource` (JUnit)
   - `table_driven` — slice of structs (Go), data-driven loops
   - `pytest_parametrize` — `@pytest.mark.parametrize`
   - `rspec_shared_examples` — `it_behaves_like`
   - `none` — separate test per case

7. **Property-based testing** — opt-in via
   `.assert-iq/config.yaml > test_framework.unit_property_based`.
   Examples: `fscheck` (.NET), `jqwik` (Java), `hypothesis` (Python),
   `fast-check` (JS / TS), `proptest` / `quickcheck` (Rust). Set to
   `none` to disable.

8. **Coverage hint** — set
   `.assert-iq/config.yaml > test_framework.unit_coverage_hint`:
   `branch` (default, preferred for unit tests) | `statement` |
   `mutation` | `none`. This is a generation hint, not an
   enforcement; coverage measurement is the
   [`check-test-coverage`](../check-test-coverage/SKILL.md) skill's
   job.

9. **Determinism boundaries** — the agent ALWAYS mocks / stubs:
   time / clock, randomness, filesystem, network, database,
   process / subprocess, env vars, current user / locale, hostname.
   Set
   `.assert-iq/config.yaml > test_framework.unit_determinism_overrides`
   to whitelist exceptions in narrow cases (e.g. test fixtures that
   *should* hit a temp directory).

10. **Traceability marker** — set
    `.assert-iq/config.yaml > traceability.marker_style` so the
    generated header matches your codebase idiom (XML doc comment,
    JSDoc, docstring, KDoc, Godoc, RustDoc, etc.). The agent emits a
    marker linking the test to its tracker work item (ADO `AB#1234`,
    Jira `PROJ-123`, GitHub issue, Linear ID).
-->

# Generate automated unit test

Produce framework-conformant unit tests. **Unit** means: in-process,
mocked at the right boundary, deterministic, fast (target: < 100ms per
test).

This skill is **language-, framework-, mocking-library-, and
team-agnostic**. It generates tests in whatever runner your repo
exposes (see customization points 1–3 above).

## Pre-conditions

- A target subject is identified: a function, class, module, file, or
  fully-qualified symbol.
- The target is unit-testable (in-process; if it requires a live
  database / network / browser, redirect to the API or UI skill).
- The repo has either an existing test layout the agent can mirror, or
  the user accepts a proposed layout.

## Inputs you must collect

- **Target** — function / class / module path + symbol name.
- **Framework** — read from
  `.assert-iq/config.yaml > test_framework.unit`. Ask if absent.
- **Mocking library** — read from `test_framework.unit_mocking`.
- **Layout / naming / parameterization** — read from the matching
  `test_framework.unit_*` keys; default to `auto` (match existing
  tests).
- **Tracker reference** — the ADO ID / Jira key / issue number to
  embed in the traceability header.

## Procedure

1. **Inspect the target.** Identify:
   - Pure logic vs. side effects.
   - External dependencies (DB, network, filesystem, time,
     randomness, env, process, locale).
   - Branching paths (every `if` / `switch` / `match` / `?:` /
     guard clause).
   - Boundary conditions (numeric extrema, empty / null / max /
     min / unicode, off-by-one, locale, timezone, large input).
   - Error / exception paths (every `throw` / `panic` / `Err(...)`).
   - State transitions (when the target is stateful).

2. **Choose the mock boundary.** Mock at the **dependency seam**
   (the interface / port the subject talks to), **not** at the
   subject under test itself. If no seam exists, surface a design
   recommendation (extract interface, inject dependency) — do not
   silently introduce a new mocking library or test private members
   to compensate.

3. **Generate the scenario set:**
   - **Happy path** — one or more typical valid inputs.
   - **Edge cases** — empty / null / zero / negative / max / min /
     unicode / very large input, as relevant to the target's domain.
   - **Error / exception paths** — one test per documented failure
     mode.
   - **State transitions** — for stateful targets, cover each
     transition the public surface exposes.
   - **Determinism stubs** — clock, randomness, IO replaced per
     `test_framework.unit_determinism_overrides`.

4. **Apply the chosen structural pattern** — Arrange / Act / Assert,
   or Given / When / Then, or the project's established idiom. Do
   **not** introduce a new pattern.

5. **Parameterize** per `test_framework.unit_parameterization` when
   multiple cases share the same arrange / act / assert shape with
   only input differences.

6. **Property-based augmentation** — when
   `test_framework.unit_property_based` is configured AND the target
   has algebraic properties (idempotency, commutativity, round-trip,
   invariants), add one property test alongside example-based tests.

7. **Emit the traceability header** in the idiom set by
   `traceability.marker_style`, including the tracker reference.

8. **Self-review the generated tests** against the QI test-design
   rules:
   - Independent (no shared mutable state between tests).
   - Fast (no real IO, no `Thread.sleep`, no real timers).
   - Deterministic (no clock / random / network drift).
   - Tests behavior on the public surface (not private methods, not
     implementation details).
   - Test name conveys intent without reading the body.

## Stop conditions

- The target is not unit-testable (requires live DB / network /
  browser / device) — redirect to the API or UI generation skill.
- No dependency seam exists and the user declines to refactor for
  testability — surface the gap; refuse to test private members or
  introduce reflection hacks.
- The target's branching cannot be enumerated with confidence (highly
  dynamic dispatch, metaprogramming) — surface and ask.

## Governance

- **Never** test private members directly. Test behavior via the
  public surface.
- **Never** introduce a new mocking library, test framework, or
  assertion library — use what the project uses
  (`test_framework.unit_mocking`).
- **Never** use real IO / clock / randomness / network in a unit
  test. If determinism overrides are needed, they must be wired in
  `test_framework.unit_determinism_overrides` with an explanation.
- **Never** generate tests that assert on internal call counts when
  the behavior could be asserted on the public outcome instead
  (interaction-testing should be a last resort).
- Generated tests are **drafts** and require human review before
  merge, per the QI foundation.

## Output

A test file (or files) in the location your repo uses for unit tests,
written in `test_framework.unit`'s idiom, with:

- traceability header linking to the tracker work item
- one or more tests per scenario from step 3
- parameterization per `unit_parameterization` where appropriate
- mocks at the seam, named per `unit_naming`
- (optional) one property test when `unit_property_based` is set and
  the target has algebraic properties

## Signals emitted

When the QI signal sink is wired, this skill emits a
`test.generated.unit` signal per generation conforming to
`.assert-iq/signal-schema.json`, carrying: `target`, `framework`,
`mocking_library`, `layout`, `scenarios_generated`,
`parameterization_used`, `property_based_used`, `seams_mocked`,
`coverage_hint`, and `tracker_ref`.

## Verify with oracle (v1.6.0+)

Generated unit tests are AI-authored drafts. Verify them against
Assert.IQ's defensible quality rubric before merge:

```
/grade-with-rubric <test_file>  --rubric-id=test-unit-v1.0
```

This runs independent oracle grading on the generated test(s) against
the **Unit Test Acceptance Contract**, producing:
- Verdict (PASS / CONDITIONAL / FAIL) with score (0.0–1.0)
- Evidence-driven feedback on assertion clarity, independence,
  determinism, test focus
- Dimension-level scoring to guide fixes

**Maturity gating:** early tier receives advisory verdicts; mid/higher
tiers weight oracle feedback in merge decisions. See
`check-merge` for gate behavior per tier.
