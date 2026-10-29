# Dreaming — memory consolidation for Assert.IQ

> **Dreaming** replaces the retired Hindsight Hooks feature. Instead of
> patching skills in place on every self-correction, Assert.IQ now keeps a
> curated, versioned **markdown memory store** and consolidates it on a
> schedule — a second-derivative process where *memory improves memory*.

If you just want it to work, do nothing. A lightweight recorder runs at
session end; when enough has accumulated you'll be nudged to run `/dream`.

## Why Dreaming — and how it saves tokens

**What it is, in plain English.** As Assert.IQ works, a lightweight "waking
loop" jots short notes about your project. Left alone, those notes pile up into
contradictions, stale references, and duplicates — the notes become the noise.
Dreaming is a periodic clean-up pass (the `/dream` skill) that reads the notes,
resolves contradictions, prunes what's dead, de-duplicates, and rewrites a tight
one-page index (`MEMORY.md`, capped at 200 lines) that points to detailed topic
files. Memory improving memory — the same idea as sleep consolidating a day's
short-term memories into durable ones.

**Why it's in Assert.IQ.** A quality assistant is only valuable if it compounds
— if the 30th session is smarter than the 1st about your codebase, conventions,
gotchas, and the corrections you've already made. Without durable memory, every
chat starts from zero, rediscovers the same context, and repeats the same
mistakes. Dreaming keeps that memory small, current, and trustworthy so the
agent actually benefits from it instead of drowning in it.

### How it saves tokens

Two mechanisms work together:

1. **Read the index, not the world.** The always-on rule in
   `qi-foundation.instructions.md` (applied to `**` — every interaction) tells
   the agent, at the start of every chat, to read only the ≤200-line
   `MEMORY.md` index, and to open a topic file only when a pointer is relevant.
   Orientation becomes a small, fixed, predictable cost instead of the agent
   re-reading many files, re-running searches, and re-confirming decisions to
   rebuild context it already had.
2. **Dreaming keeps that cost bounded.** Raw memory bloats over time; a
   1,000-line index would cost more to load every session than it saves. The
   200-line cap plus the consolidation pass keep the index cheap to load and
   free of noise — so the agent trusts it and doesn't re-derive anyway.

#### The math — a worked model

Conservative per-session assumptions (~12 tokens per index line):

| Scenario | Per session | Per 100 sessions |
|---|---|---|
| No memory — cold re-orientation each time (re-read ~4 key files ≈ 6,000 + repeat ~1 already-learned correction ≈ 3,000) | ~9,000 tokens | ~900,000 |
| Dreamed memory — read the ~160-line index (~2,000) + occasionally one topic file (~800) | ~2,800 tokens | ~280,000 |
| **Net saved** | **~6,200 tokens** | **~620,000 tokens** |

Subtract the dream pass itself — one consolidation run (~15,000 tokens) fires at
most once per ≥5 sessions ⇒ ≤3,000 tokens/session amortized — and you are still
net positive by ~3,000+ tokens every session, indefinitely. On a large codebase
where a cold start reads 20k–40k tokens to orient, the net saving is
~15,000–35,000 tokens per session.

The dollar figure is modest per session but compounds at scale; the bigger wins
are fewer repeated mistakes, predictable context cost (the 200-line cap bounds
it), and faster orientation.

**When it pays off.** Dreaming helps most on recurring, long-lived work — a
codebase, a test suite, a triage queue. For one-shot or highly varied tasks
there is little to consolidate, which is exactly why it is gated (24h and 5
sessions) and maturity-tiered. It never blocks a session, and the memory store
is a plain-markdown git diff you can review or revert.

## The two loops

```
WAKING LOOP (per session, online)
  session ends → dream-record-session appends a dated note to
                 .assert-iq/memory/logs/ and bumps the session counter

DREAMING LOOP (on demand via /dream, or optional cron)
  Phase 1 Orient → Phase 2 Gather → Phase 3 Consolidate → Phase 4 Prune & Index
  → rewritten .assert-iq/memory/ (reviewable git diff) + a dream report
```

## What's in this folder

| Path | What it does |
|------|--------------|
| `scripts/dream-record-session.{sh,ps1}` | Waking loop. Increments the session counter, appends one dated log line. |
| `scripts/dream-gate.{sh,ps1}` | Session-start dual-gate check. Nudges `/dream` when both gates are met. |
| `scripts/lib/dream-utils.{sh,ps1}` | Shared helpers (state path, lock, config gate values). |
| `scripts/lib/render-events.{sh,ps1}` | Renders `session-events.template.json` at install time. |
| `session-events.template.json` | Copilot / VS Code session-event wiring. Rendered to `session-events.json` and registered via the `chat.hookFilesLocations` setting. |
| `claude-hooks.{posix,windows}.template.json` | Claude Code session-event wiring. Rendered into the `hooks` key of `.claude/settings.json`. |
| `service/dreaming_service.py` | **Optional** background dreamer (cron / post-session). Off by default; requires the `anthropic` SDK + `ANTHROPIC_API_KEY`. |

The memory store itself lives at `.assert-iq/memory/` (see its README).

### Editing the hook templates: no `$` in the Copilot file

`session-events.template.json` commands **must not contain a `$`**. Something
between the hook file and the interpreter replaces every `$`-prefixed token with
nothing, so this (the old Windows command):

```
& { $r = if ($env:CLAUDE_PLUGIN_ROOT) { ... }; $s = Join-Path $r '...'; & $s }
```

reached PowerShell as:

```
& {  = if () {  } else { 'C:\...' }; &  }
```

which failed with a `ParserError`. The hooks never ran and nothing was written to
`.assert-iq/memory/logs/` — a silent failure, because a hook that cannot start
looks the same as a hook with nothing to say.

It is not ordinary shell expansion: `$env:CLAUDE_PLUGIN_ROOT` disappeared whole
rather than leaving `:CLAUDE_PLUGIN_ROOT` behind, and the POSIX payloads are
single-quoted, which a shell would have left alone. Rather than reverse-engineer
the escaping rules of a layer we cannot inspect, these commands depend on no
variables at all: the installer bakes in an absolute path, and
`dream-utils.{ps1,sh}` derive `AIQ_PACK_ROOT` from their own location, so nothing
in the hook needs an environment variable.

Two tests enforce this:

- `unit-hook-schema.py` fails if any command in the Copilot template contains a `$`.
- `e2e-hook-execution.py` strips every `$`-token from the command before running
  it, then asserts the session counter and the dated log file still get written.

The Claude Code templates (`claude-hooks.*.template.json`) **do** use `$` and
must keep doing so: Claude Code passes the body straight to the declared `shell`,
and `CLAUDE_PLUGIN_ROOT` is how a plugin-style install overrides the baked path.

## Configuration

All knobs live under `dreaming:` in `.assert-iq/config.yaml`:

- `enabled` — master switch (env kill-switch: `AIQ_DREAMING_DISABLED=1`).
- `index_max_lines` — `MEMORY.md` cap (default 200).
- `gate.min_hours_between_dreams` / `gate.min_sessions_between_dreams` —
  the dual gate (default 24h AND 5 sessions). Env overrides:
  `AIQ_DREAM_MIN_HOURS`, `AIQ_DREAM_MIN_SESSIONS`.
- `background_service` — opt-in cron dreamer (see below).

## Maturity gating

Mirrors Agentic Healing:

- **early** — manual `/dream` only; review every diff.
- **mid** — the gate nudge surfaces at session start; still user-run.
- **higher** — may auto-fire on the next session start when the gate is met,
  and may enable the optional background service.

## Safety (non-negotiable)

1. **Write sandbox** — the dream pass may write ONLY inside
   `.assert-iq/memory/`. Source, config, and instruction files are read-only.
2. **Rules are immutable** — `.github/instructions/*` are never modified by
   dreaming.
3. **Lock** — one dream at a time per project (`.dream/state.lock`).
4. **Human review** — every dream is a git-diffable change; skim the diff and
   hand-edit freely.

## Git visibility follows install mode

- **Committed install** — the memory store is tracked in git; every dream
  cycle is a reviewable diff (the audit interface).
- **Trial install** — the whole `.assert-iq/memory/` store is kept local-only
  via `.git/info/exclude`; git never sees it, and dreams update it
  autonomously. Run `scripts/bootstrap.sh --graduate` to expose it to git
  later. (Pack-as-workspace installs via `install.sh` track it, like committed.)

## Optional background dreamer

`service/dreaming_service.py` is the turnkey "dream while you sleep" path. It
is **never** required — the `/dream` skill is the default engine and has no
dependency on it. To enable:

1. Set `dreaming.background_service.enabled: true` in `config.yaml`
   (only honored at `higher` tier).
2. `pip install anthropic` and export `ANTHROPIC_API_KEY`.
3. Wire a trigger:

   ```bash
   # Nightly at 02:00
   0 2 * * * /usr/bin/python3 \
     /path/to/repo/.assert-iq/dreaming/service/dreaming_service.py /path/to/repo

   # Manual, after a big refactor
   python3 .assert-iq/dreaming/service/dreaming_service.py . --force
   ```

Without the env key the service exits without doing anything, so the pack
stays dependency-free by default.

## Sanity check

```bash
python3 -c "import json; print(list(json.load(open('.claude/settings.json'))['hooks'].keys()))"
# Expected: ['SessionStart', 'Stop']   (no PostToolUse)
```
