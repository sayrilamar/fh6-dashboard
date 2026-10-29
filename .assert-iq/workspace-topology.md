# Workspace topology — full contract

> Loaded on demand by skills that operate across a split prod/tests
> boundary. This file is **not** an `.instructions.md` — it does not
> auto-load into every prompt. Skills read it only when
> `.assert-iq/config.yaml > workspace.role` is `prod` or `tests`.

## When this applies

Read `.assert-iq/config.yaml > workspace.role` first.

- **`monorepo`** (default; also applies when the block is absent) —
  production code and tests live in this workspace. Stop here. No
  cross-repo behavior activates and every skill behaves exactly as it
  did before workspace topology was introduced.
- **`prod`** — this workspace holds production code; tests live in
  `workspace.companion_repo`. When a skill needs test-side signals
  (Protection layer coverage / test discovery, Trust layer flake
  history, traceability test references), fetch them via the companion.
- **`tests`** — this workspace holds the test suite; production code
  lives in `workspace.companion_repo`. When a skill needs prod-side
  signals (Change layer diff / blast radius, the code under review, the
  introducing commit for an escape, traceability code references),
  fetch them via the companion.

## Fetch fallback chain

When `companion_repo.fetch` is set, follow that single mode. When
unset, walk this chain and stop at the first that responds:

1. **MCP** — the configured VCS MCP server (`github`, `azure-devops`,
   `gitlab`, etc.) reads `companion_repo.remote`.
2. **Local path** — if `companion_repo.path` resolves to a checkout on
   disk, read files directly.
3. **Manual paste** — ask the user to paste the specific artifact
   needed (diff, coverage report, file contents). Document the gap in
   the resulting report.

## When the companion is needed but absent

If `workspace.role` is `prod` or `tests` and `companion_repo` is unset
(or all fetch attempts fail), the affected layer or signal source is
**UNGRADED** with `reason: "companion_repo_unset"` (or
`"companion_repo_unreachable"`). This is a first-class outcome under
the v0.2 signal schema (`partial_signal_mode: true`).

Do **not** fabricate the missing signal. Do **not** infer test
coverage from a prod-only checkout, or change risk from a tests-only
checkout. State the gap and continue with the remaining layers.

## Cross-repo skills

The following skills carry a workspace-topology pointer to this file.
Each names the specific layer or source that degrades to UNGRADED when
the companion is missing:

- `risk-assess-pr` — Change layer (PR diff, blast radius, churn) when
  `role=tests`.
- `check-merge` — Change on prod side; Protection + Trust on tests
  side. Verdict shifts to **discuss** rather than auto-block on any
  UNGRADED layer.
- `release-confidence` — Change when `role=tests`; Protection + Trust
  when `role=prod`. Already supports `partial_signal_mode: true`.
- `code-review` — when `role=tests`, refuse to render a verdict on
  prod-side files; ask the user to paste the files, the PR diff, or
  both.
- `check-test-coverage` — Protection layer when companion is
  unavailable; partial reports flag unresolvable source paths as
  `coverage_resolution: unresolved` rather than inferring 0%.
- `generate-traceability-matrix` — emits the matrix with the missing
  column flagged; affected rows marked `trace_state: "partial"`. Do
  **not** mark a requirement "untested" or "unimplemented" just
  because the other side isn't reachable.
- `analyze-escaped-defect` — Change layer + any Five Whys link that
  depends on prod-side evidence. Do **not** infer the introducing
  commit from test history alone.
- `generate-hotspot-map` — volatility on prod side; defect density may
  need either side depending on where component-to-code mapping lives.
