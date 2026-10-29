# /grade-with-rubric

**Grade artifacts independently** — evaluate against a pre-authored rubric in isolated grader context.

| Attribute | Value |
|-----------|-------|
| **Input** | `<artifact_path>` `<rubric_id>` |
| **Output** | `.assert-iq/oracles/outcomes/<artifact_id>/latest.json` (verdict) |
| **Maturity gate** | mid (optional in early; optional-gate in mid; can block in higher) |
| **Modes** | Manual | Async (CI) | Batch (preview future grades) |

## What This Does

Invokes the isolated grader agent (no access to generator reasoning) to evaluate an artifact against a rubric.

Verdict captures:
- **Overall verdict**: PASS / CONDITIONAL / FAIL
- **Per-dimension scores**: Each dimension graded independently
- **Evidence**: Specific citations and reasoning
- **Lineage**: Artifact version → Rubric ID → Grader model → Timestamp

Stored in `.assert-iq/oracles/outcomes/` (append-only history + latest).

## When to Use

- **After generating a test** — "Grade this unit test against test-unit-v1.0"
- **Before merge** — "/check-merge includes oracle verdicts if enabled"
- **Continuous feedback** — Grade in CI; post verdict as PR comment
- **Bulk preview** — Grade multiple artifacts to see before/after rubric changes
- **Compliance audit** — Generate grading report for all tests

## Workflow

### Manual Grading (Interactive)

```
You: "/grade-with-rubric tests/unit/login.test.ts test-unit-v1.0"

Skill: "[1] Reading artifact... tests/unit/login.test.ts (42 lines)
        [2] Loading rubric... test-unit-v1.0 (4 dimensions)
        [3] Spawning grader agent...
        [4] Grading in progress..."

[Grader evaluates assertion_clarity, independence, determinism, focus]

Skill: "Verdict: CONDITIONAL (0.92 / 1.0)
        
        ✓ PASS: test independence, determinism
        ⚠ CONDITIONAL: assertion clarity (line 25 bare assert)
        Summary: Test structure solid. Add message to assert on line 25.
        
        Saved to: .assert-iq/oracles/outcomes/login.test.ts/latest.json
        
        Next: Fix and re-grade, or update rubric."
```

### Async Grading (CI)

CI config includes:
```yaml
- name: Grade artifacts
  run: |
    copilot-agent-cli grade-with-rubric \
      --artifact-path tests/unit/**/*.test.ts \
      --rubric-id test-unit-v1.0 \
      --post-verdict github  # posts verdict as PR comment
```

### Batch Preview (Future-Proofing)

```
You: "/grade-with-rubric tests/ --rubric-id test-unit-v1.1-draft"

Skill: "[Batch grading 47 unit tests against test-unit-v1.1-draft]
        
        PASS:  32 tests (68%)
        CONDITIONAL: 13 tests (28%)
        FAIL:  2 tests (4%)
        
        Top fixes needed:
        - Assertion clarity: 23 tests need messages
        - Independence: 5 tests have setup issues
        
        Ready to adopt v1.1 as standard? Review the failures first."
```

## Output Format

Verdict JSON (stored in `.assert-iq/oracles/outcomes/<artifact_id>/latest.json`):

```json
{
  "rubric_id": "test-unit-v1.0",
  "artifact_id": "tests/unit/login.test.ts",
  "artifact_hash": "sha256:abc123...",
  "verdict": "CONDITIONAL",
  "score": 0.92,
  "dimensions": [
    {
      "id": "assertion_clarity",
      "name": "Assertion clarity",
      "weight": 1.0,
      "verdict": "CONDITIONAL",
      "score": 0.67,
      "evidence": "Lines 10–22 have clear messages. Line 25 is bare assert(). 67% clarity."
    },
    {
      "id": "independence",
      "name": "Test independence",
      "weight": 0.8,
      "verdict": "PASS",
      "score": 1.0,
      "evidence": "beforeEach() fixture used. No shared state. Isolated."
    },
    {
      "id": "determinism",
      "name": "Test determinism",
      "weight": 0.9,
      "verdict": "PASS",
      "score": 1.0,
      "evidence": "No sleep(), no floating-point, no external dependencies."
    },
    {
      "id": "focus",
      "name": "Test focus",
      "weight": 0.7,
      "verdict": "PASS",
      "score": 1.0,
      "evidence": "3 assertions, all for login success path. Single scenario."
    }
  ],
  "summary": "Test structure and independence solid. Assertion comments incomplete on line 25. Recommend: add message to bare assert().",
  "recommended_action": "Fix artifact",
  "graded_at": "2026-08-11T12:34:56Z",
  "grader_model": "claude-opus-5"
}
```

History (append-only):

```
.assert-iq/oracles/outcomes/login.test.ts/history.jsonl
  └─ Line 1: First grade (artifact v1, rubric v1.0)
  └─ Line 2: Re-grade after fix (artifact v2, rubric v1.0)
  └─ Line 3: Re-grade against new rubric (artifact v2, rubric v1.1)
```

Every line is a complete verdict JSON (newline-delimited JSON).

## Integration

### In /check-merge

Oracle verdicts contribute to Outcome layer:

```
Change layer:    Files touched, churn, dependencies
Protection layer: Tests covering touched code
Trust layer:     Test flake history, signal health
Outcome layer:   ← Oracle verdicts (weighted by maturity tier)
    ↓
Decision: PASS / CONDITIONAL / HOLD
```

Maturity weighting:
- `early`: Oracle is advisory only (0% weight)
- `mid`: Oracle is optional gate (20% weight)
- `higher`: Oracle can block merge (50% weight)

### In /release-confidence

Similar: oracle verdicts on test suite quality feed into release decision confidence.

## Verdict Sink

Oracle verdicts can be posted to your tracker:

```yaml
oracle:
  verdict_sink: "github"  # posts as PR comment
  verdict_sink: "ado"     # posts as work-item update
  verdict_sink: "jira"    # posts as comment
  verdict_sink: "local"   # stays local (default)
  verdict_sink: "none"    # disabled
```

## Tips

- **Grade early, often** — Grading after generation gives fast feedback
- **Batch preview before policy change** — Batch-grade with new rubric to see impact
- **Compare versions** — Grading same artifact against v1.0 and v1.1 shows which dimensions changed
- **Keep history** — `.jsonl` history shows progress and rubric evolution
- **Share rubrics, not artifacts** — Rubrics are git-safe; outcomes stay local by default

## Maturity Notes

- **early**: Manual grading only; advisory verdict; no CI integration
- **mid**: Manual + optional CI; optional gate; optional tracking post
- **higher**: Auto-grade in CI; can block; full tracking integration; batch preview

## Further Reading

- Rubric authoring: `/define-quality-rubric`
- Grader agent: `.claude/agents/grader.md`
- Rubric registry: `.assert-iq/oracles/README.md`
- Integration: `.github/skills/check-merge/SKILL.md`, `.github/skills/release-confidence/SKILL.md`
- Config: `.assert-iq/config.yaml > oracle:`
- Instruction rules: `.github/instructions/qi-oracle.instructions.md`
