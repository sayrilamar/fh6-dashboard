# Optimization Principles

How to turn grading evidence into a better artifact. These principles apply whether you're improving a Skill, a system prompt, or project custom instructions.

---

## The core mindset

You're not patching — you're rewriting with understanding. The goal is an artifact that will work well across millions of uses, not just the 5 test cases you ran. Resist the temptation to make narrow fixes that only address your specific test failures; instead, ask: "What is the underlying communication failure here, and how do I fix it at the root?"

---

## Diagnosing from dimension scores

### Task Completion is low

The artifact isn't giving the agent a clear enough picture of what "done" looks like.

**Common causes:**
- The core directive is vague ("help the user with X" instead of "produce Y given Z")
- Success criteria are implicit rather than stated
- The artifact doesn't define the output format or structure

**Fixes:**
- Rewrite the primary instruction to name the concrete deliverable
- Add an example of what a complete, successful output looks like
- Specify what to do when the user's request is ambiguous (ask, or make a reasonable default choice)

### Output Quality is low

The artifact isn't guiding the agent on *how* to produce good output, only *what* to produce.

**Common causes:**
- No guidance on tone, depth, or format appropriate to the target user
- No examples of good vs. bad outputs
- Missing domain knowledge the agent needs to reason well

**Fixes:**
- Add a brief description of the target user and what they need from this artifact
- Include a "what good looks like" section with a concrete example or template
- Add relevant domain-specific guidance (e.g., "legal prompts should avoid definitive claims" or "use plain language, no jargon")

### Efficiency is low

The artifact is causing the agent to do unnecessary work, or failing to give it shortcuts that would help.

**Common causes:**
- Instructions describe a sequential multi-step process when parallelism is possible
- No bundled scripts for deterministic/repetitive tasks (the agent reinvents them each time)
- Excessive caveats or hedge-writing that bloat the output

**Fixes:**
- Restructure the workflow to eliminate unnecessary intermediate steps
- Bundle scripts or templates that the agent would otherwise have to write from scratch
- Trim instructions that don't pull their weight (less is often more)

### Robustness is low

The artifact breaks on anything outside the happy path.

**Common causes:**
- Instructions assume a perfect, complete user request
- No guidance on what to do when input is incomplete, ambiguous, or out-of-scope
- Near-miss cases aren't distinguished from real use cases

**Fixes:**
- Add explicit "if the user's request is incomplete, do X" guidance
- Add a "when NOT to use this" section (for skills, this goes in the description; for prompts, early in the instructions)
- Add graceful degradation paths for common failure modes

---

## General writing principles

### Explain the why

LLMs follow *reasoning* better than rules. Instead of:
> "Always include a summary section at the end."

Write:
> "Include a summary section at the end because users often scan to the bottom before reading in full — a clear summary helps them decide if they need to read the whole thing."

The second version will produce better behavior across more situations, including ones you didn't anticipate.

### Keep it lean

Every line of instruction competes for the agent's attention. Remove:
- Redundant restatements of the same point
- Caveats and warnings that apply to obvious edge cases
- Process descriptions for things the agent would do anyway
- "Note:" paragraphs that repeat what was already said

### Avoid MUST/NEVER as a crutch

If you find yourself writing "you MUST always..." it's often a sign the instruction isn't clear enough to stand on its own. Try reframing:
- "MUST include" → "Include X, because without it the user can't Y"
- "NEVER do" → "Avoid X — it causes Y problem for the user"

### Use examples strategically

A concrete example is worth three paragraphs of abstract instruction. If the same misunderstanding keeps showing up across test cases, an example will fix it faster than any rule. Format clearly:

```
**Example:**
User asks: "Can you help me with my taxes?"
Good response: [brief description of what a good response does]
Not this: [brief description of what to avoid]
```

### Generalize, don't overfit

If test case 3 failed, ask: "What *class* of inputs would trigger this failure?" Then fix the artifact to handle that class, not just that one prompt. An overfit fix makes the eval look better but the artifact worse in the real world.

---

## Iteration strategy

**Iteration 1:** Address the lowest-scoring dimension first. Usually a rewrite of the core directive plus adding concrete success criteria.

**Iteration 2:** Address output quality — add format/tone guidance and examples if they're missing.

**Iteration 3+:** At this point, gains are usually in robustness and efficiency. Fine-tune edge-case handling. Look at the transcripts, not just the grades — if agents are taking wasteful paths, the instructions may be sending them down a maze.

**Convergence:** When you're scoring above 80 and the delta between iterations is < 5, you've likely hit the ceiling for pure instruction improvement. The remaining gap is model capability, not artifact quality.

---

## For each artifact type

### Optimizing a Skill (SKILL.md)

- The **description** field (YAML frontmatter) controls triggering — optimize it separately after the body is solid
- Keep SKILL.md under ~500 lines; use `references/` for deep content
- The skill should direct, not just describe — write for an agent that needs to know what to do, not a human reading documentation
- If agents keep rewriting the same helper code across test runs, bundle it as a script in `scripts/`

### Optimizing a system prompt

- Start with a clear statement of role and purpose ("You are a X who helps Y do Z")
- Define constraints explicitly ("Always respond in [language/format/tone]")
- End with handling for out-of-scope requests ("If the user asks about X, politely explain Y")
- Keep it under ~2000 tokens; beyond that, instructions compete with each other

### Optimizing project instructions

- These sit in context at all times, so brevity matters more than with skills
- Focus on persistent behaviors that should apply to every interaction
- Separate "always do" from "sometimes do" — only put invariants in project instructions
- Avoid specific task instructions here; those belong in per-conversation prompts