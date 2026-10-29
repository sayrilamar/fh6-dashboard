---
name: dream
mode: agent
description: "Dreaming — offline memory consolidation. Read recent session logs + transcripts and existing memory, resolve contradictions, prune stale entries, dedup, and rewrite the .assert-iq/memory/ store, keeping MEMORY.md under its index cap. WHEN: dream, dream now, consolidate memory, run a dream pass, clean up agent memory, memory got noisy after a refactor, prune stale memory."
---

<!-- markdownlint-disable MD033 -->

# Dreaming — Memory Consolidation Pass

You are performing an **offline consolidation pass** over this project's
markdown memory. Memory alone accumulates contradictions, stale references,
duplicates, and relative-date rot; dreaming is the second-derivative process
that keeps it decision-grade — *memory improving memory*.

Your only writable surface is the memory store (default
`.assert-iq/memory/`, or `dreaming.memory_dir` from `.assert-iq/config.yaml`).
You may READ session logs, transcripts, and the current repo state, but you
**must not modify any file outside the memory store** — source, config, and
especially the `.github/instructions/*` rule files are read-only.

## 0. Preflight — maturity, gate, lock

1. **Read `.assert-iq/maturity-profile.md` and `.assert-iq/config.yaml`.**
   Honor `dreaming.enabled` (skip if false) and the maturity tier:
   - **early** — only run when the user explicitly asks (`/dream` / `/dream now`).
   - **mid** — run on explicit request or when the session-start nudge fired.
   - **higher** — may run when the gate is met; still produce a reviewable diff.
2. **Dual gate** (skip when the user says `/dream now` or `--force`): read
   `.assert-iq/memory/.dream/state.json`. Proceed only if
   `sessions_since_dream >= gate.min_sessions_between_dreams` AND at least
   `gate.min_hours_between_dreams` have passed since `last_dream_utc`
   (a null `last_dream_utc` satisfies the time gate). If the gate is not met,
   say so and stop.
3. **Lock** — if `.assert-iq/memory/.dream/dream.lock` is held, another dream
   is running; stop. Otherwise proceed (the optional background service uses a
   real flock; interactively, just check-and-note).
4. **Install mode** — read `mode` from `.assert-iq/.install-manifest.json` if
   present. In a **trial** install the memory store is local-only (hidden from
   git via `.git/info/exclude`), so there is no reviewable git diff to wait on
   — consolidate autonomously within the maturity tier. In a **committed**
   install (or when no manifest exists), the store is tracked in git, so treat
   the result as a reviewable diff and surface it as such in the report.
5. **Safety — sanity check, snapshot, open the provenance cycle.** This is the
   procedure `qi-foundation.instructions.md` > *Memory Poisoning Prevention*
   requires; it is not optional and it runs **before** you change any memory
   file. One command does all three:

   ```bash
   python3 .assert-iq/analysis/dream-safety.py pre
   ```

   On Windows use `python` or `py -3` — the python.org installer ships
   `python.exe` but no `python3.exe`.

   It prints a `CYCLE_ID=dream-<stamp>` line. **Keep that id**; the Finish
   step needs it. Then honour the exit code:
   - **0** — proceed. Any sanity warnings it printed are worth reading, and
     worth mentioning in the dream report, but they do not stop you.
   - **1** — **stop.** Sanity checks failed and the maturity tier enforces
     rather than warns. Report what it found and do not modify memory.
   - **2** — the environment is wrong (no memory store, or the analysis
     helpers are missing). Report it and stop; do not dream blind.

   Never hand-roll these steps. The snapshot it writes is what the
   reproducibility contract restores from, and a dream with no snapshot is
   not reversible.

## Phase 1 — Orient

- Read `MEMORY.md` (the index). List the files under `topics/` and skim them
  so you **improve** existing files instead of duplicating them.
- Review the most recent daily logs under `.assert-iq/memory/logs/`.
- Answer: *"What do I already know, and how is it organized?"*

## Phase 2 — Gather signal (targeted, NOT exhaustive)

Do **not** read transcripts end-to-end. Use narrow, grep-style searches over
the daily logs and any transcript paths recorded in them, in priority order:

1. **Daily logs** — the append-only stream is pre-filtered signal.
2. **Drifted memories** — existing facts contradicted by the current repo state.
3. **User corrections** — moments the user redirected or overruled the agent
   (the single richest learning signal).
4. **Explicit saves** — "remember this", "always do X".
5. **Recurring themes** — the same decision/issue across ≥2 sessions.
6. **Failure clusters** — repeated tool errors, retries, dead ends.

## Phase 3 — Consolidate

Merge worthwhile signal into the appropriate `topics/*.md` file. Four surgical
operations — dreaming is surgical, not a full rewrite; leave untouched files
untouched:

| Operation | Rule |
|-----------|------|
| Temporalize | Convert every relative date to an absolute date (today is the current date). |
| Contradiction resolution | Newer verified fact wins; **delete the disproven entry at the source**, don't just annotate it. |
| Stale pruning | Remove entries referencing files/systems/decisions that no longer exist. |
| Deduplication | Collapse N overlapping observations into one canonical entry (optionally note "confirmed across N sessions"). |

Preserve the **exact wording** of recorded decisions. Do NOT invent facts not
present in the inputs. When uncertain whether to delete, **demote** (move
detail from the index into a topic file) rather than delete — `git` is the undo.

## Phase 4 — Prune & Index

Rewrite `MEMORY.md` as an **index only** (≤ `dreaming.index_max_lines`, default
200): one-line pointers with dates. Remove pointers to superseded topics, add
pointers to new ones, demote verbose entries into topic files, resolve any
index-vs-file contradictions, and reorder by relevance and recency. Update the
`_Last consolidated:_` line to today's date.

## Finish — update state + dream report

1. **Close the provenance cycle** with the id from Preflight step 5:

   ```bash
   python3 .assert-iq/analysis/dream-safety.py post --cycle-id dream-<stamp>
   ```

   This records `memory_version_after` and whether memory actually changed,
   completing the audit record. If you abandoned the dream part-way, pass
   `--aborted` so the log says so rather than leaving the cycle open.

2. **Regression corpus** — only when `regression_testing.enabled` is true in
   `config.yaml`. Re-run `/risk-assess-pr` for each `pr_id` in
   `regression_testing.golden_corpus_path`, write the outcomes as JSONL
   (`{"pr_id": ..., "actual_verdict_band": ...}`), then:

   ```bash
   python3 .assert-iq/analysis/dream-safety.py regression \
       --cycle-id dream-<stamp> --results <your-results.jsonl>
   ```

   Exit 1 means the divergence exceeded the configured threshold and the tier
   enforces it: the consolidation degraded verdict accuracy. Restore the
   snapshot this cycle recorded and report what happened.

3. Reset the counter: write `.assert-iq/memory/.dream/state.json` with
   `last_dream_utc` = now (ISO-8601 UTC) and `sessions_since_dream` = 0.
4. Emit a **dream report** — 3–6 sentences: what was consolidated, updated, or
   pruned. If nothing needed changing, say *"memories already tight — no changes."*
5. In a **committed** install, remind the user the changes are a git diff they
   can review, edit, or revert. In a **trial** install, note the store is
   local-only (hidden from git) and was updated in place.

## Guardrails (non-negotiable)

- **Write sandbox** — never write outside the memory store. If a proposed
  change would touch a path outside it, refuse and report it.
- **Rules are immutable** — never edit `.github/instructions/*`, skills, or
  source; human-authored rules outrank consolidated memory.
- **No poisoning** — promote a fact to long-term memory only when it is
  multi-session-confirmed or explicitly saved; tag provenance for high-stakes
  facts.
- **Prefer demotion over deletion** when uncertain.
