# Oracle Layer Registry

This directory holds **versioned rubrics** (specifications of correctness) and **grading outcomes** (results of independent evaluation).

## Structure

- `rubrics/` — Acceptance contracts (JSON). One per artifact type. Versioned by ID.
- `outcomes/` — Grading results and lineage. Path: `<artifact_id>/latest.json` and `<artifact_id>/history.jsonl`.
- `schemas/` — JSON Schema definition (`rubric-v1.0.json`) for validating all rubrics.

## Quick Start

**Author a rubric:**
```
/define-quality-rubric
```
Guided interview → structured rubric → versioned JSON → git commit

**Grade an artifact:**
```
/grade-with-rubric <artifact_path> <rubric_id>
```
Isolated grader evaluates artifact against your rubric → PASS/CONDITIONAL/FAIL + evidence

**View grading outcome:**
```
.assert-iq/oracles/outcomes/<artifact_id>/latest.json         # most recent verdict
.assert-iq/oracles/outcomes/<artifact_id>/history.jsonl       # full history
```

## Rubric Versioning

Rubrics are immutable. Rubric ID format: `{artifact_type}-v{major}.{minor}`

Example: `test-unit-v1.0`

**If you need to change a rubric:**
1. Refine the rubric dimensions/levels (make it clearer, stricter, more lenient)
2. Save as a new version: `test-unit-v1.1`
3. Old rubric stays in git history
4. New version is used for future gradings

## Grading Lineage

Every grading verdict is versioned:

```
Artifact (content_hash)
  → Rubric (ID + version)
    → Grader (model + version)
      → Verdict (PASS / CONDITIONAL / FAIL)
        → Evidence (per-dimension scores + commentary)
          → Timestamp + Audit Trail
```

All stored in `.assert-iq/oracles/outcomes/<artifact_id>/history.jsonl` (append-only log).

## Example: Unit Test Rubric

See `rubrics/test-unit-v1.0.json` — defines dimensions like "assertion clarity", "test independence", "determinism".

Dimensions are weighted (importance) and scored (PASS/CONDITIONAL/FAIL).

## Integration with QI

Oracle verdicts feed into the **Outcome layer** of the QI four-layer signal model:

- `/check-merge` — Oracle verdicts contribute to pre-merge gate decision
- `/release-confidence` — Oracle verdicts contribute to release go/no-go

Weighting per maturity tier:
- `early`: 0% (oracle is advisory only)
- `mid`: 20% (informational)
- `higher`: 50% (co-decisive)

## Safety

- Rubrics are safe to commit to git (no secrets, PII-free)
- Grading outcomes are local by default
- Configure `oracle.verdict_sink` in `.assert-iq/config.yaml` to post verdicts to GitHub/Jira if desired
- Grader model is configurable in `.assert-iq/config.yaml`

## Further Reading

- Full guide: `oracles-readme.html`
- Quick start: `ORACLE_QUICK_START.md`
- Configuration: `.assert-iq/config.yaml > oracle:`
- Instruction rules: `.github/instructions/qi-oracle.instructions.md`
