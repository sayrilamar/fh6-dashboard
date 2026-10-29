# Grading Rubric

This rubric applies to all artifact types (skills, system prompts, project instructions). Score each dimension 0–10, then apply weights to reach the 0–100 composite.

---

## Dimension 1: Task Completion (weight: 40%)

Does the output fully accomplish what the test prompt asked?

| Score | Meaning |
|-------|---------|
| 9–10 | Output fully addresses every part of the prompt with nothing missing |
| 7–8 | Output addresses the main request; minor gaps or omissions |
| 5–6 | Output partially addresses the prompt; significant parts missing or off-target |
| 3–4 | Output attempts the task but misses the point or produces the wrong thing |
| 1–2 | Output is largely irrelevant or fails to attempt the task |
| 0 | No usable output produced |

**What to look for:**
- Did it answer every sub-question in a compound prompt?
- Did it produce the right artifact type (file, list, analysis, etc.)?
- Did it handle all constraints the user specified?

---

## Dimension 2: Output Quality (weight: 30%)

Is the output accurate, clear, well-structured, and appropriate for the target user?

| Score | Meaning |
|-------|---------|
| 9–10 | Excellent accuracy, clarity, and structure; exactly right for the target audience |
| 7–8 | Good quality with minor issues (small factual error, slightly wrong tone, mild formatting inconsistency) |
| 5–6 | Acceptable but with noticeable issues (vague, poorly structured, mismatched tone) |
| 3–4 | Poor quality: confusing, inaccurate, or inappropriate for the audience |
| 1–2 | Very poor: misleading, garbled, or completely wrong format |
| 0 | No quality assessment possible (no output) |

**What to look for:**
- Factual accuracy of claims made
- Format appropriate for the request (e.g., structured doc vs. quick answer)
- Tone appropriate for the stated or implied target user
- Logical organization and clarity of the response

---

## Dimension 3: Efficiency (weight: 15%)

Was the reasoning path lean? Did the agent avoid unnecessary steps, redundant work, or wasted tokens?

| Score | Meaning |
|-------|---------|
| 9–10 | Minimal, direct path to the answer; no unnecessary steps or repetition |
| 7–8 | Mostly efficient with minor redundancy (e.g., one unnecessary check, slight backtracking) |
| 5–6 | Noticeable inefficiency: repeated steps, unnecessary research, or overcomplicated approach |
| 3–4 | Significant waste: wrote the same code twice, took 3 tool calls where 1 would do, long unnecessary preamble |
| 1–2 | Extremely inefficient: most of the work was unnecessary or counterproductive |
| 0 | Agent went in circles or failed to progress |

**What to look for:**
- Number of tool calls relative to task complexity
- Whether intermediate steps actually led toward the goal
- Self-correction loops (occasional is fine; frequent signals a confused agent)
- Whether the artifact's instructions caused unnecessary work

---

## Dimension 4: Robustness (weight: 15%)

Did the output handle the test case's specific challenge gracefully?

This dimension is **angle-specific** — what counts as robust depends on the test case type:

| Test angle | What robustness means |
|------------|----------------------|
| **Core intent** | Handles the task cleanly even under normal variation in phrasing |
| **Edge case** | Handles unusual/incomplete input without breaking or producing garbage |
| **Near-miss** | Correctly identifies this isn't the right use case, or gracefully scopes the response |
| **Adversarial** | Doesn't get confused by ambiguity; asks for clarification or makes a reasonable choice |

| Score | Meaning |
|-------|---------|
| 9–10 | Handles the challenge perfectly; exactly the right behavior for the test angle |
| 7–8 | Handles the challenge well with minor awkwardness |
| 5–6 | Partially handles it; some confusion or degradation in the edge/adversarial case |
| 3–4 | Mostly fails at the challenge; the artifact didn't prepare the agent for this scenario |
| 1–2 | Completely fails; the agent is confused or produces wrong output for the challenge |
| 0 | No output |

---

## Computing the composite score

```
composite = (task_completion × 4.0) + (output_quality × 3.0) + (efficiency × 1.5) + (robustness × 1.5)
```

Range: 0–100.

For a set of test cases, average the composite scores. Then compute:

```
delta = with_artifact_avg - baseline_avg
```

A healthy artifact should produce a positive delta. Zero or negative delta means the artifact may be adding noise rather than signal.

---

## Grading tips

- **Be calibrated**: a score of 7 should feel genuinely good, not mediocre. Reserve 9–10 for outputs that are excellent by any standard.
- **Cite evidence**: every score should be backed by a specific observation from the output or transcript, not just a general impression.
- **Don't conflate dimensions**: an output can be efficient (few steps) but poor quality (wrong answer). Score each independently.
- **For subjective qualities** (tone, style), anchor to the target user described in Step 1. What's appropriate for a non-technical executive is different from what's appropriate for a developer.