# /assert-iq-bootstrap

Bootstrap the Assert.IQ Agent Pack into a workspace. Walks the user
through choosing — per workspace-loaded surface — whether each goes to
the workspace, the user-global slot (where supported), or is skipped.
Then invokes the appropriate script with explicit flags. Cross-platform
(bash on macOS/Linux, PowerShell on Windows).

## When to use

This is the **codebase-install** path. Run it when the user wants the
pack to live inside their target repository (any workspace that is not
the pack repo itself).

If the user instead wants to play with Assert.IQ inside the pack repo
itself — without touching their team's codebase — direct them to
`bash install.sh` (or `pwsh ./install.ps1`) at the root of the cloned
pack and stop. That path opens the pack folder as the workspace; this
skill is for everything else.

Trigger conditions for this skill:

- User just brought the Assert.IQ pack onto their machine (cloned the
  repo) and wants it installed into a target codebase.
- User explicitly typed `/assert-iq-bootstrap`.
- The agent found `.assert-iq/maturity-profile.md` is missing from both
  the workspace and `~/.assert-iq/` and the user wants quality/release
  reasoning grounded in that config.

## What it copies

Twelve workspace-loaded surfaces. Bootstrap is the **complete codebase
install** — Copilot and Claude Code can't auto-discover skills or
agents that aren't physically present in the workspace, so all of them
ship into the target repo.

| Surface | What it is |
|---|---|
| `.assert-iq/` | Per-client config: `config.yaml`, `governance.md`, `maturity-profile.md`, `signal-schema.json` |
| `.github/instructions/*.instructions.md` | Five QI rule sheets that load via `applyTo` globs |
| `.github/skills/` | All 32 QI skills — Copilot Chat reads them from this workspace path |
| `.github/agents/` | `Assert-IQ.agent.md` and `Assert-IQ-PLAN.agent.md` custom chat modes |
| `.claude/agents/` | Claude Code subagent counterparts (`assert-iq.md`, `assert-iq-plan.md`) |
| `.claude/skills` | Symlink to `../.github/skills` (copy fallback when symlinks unavailable) so Claude Code discovers the same skills |
| `CLAUDE.md` | Always-on QI guidance for Claude Code |
| `.github/copilot-instructions.md` | Always-on QI guidance for Copilot |
| `AGENTS.md` | Generic agent-spec pointer (Codex, Cursor, Aider) |
| `.vscode/settings.json` + `.vscode/mcp.json` | Wires VS Code Copilot to read instructions, prompts, and **Dreaming session events** from the workspace; declares the GitHub / ADO / Jira MCP servers. **JSON deep-merged** if the user already has these files (additive; user's values win on scalar conflicts). |
| `.assert-iq/dreaming/` + `.assert-iq/memory/` | The Dreaming machinery `chat.hookFilesLocations` points at, plus the markdown memory store. `session-events.json` is rendered with `__PACK_ROOT__` = workspace root so the scripts resolve to the workspace copies; the memory store is scaffolded alongside. |
| `.claude/settings.json` | Claude Code reads the `hooks` block from here. Bootstrap merges only the `.hooks` key, preserving everything else. The Copilot side disables this file via `chat.hookFilesLocations` to avoid double-fire. |

## Install modes (trial vs committed)

The bootstrap supports **three install modes**:

| Mode | What it does | When to use |
|---|---|---|
| `trial` | Drops files into the workspace but adds their paths to `.git/info/exclude` so git ignores them locally. **The codebase `.gitignore` is never touched.** Other contributors see nothing. | Evaluating the pack; piloting on a single dev machine before a team adopts it. |
| `committed` | Drops files into the workspace as normal, visible to git. User commits when ready. | Team has decided to adopt; pack should be in the repo for everyone. |
| `ask` (default in TTY) | Interactive prompt at install time. Non-TTY falls back to `committed`. | Default when no flag is passed. |

**Graduating from trial → committed** is one command, run **from the
installed workspace** against the pack's copy of the script (`scripts/`
is not part of the install payload, so a bare `scripts/bootstrap.sh`
will not resolve there):
```bash
cd /path/to/installed/workspace
bash "${CLAUDE_PLUGIN_ROOT:-/path/to/pack}/scripts/bootstrap.sh" --graduate
# or -Graduate on Windows
```
The working directory matters: `--workspace` defaults to `$PWD`, so
running this from the pack root targets the pack instead of the
workspace you meant. Pass `--workspace=` explicitly if you cannot `cd`.

This removes the managed block from `.git/info/exclude` and updates
`.assert-iq/.install-manifest.json` so `mode: committed`. Files on
disk are untouched.

## How to run it (the chat flow)

1. **Greet and explain**. "I'll set up the Assert.IQ pack in this
   workspace. First — do you want to **trial** it (files local-only,
   ignored by `.git/info/exclude`) or **commit** it (visible to git)?
   Then I'll ask where each of the configurable surfaces goes."

2. **Decide trial vs committed.** Always pass `--mode=` explicitly to
   the script — the chat is the prompt surface, not the script. This
   suppresses the script's own interactive prompt.

3. **Offer presets next**:
   - **`pod`** (default): everything in the workspace. Best when the
     pack is being tailored per-client and the repo is the source of
     truth.
   - **`solo`**: `.assert-iq/` in the workspace (per-client governance),
     everything else user-global. Best for a contractor rotating across
     many client repos who wants the same QI brain everywhere.
   - **`portable`**: skills land user-globally at `~/.agents/skills/`
     (VS Code) and `~/.claude/skills/` (Claude Code). Workspace
     footprint shrinks to the Assert-IQ chat agent files and the
     install manifest; instructions, dreaming, settings, MCP config, and
     `CLAUDE.md` stay out of the repo. Best for users who don't want
     trial-mode pack files in their repo, or who want skills available
     in every workspace they open. Sets `--skills-scope=user` and skips
     workspace surfaces (copilot/agents/vscode/dreaming/claude-settings).

4. **If preset is chosen**, confirm and skip to step 6. Otherwise, walk
   through each surface and ask `workspace` / `user-global` / `skip`.
   For `--copilot=user` or `--agents=user`, explain there's no native
   user-global slot and treat as `skip` (the agent automatically
   degrades).

4. **Detect OS** via the environment:
   - In VS Code / chat terminal: prefer `$IsWindows` (PowerShell) or
     `uname` (bash).
   - Pick the script: `scripts/bootstrap.ps1` on Windows,
     `scripts/bootstrap.sh` elsewhere.

5. **Resolve the source dir**. Prefer `$CLAUDE_PLUGIN_ROOT` if set
   (Claude Code surfaces it for installed packs). Fall back to the pack
   root if running from a cloned checkout. The script handles this
   automatically when `--source` is omitted.

6. **Invoke the script** with explicit flags (always pass `--mode=`
   from the chat to avoid double-prompting the user):

   ```bash
   # macOS / Linux — trial mode
   bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/bootstrap.sh" \
     --mode=trial \
     --preset=solo \
     --workspace="$PWD"

   # macOS / Linux — committed mode
   bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/bootstrap.sh" \
     --mode=committed \
     --preset=pod
   ```

   ```powershell
   # Windows — trial mode
   pwsh -NoProfile -File "$env:CLAUDE_PLUGIN_ROOT\scripts\bootstrap.ps1" `
     -Mode trial `
     -Preset solo `
     -Workspace (Get-Location).Path
   ```

   Or with per-surface flags overriding the preset:

   ```bash
   bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/bootstrap.sh" \
     --mode=committed \
     --preset=pod \
     --skills-scope=both \
     --instructions=user \
     --claude=skip
   ```

   > **Every command below runs against an already-installed workspace,
   > where `scripts/` does not exist** — it is not part of the install
   > payload. Always resolve the script through `$CLAUDE_PLUGIN_ROOT`
   > (or the pack checkout path), and run it with the **installed
   > workspace as the working directory**: `--workspace` defaults to
   > `$PWD`, so invoking from the pack root silently targets the pack.
   > Pass `--workspace=` explicitly when you cannot `cd`.

   **Graduating from trial → committed later:**
   ```bash
   cd /path/to/installed/workspace
   bash "${CLAUDE_PLUGIN_ROOT:-/path/to/pack}/scripts/bootstrap.sh" --graduate
   # or:
   pwsh -File "$env:CLAUDE_PLUGIN_ROOT\scripts\bootstrap.ps1" -Graduate
   ```

   **Removing the pack from a workspace:**
   ```bash
   cd /path/to/installed/workspace
   P="${CLAUDE_PLUGIN_ROOT:-/path/to/pack}"
   bash "$P/scripts/bootstrap.sh" --uninstall              # macOS / Linux
   bash "$P/scripts/bootstrap.sh" --uninstall --user       # also remove user-global copies
   bash "$P/scripts/bootstrap.sh" --uninstall --dry-run    # preview without changes
   pwsh -File "$env:CLAUDE_PLUGIN_ROOT\scripts\bootstrap.ps1" -Uninstall   # Windows
   ```
   The uninstall reads `.assert-iq/.install-manifest.json`, restores
   any pre-existing files from their `<file>.assert-iq.pre-install`
   snapshots (preserving the post-install copy at
   `<file>.assert-iq.uninstall-saved` if it changed), removes
   pack-owned files, and strips the trial-mode block from
   `.git/info/exclude`.

7. **Show the summary table the script prints** verbatim. It tells the
   user what was copied, what was skipped (already present), what was
   skipped by user choice, and what was skipped because no user-global
   slot exists.

8. **Tell the user to reload the editor window** (VS Code: `⇧⌘P` →
   "Reload Window"; Claude Code: restart the session). Instruction
   files only get picked up after a reload.

9. **Offer the tailoring pass.** Placement is done, but every file the
   bootstrap copied still carries `<PLACEHOLDER>` values and
   universal-template defaults. Tell the user the natural next step is
   `/assert-iq-tailor`, which discovers their stack and customizes
   `config.yaml`, governance, the maturity profile, the instruction
   files, the skills, and `mcp.json` to this codebase. Bootstrap places
   the pack; tailor makes it theirs.

## Flags reference

| Flag | Values | Default |
|---|---|---|
| `--mode` / `-Mode` | `trial`, `committed`, `ask` | `ask` (TTY) / `committed` (non-TTY) |
| `--trial` / `-Trial` | (switch) | shorthand for `--mode=trial` |
| `--committed` / `-Committed` | (switch) | shorthand for `--mode=committed` |
| `--graduate` / `-Graduate` | (switch) | reverses trial mode; exits after |
| `--untrial` / `-Untrial` | (switch) | alias for `--graduate` |
| `--uninstall` / `-Uninstall` | (switch) | removes the pack from this workspace; exits after |
| `--user` / `-User` | (switch, with `--uninstall`) | also remove user-global copies |
| `--yes` / `-Yes` (`-y`) | (switch, with `--uninstall`) | skip the confirmation prompt |
| `--dry-run` / `-DryRun` | (switch, with `--uninstall`) | preview operations without changing files |
| `--preset` / `-Preset` | `solo`, `pod`, `portable` | (none — falls back to `pod` if no per-surface flags given) |
| `--skills-scope` / `-SkillsScope` | `workspace`, `user`, `both` | `workspace` (or `user` when `--preset=portable`) |
| `--assert-iq` / `-AssertIq` | `workspace`, `user`, `skip` | preset default |
| `--instructions` / `-Instructions` | `workspace`, `user`, `skip` | preset default |
| `--claude` / `-Claude` | `workspace`, `user`, `skip` | preset default |
| `--copilot` / `-Copilot` | `workspace`, `user` (→skip+warn), `skip` | preset default |
| `--agents` / `-Agents` | `workspace`, `user` (→skip+warn), `skip` | preset default |
| `--vscode` / `-VSCode` | `workspace`, `user` (→skip+warn), `skip` | `workspace` (both presets) |
| `--dreaming` / `-Dreaming` (alias `--hooks` / `-Hooks`) | `workspace`, `skip` | `workspace` (both presets) |
| `--claude-settings` / `-ClaudeSettings` | `workspace`, `skip` | `workspace` (both presets) |
| `--workspace` / `-Workspace` | path | `$PWD` |
| `--source` / `-Source` | path | `$CLAUDE_PLUGIN_ROOT` if set, else script's parent dir |

## Behavior contract

- **Per-file conflict resolution.** If a destination file exists and has
  different content from the pack version, the script falls back to an
  interactive resolver: `[k]eep` / `[o]verwrite` / `[s]idecar (writes
  `.assert-iq-new`) / [d]iff / [K/O/S]all / [a]bort`. Non-TTY runs auto-keep.
- **JSON deep-merge for settings files.** `.vscode/settings.json`,
  `.vscode/mcp.json` (when pre-existing), and `.claude/settings.json`
  use additive deep-merge instead of the keep/overwrite resolver. User's
  scalar values always win; object keys from both sides are preserved.
  This means a user's existing settings are never clobbered, and `_all`
  shortcuts don't apply to these files.
- **SHA256 fast-path.** If destination content matches the pack content
  byte-for-byte, the file is recorded as `unchanged_owned` and no prompt
  appears.
- **Pre-existing user files are preserved by default.** A user's
  hand-written file at a destination path will never be silently
  overwritten.
- **Manifest tracking.** Every action is recorded in
  `.assert-iq/.install-manifest.json` (`version`, `installed_at`, `mode`,
  `paths[]`). Trial mode uses this manifest to know which paths to add
  to `.git/info/exclude`.
- **Already-tracked files.** If a file the pack wants to drop is already
  tracked by git, trial mode leaves it visible (does **not** auto-untrack
  — that would be destructive). The script prints a one-line
  `git rm --cached` hint per path.
- **Atomic per surface.** A failure on one surface does not abort the
  others.
- **Idempotent.** Re-running with the same flags is safe.

## Things you do NOT do

- Do not invoke this skill silently. Always explain to the user what's
  about to happen and confirm trial-vs-committed and preset choices.
- Do not bypass the conflict resolver with `--force` or similar — it
  doesn't exist by design.
- Do not edit the copied files after the script runs. The user
  customizes them to their client/codebase.
- Do not auto-untrack files. If trial mode flags a tracked file, surface
  the hint and let the user decide.
