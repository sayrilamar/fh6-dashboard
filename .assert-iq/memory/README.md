# `.assert-iq/memory/` — Dreaming memory store

Long-term, human-inspectable agent memory for this workspace. Maintained by
the `/dream` consolidation pass (see `.assert-iq/dreaming/`).

## Layout

| Path | Tier | Written by | Loaded at startup | Dreamed? |
|------|------|-----------|-------------------|----------|
| `.github/instructions/*` | Rules | Human | Always (Copilot/Claude) | Never — immutable |
| `MEMORY.md` | Long-term index | Agent + `/dream` | Index only (≤200 lines) | Yes |
| `topics/*.md` | Long-term detail | Agent + `/dream` | On demand | Yes |
| `logs/YYYY/MM/*.md` | Short-term stream | Waking recorder | No | Yes (raw input) |
| `.dream/state.json` | Dream state | Recorder + `/dream` | No | No |

## Conventions

- **Absolute dates only.** Never "yesterday" / "last week".
- **One fact per bullet.** Note provenance where it matters
  (`decided 2026-03-15`, `observed across 3 sessions`).
- **Facts, decisions, preferences** — not transcript excerpts.
- `MEMORY.md` is an **index**, not a dump. One-line pointers to topic files;
  the 200-line cap bounds startup context cost.

## Safety

- The `/dream` pass may write **only** inside `.assert-iq/memory/`.
- Instruction/rule files are immutable — dreaming never edits them.
- **Git visibility follows your install mode.** Committed installs track this
  directory (every dream cycle is a reviewable diff, and `git revert` is your
  undo). Trial installs keep it local-only via `.git/info/exclude` — git never
  sees it and dreams update it autonomously; `bootstrap.sh --graduate` exposes
  it later.
