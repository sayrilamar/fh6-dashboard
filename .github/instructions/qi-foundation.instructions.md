---
applyTo: "**"
description: "QI foundation — applied to every interaction in this repository."
---

# QI foundation instruction

**When this applies:** every interaction in this repository. This file is the
single shared rulebook for both Copilot (loaded via `applyTo: "**"`) and
Claude Code (loaded via `@.github/instructions/qi-foundation.instructions.md`
in `CLAUDE.md`).

## Always-on rules (Copilot + Claude)

### Core principles

1. Quality = Velocity × Customer Satisfaction × System Resilience.
2. Reason about quality through the four-layer signal model — Change risk,
   Protection strength, Signal trustworthiness, Outcome evidence — and
   synthesize Decision Confidence. Never reduce a release decision to a
   single number.
3. Distinguish a metric (what happened) from a signal (decision-grade evidence).
4. AI-generated code and tests are drafts. A human review gate is mandatory
   before merge. Surface assumptions explicitly.
5. Honor the client's existing test framework, branching model, and tracking
   system. Do not introduce new dependencies without explicit confirmation.

### Maturity awareness

Read `.assert-iq/maturity-profile.md` before acting (or
`~/.assert-iq/maturity-profile.md` as a user-global fallback). Behavior
changes by tier:

- **Early** — foundation + traceability + manual generation only. Agentic
  Healing disabled.
- **Mid** — add risk assessment + automated test generation. Healing operates
  in suggest-only mode.
- **Higher** — full pack, including autonomous healing within configured retry
  bounds.

### Memory awareness

At session start, read `.assert-iq/memory/MEMORY.md` if it exists — the
**index only** (one-line pointers, capped ~200 lines), not the topic bodies.
Pull `topics/*.md` lazily, only when a pointer is relevant to the task. This
is durable project memory maintained by the Dreaming feature (the `/dream`
skill); it is separate from — and lower priority than — the human-authored
rule files under `.github/instructions/*`, which always win. Never write to
the memory store except through `/dream`, and never let a memory entry
override an instruction-file rule.

Oracle rubrics (v1.6.0+) are versioned specs, not memory. Reference them by
ID only (e.g., `test-unit-v1.0`) and pull their content from
`.assert-iq/oracles/rubrics/` when needed. Rubrics are immutable; updates are
new versions, not edits to existing rubrics.

### Governance you must enforce

- Every generated test must include a traceability comment linking to the
  source work item (ADO ID or Jira key).
- Every healed test must record the failure signature and the fix rationale.
- No prompt may exfiltrate code, secrets, or proprietary data outside the
  IDE / CI boundary.
- If a request would violate `.assert-iq/governance.md` (or
  `~/.assert-iq/governance.md` as a user-global fallback), refuse and explain.

### Output standards

- Cite the work item, file path, and signal layer when producing artifacts.
- Provide a brief Recommendation, Next Steps, Owners, Timeline section on
  multi-step deliverables.
- Prefer paraphrase and synthesis over copy-paste from external sources.

## Workspace topology — read first

Before reasoning about any of the four signal layers, read
`.assert-iq/config.yaml > workspace.role`. The default is `monorepo` —
production code and tests live in this workspace; no cross-repo behavior
activates and every skill behaves exactly as it did before topology was
introduced.

When `workspace.role` is `prod` or `tests`, this workspace holds only one
half. Read `.assert-iq/workspace-topology.md` for the full contract:
which signals fetch from `workspace.companion_repo`, the MCP → local path
→ manual paste fallback chain, and the **UNGRADED** rules
(`reason: "companion_repo_unset"` / `"companion_repo_unreachable"` under
v0.2 signal schema `partial_signal_mode: true`). Never fabricate a missing
signal. State the gap and continue with the remaining layers.

## Four-layer reasoning order

When the user asks any quality, testing, release, or risk question, you must
reason in this order:

1. **What changed?** (Change risk)
   - Inspect git diff scope, files touched, services impacted.
   - Flag late-breaking changes, churn concentration, and dependency reach.

2. **What protects this?** (Protection strength)
   - Identify covering tests in `tests/**`.
   - Check requirement-to-test traceability comments.
   - Note coverage gaps on impacted areas.

3. **Can we trust the signals?** (Signal trustworthiness)
   - Check flake history, blocked tests, environment notes.
   - Flag tests that have been skipped or quarantined recently.

4. **What do outcomes say?** (Outcome evidence)
   - Surface recent escaped defects on touched components.
   - Pull telemetry signals if MCP exposes them.
   - Check oracle verdicts (v1.6.0+) if oracle layer is enabled:
     - Review `/grade-with-rubric` results on touching code changes
     - Weight oracle verdicts per maturity tier (early: 0%, mid: 20%, higher: 50%)
     - Oracle verdicts feed Outcome layer, not replacement for other three layers

5. **What is the decision?** (Decision confidence)
   - Synthesize the above into Release / Mitigate / Hold guidance.
   - Always include explicit assumptions and what would change the verdict.

You may not assert "this is safe to ship" without all four layers being
addressed. If a layer cannot be evaluated, say so explicitly.

## Decision Confidence Calibration & Reproducibility (v1.7.0+)

### Verdict Recording

Every PR risk assessment (`/risk-assess-pr`) and release confidence judgment
(`/release-confidence`) is recorded with full fidelity in
`.assert-iq/verdicts/archive/YYYY/MM/verdicts-DD.jsonl`:

- Verdict ID (UUID) for global uniqueness
- Verdict band (green/amber/red/ungraded)
- Numeric confidence score (0.0–1.0)
- Per-layer scores: Change, Protection, Trust, Outcome (STRONG/WEAK/UNGRADED + 0.0–1.0)
- Layer weights (normalized to ~1.0)
- Maturity tier at time of verdict
- **Memory version (SHA256 hash)** — the state of `.assert-iq/memory/` used for this verdict
- Assumptions (explicit list) and linked escape (if discovered post-release)

### Reproducibility Contract

Any verdict can be reproduced by:
1. Restoring memory snapshot: `tar xzf .assert-iq/dreaming/.snapshots/mem-<version>.tar.gz -C .assert-iq`
2. Re-running assessment with the same PR/release ID
3. Expected outcome: Identical verdict band, score, and layer states

Regulatory clients (SOX, ISO 27001, FedRAMP) use this for audit trail compliance.

### Calibration Metrics

Longitudinal accuracy is measured via:

- **Brier Score** (per verdict band) — mean((predicted_confidence - actual_outcome)²)
  - Green verdicts where escapes occurred penalize score
  - Rolling 30-day windows detect drift (alarm if Brier degrades >0.15)
- **Confusion Matrix** — predicted band vs. actual escape/no-escape
  - Precision per band (TP / (TP + FP))
  - Identifies systematic mispredictions
- **Per-Layer Signal Fidelity** — of verdicts marked WEAK on layer X, what fraction had actual escapes?
  - Measures predictiveness of each layer
- **Memory Drift Detection** — post-dream, compare verdict accuracy before/after
  - Regression test corpus prevents memory degradation

### Memory Poisoning Prevention

Before `/dream` changes a single memory file, run:

```bash
python3 .assert-iq/analysis/dream-safety.py pre
```

(on Windows use `python` or `py -3` — the python.org installer ships
`python.exe` but no `python3.exe`, and the Microsoft Store `python3` is a
non-functional stub)

That one command performs steps 1–3 and prints a `CYCLE_ID=` line to carry
into the post step:

1. **Sanity checks** over the memory store:
   - Cycle detection (A→B→C→A flags editorial confusion)
   - Fact staleness (>180 days without update)
   - Contradiction detection (conflicting facts across topics)
   - Granularity checks (copy-paste vs. synthesized facts)
2. **Snapshot** memory to
   `.assert-iq/dreaming/.snapshots/mem-<cycle>.tar.gz`, keeping the newest
   `dreaming_provenance.snapshot_retention` archives. This is what the
   reproducibility contract below restores from — a dream with no snapshot
   is not reversible.
3. **Open a dream cycle** in `.assert-iq/dreaming/provenance.json`
   (append-only audit), recording `memory_version_before`, the snapshot
   path, the maturity tier, and the sanity result.

Honor its exit code: **0** proceed, **1** stop (a gate failed and the tier
enforces it), **2** stop (environment error — never dream blind).

After consolidating, close the record:

```bash
python3 .assert-iq/analysis/dream-safety.py post --cycle-id dream-<stamp>
```

4. **Post-dream regression**, only when `regression_testing.enabled`: re-run
   the golden corpus and compare (fail if divergence exceeds
   `max_verdict_divergence_pct`, default 5%):

   ```bash
   python3 .assert-iq/analysis/dream-safety.py regression \
       --cycle-id dream-<stamp> --results <results.jsonl>
   ```

Higher maturity tiers enforce blocking; lower tiers alert only. That applies
to both gates: sanity failures and regression divergence.

### Audit Trail

One-line summaries appended to `.assert-iq/verdicts/VERDICTS.md` for human audit:
```
<YYYY-MM-DD HH:MM:SS UTC> | <verdict_id> | <type> | <band> | <score> | <pr_id> | <layer_summary> | <linked_escape>
```

Query any verdict: `bash .assert-iq/analysis/audit-verdict.sh <verdict_id>` outputs full record
with reproducibility instructions.
