# /define-quality-rubric

**Define versioned quality rubrics** — acceptance contracts for artifacts.

| Attribute | Value |
|-----------|-------|
| **Input** | User interviews OR paste existing rubric spec |
| **Output** | `.assert-iq/oracles/rubrics/<rubric_id>.json` (saved, git-ready) |
| **Maturity gate** | All tiers (early/mid/higher) |
| **Workflow** | Discover → Structure → Validate → Version |

## What This Does

Guides you through authoring versioned quality rubrics — pre-authored acceptance contracts that define "done" for artifacts like unit tests, bug reports, or test plans.

Rubric authorship is the defensible differentiator: instead of generating artifacts that might pass, you define what "done" *looks like* ahead of time, then grade independently.

## When to Use

- **Starting with oracle grading** — Customize the default rubrics to your team's standards
- **New artifact type** — Define quality criteria for a type not in the defaults (e.g., architecture review)
- **Evolving standards** — Refine existing rubric → bump version (e.g., `test-unit-v1.0` → `test-unit-v1.1`)
- **Compliance audit** — Document your team's acceptance criteria formally

## Workflow

### 1. Discover

You tell the skill:
- What artifact type? (test, bug report, plan, code review, custom)
- What's the current pain? (e.g., "Our unit tests have weak assertions")
- What should "good" look like?

### 2. Structure

Skill interviews you through **dimensions** — independently scoreable criteria:

```
Dimension: "Assertion Clarity"
  └─ Criterion: "Each assertion documents what is being verified"
     ├─ PASS: "All assertions have inline messages"
     ├─ CONDITIONAL: "70%+ have messages"
     └─ FAIL: "Bare assertions with no context"
```

For each dimension:
- **Name** — what is being evaluated
- **Criterion** — the actual quality measure
- **Weight** — relative importance (0.0–1.0)
- **Levels** — PASS / CONDITIONAL / FAIL definitions

### 3. Validate

Skill checks:
- All dimensions covered and logically sound?
- Are the PASS/CONDITIONAL/FAIL definitions clear and objective?
- Does the rubric scale to your artifact volume?
- Any conflicting criteria?

### 4. Version & Save

Skill generates immutable rubric ID: `<artifact_type>-v<major>.<minor>`

Examples:
- `test-unit-v1.0` (initial unit test rubric)
- `bug-report-v1.1` (refined bug report rubric)
- `manual-tc-v2.0` (major revision of manual test case rubric)

Saved to `.assert-iq/oracles/rubrics/` and committed to git.

## Example Session

```
You: "I want to define what a good manual test case looks like"

Skill: "Great! Let's build the rubric. First, what's the top pain point 
        you've seen in your manual test cases?"

You: "Steps are unclear. Testers can't reproduce consistently."

Skill: "OK, so 'clarity of reproduction steps' is important. Let's 
        structure the rubric:

        Dimension 1: Clarity of Reproduction Steps
          Criterion: Steps are precise enough that any tester can follow them
          Weight: [1.0 — high importance]
          
          PASS:  'Steps numbered, include every click/keystroke, expected 
                  state at each step'
          CONDITIONAL: '80%+ steps detailed; some minor gaps'
          FAIL:  'Steps vague or missing key details'

        Any other dimensions you want to cover?"

You: "Expected vs. Actual Result. That's critical."

Skill: "Excellent. Dimension 2: Expected vs. Actual Result
        ... [builds structure]

        Ready to validate this rubric?"

You: "Yes"

Skill: "[Checks for conflicts, clarity, scale]
        Looks solid. Ready to save?"

You: "Yes"

Skill: "Saved to .assert-iq/oracles/rubrics/manual-tc-v1.0.json
        Next: Use /grade-with-rubric to evaluate test cases against this."
```

## Output Format

Rubric JSON (schema: `.assert-iq/oracles/schemas/rubric-v1.0.json`):

```json
{
  "rubric_id": "manual-tc-v1.0",
  "artifact_type": "manual-test-case",
  "title": "Manual Test Case Acceptance Contract",
  "dimensions": [
    {
      "id": "clarity_of_steps",
      "name": "Clarity of Reproduction Steps",
      "weight": 1.0,
      "criterion": "Steps are precise enough that any tester can follow them",
      "levels": [
        { "level": "PASS", "definition": "..." },
        { "level": "CONDITIONAL", "definition": "..." },
        { "level": "FAIL", "definition": "..." }
      ]
    }
  ],
  "passing_criteria": "All PASS, OR weighted avg >= 0.85",
  "metadata": {
    "author": "Your Name",
    "created_at": "2026-08-11T12:34:56Z",
    "version": "1.0",
    "tags": ["manual-test-case", "acceptance-contract"]
  }
}
```

## Integration

- **Rubric is immutable** — saved to git, not changed once created
- **New version** — if you need to refine the rubric, create a new version (v1.1, v2.0)
- **Used by** — `/grade-with-rubric` skill reads this rubric to evaluate artifacts
- **Weighted into** — `/check-merge` and `/release-confidence` consume grading verdicts in the Outcome layer

## Tips

- **Start simple** — 3–4 dimensions is usually enough
- **Weight by business value** — put 1.0 on what really matters; 0.5 on nice-to-haves
- **Define PASS strictly** — PASS should be genuinely good, not just acceptable
- **CONDITIONAL as the middle ground** — "mostly good, some gaps"
- **Versions are cheap** — don't fear v1.1, v2.0 as you learn what matters

## Maturity Notes

- **early**: Rubric authoring only; no auto-suggest
- **mid**: Access to template rubrics; guided refinement
- **higher**: Auto-suggest dimensions based on artifact analysis (optional)

## Further Reading

- Grader agent: `.claude/agents/grader.md`
- Grading skill: `/grade-with-rubric`
- Rubric registry: `.assert-iq/oracles/README.md`
- Config: `.assert-iq/config.yaml > oracle:`
- Instruction rules: `.github/instructions/qi-oracle.instructions.md`
