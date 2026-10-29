# Workspace, stack, and delivery setup

_Layer: Change risk. Facts about how this workspace is wired that are not
obvious from the code._

## Stack

- **Server:** Node ESM. `dgram` (UDP :5300) → parse/derive → `ws` WebSocket,
  with `http` serving the built client on :8080. No framework.
- **Client:** React + Vite + TypeScript. Canvas panels render via
  `requestAnimationFrame`; numeric readouts via a `useTick` hook; metadata via
  `useSyncExternalStore`. Env overrides: `PORT`, `UDP_PORT`, `UDP_HOST`.
- `npm run sim` replays synthetic 60 Hz packets, so the whole pipeline is
  testable with no console attached — use it before asking the user to drive.

## Test posture (as of 2026-08-29)

- **There is no automated test suite yet and no CI.** Playwright is the
  *intended* UI framework per `.assert-iq/config.yaml`, but nothing is wired up.
- Consequence for QI reasoning: the **Protection** and **Trust** layers are
  genuinely UNGRADED on this repo. Do not synthesize a protection score from
  absent tests — say the layer cannot be evaluated and continue.
- Verification to date has been **live manual driving** by the user plus
  browser-preview inspection. That is the actual oracle here.

## Git and GitHub (set up 2026-08-29)

- Published to **https://github.com/sayrilamar/fh6-dashboard** — public,
  default branch `main`, `main` tracks `origin/main`.
- Committed as `sayrilamar <sayrilamar@gmail.com>` (repo-local git config).
- Auth is the **`gh` CLI** (installed via Homebrew 2026-08-29, HTTPS, keyring).
  There is no SSH key on this machine.
- **The Assert.IQ pack is deliberately NOT published.** Install mode is
  `trial`, so `.assert-iq/`, `.github/`, `.claude/`, `.vscode/`, `CLAUDE.md`,
  and `AGENTS.md` are listed in `.git/info/exclude`. To publish later:
  `scripts/bootstrap.sh --graduate`, then remove that block.
- **Gotcha:** `.git/info/exclude` is not versioned. A clone of this repo on
  another machine will not carry those exclusions.
- `.gitignore` covers `node_modules/`, `client/dist/`, `sessions/`,
  `tsconfig.tsbuildinfo`, `.env*`, `.DS_Store`. `sessions/` matters — three
  recorded runs are ~39 MB of JSONL and must stay out of git.
- **No LICENSE file.** The repo is public with default copyright, which grants
  no reuse rights. Open question with the user as of 2026-08-29.

## Note on this workspace

This directory is also used as the working directory for **unrelated** work
(a REAPER audio-mixing project, 2026-08-29). Session transcripts under this
project path are not all about the dashboard — check the subject before
treating a transcript as FH6 signal.

See also: [[recurring-defects]]
