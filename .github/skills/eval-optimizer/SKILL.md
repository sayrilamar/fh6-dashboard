---
name: eval-optimizer
description: >
  Evaluate and automatically optimize any AI instruction artifact — a Skill
  (SKILL.md), system prompt, Claude project custom instructions, or any block
  of AI directives. Runs an iterative eval-and-improve loop and delivers an
  optimized final version plus a report.
  WHEN: eval this skill, optimize my instructions, improve this system
  prompt, benchmark prompt quality, run evals, how effective is this.
  Do NOT trigger for "just give me feedback" or "review this writing"
  without explicit optimization intent — provide qualitative feedback instead.
---

# Eval Optimizer

You take any AI instruction artifact and run it through a fully automated eval-and-optimize loop, iterating until it reaches peak effectiveness, then deliver the final optimized version plus a complete report.

Instruction quality is measurable. You test it, score it, find weak spots, improve it, and re-test to verify the improvement. This skill automates the cycle end-to-end.

**Supported artifact types:**
| Type | Examples | Primary success mode |
|------|----------|---------------------|
| Skills | SKILL.md files | Task completion — does the agent do the right thing? |
| System prompts | Background AI context | Output quality — is behavior consistent and appropriate? |
| Project instructions | copilot-instructions.md, .instructions.md | Output quality — does it shape all interactions correctly? |
| Prompt templates | Reusable prompts with placeholders | Task completion — does it produce the right deliverable? |
| Agent configs | .agent.md, AGENTS.md | Task completion + robustness — does it handle its full scope? |

---

## Step 0: Scope check

Determine what the user actually wants before entering the loop.

| User signals | Route to | Action |
|---|---|---|
| "eval", "optimize", "benchmark", "improve", "run evals", "iterate", mentions scores/targets | **Full loop** | Proceed to Step 1 |
| "what do you think", "review this", "give me feedback", "is this well-written?", explicitly declines optimization | **Quick feedback** | Deliver 5-dimension assessment (below) |
| Mixed signals or ambiguous ("evaluate this" without context) | **Disambiguate** | Ask: "Quick qualitative review, or full eval-optimize loop with test cases and iterations?" |
| No explicit eval/optimize language | **Default: quick feedback** | Don't assume the heavy path |

**Quick feedback** — 5-dimension structured assessment:
1. **Purpose clarity** — Is core intent obvious to the agent that will follow it?
2. **Structure** — Logical flow? Well-scoped sections? Navigable?
3. **Edge-case coverage** — Handles failure modes, ambiguity, scope boundaries?
4. **Consistency** — Voice, format, level of detail consistent throughout?
5. **Top 3–5 improvements** — Ranked by impact, specific and actionable

Then offer: "Want me to run the full eval-optimize loop to measure actual performance?"

**Partial service** for constrained requests:
- Evaluation only → Steps 1–6, skip optimization
- Single-pass → One iteration, deliver immediately
- Iteration cap → Honor it, note remaining potential

---

## Step 1: Understand the input

Read the artifact. Extract:

| Field | What to identify |
|-------|-----------------|
| Core purpose | What task/behavior does this enable? |
| Target user | Who triggers it? What would they ask? |
| Success criteria | What does excellent output look like? |
| Complexity | Simple (< 5 directives / 10 lines), medium (10–200 lines), complex (200+) |
| Type | From the supported types table above |

Summarize in 2–3 sentences. Confirm with user before proceeding.

### Minimal artifacts (< 5 directives or 10 substantive lines)

> "This is very brief — optimization will be building it out, not refining it. Want me to proceed (first iteration expands), or draft a fuller version for review first?"

**Expansion interview** (if they want one):
1. 3–5 most common inputs this should handle?
2. What format/structure should outputs follow?
3. What happens when input is ambiguous or out-of-scope?
4. Target audience?

After expansion, verify the expanded artifact has ≥ 5 distinct directives before re-entering at Step 2. If it doesn't, ask one more targeted question to fill the gap.

If user says "just optimize what's there" → proceed, note brevity constraint in report.

### Contradictory constraints

Surface with consequences:
> "Tension between [A] and [B]:
> - [A] means [consequence X]
> - [B] means [consequence Y]  
> Which matters more?"

**Contradictions always block** — even if the user specified an iteration cap or requested single-pass. Resolve contradictions first, then honor the cap within the resolved scope. Unresolved contradictions compound every downstream step.

---

## Step 2: Generate test cases

Create **5 diverse test prompts**:

| Angle | # | Tests |
|-------|---|-------|
| Core intent | 2 | Primary job — does it work for intended use? |
| Edge case | 1 | Unusual/incomplete input, atypical-but-valid |
| Near-miss | 1 | Looks triggerable but shouldn't be, or overfitting risk |
| Adversarial | 1 | Ambiguous, conflicting, graceful-degradation needed |

**Calibrate to complexity:**
- Simple → Can it guide even basic cases better than no guidance?
- Medium → Scope boundaries and format adherence
- Complex → Subsystem interactions and priority conflicts

**Quality bar:** Realistic (real user phrasing), specific (unambiguous grading), diverse (genuinely different capabilities), proportionate (adversarial ≠ impossible).

**Test-case regeneration:** If optimization changes scope > ~30%, regenerate tests. Note this in iteration report.

```json
{
  "artifact_name": "name",
  "artifact_type": "skill",
  "evals": [
    {
      "id": 1,
      "name": "core-intent-standard",
      "prompt": "Multi-sentence realistic user prompt",
      "expected_output": "What great looks like",
      "angle": "core",
      "expectations": ["Verifiable assertion 1", "Verifiable assertion 2"],
      "files": []
    }
  ]
}
```

---

## Step 3: Run evaluations

For each test case, produce two outputs:

**With-artifact:** Apply the artifact's instructions/context when completing the prompt.
- Skills → follow SKILL.md
- System prompts → operate under the prompt (tests are user messages)
- Project instructions → instructions active during completion

**Baseline:** Same prompt, no artifact. Raw model capability.
- System prompts baseline: generic "You are a helpful assistant" or no system prompt

**Execution:** Use what's available — subagents, sequential runs, or analytical evaluation. Method doesn't affect validity; honest assessment does.

**No baseline possible?** Grade with-artifact against assertions only. Note omission in report.

Save to: `<workspace>/iteration-<N>/<eval-name>/with_skill/` and `without_skill/`

---

## Step 4: Draft assertions

For each test case, draft grading criteria that are:
- **Specific**: "Includes ≥ 3 findings with severity ratings" not "is good"
- **Observable**: Grader can point to evidence
- **Proportionate**: Rubric-style for subjective artifacts

Update `evals/evals.json` expectations.

---

## Step 5: Grade outputs

### Weights by artifact type

| Dimension | Skills | System Prompts | Project Instructions | Prompt Templates |
|-----------|--------|----------------|---------------------|-----------------|
| Task Completion | **45%** | 35% | 35% | **45%** |
| Output Quality | 25% | **35%** | **35%** | 25% |
| Efficiency | 15% | 15% | 15% | 15% |
| Robustness | 15% | 15% | 15% | 15% |

*Rationale:* Skills/templates are task-oriented (did it produce the right thing?). Prompts/instructions shape ongoing behavior (is quality consistent?).

### Scoring scale

| Score | Task Completion | Output Quality | Efficiency | Robustness |
|-------|----------------|----------------|------------|------------|
| 9–10 | Everything addressed | Excellent in all aspects | Direct, no waste | Perfect handling |
| 7–8 | Main request done, minor gaps | Good, minor issues | Mostly lean | Handles well |
| 5–6 | Partially done, significant gaps | Acceptable, noticeable issues | Some waste | Partial handling |
| 3–4 | Attempts but wrong direction | Poor, confusing | Significant waste | Mostly fails |
| 1–2 | Irrelevant | Misleading/garbled | Circular/lost | Complete failure |

### Angle-specific rules

- **Core**: Standard high bar on all dimensions
- **Edge**: Robustness weighted toward graceful handling of unusual input
- **Near-miss**: Correctly declining IS task completion. Don't penalize scope awareness.
- **Adversarial**: Graceful degradation > pretending to succeed

### Evidence quality

Every score needs evidence. Good evidence is:
- **Quotable**: Points to specific output passages or behaviors
- **Comparative**: "Did X instead of Y" or "included A but missed B"
- **Proportionate**: 1–2 sentences for scores 7+, more detail for low scores explaining what went wrong

Example good evidence: "Output included 4 of 5 requested sections (Purpose, Risks, Approach, Exit Criteria) but omitted Dependencies, which was explicitly mentioned in the prompt."

Example bad evidence: "Output was good." (Not grounded. Doesn't enable diagnosis.)

### Mid-loop discovery

If grading reveals problems not visible at intake (hidden contradictions, scope drift, misunderstanding): pause, surface to user, ask whether to continue with adjusted understanding or restart.

### Grading output

Save `grading.json`:
```json
{
  "test_cases": [
    {
      "id": 1,
      "name": "core-intent-standard",
      "with_skill": {
        "task_completion": {"score": 8, "weight": 0.45, "weighted": 36.0, "evidence": "Quotable evidence..."},
        "output_quality": {"score": 7, "weight": 0.25, "weighted": 17.5, "evidence": "..."},
        "efficiency": {"score": 9, "weight": 0.15, "weighted": 13.5, "evidence": "..."},
        "robustness": {"score": 7, "weight": 0.15, "weighted": 10.5, "evidence": "..."},
        "composite_score": 77.5
      },
      "baseline": { "...same structure..." }
    }
  ],
  "aggregate": {
    "with_skill_avg": 0,
    "baseline_avg": 0,
    "delta": 0,
    "weakest_dimensions": [],
    "top_3_weaknesses": []
  }
}
```

---

## Step 6: Report

Write `report.md`:

```markdown
# Iteration N Report

## Scores
| Metric | With Skill | Baseline | Delta |
|--------|-----------|----------|-------|
| Composite Average | X | Y | ±Z |

## Per-Dimension Averages
| Dimension | Score | Notes |
|-----------|-------|-------|

## Best/Worst Cases
## Top 3 Weaknesses (with evidence)
## Changes from Previous Iteration
```

Communicate: "Iteration N: X vs baseline Y (Δ+Z). Findings: [...]. Generating improved version."

---

## Step 7: Optimize

Target weakest dimensions:

| Weak | Root Cause | Fix |
|------|-----------|-----|
| Task Completion | Unclear "done" criteria | Add deliverables, output examples, definition of done |
| Output Quality | Underspecified format/tone | Add audience, templates, good/bad examples |
| Efficiency | Causes unnecessary work | Trim, consolidate, add shortcuts, early-exit paths |
| Robustness | Edge cases unhandled | Scope boundaries, degradation paths, ambiguity handling |

**Principles:** Explain why > state rules. Keep lean. Generalize from failures. Examples > abstractions. Consequences > MUST/NEVER.

**Changelog prefix:**
```
<!-- Iteration N changes:
- [Change]: [Reasoning from grading evidence]
-->
```

Save to `<workspace>/iteration-<N>/optimized_artifact.md`.

### Self-check before saving

Before finalizing the optimized artifact, verify:
- Does every new addition address a specific grading weakness? (No speculative additions)
- Is the artifact still shorter than 150% of the previous version? (Resist bloat)
- Would removing any section cause a test case score to drop? (Every line earns its keep)

---

## Step 8: Convergence

| Condition | Action |
|-----------|--------|
| Delta ≥ 5 points | Continue. Optimized → next input. Baseline stays original. |
| Delta < 5 points | Converged. Stop and deliver. |
| User cap reached | Stop. Note remaining trajectory. |
| Max 6 iterations | Hard stop. Remaining gaps = model ceiling. |
| Scope changed > 30% | Regenerate tests before next iteration. |

---

## Step 9: Deliver

**1. Optimized artifact** — Final version, workspace root.

**2. Eval report** (`eval_report.md`):
- Score trajectory table
- Per-iteration changes and reasoning
- Final dimension breakdown
- Remaining weaknesses
- Next steps

**3. History** (`history.json`):
```json
{
  "artifact_name": "name",
  "artifact_type": "skill",
  "iterations": [
    {"version": "original", "composite_score": 52, "delta": null, "converged": false},
    {"version": "iteration-1", "composite_score": 67, "delta": 15, "converged": false}
  ],
  "final_score": 76,
  "total_iterations": 3,
  "converged": true
}
```

**Summary:** "Your [artifact] went from X to Y over N iterations. Biggest gains: [changes]. Remaining gap: [Z]."

---

## Worked examples

### Example A: System prompt optimization

```
Input: 30-line system prompt for a code review bot.
Step 0: User said "optimize" → full loop.
Step 1: Purpose=code review, Target=developers, Complexity=medium, Type=system prompt.
Step 2: Tests: "review this function" (core), "review this 500-line file" (core),
        "review this snippet without full context" (edge), "write unit tests" (near-miss),
        "review but ignore security" (adversarial).
Step 3: With prompt: follows tone/format. Without: generic responses.
Step 5: With-skill 68, Baseline 52. Δ+16. Weakest: Robustness (5) — tried to write tests
        on near-miss instead of declining.
        Weights used: OQ 35% (system prompt type), so quality consistency matters more.
Step 7: Added scope boundary, format template, partial-file guidance.
Step 8: Re-grade: 81 (Δ+13). Continue. It-2: 85 (Δ+4). Converged.
Final: 52 → 68 → 81 → 85.
```

### Example B: Minimal artifact expansion

```
Input: "Be helpful. Answer Python questions."
Step 0: User said "run evals" → full loop.
Step 1: Complexity=simple (2 lines, < 5 directives). Offered expansion.
        User chose "just optimize what's there."
Step 2: Tests calibrated to simple artifact — probe whether ANY guidance value exists.
Step 5: With-skill 45, Baseline 48. Δ-3! Artifact is so vague it's slightly harmful.
Step 7: Expanded to 25 lines: added scope (Python only), format (code blocks + explanation),
        edge handling (say when unsure), decline non-Python.
        Verified expansion has ≥ 5 directives before proceeding.
Step 8: Re-grade: 72 (Δ+24). Continue. It-2: 79 (Δ+7). It-3: 82 (Δ+3). Converged.
Note in report: started below baseline — artifact was actively harmful until expansion.
```

### Example C: Near-miss routing

```
Input: User says "what do you think of my skill? Is it well-organized?"
Step 0: No eval/optimize language. "What do you think" = quick feedback. Route to feedback.
Deliver: 5-dimension assessment (Purpose: 8/10, Structure: 6/10 — sections overlap,
         Edge coverage: 4/10 — no failure handling, Consistency: 7/10, Improvements: [3 items]).
Offer: "Want the full eval loop?" User says "no thanks" → done.
```

### Example D: Adversarial — contradictory constraints with iteration cap

```
Input: User says "optimize my 400-line skill to under 50 lines, hit 95+ score,
       don't change the core behavior, max 1 iteration."
Step 0: "optimize" + "hit 95+" → full loop.
Step 1: Extract purpose, confirm. Detect contradictions:
        - "Under 50 lines" vs. "handles 12 scenarios" (brevity vs. coverage)
        - "Hit 95+" vs. "don't change core behavior" (improvement vs. preservation)
        Surface both: "These are in tension. Which priority order?"
        [Contradictions block even though user said max 1 iteration — resolve first]
        User says: "Coverage > brevity. You can change structure but keep all 12 scenarios."
        Revised scope: compress/restructure, keep all scenarios, 1 iteration.
Step 2: Tests probe whether all 12 scenarios still work post-compression.
Step 5: Grade compressed version. If it lost scenarios → TC drops.
Step 7: Optimize: restructure into tables, remove redundancy, merge similar scenarios.
        Self-check: Is it < 150% of previous? (Here: targeting much shorter, so check passes.)
Step 8: User cap = 1 iteration. Deliver with note:
        "Achieved X score in 1 pass. Trajectory suggests 2-3 more iterations could reach Y.
        Remaining gap: [specific scenarios that lost fidelity in compression]."
```

### Example E: Skill-type with TC 45% weighting

```
Input: 80-line skill for generating test plans.
Step 0: "eval and improve" → full loop.
Step 1: Purpose=generate test plans, Target=QA leads, Complexity=medium, Type=skill.
Step 5: Using skill weights (TC 45%, OQ 25%, Eff 15%, Rob 15%):
        Test 1 (core): TC=9 (produces complete test plan), OQ=7 (format OK but missing 
        risk matrix), Eff=8, Rob=7. Composite = 9×4.5 + 7×2.5 + 8×1.5 + 7×1.5 = 81.0
        Note: If this were project instructions (TC 35%, OQ 35%), same scores would yield:
        9×3.5 + 7×3.5 + 8×1.5 + 7×1.5 = 78.5 — the type-specific weights reflect what
        matters most for that artifact's purpose.
Step 7: OQ was weakest → added risk-matrix template and format specification.
```

---

## Reference files

These contain deeper guidance beyond what's inlined above. The SKILL.md is self-sufficient for standard use, but consult these for nuanced edge cases or when grading judgments are borderline:

- `references/grading-rubric.md` — Extended scoring examples per dimension, guidance for borderline scores, artifact-type-specific grading notes
- `references/optimization-principles.md` — Iteration strategy, diagnosing from dimension patterns, writing principles for instruction artifacts, when to use examples vs. rules
