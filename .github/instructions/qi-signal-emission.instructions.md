---
applyTo: ".github/workflows/**, azure-pipelines.yml, **/*.gitlab-ci.yml, Jenkinsfile"
description: "CI must emit QI outcome signals in a standard schema."
---

# Signal emission instructions

**When this applies:** authoring or modifying CI configuration — GitHub
Actions workflows (`.github/workflows/**`), Azure Pipelines
(`azure-pipelines.yml`), GitLab CI (`**/*.gitlab-ci.yml`), or Jenkins
(`Jenkinsfile`). Copilot loads via `applyTo`; Claude Code: apply whenever
the user is editing pipeline definitions.

CI pipelines in this repository must emit a QI outcome payload at the end of
every test run. The payload schema is defined in `.assert-iq/signal-schema.json`.

When generating or modifying CI configuration:

1. Add a final step that publishes the outcome payload to the configured sink
   (file artifact, webhook, or telemetry endpoint per `config.yaml`).
2. The payload must include:
   - `run_id`, `commit_sha`, `branch`, `pr_id` (if applicable)
   - `change_layer`: { files_changed, services_touched, churn, late_changes }
   - `protection_layer`: { tests_executed, coverage_pct, traceability_pct }
   - `trust_layer`: { flaky_count, blocked_count, env_uptime_pct }
   - `outcome_layer`: { defects_open, escapes_30d, telemetry_alerts }
   - `decision_layer`: { release_confidence, mitigation_required }
3. Mask secrets. Never include raw stack traces with file paths from secret stores.
4. Tag the run with the maturity tier from `.assert-iq/config.yaml` so consumers
   can interpret which signals are available.

## Verdict Recording Requirements (v1.7.0+)

When `/risk-assess-pr` or `/release-confidence` emits a verdict, the CI pipeline
must record it to `.assert-iq/verdicts/archive/`:

1. **Verdict Sink Path:** `.assert-iq/verdicts/archive/YYYY/MM/verdicts-DD.jsonl`
   - Create directories if they don't exist
   - One JSON object per line (JSONL format)
2. **Required Fields in Verdict Object:**
   - `verdict_id` — UUIDv4 (use `uuidgen` or `python3 -c "import uuid; print(uuid.uuid4())"`)
   - `verdict_type` — enum: pr_risk_assessment, release_confidence, hotspot_map, other
   - `verdict_band` — enum: green, amber, red, ungraded
   - `verdict_score` — float 0.0–1.0 (predicted confidence)
   - `layer_scores` — object with change, protection, trust, outcome (each: {state, score})
   - `layer_weights` — object with normalized weights (sum ≈ 1.0)
   - `memory_version` — SHA256 hash of `.assert-iq/memory/` at verdict time
   - `issued_at` — ISO 8601 timestamp
   - `issued_by` — skill name (e.g., "risk-assess-pr")
   - `pr_id` — PR number (or null)
   - `release_id` — release tag (or null)
   - `assumptions` — array of explicit assumption strings
   - `linked_escape` — null or {defect_id, discovery_date, layer_failure}
3. **Append to Audit Trail:** Add one-line summary to `.assert-iq/verdicts/VERDICTS.md`:
   ```
   <YYYY-MM-DD HH:MM:SS UTC> | <verdict_id> | <verdict_type> | <verdict_band> | <verdict_score> | <pr_id> | <layer_summary> | <linked_escape>
   ```
4. **Update Index:** Increment `.assert-iq/verdicts/index.json` counters:
   - `verdicts_recorded`
   - `verdicts_by_band[<band>]`
   - `verdicts_by_type[<type>]`
   - If escape linked: `verdicts_with_escapes`
5. **Non-blocking:** Verdict recording must not fail the build. If sink is unreachable,
   log warning and continue.
