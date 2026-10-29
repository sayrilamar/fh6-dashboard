---
name: code-review
version: 6.1
changelog: >
  v6.1 — Added Recurring Anti-Patterns Pre-flight pass run before the 9 categories. Captures
  patterns that production reviewers consistently flag but are easy for AI-generated reviews
  to miss: wrapper helpers around standard-library APIs, invariant work repeated inside loops,
  untyped/dynamic data traversal when typed models exist, AI-style over-defensive try/catch,
  unused parameters on shared signatures, and repo-hygiene/portability issues (hardcoded
  developer paths, vendored build artifacts, machine-specific tooling config). Language-agnostic
  with concrete examples per language. Cross-Cutting Patterns extended with a Repo Hygiene
  & Portability check.
  v6.0 — PR-aware review mode. Always fetches PR comment threads, commit history, and
  reconciles claimed fixes against actual committed code before reviewing. Works for new PRs
  (no comments yet), in-flight PRs (active comment threads), and post-merge verification.
  Added: PR Context Gathering Protocol (git log, ADO REST API threads), PR Comment
  Reconciliation table in output (thread status vs. code evidence), Commit Timeline
  Analysis (multi-iteration diff tracking), discrepancy detection for "marked fixed but
  not committed" patterns. Activation gate extended to accept bare PR numbers as valid
  code references.
  v5.1 — Eval-optimized (98.3/100). Added: Partial-scope/suppression handling rules (Critical findings
  always surface). Python DB connection lifecycle check. Cross-cutting patterns structured format with
  DI/lifecycle mismatch check. XML/HTML injection → Critical for Python. Compact all-OK template.
  Activation gate redirect quality guidance.
  v5.0 — Final optimized version. 9 review categories (added Security). Severity decision trees
  for 6 categories. Language-specific checks for C#, Python, JS/TS, Java, Go, Rust, Kotlin,
  Swift, Ruby. Test code calibration. Cross-file pattern analysis. Deduplication rules.
  Output format flexibility (markdown, JSON, PR comment, quick summary). Post-review follow-up.
description: >
  Structured code review against nine principles: Readability, KISS, DRY,
  YAGNI, Documentation, Error Handling, Performance, Security, Code Smells.
  Per-category findings with severity decision trees. PR-aware: when a PR
  number is given, fetches comment threads + commit history and reconciles
  claimed fixes against committed code. Language- and VCS-agnostic.
  WHEN: code review, review this file, review my code, security review,
  audit this code, review PR, check PR comments, PR <number>.
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
language, framework, platform, VCS host, or team** — the 9 review
categories and severity decision trees are language-agnostic; the
language-specific blocks below them are additive guidance the skill
applies only to the detected language. You'll get sharper, faster
results if you fill in the per-repo specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each placeholder). If the key is absent, the agent infers from repo
signals or asks you. Wire the values once in `.assert-iq/config.yaml`
and they flow into every skill that references them — no per-skill
editing required.

1. **VCS host** — `{{VCS_HOST}}` determines how the PR Context Gathering
   Protocol fetches diffs and comment threads. Set
   `.assert-iq/config.yaml > vcs.type` to one of: `github` | `ado-repos`
   | `gitlab` | `bitbucket` | `gitea`. The protocol below has examples
   per host; the skill picks the right one automatically.

2. **Base branch** — `{{BASE_BRANCH}}` is the branch a PR is diffed
   against. Set `.assert-iq/config.yaml > vcs.default_branch` (e.g.
   `main`, `master`, `develop`, `trunk`). If your PRs target a different
   base than the default branch, set `vcs.pr_base_branch`.

3. **Tracker** — already configured in
   `.assert-iq/config.yaml > tracker`. Used to resolve work-item
   references found in PR descriptions and `{{TRACE_MARKER}}` comments.

4. **Categories enabled / disabled** — by default all 9 categories run.
   To disable a category for this repo, list it under
   `.assert-iq/config.yaml > code_review.disabled_categories`. Critical
   findings still surface regardless (see Handling Partial-Scope and
   Suppression Requests).

5. **Test-code calibration** — when the skill detects a test file, it
   applies the Test Code Calibration adjustments. Toggle via
   `.assert-iq/config.yaml > code_review.test_code_calibration` (default
   `true`). Add custom test-file globs under
   `code_review.test_file_globs` (defaults cover `*Test*`, `*_test.*`,
   `*.test.*`, `*.spec.*`, `tests/**`, `__tests__/**`).

6. **Severity floor** — `.assert-iq/config.yaml >
   code_review.severity_floor` (`critical` | `warning` | `ok`)
   suppresses findings below the floor. Defaults to `ok` (show
   everything). Useful for PR-comment output formats where only
   actionable findings matter.

7. **Output format default** — `.assert-iq/config.yaml >
   code_review.default_output_format`: `markdown` (default) | `json` |
   `pr_comment` | `quick_summary`. Per-invocation request overrides.

8. **Tooling recommendations** — toggle via
   `.assert-iq/config.yaml > code_review.recommend_tooling` (default
   `true`). Add or override per-language tools under
   `code_review.tooling_overrides`.

9. **Report sink** — by default the markdown report is written to
   `code-review-report.md` at the repo root. Override the path in
   `.assert-iq/config.yaml > code_review.report_path`. (Structured QI
   signal emission is separate — see the `signals` section in
   `.assert-iq/config.yaml`.)

10. **Platform notes** — this skill is platform-agnostic (monorepo,
    polyrepo, mobile, browser, embedded, infrastructure-as-code). If a
    language is missing from the per-language blocks below, the
    universal checks still apply and the skill will state its assumption
    about the detected language at the top of the report.

11. **Workspace topology** — inherits
    `.assert-iq/config.yaml > workspace.role` (`monorepo` |
    `prod` | `tests`, default `monorepo`). When `role=tests`, the
    files under review and the PR Context Gathering Protocol's
    target branch live in `workspace.companion_repo`; fetch via
    MCP → local path → manual paste per
    `.assert-iq/workspace-topology.md`. If the companion is
    unavailable, refuse to render a review verdict on prod-side
    files — state
    `reason: "companion_repo_unset"` and ask the user to paste
    the files, the PR diff, or both. Do **not** review against a
    stale local cache or infer code from test references.
-->

# Code Review Skill

Perform a thorough, structured code review against **nine** engineering principles. Adapt all guidance to the **detected language** of the submitted code.

This skill is **framework-, language-, platform-, and VCS-host-agnostic**. The 9 categories and severity decision trees apply universally; the language-specific blocks add idiomatic guidance for whichever language is detected. PR-context gathering adapts to the configured `{{VCS_HOST}}` (see customization point 1 above).

---

## Activation Gate

Before entering the review procedure, verify that the request is actually a code review:

1. **Code is present or referenced** — the user shared code inline, attached a file, pointed to a specific file path, **or provided a PR/pull request number**. A bare PR number (e.g. "PR 781427", "pull request 1234") is a valid code reference — treat it the same as a file reference and proceed to the PR Context Gathering Protocol below.
2. **The intent is to evaluate code quality** — not to ask an architecture question, request a feature, debug a runtime error, or get a general explanation.

If either condition fails:
- If code is referenced but intent is unclear → ask: "Would you like a structured code review of this, or are you looking for something else?"
- If no code is present → ask: "I'd be happy to review your code. Could you share the file(s) or a PR number you'd like me to look at?"
- If the request is clearly not a code review (e.g., architecture comparison, design advice) → **do not activate this skill**. Answer the question directly using your general knowledge. Provide a structured, helpful response that matches the complexity of their question — don't give a dismissive one-liner just because it's not a code review.

**Near-miss examples that should NOT activate this skill:**
- "Review the pros and cons of X vs Y" — this is a comparison, not code review
- "Review my approach to solving this" — this is design feedback unless code is attached
- "Check this architecture diagram" — this is architecture review
- "Can you review my resume / document / plan" — non-code review
- "What's wrong with this approach?" (no code shown) — design question

---

## PR Context Gathering Protocol

**Run this protocol whenever a PR number is provided, regardless of whether the PR is open, in-flight, or already merged.** Do not skip it for merged PRs — post-merge verification is a first-class use case.

Execute all four steps before writing a single line of the review. The findings from this protocol feed directly into the **PR Comment Reconciliation** section of the output (see Output Format).

This protocol is **VCS-host-agnostic**. Detect `{{VCS_HOST}}` from `.assert-iq/config.yaml > vcs.type`, fall back to `git remote get-url origin` if unset. Use `{{BASE_BRANCH}}` from `vcs.pr_base_branch` (falling back to `vcs.default_branch`). For both diff and thread retrieval, prefer **MCP → official CLI → REST API with stored git credentials → manual paste** in that order. Never prompt the user for secrets directly.

### Step 1 — Retrieve the PR diff

```bash
# Discover the remote and derive the PR ref
git remote get-url origin

# Get all commits unique to the PR branch (not yet on the base branch)
git log --format="%H %ai %s" origin/pr/<PR_NUMBER> ^origin/{{BASE_BRANCH}} 2>/dev/null
# If the PR is merged, origin/pr/<PR_NUMBER> is the merge commit tip.

# Get the cumulative final diff (base branch to PR tip)
git diff origin/{{BASE_BRANCH}}...origin/pr/<PR_NUMBER>

# Also diff each code commit individually to track what changed between iterations
# (identifies if a later commit reversed or broke a claimed fix)
git show <each_non_merge_commit_hash> --stat
```

Use the **cumulative diff** as the basis for code review. Use the **per-commit diffs** to understand the iteration history and to verify that claimed fixes were actually committed.

Host-specific ref conventions (when `git fetch origin pull/<N>/head` or the PR-ref refspec isn't already configured):

- **GitHub**: `git fetch origin pull/<PR_NUMBER>/head:pr/<PR_NUMBER>` (also via `gh pr checkout <PR_NUMBER>`).
- **Azure DevOps Repos**: `git fetch origin pull/<PR_NUMBER>/merge:pr/<PR_NUMBER>`.
- **GitLab**: `git fetch origin merge-requests/<MR_IID>/head:mr/<MR_IID>`.
- **Bitbucket Cloud**: `git fetch origin pull-requests/<PR_ID>/from:pr/<PR_ID>`.
- **Gitea / Forgejo**: `git fetch origin pull/<PR_NUMBER>/head:pr/<PR_NUMBER>`.

### Step 2 — Fetch PR comment threads

Resolve `{{VCS_HOST}}` then pick the matching path. For each thread, capture: thread ID, **status** (`active`/`pending`/`fixed`/`resolved`/`wontFix`/`closed`/`outdated` — map host-specific values to this universal set), file path, line number, and the full comment chain (all authors, in order). Skip system comments (status-change events). Never prompt for credentials — read them from MCP, the host CLI, or `git credential fill` only.

**GitHub** (`vcs.type: github`):
```bash
# Preferred: gh CLI (auto-resolves auth from gh's keychain)
gh pr view <PR_NUMBER> --json comments,reviews,reviewThreads
gh api repos/<owner>/<repo>/pulls/<PR_NUMBER>/comments
```
MCP alternative: the Azure MCP / GitHub MCP `github_repo` and PR-thread tools.

**Azure DevOps Repos** (`vcs.type: ado-repos`):
```bash
# Preferred: az devops CLI
az repos pr show --id <PR_NUMBER> --query 'threads' --output json
# REST API fallback (uses stored credential, never prompts):
curl -s -u :"$(git credential fill <<<'protocol=https\nhost=dev.azure.com\n' | grep ^password | cut -d= -f2-)" \
  "https://dev.azure.com/<org>/<project>/_apis/git/repositories/<repo>/pullRequests/<PR_NUMBER>/threads?api-version=7.1"
```

**GitLab** (`vcs.type: gitlab`):
```bash
glab mr view <MR_IID> --comments
# REST fallback:
curl -s --header "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "https://<host>/api/v4/projects/<project_id>/merge_requests/<MR_IID>/discussions"
```

**Bitbucket Cloud** (`vcs.type: bitbucket`):
```bash
# Bitbucket CLI is community-maintained; REST is the canonical path:
curl -s -u "$BB_USER:$BB_APP_PASSWORD" \
  "https://api.bitbucket.org/2.0/repositories/<workspace>/<repo>/pullrequests/<PR_ID>/comments"
```

**Gitea / Forgejo** (`vcs.type: gitea`):
```bash
curl -s -H "Authorization: token $GITEA_TOKEN" \
  "https://<host>/api/v1/repos/<owner>/<repo>/issues/<PR_NUMBER>/comments"
```

**Manual-paste fallback** — if no API path works (offline, locked-down PAT, etc.), ask the user to paste the rendered comment thread; parse it heuristically. Note in the report header that PR context came from manual paste so the user knows the reconciliation table is best-effort.

### Step 3 — Build the iteration timeline

Map every non-merge commit on the branch to its date and the threads that existed at the time:

| Commit | Date | Message | Threads that predate this commit |
|---|---|---|---|
| `abc1234` | May 7 | Initial scaffolding | — |
| `def5678` | May 8 | update | Thread #5 (raised May 7) |
| `ghi9012` | May 13 | Added tests and page actions | Thread #5, #6 |

This timeline lets you answer: *"Was this thread open when the author pushed their final commit? Did the author claim a fix that should appear in a later commit?"*

### Step 4 — Reconcile threads against the diff

For every non-system thread, apply this decision tree:

```
Thread status = "fixed" or "resolved"?
├── YES → Does the final cumulative diff contain evidence of the fix described in the comment?
│         ├── YES → Mark as ✅ Implemented — thread resolved correctly
│         └── NO  → Mark as ❌ Unimplemented — thread closed without code change
│                   → Escalate to 🔴 Critical in the PR Comment Reconciliation table
└── NO (status = "active" / "pending" / no status)
    → Was the PR merged despite this thread being open?
      ├── YES → Mark as ⚠️ Merged with open thread — flag in reconciliation table
      └── NO  → Mark as 🔁 Awaiting author response — include for context
```

**What counts as "code evidence of a fix":** Look in the cumulative diff for the specific change described in the comment — new file created, method removed, string replaced with constant, try/catch restructured, etc. If the comment says "I created X" but no file named X appears in the diff, the fix was not committed.

---

## Handling Partial-Scope and Suppression Requests

Users may ask to review only certain categories ("just check naming") or to skip categories ("ignore security"). Handle these requests as follows:

| User request | Response |
|---|---|
| "Only review X" | Focus on X with full depth. Still run other categories briefly — report any 🔴 Critical findings even from "skipped" categories, because Critical issues represent active harm (security vulnerabilities, data loss, correctness bugs that affect users). |
| "Ignore category Y" / "Don't mention Y" | Skip Y in the report **unless** Y contains a 🔴 Critical finding. Critical findings always surface — they represent exploitable vulnerabilities or correctness failures that cannot be ethically suppressed. |
| "Skip security" with Critical security issues present | Report the security findings with a brief one-sentence explanation: "I've noted these Critical security findings because they represent exploitable vulnerabilities that could cause immediate harm if deployed." Then continue with the rest of the review at the user's requested scope. Do not lecture or moralize — just state the finding and reasoning concisely. |

For Performance skips: mark the section as "Skipped per user request" in the report. For non-Critical findings in skipped categories: omit them entirely.

---

## Scope Resolution

Once activation is confirmed:

1. **Explicit file references** — files tagged with `@` or attached in chat. Review all of them.
2. **Multiple files** — run all nine checks across each file; produce one combined report with per-file sections.
3. **Detect the language** — identify the programming language using this priority order:
   - **File extension** — `.cs`, `.py`, `.js`, `.ts`, `.go`, `.rs`, `.kt`, `.swift`, `.rb`, `.java`, etc.
   - **Syntax markers** — keywords, import style, type annotations, comment syntax
   - **User context** — "here's my Python code" or project context from the conversation
   - **Ambiguous cases** — if the language can't be determined (e.g., pseudocode, no extension, config-as-code like Terraform/YAML), state your assumption explicitly: "I'm reviewing this as [language]. Let me know if that's not right."
4. **Detect if test code** — check for test framework imports (`[TestClass]`, `pytest`, `describe/it`, `_test.go`, `#[cfg(test)]`), test naming patterns, or test directory paths. If the file is test code, apply the **Test Code Calibration** adjustments below.

---

## Review Depth Calibration

Not all code deserves the same level of ceremony. Match your depth to the input:

| Input Size | Approach |
|---|---|
| **< 20 lines** (snippet) | Compact review. Run all 9 categories but use a single consolidated table instead of 9 separate sections. Most categories will be 🟢 OK — don't pad. Note if the snippet is too small for meaningful review in some categories. |
| **20–200 lines** (single file / class) | Standard review. Full 9-section report as specified in the Output Format below. |
| **> 200 lines or multiple files** | Deep review. Full 9-section report per file, plus a Cross-Cutting Patterns section that identifies systemic issues across files (see below). |

The goal is signal density — every finding should earn its place. A report full of 🟢 OK rows for a trivial snippet wastes the reader's time.

---

## Test Code Calibration

When reviewing test files, adjust the standard review rules. Test code has legitimately different engineering trade-offs:

| Category | Adjustment for Test Code |
|---|---|
| **Readability** | Verbose method names are GOOD in tests (`Should_ReturnError_When_UserNotFound`). Don't flag as a naming issue. |
| **KISS** | Test setup/teardown may look verbose — that's fine if it improves test clarity. Only flag genuine over-engineering of test infrastructure. |
| **DRY** | Moderate repetition is acceptable in tests when it improves readability and test isolation. Flag only extreme duplication (>3 near-identical test methods that should be parameterized). |
| **YAGNI** | Unused test utilities/helpers are worth flagging. Commented-out test cases are 🟡 Warning — they obscure coverage. |
| **Documentation** | Test names should be self-documenting. Missing docstrings on test methods are NOT a finding. Missing documentation on shared test utilities/fixtures IS a finding. |
| **Error Handling** | Tests are expected to throw and catch exceptions. Don't flag `Assert.Throws` / `pytest.raises` / `expect(...).toThrow()` patterns. DO flag tests that silently swallow exceptions without asserting on them. |
| **Performance** | Test performance matters less. Only flag issues that make the test suite unreasonably slow (e.g., real network calls instead of mocks, unnecessary sleep/delays). |
| **Security** | Flag hardcoded test credentials only if they resemble production secrets. Obvious dummy values (`password123`, `test-api-key`) are fine. |
| **Code Smells** | Flag: tests with no assertions (vacuous tests), tests that test implementation details instead of behavior, flaky test patterns (time-dependent, order-dependent). |

---

## Deduplication Rule

A single issue may be relevant to multiple categories (e.g., `async void` touches Error Handling AND Performance). Report the finding in the **most specific category** and add a brief cross-reference in the other:

> Example: In Error Handling: "🔴 Critical — `async void SaveProfile()` makes exceptions unobservable (Line 45)."
> In Performance: "See Error Handling #1 — `async void` also prevents proper async flow control."

This keeps the report accurate without inflating finding counts.

---

## Severity Decision Trees

Use these decision trees to assign consistent severity ratings for the most common findings. When a finding matches a decision tree, use the prescribed severity. For findings not covered, use your best judgment.

### Readability Severity Tree

```
Is the naming actively misleading (name suggests opposite of what code does)?
├── YES → 🔴 Critical (correctness risk — readers will misunderstand behavior)
└── NO  → Is the naming unclear, abbreviated, or inconsistent?
          ├── YES → 🟡 Warning
          └── NO  → 🟢 OK

Is the method doing more than one conceptual thing?
├── YES → Is it >50 lines AND doing unrelated things?
│         ├── YES → 🔴 Critical (untestable, unmaintainable)
│         └── NO  → 🟡 Warning (should be split but manageable)
└── NO  → 🟢 OK

Is nesting >3 levels deep?
├── YES → Does the deep nesting contain complex logic (not just null guards)?
│         ├── YES → 🟡 Warning
│         └── NO  → 🟢 OK (early-return refactor recommended but not urgent)
└── NO  → 🟢 OK
```

### KISS Severity Tree

```
Is the abstraction unused beyond a single call site AND adds >1 layer of indirection?
├── YES → Is it a speculative design (no ticket, no requirement, no test)?
│         ├── YES → 🟡 Warning (premature abstraction)
│         └── NO  → 🟢 OK (may be justified by future plans — ask)
└── NO  → 🟢 OK

Is the implementation significantly more complex than the simplest working solution?
├── YES → Does the complexity address a documented requirement (concurrency, extensibility, etc.)?
│         ├── YES → 🟢 OK (complexity is justified)
│         └── NO  → 🟡 Warning (over-engineering)
└── NO  → 🟢 OK
```

### Code Smells Severity Tree

```
Is the class/module a God Class (>300 lines, >5 responsibilities)?
├── YES → Are multiple unrelated concerns mixed (e.g., UI logic + data access + business rules)?
│         ├── YES → 🔴 Critical (architectural debt — affects testability and change velocity)
│         └── NO  → 🟡 Warning (large but cohesive — should be decomposed when next modified)
└── NO  → 🟢 OK

Is there a mutable shared state bug (e.g., Python mutable default, JS closure over var)?
├── YES → 🔴 Critical (correctness bug)
└── NO  → Continue

Are magic numbers/strings used in logic?
├── YES → Is it a threshold, config value, or business rule that could change?
│         ├── YES → 🟡 Warning (extract to named constant)
│         └── NO  → 🟢 OK (e.g., `0`, `1`, `""` in obvious contexts)
└── NO  → 🟢 OK
```

### Error Handling Severity Tree

```
Is the error silently swallowed (no log, no re-raise, no user notification)?
├── YES → Is it in an async path or affects data integrity?
│         ├── YES → 🔴 Critical
│         └── NO  → 🟡 Warning
└── NO  → Is the error handling strategy inappropriate (e.g., catch-all, wrong exception type)?
          ├── YES → 🟡 Warning
          └── NO  → 🟢 OK

Is the method async void (C#) or has unhandled promise rejection (JS)?
├── YES → Is it an event handler?
│         ├── YES → 🟡 Warning (acceptable in C# event handlers, but flag for awareness)
│         └── NO  → 🔴 Critical (exceptions are unobservable / crash risk)
└── NO  → Continue to next check

Is blocking code used on an async path (.Result, .Wait(), sync I/O on UI thread)?
├── YES → Is it on the main/UI thread?
│         ├── YES → 🔴 Critical (deadlock risk)
│         └── NO  → 🟡 Warning (performance concern)
└── NO  → 🟢 OK
```

### Performance Severity Tree

```
Is the operation blocking the main/UI thread?
├── YES → 🔴 Critical
└── NO  → Is it an unnecessary allocation or computation in a hot path / tight loop?
          ├── YES → Is the loop bounded and small (< 100 iterations)?
          │         ├── YES → 🟡 Warning
          │         └── NO  → 🔴 Critical (potential OOM or noticeable lag)
          └── NO  → Is it a suboptimal pattern with a clearly better alternative?
                    ├── YES → 🟡 Warning
                    └── NO  → 🟢 OK
```

### Security Severity Tree

```
Does the code handle user-controlled input?
├── YES → Is the input used directly in: SQL query / shell command / file path / HTML output / eval()?
│         ├── YES → Is there sanitization, parameterization, or escaping?
│         │         ├── YES → 🟢 OK (verify it's correct)
│         │         └── NO  → 🔴 Critical (injection risk)
│         └── NO  → Is the input validated/sanitized before use in business logic?
│                   ├── YES → 🟢 OK
│                   └── NO  → 🟡 Warning (defense in depth)
└── NO  → Does the code contain hardcoded secrets, credentials, or API keys?
          ├── YES → 🔴 Critical
          └── NO  → Continue to other security checks
```

---

## Recurring Anti-Patterns Pre-flight

Before running the 9 categories, scan the code for the following high-signal anti-patterns. These are issues that experienced human reviewers raise consistently, and that AI-generated implementations are prone to introduce. Each item maps to a downstream category — when you find one, surface it in that category with the suggested severity, and **do not let an absence of category-specific cues cause you to skip these**.

This pass is language-agnostic. Concrete examples per language are illustrative — apply the principle to whatever language is detected.

### A. Wrapper helpers around standard-library APIs → KISS / YAGNI

Flag any helper method whose body is a thin pass-through to a well-known framework/standard-library call, especially when callers could invoke the framework API directly.

- Symptom: the helper adds no business behavior — no validation, no logging, no domain naming — just renames or trivially defers to a built-in.
- Action: 🟡 Warning. Recommend deleting the helper and inlining the framework call at the call sites, *unless* it centralizes a non-obvious cross-cutting concern.
- Examples by language:
  - **C# / .NET**: `EnsureDirectoryAndWrite(path, text)` → `Directory.CreateDirectory` + `File.WriteAllTextAsync`; custom `CopyFile` → `File.Copy`; custom relative-path math → `Path.GetRelativePath`; custom "find by employee id" loop → `Directory.GetFiles(dir, $"*_{id}.json")`.
  - **Python**: hand-rolled `ensure_dir` → `pathlib.Path.mkdir(parents=True, exist_ok=True)`; custom `copy_file` → `shutil.copy`.
  - **JavaScript / TypeScript**: custom `deepClone` → `structuredClone`; custom `groupBy` when `Object.groupBy` / `Map.groupBy` is available.
  - **Java**: custom file-walk helper → `Files.walk` / `Files.copy`; custom `Optional`-like wrapper.
  - **Go**: custom `ensureDir` wrapper → `os.MkdirAll`.
  - **Rust**: custom file copy wrapper → `std::fs::copy`.
  - **Ruby**: custom directory create → `FileUtils.mkdir_p`.

### B. Invariant work repeated inside loops or hot call sites → Performance

Flag computations whose result does not change per iteration but are recomputed every iteration, **especially** string normalization, case conversion, parsing, regex compilation, reflection lookups, or expensive service calls.

- Symptom: `ToUpper` / `ToLower` / `Trim` / `Normalize` / `Parse` / `Compile` called on the same value inside a loop or inside a method called from a loop.
- Action: 🟡 Warning (🔴 Critical if the loop is unbounded or the call performs I/O). Hoist the invariant to a local variable before the loop, or switch to a case-insensitive comparer/equality strategy.
- Examples by language:
  - **C# / .NET**: repeated `employeeId.ToUpper()` inside a loop → compute once, or use `StringComparer.OrdinalIgnoreCase`. Async method invoked inside a `foreach` whose result is identical for every iteration.
  - **Python**: `re.compile` inside a loop → compile once outside; `str.lower()` on the same key per iteration.
  - **JavaScript / TypeScript**: `new RegExp(...)` inside `.map`/`.forEach`; `JSON.parse` of the same payload per iteration.
  - **Java**: `Pattern.compile` inside a loop; repeated `toLowerCase()` on the same key — use a `TreeMap` with `String.CASE_INSENSITIVE_ORDER`.
  - **Go**: `regexp.MustCompile` inside a loop; repeated `strings.ToLower` on the same value.
  - **Rust**: `Regex::new` inside a loop; repeated `to_lowercase()` allocations.
  - **Kotlin / Swift**: repeated case conversion per iteration where a case-insensitive comparator exists.

### C. Untyped / dynamic traversal when a typed model exists → Code Smells / Readability

Flag code that reaches into a dynamic, weakly-typed representation of data (JSON tree, dictionary of strings, map of `any`) when a typed model for the same payload already exists in the codebase or is trivial to introduce.

- Symptom: navigating fields via string keys, casting from `object`/`any`, or constructing one-off dictionaries to extract two or three values that already correspond to a domain type.
- Action: 🟡 Warning. Deserialize into the typed model and read properties directly; this also restores compile-time checks and refactor-safety.
- Examples by language:
  - **C# / .NET**: `JObject`/`JToken` indexing (e.g., `obj["countryCode"]?.ToString()`) when a DTO or domain class exists — deserialize once and use properties.
  - **Python**: chained `dict.get("a", {}).get("b")` for structured payloads when a `pydantic`/`dataclass`/`TypedDict` model exists.
  - **JavaScript / TypeScript**: `any`-typed JSON access in TypeScript when an `interface`/`type` is available — use a parser (e.g., `zod`) or typed cast at the boundary.
  - **Java**: `JsonNode.get("...")` chains when a Jackson POJO exists — deserialize and use getters.
  - **Go**: `map[string]interface{}` traversal when a struct with `json:"..."` tags would deserialize cleanly.
  - **Rust**: `serde_json::Value` indexing when a `#[derive(Deserialize)]` struct exists.
  - **Kotlin / Swift / Ruby**: equivalent dynamic-map navigation where a data class / `Codable` struct / typed model already represents the payload.

### D. Over-defensive try/catch that doesn't handle anything → Error Handling

Flag try/catch (or equivalent) blocks that wrap code which cannot realistically throw the caught type, or that catch broadly and then log-and-continue / swallow / re-throw unchanged without adding context. This is a frequent AI-generated artifact.

- Symptom: catch blocks that exist "just in case", catch-all around pure in-memory operations, or catches that turn an exception into a generic shrug (return null, return empty, log "something went wrong") instead of either (a) handling a specific known failure mode or (b) propagating to the caller.
- Action: 🟡 Warning by default; 🔴 Critical when the swallow hides a correctness or data-integrity failure (see Error Handling Severity Tree). Recommend either deleting the try/catch or narrowing it to the specific exception type with a real recovery path.
- Examples by language:
  - **C# / .NET**: `try { /* pure dictionary lookup */ } catch (Exception) { return null; }` — delete.
  - **Python**: `try: ... except Exception: pass` around code that has no expected failure mode.
  - **JavaScript / TypeScript**: `try { ... } catch { /* ignore */ }` around `JSON.parse` of trusted in-memory data.
  - **Go**: idiomatic Go uses error returns, not panics — but flag `recover()` blocks that mask all panics instead of a known recoverable one.
  - **Rust**: `let _ = result;` patterns that silently discard `Result` values.
  - **Kotlin**: `runCatching { ... }.getOrNull()` used to mask all failures of a call that should propagate.
  - **Swift**: `try?` used everywhere to convert real failures into `nil`.

### E. Unused parameters on shared / public signatures → YAGNI

Flag parameters that callers must supply but the method body never reads, particularly on async/heavy methods where the caller is forced to do extra work to compute an argument that is then discarded.

- Symptom: parameter appears in the signature, never appears in the body. Often a leftover from an earlier design.
- Action: 🟡 Warning. Remove the parameter and simplify the call sites; this often reveals further simplification (e.g., the method no longer needs to be `async`).
- Applies to: all languages.

### F. Repo hygiene & developer-environment portability → Cross-Cutting Patterns

Flag artifacts that should not be in the repository or that bind the project to one developer's machine. These are not category-1-through-9 issues per se, but they bite teams hard and reviewers raise them consistently.

- Symptom: hardcoded absolute paths in `tasks.json` / `launch.json` / `Makefile` / shell scripts (`/Users/<name>/...`, `C:\Users\<name>\...`); committed `node_modules`, `wwwroot/lib`, `bin/`, `obj/`, `dist/`, `target/`, `__pycache__/`, `.venv/`; secrets or per-developer config checked in; editor/IDE configs that override team conventions.
- Action: 🟡 Warning (🔴 Critical if it includes secrets, credentials, or breaks the build for other developers). Recommend `.gitignore` additions, environment variables / workspace variables (e.g., `${workspaceFolder}`), or a sample/template file checked in instead of the real one.
- Surface this in the **Cross-Cutting Patterns** section (or in YAGNI for a single-file review).

---

## Review Procedure

Run all nine checks in sequence. The Recurring Anti-Patterns Pre-flight above feeds findings into these categories — don't double-count, but make sure every pre-flight hit lands in the right category in the final report. For each, collect findings and assign a severity using the decision trees above where applicable:

| Severity | Meaning |
|---|---|
| 🔴 Critical | Must fix — correctness risk, serious design flaw, or security concern |
| 🟡 Warning | Should fix — degrades maintainability, readability, or performance |
| 🟢 OK | No issues found in this category |

---

### 1. Readability

**Goal**: Code should be immediately understandable to a reader unfamiliar with it.

**Universal checks:**
- Unclear or misleading names (variables, methods, classes, parameters)
- Methods or functions that do more than one thing
- Excessive nesting (more than 2–3 levels deep)
- Long lines or dense one-liners that obscure intent
- Inconsistent formatting or style

**Language-specific checks:**

<details>
<summary>C# / .NET MAUI</summary>

- PascalCase for public members, camelCase with `_` prefix for private fields
- `[ObservableProperty]` backing fields should be named `_camelCase`; the generated property should read naturally
- XAML binding names and `x:Name` values should clearly reflect UI purpose
- ViewModel properties exposed to the View should be descriptive, not abbreviated
</details>

<details>
<summary>Python</summary>

- PEP 8 compliance: `snake_case` for functions/variables, `PascalCase` for classes, `UPPER_SNAKE` for constants
- Avoid single-character variable names outside of comprehensions or trivial loop counters
- Use f-strings over `.format()` or `%` formatting (Python 3.6+)
- Prefer `pathlib.Path` over `os.path` string manipulation for file paths
- Type hints on function signatures (PEP 484) — especially public APIs
</details>

<details>
<summary>JavaScript / TypeScript</summary>

- camelCase for variables/functions, PascalCase for classes/components, UPPER_SNAKE for constants
- Consistent use of `const` / `let` (no `var`)
- Destructuring used appropriately (not excessively)
- TypeScript: strict types preferred over `any`; interfaces for object shapes
</details>

<details>
<summary>Java</summary>

- camelCase for methods/variables, PascalCase for classes, UPPER_SNAKE for constants
- Consistent access modifiers (no package-private by accident)
- Meaningful generic type parameter names beyond single letters for complex generics
</details>

<details>
<summary>Go</summary>

- Exported names PascalCase, unexported camelCase
- Short variable names acceptable in narrow scopes per Go convention
- Error variables named `err`; don't shadow across nested scopes
- `gofmt` compliance assumed — flag obvious deviations
</details>

<details>
<summary>Rust</summary>

- `snake_case` for functions/variables/modules, `PascalCase` for types/traits, `SCREAMING_SNAKE` for constants
- Lifetime parameters should be descriptive when >1 in scope (`'input`, `'output` over `'a`, `'b`)
- Avoid `unwrap()` / `expect()` in library code — propagate errors with `?`
</details>

<details>
<summary>Kotlin</summary>

- camelCase for functions/properties, PascalCase for classes, `UPPER_SNAKE` for constants
- Use `val` over `var` where possible
- Named arguments for functions with >2 parameters of the same type
</details>

<details>
<summary>Swift</summary>

- camelCase for functions/variables, PascalCase for types/protocols
- `guard` for early returns instead of nested `if let`
- Omit needless words per Swift API Design Guidelines
</details>

<details>
<summary>Ruby</summary>

- `snake_case` for methods/variables, `PascalCase` for classes/modules, `SCREAMING_SNAKE` for constants
- Use `?` suffix for predicate methods, `!` suffix for mutating methods
- Prefer symbols over strings for hash keys
</details>

<details>
<summary>Other languages</summary>

Apply the universal checks above plus the idiomatic naming and formatting conventions of the detected language. If unsure of a language's conventions, note the assumption explicitly.
</details>

---

### 2. KISS (Keep It Simple, Stupid)

**Goal**: Solutions should be as simple as the problem allows — no simpler, no more complex.

**Universal checks:**
- Logic that can be expressed more simply
- Unnecessary abstraction layers introduced prematurely
- Over-engineered class hierarchies or generic constraints
- Lambdas or expressions that are harder to read than a simple loop or conditional
- **Prefer the standard library / framework API over a custom helper** — if a helper is a thin pass-through to a built-in (file copy, directory create, relative path, deep clone, group-by, regex compile), inline the built-in and delete the helper unless it centralizes real cross-cutting behavior. (See Pre-flight Pattern A.)
- **Pass the whole domain object rather than a destructured bag of primitives** when caller and callee both know the same type — reduces parameter clumps and keeps the call site honest.

**Language-specific checks:**

<details>
<summary>C# / .NET MAUI</summary>

- Unnecessary base classes or interfaces for single-use types
- Overly complex XAML triggers/behaviors where a simple binding would suffice
- Custom renderers/handlers added without clear platform necessity
- Excessive use of generic type parameters where concrete types are clearer
- Wrappers around `File.*` / `Directory.*` / `Path.*` that add no behavior → delete and call the BCL directly; use `Path.GetRelativePath`, `Directory.CreateDirectory` (idempotent), `Directory.GetFiles(dir, pattern)` instead of manual scans.
</details>

<details>
<summary>Python</summary>

- Metaclasses or descriptors where a simple class or function would work
- Overuse of decorators that obscure behavior
- Complex comprehensions that should be explicit loops
- Abstract base classes with a single implementation
</details>

<details>
<summary>JavaScript / TypeScript</summary>

- Unnecessary wrapper functions or higher-order functions for simple operations
- Over-abstracted component hierarchies (React/Vue/Angular)
- Complex generic types that could be simplified with concrete types or unions
</details>

<details>
<summary>Rust</summary>

- Overly generic trait bounds where a concrete type would suffice
- Unnecessary `Box<dyn Trait>` when an enum would be simpler and stack-allocated
- Macro usage where a regular function would work
</details>

<details>
<summary>Kotlin</summary>

- Unnecessary sealed class hierarchies for simple branching
- Overuse of extension functions that fragment readability
- Complex coroutine flows where a simple sequential call would suffice
</details>

<details>
<summary>Swift</summary>

- Protocol-oriented design where a simple struct would suffice
- Unnecessary `@propertyWrapper` for simple computed properties
- Overly complex combine/async-await chains
</details>

<details>
<summary>Java</summary>

- Enterprise patterns (AbstractSingletonProxyFactoryBean) for simple problems
- Unnecessary use of reflection when direct invocation works
- Complex generics with multiple bounded wildcards where a simpler signature exists
- Strategy/Visitor patterns for logic with only 2–3 branches
</details>

<details>
<summary>Go</summary>

- Unnecessary interfaces — Go convention is to define interfaces at the consumer, not the producer
- Channel-based solutions where a simple mutex or waitgroup would suffice
- Overly generic `interface{}` / `any` parameters where concrete types are clear
</details>

<details>
<summary>Ruby</summary>

- Metaprogramming (`method_missing`, `define_method`) where explicit methods are clearer
- Unnecessary DSLs for internal configuration
- Complex block/proc/lambda chains where a simple method would work
</details>

---

### 3. DRY (Don't Repeat Yourself)

**Goal**: Every piece of knowledge should have a single, authoritative representation.

**Universal checks:**
- Duplicated logic blocks (copy-paste code)
- Repeated string literals that should be constants or resource keys
- Identical or near-identical methods that could be unified
- Parallel data structures that must be kept in sync manually

**Language-specific checks:**

<details>
<summary>C# / .NET MAUI</summary>

- Repeated LINQ query chains → extract into shared method or extension
- Duplicated ViewModel boilerplate outside CommunityToolkit
- XAML styles/templates defined inline per-page instead of in `ResourceDictionary`
- Repeated platform-specific `#if ANDROID` / `#if IOS` blocks → unify via service abstraction
</details>

<details>
<summary>Python</summary>

- Repeated `try/except` blocks → decorator or context manager
- Duplicate dict/list construction → factory function
- Copy-pasted validation logic → shared validator
- Repeated file I/O patterns → helper function
</details>

<details>
<summary>JavaScript / TypeScript</summary>

- Duplicated fetch/API call patterns → shared client
- Repeated component prop patterns → shared type/interface
- Copy-pasted event handlers → single parameterized handler
</details>

<details>
<summary>Rust</summary>

- Repeated `match` arms → extract into a helper or use a macro (only if >3 repetitions)
- Duplicated error conversion logic → implement `From<T>` trait
- Repeated builder patterns → derive macro or builder crate
</details>

<details>
<summary>Kotlin</summary>

- Duplicated coroutine launch patterns → shared extension function
- Repeated null-check chains → scope function (`let`, `run`, `also`)
- Copy-pasted data class transformations → shared mapper
</details>

<details>
<summary>Java</summary>

- Repeated try-with-resources patterns → extract into a utility method
- Duplicated DTO mapping logic → use MapStruct or shared mapper
- Copy-pasted stream pipeline patterns → shared collector or utility
- Repeated builder patterns across similar classes → abstract builder or factory
</details>

<details>
<summary>Go</summary>

- Repeated error wrapping patterns → shared `wrapErr` helper
- Duplicated HTTP handler boilerplate → middleware or shared handler factory
- Copy-pasted struct initialization → constructor function
</details>

<details>
<summary>Swift</summary>

- Repeated Codable boilerplate → protocol extensions or shared decoder configuration
- Duplicated UIKit/SwiftUI styling → shared ViewModifier or UIAppearance config
- Copy-pasted async/await call patterns → shared async utility
</details>

<details>
<summary>Ruby</summary>

- Repeated ActiveRecord scopes with similar logic → shared concern or scope builder
- Duplicated controller before_action patterns → shared concern
- Copy-pasted service object patterns → base service class or shared module
</details>

---

### 4. YAGNI (You Aren't Gonna Need It)

**Goal**: Don't build things that aren't currently needed.

**Universal checks:**
- Unused variables, fields, parameters, or imports
- **Unused parameters on shared/public method signatures** — forces callers to compute values that are then discarded. Remove them; this often unlocks further simplification (e.g., the method may no longer need to be async). (See Pre-flight Pattern E.)
- Methods or classes that exist but are never called
- **Pass-through helpers that wrap a single framework call** with no added behavior — delete and call the framework API directly. (See Pre-flight Pattern A.)
- Speculative data, fixtures, or generators for features not yet implemented (e.g., generators for a barcode/format/category that no caller uses yet) — add when the consumer arrives, not before.
- Commented-out code left in place
- Feature flags or conditional blocks for features that no longer exist
- Speculative abstractions (interfaces with a single implementation and no expansion plan)
- Stale `TODO` comments

**Language-specific checks:**

<details>
<summary>C# / .NET MAUI</summary>

- Injected services that are never used in the constructor body
- `[ObservableProperty]` fields that have no binding or command referencing them
- Dead `OnAppearing` / `OnDisappearing` overrides that do nothing
- Unused `AutomationId` values with no corresponding test
</details>

<details>
<summary>Python</summary>

- Unused imports (check all `import` and `from ... import` statements)
- `__init__` parameters stored as attributes but never accessed
- Empty `pass` methods or `NotImplementedError` placeholders that have been stale
- Unused function parameters (especially `**kwargs` that's never inspected)
</details>

<details>
<summary>JavaScript / TypeScript</summary>

- Unused imports or destructured variables
- Props defined in a component's interface but never read
- Exported functions/types that nothing imports
- Dead feature flags or environment variable checks
</details>

<details>
<summary>Rust</summary>

- `#[allow(dead_code)]` annotations hiding unused items
- Unused `use` imports (compiler warns, but check for `#[allow(unused_imports)]` suppression)
- Trait implementations that are never used polymorphically
</details>

<details>
<summary>Kotlin</summary>

- Unused constructor parameters in data classes
- `@Suppress("unused")` hiding real dead code
- Empty `companion object` blocks
</details>

<details>
<summary>Swift</summary>

- Unused `import` statements
- Protocol conformances that are never utilized
- Empty required initializers
</details>

<details>
<summary>Java</summary>

- Unused imports (IDE usually catches these — but check for wildcard imports hiding unused classes)
- Unused private methods or fields
- Empty method overrides that only call `super`
- Unused Spring `@Bean` definitions or `@Autowired` fields
</details>

<details>
<summary>Go</summary>

- Go compiler enforces no unused imports/variables — but check for `_` blanking used to suppress warnings
- Unexported functions that are never called within the package
- Build tags for dead platform targets
</details>

<details>
<summary>Ruby</summary>

- Unused `require` / `require_relative` statements
- Dead routes in `routes.rb` (Rails)
- Unused model scopes or class methods
- Empty callbacks (`before_action`, `after_save`) with no implementation
</details>

---

### 5. Documentation & Commenting

**Goal**: Public API should be self-documenting; non-obvious logic should be explained.

**Universal checks:**
- Missing documentation on public classes, methods, and properties
- Comments that restate what the code does instead of explaining *why*
- Outdated comments that no longer match the code
- Undocumented non-obvious algorithm choices or business rule implementations

**Language-specific checks:**

<details>
<summary>C# / .NET MAUI</summary>

- Missing XML documentation (`///`) on public classes, methods, and properties
- Missing `<param>`, `<returns>`, `<exception>` tags on non-trivial public methods
- Service interfaces (`I{Name}Service`) should have `///` summaries
- ViewModel commands (`[RelayCommand]`) should document trigger context if non-obvious
- XAML: ensure `AutomationId` on interactive elements for test discoverability
</details>

<details>
<summary>Python</summary>

- Missing docstrings on modules, classes, and public functions (Google, NumPy, or Sphinx style)
- Missing type hints on function signatures — type hints ARE documentation
- Missing `Args:`, `Returns:`, `Raises:` sections in docstrings for non-trivial functions
- `# type: ignore` comments without explanation
</details>

<details>
<summary>JavaScript / TypeScript</summary>

- Missing JSDoc on exported functions/classes
- TypeScript interfaces without property-level doc comments for non-obvious fields
- Missing README or module-level docstring for utility modules
</details>

<details>
<summary>Rust</summary>

- Missing `///` doc comments on public items — Rust culture strongly expects these
- Missing `# Examples` section in doc comments for public API functions
- Missing `# Errors` / `# Panics` sections where applicable
</details>

<details>
<summary>Kotlin</summary>

- Missing KDoc (`/** */`) on public classes and functions
- Missing `@param`, `@return`, `@throws` tags
</details>

<details>
<summary>Swift</summary>

- Missing documentation comments (`///`) on public declarations
- Missing `- Parameters:`, `- Returns:`, `- Throws:` markup
</details>

<details>
<summary>Java</summary>

- Missing Javadoc (`/** */`) on public classes, methods, and interfaces
- Missing `@param`, `@return`, `@throws` tags on non-trivial public methods
- Missing package-level `package-info.java` documentation
</details>

<details>
<summary>Go</summary>

- Missing doc comments on exported functions, types, and package declarations — `godoc` depends on these
- Comment should start with the name of the thing being documented (Go convention)
- Missing `// Deprecated:` annotations on deprecated API
</details>

<details>
<summary>Ruby</summary>

- Missing YARD doc (`# @param`, `# @return`, `# @raise`) on public methods
- Missing class-level documentation comments
- Missing `README.md` or module-level comments for gem/library code
- Undocumented Rails concerns and shared modules
</details>

### 6. Error Handling

**Goal**: Failures should be caught at the right level, logged appropriately, and never silently swallowed. Use the **Error Handling Severity Tree** above for classification.

**Universal checks:**
- Empty or bare catch blocks
- Catching all exceptions to swallow errors without logging
- **Over-defensive try/catch that doesn't handle anything** — wrapping code that has no realistic failure mode, or catching broadly and then returning `null`/empty/default without a real recovery path. Either delete the try/catch or narrow it to a specific exception type with a real recovery action. This is a common AI-generated anti-pattern: it *looks* safe but converts genuine bugs into silent failures. (See Pre-flight Pattern D.)
- Exceptions used for normal control flow
- Missing null/undefined checks at system boundaries (user input, API responses, DI-resolved services)
- Error states that are silently ignored in async paths

**Language-specific checks:**

<details>
<summary>C# / .NET MAUI</summary>

- `async void` methods outside event handlers → 🔴 Critical (per decision tree)
- Missing `ILogger` calls when catching exceptions
- `.Result` / `.Wait()` on `Task` in async paths → deadlock risk (see decision tree)
- `[RelayCommand]` methods that can throw with no try/catch and no error state for the View
- No domain-specific exception types for business rule violations
</details>

<details>
<summary>Python</summary>

- Bare `except:` or `except Exception:` without logging/re-raising → 🔴 Critical (per decision tree)
- File I/O without context managers (`with`) → 🟡 Warning (resource leak risk)
- Database connections without context managers or explicit `close()` → 🟡 Warning (resource leak, connection pool exhaustion)
- `sys.argv` access without bounds checking or `argparse`
- `KeyError`/`IndexError` risk on unguarded dict/list access
- Silent `pass` in except blocks
</details>

<details>
<summary>JavaScript / TypeScript</summary>

- Unhandled Promise rejections (missing `.catch()` or try/catch on `await`)
- Empty catch blocks
- Callbacks without error parameter handling
- Missing null/undefined guards on optional chaining results
</details>

<details>
<summary>Go</summary>

- Ignored error returns (`_, _ = someFunc()`) → 🔴 Critical
- `if err != nil` without wrapping or adding context
- Deferred closes without error checking
</details>

<details>
<summary>Rust</summary>

- `unwrap()` / `expect()` in library code → 🔴 Critical (panics in library code are unacceptable)
- `unwrap()` in application code without a comment explaining why it's safe → 🟡 Warning
- Missing `?` propagation where error conversion is straightforward
- Ignoring `Result` return values
</details>

<details>
<summary>Kotlin</summary>

- `!!` (non-null assertion) without preceding null check → 🟡 Warning
- Empty catch blocks in coroutine exception handlers
- Missing `runCatching` or `try/catch` around suspending functions that can fail
</details>

<details>
<summary>Swift</summary>

- Force unwrap (`!`) without guard → 🟡 Warning
- `try!` in non-test code → 🔴 Critical
- Missing error propagation with `throws`
</details>

---

### 7. Performance

**Goal**: Code should not perform unnecessary work or allocate resources it doesn't need. Use the **Performance Severity Tree** above for classification.

**Universal checks:**
- Unnecessary object allocations inside hot paths or loops
- **Invariant computation repeated per iteration** — string case conversion (`ToUpper`/`ToLower`/`toLowerCase`), trimming, parsing, regex compilation, reflection lookup, or expensive method calls whose result does not change across iterations. Hoist the result out of the loop, or switch to a case-insensitive comparer/equality strategy so the conversion never happens. (See Pre-flight Pattern B.)
- **Heavy method invoked from inside a loop** where the same expensive work is repeated for every iteration — restructure so the heavy work runs once and the loop consumes its result.
- Synchronous I/O or blocking calls on the UI thread
- Collections enumerated multiple times unnecessarily
- Unbounded collections or missing pagination for potentially large data sets

**Language-specific checks:**

<details>
<summary>C# / .NET MAUI</summary>

- `.Result` / `.Wait()` / `.GetAwaiter().GetResult()` on UI thread → 🔴 Critical (per decision tree)
- `ObservableCollection` rebuilt entirely on updates that could be incremental
- Missing `IDisposable` on services holding event subscriptions or resources
- Missing `ConfigureAwait(false)` in library/service code
- `WeakReferenceMessenger` subscriptions never unregistered
- Expensive XAML converters called on every frame
</details>

<details>
<summary>Python</summary>

- `.append()` in loop where list comprehension or generator would suffice
- `readlines()` on large files → line-by-line iteration
- String concatenation in loop → `"".join()`
- N+1 query patterns in ORM code
- Missing `__slots__` on data-heavy classes created in bulk
</details>

<details>
<summary>JavaScript / TypeScript</summary>

- Synchronous operations blocking the event loop
- Missing memoization on expensive React renders (`useMemo`, `React.memo`)
- Chained `.filter().map()` that could be a single pass
- Unbatched DOM manipulations
</details>

<details>
<summary>Rust</summary>

- Unnecessary `clone()` where a borrow would suffice
- `collect()` into a `Vec` only to iterate again immediately
- `String` allocation where `&str` would work
- Missing `with_capacity()` on `Vec`/`HashMap` with known size
</details>

<details>
<summary>Kotlin</summary>

- Repeated coroutine creation where a single scope would suffice
- Unnecessary `toList()` / `toMutableList()` conversions
- Blocking calls inside coroutine dispatchers
</details>

<details>
<summary>Swift</summary>

- Unnecessary copying of value types (large structs passed by value repeatedly)
- Missing `lazy` for expensive computed properties accessed conditionally
- Main actor blocking with synchronous calls
</details>

---

### 8. Security

**Goal**: Code should not introduce vulnerabilities that could be exploited. Use the **Security Severity Tree** above for classification.

This category checks for common vulnerability patterns. It is not a substitute for a full penetration test or security audit, but it catches the issues most frequently introduced in application code.

**Universal checks:**
- **Injection risks** — user-controlled input used directly in SQL, shell commands, file paths, HTML output, or dynamic code evaluation without sanitization/parameterization
- **Hardcoded secrets** — API keys, passwords, tokens, connection strings embedded in source code
- **Insecure deserialization** — deserializing untrusted data without type constraints or validation
- **Path traversal** — user-controlled strings used to construct file paths without canonicalization or allowlist
- **Missing authentication/authorization checks** — endpoints or operations that should be guarded but aren't
- **Sensitive data exposure** — logging PII, tokens, or passwords; returning sensitive fields in API responses
- **Insecure randomness** — using non-cryptographic random generators for security-sensitive operations (session tokens, OTPs)

**Language-specific checks:**

<details>
<summary>C# / .NET MAUI</summary>

- String concatenation in SQL queries instead of parameterized queries → 🔴 Critical
- `Process.Start()` with user-controlled arguments without sanitization → 🔴 Critical
- Storing secrets in `appsettings.json` checked into source control → 🔴 Critical
- Missing `[ValidateAntiForgeryToken]` on POST endpoints (ASP.NET)
- `HttpClient` not using certificate pinning for sensitive mobile API calls
- XAML bindings that display sensitive data without masking
</details>

<details>
<summary>Python</summary>

- `os.system()` / `subprocess.call(shell=True)` with user input → 🔴 Critical
- `eval()` / `exec()` with any external input → 🔴 Critical
- SQL string formatting instead of parameterized queries → 🔴 Critical
- `pickle.load()` on untrusted data → 🔴 Critical
- `open()` with user-controlled path without `os.path.realpath()` + allowlist check → 🔴 Critical
- Hardcoded secrets in source files → 🔴 Critical
- User-controlled data interpolated into XML/HTML output without escaping → 🔴 Critical (injection risk; use `xml.sax.saxutils.escape()` or `html.escape()`)
- `random` module for security-sensitive values instead of `secrets` module → 🟡 Warning
- Missing `hashlib` comparison using `hmac.compare_digest()` for timing-safe comparison → 🟡 Warning
</details>

<details>
<summary>JavaScript / TypeScript</summary>

- `innerHTML` / `dangerouslySetInnerHTML` with unsanitized user input → 🔴 Critical (XSS)
- `eval()` / `new Function()` with external input → 🔴 Critical
- SQL string templates instead of parameterized queries → 🔴 Critical
- `Math.random()` for tokens/secrets instead of `crypto.randomUUID()` → 🟡 Warning
- Missing CORS configuration on API endpoints
- JWT tokens stored in localStorage without httpOnly cookie alternative → 🟡 Warning
- Missing rate limiting on authentication endpoints
</details>

<details>
<summary>Go</summary>

- `fmt.Sprintf` for SQL queries instead of parameterized queries → 🔴 Critical
- `os/exec` with user-controlled arguments without sanitization → 🔴 Critical
- Hardcoded secrets → 🔴 Critical
- Missing TLS verification (`InsecureSkipVerify: true`) → 🔴 Critical
- `math/rand` for security values instead of `crypto/rand` → 🟡 Warning
</details>

<details>
<summary>Rust</summary>

- `unsafe` blocks without documented safety invariants → 🟡 Warning
- `unsafe` blocks that dereference raw pointers from external input → 🔴 Critical
- SQL string formatting instead of parameterized queries (sqlx, diesel) → 🔴 Critical
- Hardcoded secrets → 🔴 Critical
</details>

<details>
<summary>Kotlin</summary>

- SQL string templates instead of parameterized queries → 🔴 Critical
- `Runtime.getRuntime().exec()` with user input → 🔴 Critical
- Hardcoded secrets in companion objects → 🔴 Critical
- WebView with `setJavaScriptEnabled(true)` + `addJavascriptInterface` → 🔴 Critical (Android)
</details>

<details>
<summary>Swift</summary>

- String interpolation in SQL queries → 🔴 Critical
- `Process()` / `NSTask` with user-controlled arguments → 🔴 Critical
- App Transport Security exceptions without justification → 🟡 Warning
- Keychain access without appropriate access control flags → 🟡 Warning
</details>

<details>
<summary>Ruby</summary>

- `system()` / backtick execution with user input → 🔴 Critical
- `eval()` with external input → 🔴 Critical
- Mass assignment without strong parameters (Rails) → 🔴 Critical
- YAML.load on untrusted data (use `YAML.safe_load`) → 🔴 Critical
- Missing CSRF protection on state-changing endpoints → 🟡 Warning
</details>

---

### 9. Code Smells

**Goal**: Identify structural issues that indicate deeper design problems.

**Universal checks:**
- **Long Method** — methods exceeding ~30 lines doing too much
- **God Class** — a class with too many responsibilities
- **Feature Envy** — a method that uses another class's data more than its own
- **Magic Numbers / Strings** — unexplained literal values inline in logic; also includes hardcoded lists/enums/options that should be generated from a real enum or constant (e.g., a hardcoded dropdown list that duplicates an existing enum).
- **Primitive Obsession** — using raw strings/ints where a domain type would be clearer
- **Stringly-typed / dynamic data traversal when a typed model exists** — navigating JSON/dictionary trees via string keys (e.g., `JObject` indexing, `dict.get(...).get(...)`, `JsonNode.get(...)`, `map[string]interface{}`) when a domain DTO is available or trivial to introduce. Deserialize once and use properties. (See Pre-flight Pattern C.)
- **Inconsistent naming of parallel types** — sibling converters/validators/parsers/repositories that follow different naming patterns even though they play the same architectural role (e.g., `IntToBoolJsonConverter` next to `BoolToStringConverter`; `PersonaRegistrar` where every other peer is `*Repository`). Align names so role is predictable from the name.
- **Shotgun Surgery** — a single conceptual change requires edits across many unrelated files
- **Data Clumps** — groups of parameters or fields that always appear together and should be a type

**Language-specific checks:**

<details>
<summary>C# / .NET MAUI</summary>

- Fat ViewModel — >200 lines, logic belongs in a service
- Code-behind logic in `.xaml.cs` beyond constructor + `InitializeComponent()` → 🟡 Warning
- Navigation logic in ViewModel instead of `INavigationService`
- Magic resource key strings not referenced via typed constant
</details>

<details>
<summary>Python</summary>

- Functions with >5 parameters — missing data class or config object
- Mutable default arguments (`def f(x=[])`) → 🔴 Critical (shared state bug)
- God module — single `.py` file >500 lines with mixed responsibilities
- Boolean flag parameters that change function behavior → split into separate functions
- Nested function definitions beyond 1 level deep
</details>

<details>
<summary>JavaScript / TypeScript</summary>

- Component >300 lines → split into sub-components or custom hook
- Prop drilling >2 levels → context or state management
- Mixed async patterns (callbacks + promises + async/await in same file)
- `any` type used to bypass TypeScript checks → 🟡 Warning
</details>

<details>
<summary>Rust</summary>

- Functions >50 lines (Rust convention skews shorter due to match arms)
- Overly deep nesting in match arms → extract into helper functions
- `clone()` used to satisfy the borrow checker without understanding the ownership model
</details>

<details>
<summary>Kotlin</summary>

- Deeply nested `when` expressions → extract into separate functions
- Data class with >7 properties without grouping → split into sub-objects
- `lateinit` used to defer initialization that should happen in constructor
</details>

<details>
<summary>Swift</summary>

- Massive view controllers / SwiftUI views >200 lines → decompose
- Force unwraps (`!`) used throughout instead of proper optional handling
- Stringly-typed APIs where an enum would be safer
</details>

<details>
<summary>Ruby</summary>

- Class >200 lines with mixed concerns → extract service objects
- Method >20 lines (Ruby convention skews shorter)
- Monkey-patching core classes without isolation
- God controller in Rails → extract to service layer
</details>

---

## Cross-Cutting Patterns (Deep Review Only)

When reviewing multiple files (> 200 lines total or 2+ files), add a **Cross-Cutting Patterns** section after the per-file reviews. This section surfaces systemic issues that only become visible when reading files together — problems that no single-file review would catch.

**Format:** Use a numbered table with severity and one-line detail. Keep it actionable.

| # | Pattern | Severity | Detail |
|---|---|---|---|
| 1 | Name of systemic issue | 🔴/🟡 | One-sentence description + recommendation |

**Check for:**

1. **Inconsistent error handling strategy** — one file uses exceptions, another returns error codes, a third silently ignores failures. Flag and recommend a unified approach.
2. **Naming convention drift** — one file uses `camelCase`, another `snake_case` for the same type of identifier. Flag with specific examples from both files. Also flag sibling types in the same architectural role that follow different naming patterns (`*Converter` vs `*JsonConverter`, `*Registrar` vs `*Repository`).
3. **Dependency direction violations** — lower-layer modules importing from higher layers (e.g., a data access layer importing from a controller/view layer). Flag as 🔴 Critical if present.
4. **Missing shared abstractions** — multiple files implement the same pattern (logging, validation, API calls) differently when a shared utility/service should exist.
5. **Dependency injection / lifecycle mismatches** — one file creates instances manually while another expects DI; or resources created in one file are never disposed by the caller in another. Common in C#/Java/TS service architectures.
6. **Repo hygiene & developer-environment portability** — hardcoded absolute paths in tooling/config (`tasks.json`, `launch.json`, scripts), committed build artifacts or vendored dependencies (`node_modules`, `wwwroot/lib`, `bin/`, `obj/`, `dist/`, `target/`, `__pycache__/`, `.venv/`), per-developer settings or secrets in source control. Use workspace variables (e.g., `${workspaceFolder}`) and `.gitignore` instead. 🟡 Warning by default; 🔴 Critical if secrets/credentials are present. (See Pre-flight Pattern F.)
7. **Cross-language / cross-project consistency for shared concepts** — when the same concept (e.g., a serializer configuration, an ID format, a fixture schema) is defined in two projects that must agree, flag any drift between them.
8. **Test coverage gaps** — if test files are included in the review, identify which production code paths have no corresponding test. If no test files are present, note this as a recommendation.

---

## Tooling Recommendations

After the findings report, **always include** a **Tooling** section when any 🔴 Critical or 🟡 Warning findings were reported. This helps the developer prevent recurrence, not just fix the current instance. Match to the detected language:

| Language | Recommended Tools |
|---|---|
| C# | Roslyn Analyzers, SonarQube, dotnet-format, SecurityCodeScan |
| Python | ruff, mypy, bandit (security), black (formatting) |
| JavaScript/TS | ESLint, Prettier, TypeScript strict mode, npm audit |
| Go | golangci-lint, go vet, gosec (security) |
| Rust | clippy, cargo audit, miri (unsafe verification) |
| Kotlin | detekt, ktlint, Android Lint |
| Swift | SwiftLint, swift-format |
| Ruby | RuboCop, Brakeman (security), Reek (code smells) |
| Java | SpotBugs, PMD, Checkstyle, SonarQube |

Only recommend tools that would catch issues you actually found. Don't dump the full table — pick the 1–3 most relevant.

---

## Output Format

Produce a single structured report. Match depth to input size (see Review Depth Calibration above).

**Format adaptation:** If the user requests a specific format, adapt:
- "Give me a quick summary" → Produce only the Summary table + Top Priorities. Skip per-category sections.
- "Output as JSON" → Produce a machine-readable JSON object with the same structure (categories, findings, severities).
- "For a PR comment" → Produce a condensed version: Top Priorities + one-line-per-finding. No 🟢 OK rows.
- Default (no format specified) → Use the standard markdown report below.

### JSON Output Schema (when requested)

```json
{
  "pr_number": 781427,
  "file": "UserProfileViewModel.cs",
  "language": "csharp",
  "pr_context": {
    "commits": [
      { "hash": "abc1234", "date": "2026-05-07", "message": "Initial scaffolding" },
      { "hash": "def5678", "date": "2026-05-13", "message": "Added tests and page actions" }
    ],
    "thread_reconciliation": [
      {
        "thread_id": 5,
        "status": "active",
        "file": "DriverFollowUpReasonPage.cs",
        "line": 76,
        "claimed_fix": "Removed try catch",
        "code_evidence": "try/catch still present in final commit",
        "verdict": "unimplemented"
      }
    ]
  },
  "categories": [
    {
      "name": "Readability",
      "status": "warning",
      "findings": [
        {
          "severity": "warning",
          "finding": "ObservableProperty fields missing _ prefix",
          "location": "Lines 14-17",
          "suggestion": "Rename to _name, _email, _phone, _isLoading"
        }
      ]
    }
  ],
  "summary": {
    "critical_count": 2,
    "warning_count": 5,
    "ok_count": 2,
    "top_priorities": [
      { "severity": "critical", "finding": "async void SaveProfile", "category": "Error Handling" },
      { "severity": "critical", "finding": "Swallowed exception in catch block", "category": "Error Handling" }
    ]
  },
  "tooling": ["Roslyn Analyzers", "SecurityCodeScan"]
}
```

### Standard Report (20–200 lines)

```
## Code Review: {FileName or PR #NNNN} ({Language})

### PR Comment Reconciliation
> Include this section only when a PR number was provided and threads were fetched.
> Omit entirely for file-only reviews. Place it before section 1.

| Thread | Status | File | Claimed fix | Code evidence | Verdict |
|---|---|---|---|---|---|
| #5 | 🔴 active (open) | DriverFollowUpReasonPage.cs:76 | "Removed try catch" | try/catch still present in dd5e5b3 | ❌ Unimplemented |
| #6 | ⚠️ fixed (closed) | ManifestPage.cs:192 | "Created AutomationId.cs, updated all references" | No such file in diff; strings still inline ×6 | ❌ Unimplemented |

**Legend:** ✅ Implemented · ❌ Unimplemented (thread closed without code change) · ⚠️ Merged with open thread · 🔁 Awaiting author response

Any ❌ Unimplemented finding on a thread marked "fixed" is automatically escalated to 🔴 Critical in the relevant review category below.

### Commit Timeline
> Include when the PR has multiple code commits. Omit for single-commit PRs.

| Commit | Date | Message |
|---|---|---|
| `abc1234` | May 7 | Initial scaffolding |
| `def5678` | May 8 | update |
| `ghi9012` | May 13 | Added tests and page actions (final) |

Review is based on the **final cumulative diff** (`origin/dev...origin/pr/NNNN`).

---

### 1. Readability
| Severity | Finding | Location | Suggestion |
|---|---|---|---|
| 🟡 Warning | `ProcessData` does two unrelated things | Line 42 | Split into `ValidateData` and `TransformData` |
| 🟢 OK | Naming is consistent and clear | — | — |

### 2. KISS
...

### 3. DRY
...

### 4. YAGNI
...

### 5. Documentation
...

### 6. Error Handling
...

### 7. Performance
...

### 8. Security
...

### 9. Code Smells
...

---

## Summary

| Category | Status | Critical | Warnings |
|---|---|---|---|
| Readability | 🟡 | 0 | 1 |
| KISS | 🟢 | 0 | 0 |
| DRY | 🔴 | 1 | 0 |
| YAGNI | 🟡 | 0 | 2 |
| Documentation | 🟡 | 0 | 3 |
| Error Handling | 🔴 | 1 | 1 |
| Performance | 🟡 | 0 | 1 |
| Security | 🟢 | 0 | 0 |
| Code Smells | 🟡 | 0 | 2 |

**Top priorities:**
1. 🔴 [Critical finding 1]
2. 🔴 [Critical finding 2]
3. 🟡 [Most impactful warning]

**Tooling:** Consider adding [tool] to catch [category] issues automatically.
```

### Compact Report (< 20 lines / snippet)

```
## Code Review: {FileName} ({Language})

| Category | Status | Finding | Suggestion |
|---|---|---|---|
| Readability | 🟢 OK | — | — |
| KISS | 🟢 OK | — | — |
| DRY | 🟢 OK | — | — |
| YAGNI | 🟢 OK | — | — |
| Documentation | 🟡 Warning | Missing docstring | Add a brief description |
| Error Handling | 🟢 OK | — | — |
| Performance | 🟢 OK | — | — |
| Security | 🟢 OK | — | — |
| Code Smells | 🟢 OK | — | — |

> Note: This is a small snippet — several categories don't apply at this scale. Share the full file or module for a deeper review.
```

**All-OK compact summary:** When a snippet has zero findings across all categories, end with:
> "No issues found. This snippet is clean, idiomatic [Language]. For a more meaningful review, share the full file or surrounding context — there may be architectural or integration concerns not visible at this scale."

Always end with the **Top priorities** list ordering 🔴 Critical items first, then the most impactful 🟡 Warnings. For compact reports with no findings, end with a brief note.

Always end with asking if the user wants you to add comments directly to the lines of code with findings, if the platform supports it (e.g., GitHub PR). This can make it easier for the developer to see exactly where the issues are and understand the context of the suggestions.

---

## Post-Review Follow-Up

After delivering the report, offer the user concrete next steps based on the findings:

| Scenario | Offer |
|---|---|
| **❌ Unimplemented PR thread(s)** | "Would you like me to implement the fixes that were promised in the PR comments but never committed — [Thread #N: description]?" |
| **⚠️ Merged with open thread(s)** | "Thread #N is still open. Would you like me to answer the reviewer's question / implement the fix now?" |
| **🔴 Critical findings exist** | "Would you like me to fix the critical issues? I can provide corrected code for [specific findings]." |
| **Many 🟡 Warnings** | "Want me to prioritize these into a refactoring plan with estimated effort?" |
| **Security findings** | "I can generate a security-hardened version of [specific function/class] if you'd like." |
| **Documentation gaps** | "I can generate the missing docstrings/XML docs for the public API if you'd like." |
| **All 🟢 OK** | "The code looks solid. If you want, I can review additional files or do a deeper dive on [specific area]." |

Keep the offer to **one sentence, max two options**. Don't overwhelm the user with a menu. Pick the highest-impact follow-up based on the findings — PR thread discrepancies take precedence over general code findings.

---

## Output

A `code-review-report.md` artifact (or the path configured in
`.assert-iq/config.yaml > code_review.report_path`) when the report is
written to disk. When the review is delivered inline (chat, PR comment),
no file is written unless explicitly requested.

## Signals emitted

When the QI signal sink is wired, this skill emits a `code.review`
signal per run conforming to `.assert-iq/signal-schema.json`, carrying:
`scope` (`file` | `pr` | `multi_file`), `language`, `vcs_host`,
`pr_number` (when applicable), `findings_count_by_severity`
(`critical` / `warning` / `ok`), `findings_count_by_category`,
`pr_thread_reconciliation` (counts of `implemented` /
`unimplemented` / `merged_with_open` / `awaiting_response`), and
`top_findings[]` (each with `category`, `severity`, `location`,
`one_line_summary`).

## Complement with oracle grading (v1.6.0+)

This skill performs **subjective architectural and maintainability
review**. For **independent verification of test code quality** in the
reviewed PR or files, optionally run oracle grading:

```
/grade-with-rubric <changed_test>  --rubric-id=test-unit-v1.0
```

**When to use:** PR review flags test changes but quality metrics are
unclear. Oracle grading adds objective dimension scoring (assertion
clarity, independence, determinism, focus) as a complement to this
skill's subjective assessment.
