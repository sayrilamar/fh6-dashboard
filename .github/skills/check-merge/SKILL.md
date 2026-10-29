---
name: check-merge
mode: agent
description: "Pre-merge quality gate — synthesize all signals into a merge / hold / discuss verdict."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, platform, VCS host, CI system, or team** — the
verdict model (MERGE / HOLD / DISCUSS) and the four-layer QI synthesis are
universal; only the integration points change. You'll get sharper, faster
verdicts if you fill in the per-repo specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each placeholder). If the key is absent, the agent infers from repo
signals or asks you. Wire the values once in `.assert-iq/config.yaml`
and they flow into every skill that references them — no per-skill
editing required.

1. **VCS / PR host** — `{{PR_HOST}}` is the system that owns the PR /
   merge-request object. Examples:
   - GitHub (PR), GitLab (Merge Request), Azure DevOps (Pull Request),
     Bitbucket (Pull Request), Gitea, Gerrit (Change), Phabricator
   Wire access in `.assert-iq/config.yaml > vcs.host` plus the matching
   MCP / CLI fallback. The agent uses (in order): MCP → host CLI
   (`gh pr view`, `glab mr view`, `az repos pr show`, `tea pr show`) →
   manual paste.

2. **CI provider** — `{{CI_PROVIDER}}` is where build / test / lint /
   coverage jobs run. Examples:
   - GitHub Actions, Azure Pipelines, GitLab CI, Jenkins, CircleCI,
     Buildkite, TeamCity, Drone, AWS CodeBuild, Google Cloud Build,
     Bitbucket Pipelines, Argo Workflows
   The agent checks job status for the PR's head commit via the host's
   checks/statuses API.

3. **Required checks** — `{{REQUIRED_CHECKS}}` is the list of check names
   that must be green for a `MERGE` verdict. Defaults to whatever your
   branch-protection rules require, queried at runtime. Override
   explicitly in `.assert-iq/config.yaml > merge_gate.required_checks`
   when you want stricter gating than branch protection alone.

4. **Coverage thresholds** — `{{COVERAGE_THRESHOLDS}}` is the bar for the
   protection layer. Two values:
   - `merge_gate.coverage.line_min` (default `80%` on changed lines)
   - `merge_gate.coverage.risk_weighted_min` (default `90%` on changed
     lines flagged high-risk by `/risk-assess-pr`)
   Coverage source can be Codecov, Coveralls, SonarQube/SonarCloud,
   Codacy, Code Climate, JaCoCo XML, lcov, Cobertura, OpenCover, or any
   tool that publishes a check-run summary the host can read.

5. **Linter / formatter checks** — `{{LINTERS}}` is the list of linters
   whose status counts toward the verdict. Examples by ecosystem:
   - JS/TS: ESLint, Biome, Prettier
   - Python: Ruff, Flake8, Black, mypy, pyright
   - .NET: `dotnet format`, Roslyn analyzers, StyleCop
   - Java/Kotlin: Checkstyle, ktlint, detekt, Spotless
   - Go: `golangci-lint`, `gofmt`, `staticcheck`
   - Rust: `cargo clippy`, `rustfmt`
   - Ruby: RuboCop, Standard
   - Swift: SwiftLint, SwiftFormat
   - Generic: pre-commit, Reviewdog

6. **Traceability rule** — `{{TRACEABILITY_RULE}}` controls how the agent
   checks that changed code resolves to a work item:
   - `commit_message` — every commit must mention an ADO `AB#`, Jira key,
     GitHub issue (`#1234`), GitLab issue, Linear (`ENG-1234`), etc.
   - `pr_body` — the PR description must link to ≥1 work item
   - `code_comment` — modified functions must carry a `///` traceability
     comment (see `.github/instructions/qi-traceability.instructions.md`)
   - `any` (default) — accept any of the above
   - `off` — skip the traceability check (not recommended for `mid` /
     `higher` tiers)
   Configure in `.assert-iq/config.yaml > merge_gate.traceability_rule`.

7. **Quarantine / skip detection** — `{{SKIP_MARKERS}}` is the list of
   annotations / patterns that count as a skipped or quarantined test.
   Defaults cover the common ones:
   - xUnit / NUnit / MSTest: `[Skip]`, `[Ignore]`, `[Fact(Skip=...)]`
   - JUnit / TestNG: `@Disabled`, `@Ignore`, `@Test(enabled = false)`
   - pytest: `@pytest.mark.skip`, `@pytest.mark.xfail`, `pytest.skip(...)`
   - Jest / Vitest / Mocha: `.skip`, `xit`, `xdescribe`, `it.todo`
   - Go: `t.Skip(...)`, `// +build ignore`
   - Ruby (RSpec): `skip`, `xit`, `pending`
   - Playwright / Cypress: `.skip`, `.fixme`
   Add framework-specific markers in
   `.assert-iq/config.yaml > merge_gate.skip_markers`.

8. **Oracle verdicts (v1.6.0+)** — If oracle layer is enabled
   (`.assert-iq/config.yaml > oracle.enabled: true`), the agent may
   reference grading verdicts from `/grade-with-rubric` on artifacts in
   the PR (tests, bug reports, plans, etc.). Oracle verdicts contribute
   to the **Outcome layer** with maturity-tier weighting (early: 0%, mid: 20%,
   higher: 50%). Configure in `.assert-iq/config.yaml > oracle.maturity_gating`.

9. **Code-review feedback source** — `{{REVIEW_SOURCE}}` is where the
   agent finds unresolved code-review comments:
   - PR review threads on `{{PR_HOST}}`
   - Output of the `/code-review` skill (cached in
     `.assert-iq/.cache/code-review-<pr>.md`)
   - Static-analysis platforms: SonarQube, Codacy, DeepSource, Semgrep
   The agent fails to `DISCUSS` if any **blocker / major** finding is
   unaddressed.

9. **Verdict thresholds** — tune what flips MERGE → DISCUSS → HOLD in
   `.assert-iq/config.yaml > merge_gate.verdict_rules`. Defaults are in
   the Procedure below; the universal principle is **red = HOLD, amber =
   DISCUSS, all green = MERGE**.

10. **Maturity-tier behavior** — set in `.assert-iq/config.yaml >
    maturity_tier`:
    - `early` — verdict is **advisory only**; surface concerns, never
      block. The card uses "consider" / "watch out for" language.
    - `mid` — verdicts are firm but advisory; branch protection still
      gates merges.
    - `higher` — verdicts feed into the QI signal sink and may inform
      automated branch-protection contexts (still never modified by this
      skill).

11. **Output sink** — by default the verdict card is rendered inline and
    optionally written to `merge-readiness-card.md`. Override the path
    in `.assert-iq/config.yaml > merge_gate.report_path`. (Structured
    QI signal emission is separate — see the `signals` section in
    `.assert-iq/config.yaml`.)

12. **Workspace topology** — inherits
    `.assert-iq/config.yaml > workspace.role` (`monorepo` |
    `prod` | `tests`, default `monorepo`). The merge gate
    synthesizes signals from both sides: **Change** (PR diff,
    files touched) on the prod side, **Protection** + **Trust**
    (covering tests, flake history) on the tests side. When
    `role=prod`, fetch tests-side signals from
    `workspace.companion_repo`; when `role=tests`, fetch the PR
    diff from the companion. Use MCP → local path → manual paste
    per `.assert-iq/workspace-topology.md`. If the companion is
    unavailable, the affected layer is reported as UNGRADED with
    `reason: "companion_repo_unset"` and the verdict shifts to
    **discuss** (not auto-block) so the human gate decides. Never
    auto-merge against an UNGRADED layer.
-->

# Check merge

Run a pre-merge quality gate against the current PR / merge request.
Aggregate all available signals; produce a verdict the developer can act
on in seconds.

This skill is **VCS-, CI-, framework-, language-, and platform-agnostic**
— it queries whatever PR host and CI provider your team already uses (see
`{{PR_HOST}}`, `{{CI_PROVIDER}}`, and `{{REQUIRED_CHECKS}}` in the
customization block above).

## Inputs

- **PR / MR identifier** (default: the PR / MR for the current branch on
  `{{PR_HOST}}`, auto-discovered via the host's CLI / MCP).
- Optional override: stricter coverage threshold, stricter required-checks
  list, or skip a layer for this run (e.g. `--skip-traceability` on a
  bot-authored PR).

## Procedure

1. **Confirm CI state** on `{{CI_PROVIDER}}` for the PR's head commit:
   `{{REQUIRED_CHECKS}}` passing, coverage uploaded, lint clean
   (`{{LINTERS}}`).
2. **Pull the latest `/risk-assess-pr` result.** If none for this head
   commit, run it.
3. **Pull `/check-test-coverage`** for the changed surfaces and compare
   against `{{COVERAGE_THRESHOLDS}}`.
4. **Check traceability** per `{{TRACEABILITY_RULE}}` — every changed
   function / commit / PR should resolve to a work item.
5. **Check for quarantined or skipped tests** near touched code using
   `{{SKIP_MARKERS}}`. A new skip in the diff is an automatic amber.
4. **Check oracle verdicts (if enabled)** — Look for recent `/grade-with-rubric`
   verdicts on PR artifacts in `.assert-iq/oracles/outcomes/`. FAIL verdicts may
   indicate quality concerns; treat per maturity tier (early: advisory; mid: discuss;
   higher: co-gate).
5. **Check `{{REVIEW_SOURCE}}`** for unaddressed blocker / major comments
   from `/code-review` or human reviewers.
6. **Compute verdict** by layer (all four must be addressed):
   - **Change layer** — risk band acknowledged, scope of diff sane
   - **Protection layer** — coverage thresholds met on changed lines
   - **Trust layer** — no new skips / quarantines; flaky tests not on the
     critical path of this PR
   - **Outcome layer** — no open escapes or hot incidents touching the
     changed component; oracle verdicts (if enabled) on touched artifacts
     show PASS or CONDITIONAL (not FAIL), or FAIL verdicts have accepted
     mitigations per maturity tier
   Verdict:
   - **MERGE** — all four layers green, no blockers.
   - **HOLD** — any red signal (failing required check, missing coverage
     on high-risk changed line, new skip on touched code, blocker review
     comment, escaped defect on touched component).
   - **DISCUSS** — amber signals require a human decision (risk-accepted
     mitigation, scope change, low-coverage justified by reviewer).
9. **Output a one-screen merge-readiness card** with:
   - Verdict (MERGE / HOLD / DISCUSS)
   - Per-layer status (✓ / ⚠ / ✗)
   - Blocking items (if any) with file path + line + owner
   - Linked PR / commit / check URLs on `{{PR_HOST}}` and `{{CI_PROVIDER}}`
   - Traceability summary (work-item IDs covered)
   - Oracle verdicts (if any enabled) on touched artifacts (test, report, plan)
   - Confidence and what would change the verdict

## Governance

- This is **advisory**. Branch protection on `{{PR_HOST}}`, not this skill,
  gates merges. Never modify branch-protection rules.
- On `early` maturity tier, **soften verdicts** — surface concerns
  ("consider", "watch out for") rather than enforce gates.
- Never auto-resolve a review comment, dismiss a failing check, or remove
  a skip marker. All remediation is human-driven.
- Preserve any tracker references (`AB#`, Jira key, etc.) when
  summarizing — traceability is reported, never erased.

## Output

A merge-readiness card rendered inline, optionally persisted to the path
configured in `.assert-iq/config.yaml > merge_gate.report_path`
(default `merge-readiness-card.md`). The card is one screen — if the
verdict needs more than a screen to explain, the verdict is `DISCUSS`.

## Signals emitted

When the QI signal sink is wired, this skill emits a `pr.merge_check`
signal per run conforming to `.assert-iq/signal-schema.json`, carrying:
`pr_id`, `head_sha`, `verdict`, `layer_status` (change / protection /
trust / outcome), `blocking_items[]`, `coverage_delta`, `risk_band`,
`new_skips_introduced`, `traceability_satisfied`, and `tracker_refs[]`.
