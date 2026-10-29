---
applyTo: ".assert-iq/oracles/**"
description: "Oracle layer — rubric authorship and grading rules."
---

# QI Oracle Instruction

**When this applies:** When working with oracle layer files — rubric authoring, grading outcomes, verdict interpretation.

## Core Principles

1. **Rubrics are specs, not generators** — A rubric is a pre-authored acceptance contract (dimensions, levels, passing criteria). It defines "done". This is fundamentally different from generating an artifact.

2. **Grading is independent** — The grader agent has no access to generator reasoning. It sees only: artifact + rubric. This isolation is the key differentiator.

3. **Immutable rubrics, versioned evolution** — Once a rubric is created (e.g., `test-unit-v1.0`), it does not change. If you refine it, you create `test-unit-v1.1`. Old versions stay in git history.

4. **Evidence-driven verdicts** — Every verdict must include specific citations (line numbers, code excerpts, patterns). Never assert a verdict without evidence.

5. **Maturity-aware** — Oracle verdicts have different weight in decisions depending on maturity tier:
   - `early`: advisory only (0% weight in gates)
   - `mid`: optional gate (20% weight)
   - `higher`: co-decisive (50% weight)

## Rubric Authorship Rules

### Structure (applyTo: `.assert-iq/oracles/rubrics/`)

Each rubric JSON must:

- **Immutable ID** — `<artifact_type>-v<major>.<minor>` (e.g., `test-unit-v1.0`)
  - Artifact type: test, bug_report, plan, code_review, custom
  - Version: major = breaking change (new dimensions), minor = refinement (tweaked levels)
  - Never reuse an ID; versioning is cheap

- **Clear dimensions** — 3–5 independently scoreable criteria
  - Each dimension: `id`, `name`, `criterion`, `weight` (0.0–1.0), `levels` (PASS/CONDITIONAL/FAIL)
  - Criterion is the actual quality measure (not subjective opinion)
  - Levels are objective: "Steps are numbered and detailed" (PASS) vs. "Steps missing key details" (FAIL)

- **Passing criteria** — Logic for overall verdict
  - Example: "All dimensions PASS" (strictest)
  - Example: "weighted avg score >= 0.85" (allows some CONDITIONAL)
  - Never use subjective language ("looks good")

- **Metadata** — author, created_at, version, tags
  - author: who wrote this rubric (e.g., "qe-team", not a person's name for shared rubrics)
  - created_at: ISO-8601 timestamp
  - tags: e.g., ["unit-test", "automated", "acceptance-contract"]

### Rubric Quality Checklist

Before committing a new rubric:

- [ ] Does the artifact type make sense? (test, bug_report, etc. — not vague)
- [ ] Are all dimensions clear and objective?
- [ ] Does each level (PASS/CONDITIONAL/FAIL) definition make sense?
- [ ] Are weights justified? (1.0 for critical, 0.5 for nice-to-have)
- [ ] Does the passing_criteria logic match the rubric's intent?
- [ ] Would another reviewer agree with this rubric?
- [ ] Is this a major revision (new ID) or a refinement (new version of existing ID)?

### Example: Unit Test Rubric v1.0

```json
{
  "rubric_id": "test-unit-v1.0",
  "artifact_type": "automated-unit-test",
  "title": "Unit Test Acceptance Contract",
  "dimensions": [
    {
      "id": "assertion_clarity",
      "name": "Assertion clarity",
      "weight": 1.0,
      "criterion": "Each assertion documents what is being verified",
      "levels": [
        { "level": "PASS", "definition": "All assertions have messages" },
        { "level": "CONDITIONAL", "definition": "70%+ have messages" },
        { "level": "FAIL", "definition": "Bare assertions with no context" }
      ]
    }
  ],
  "passing_criteria": "All PASS, OR weighted avg >= 0.85",
  "metadata": {
    "author": "assert-iq-pack",
    "created_at": "2026-08-11T00:00:00Z",
    "version": "1.0"
  }
}
```

## Grading Rules

### Verdict Structure (applyTo: `.assert-iq/oracles/outcomes/`)

Every grading verdict must include:

- **rubric_id** — Which rubric was used (immutable reference)
- **artifact_id** — What was graded (path or identifier)
- **artifact_hash** — Content hash (SHA256) for lineage
- **verdict** — PASS / CONDITIONAL / FAIL (overall)
- **score** — 0.0–1.0 (numeric overall)
- **dimensions** — Array of per-dimension verdicts (each with id, name, weight, verdict, score, evidence)
- **summary** — 1–2 sentences on overall verdict and key findings
- **recommended_action** — "Fix artifact" / "Refine rubric" / "None"
- **graded_at** — ISO-8601 timestamp
- **grader_model** — Which model performed the grading

### Evidence Standard

For each dimension verdict, the `evidence` field must include:

- **Specific citations** — Line numbers, code excerpts, patterns found
  - ✓ "Lines 10–22 have clear messages. Line 25 is bare assert()."
  - ✗ "Some assertions are clear."
  
- **Why this level** — Reasoning that connects artifact to criterion
  - ✓ "Criterion requires messages; 3 of 4 assertions have them → CONDITIONAL"
  - ✗ "This is OK."

- **What would change the verdict** — Constructive guidance
  - ✓ "Add message to assert on line 25 → would be PASS"
  - ✗ "It's fine."

### Verdict Immutability

Once a verdict is recorded (in `.assert-iq/oracles/outcomes/<artifact_id>/history.jsonl`):

- It is append-only (never deleted or edited)
- New grades create new entries in the history
- You can compare v1 → v2 → v3 as the artifact evolves
- Full lineage is preserved: artifact_hash → rubric_id → grader_model → verdict + timestamp

### Grading Isolation

The grader agent MUST NOT:

- Reference the generator agent's reasoning or prompts
- Access prior grading verdicts (first verdict per artifact × rubric is fresh)
- Make assumptions about intent (grade only against rubric)
- Fabricate evidence (if unsure, say so in the evidence field)
- Skew verdicts toward passing (grade fairly, not favorably)

## Integration with QI Four-Layer Signal Model

Oracle verdicts feed into the **Outcome layer**:

```
Change layer:      ← Which code changed? (git diff)
  ↓
Protection layer:   ← Which tests cover it? (traceability)
  ↓
Trust layer:        ← Are the tests reliable? (flake history)
  ↓
Outcome layer:      ← How good are the tests? (oracle verdicts)
  ↓
Decision Confidence: PASS / CONDITIONAL / HOLD
```

Oracle verdicts do NOT replace the other three layers. They enhance the Outcome layer specifically.

### Weighting by Maturity

In `/check-merge` and `/release-confidence`:

```yaml
oracle_weighting:
  early:   0.0    # advisory only; no merge gate
  mid:     0.2    # 20% of Outcome layer decision
  higher:  0.5    # 50% of Outcome layer decision
```

## Governance

- **Rubrics in git** — Always commit rubric JSON. They are specifications, not secrets.
- **Outcomes local by default** — Grading results stay in `.assert-iq/oracles/outcomes/` (in .gitignore). Configure `oracle.verdict_sink` in config.yaml to post to tracker if desired.
- **No rubric auto-generation** — Rubrics are authored, not generated. This is the defensible difference.
- **Versioning over deletion** — Don't delete old rubrics. Version them. This preserves lineage and historical context.

## Maturity Notes

- **early** — Rubric authoring available; manual grading only; oracle is advisory
- **mid** — Rubric templates available; guided authoring; optional CI grading; optional gate
- **higher** — Auto-suggest rubric dimensions; auto-grade in CI; can block merges; full tracking

## Output Standards

When presenting oracle verdicts to users:

- **Lead with the verdict** — "PASS" or "CONDITIONAL" or "FAIL" first
- **Cite evidence** — Show which dimensions failed/conditional and why
- **Recommend action** — "Fix artifact" or "Refine rubric"
- **Respect maturity** — Don't overstate confidence in early/mid tier (oracle is advisory/optional)

## Oracle Verdicts & Calibration Integration (v1.7.0+)

Oracle verdicts feed into Decision Confidence Calibration:

### Recording Oracle Verdicts in Assessments

When `/risk-assess-pr` or `/release-confidence` issues a verdict, include:
- `oracle_verdicts_considered`: Array of oracle verdict IDs that informed the assessment
- Reference oracle verdicts in assumptions (e.g., "Test quality graded PASS via oracle-test-unit-v1.0")

### Escape Linkage & Feedback

When `/analyze-escaped-defect` links an escape to a prior verdict:
1. Query `.assert-iq/verdicts/archive/` to find the original verdict
2. Check if oracle was marked PASS/CONDITIONAL on graded artifacts
3. If escape contradicts oracle verdict → flag as oracle drift (add to calibration report)
4. Update verdict record with `linked_escape: {defect_id, discovery_date, layer_failure}`

### Calibration Weighting by Maturity

Oracle verdicts weigh into Outcome layer calibration:
- **early** — 0% weight (advisory only; Outcome layer ignores oracle)
- **mid** — 20% weight (optional signal; combined with escaped defects)
- **higher** — 50% weight (primary signal; oracle drift penalties apply)

### Precision Tracking

Track per-rubric precision:
- How many artifacts graded PASS later had defects?
- Per rubric ID, per dimension
- Use to adjust oracle weighting over time (if PASS verdicts have high escape rate, reduce weight)

## Further Reading

- Rubric authoring skill: `.github/skills/define-quality-rubric/SKILL.md`
- Grading skill: `.github/skills/grade-with-rubric/SKILL.md`
- Grader agent: `.claude/agents/grader.md`
- Registry & usage: `.assert-iq/oracles/README.md`
- Config: `.assert-iq/config.yaml > oracle:`
- QI foundation: `.github/instructions/qi-foundation.instructions.md`
- Calibration metrics: `.github/instructions/qi-foundation.instructions.md > Decision Confidence Calibration & Reproducibility`
