# Workspace, stack, and delivery setup

_Layer: Change risk. Facts about how this workspace is wired that are not
obvious from the code._

## Stack

- **Server:** Node ESM. `dgram` (UDP :5300) → parse/derive → `ws` WebSocket,
  with `http` serving the built client on :8080. No framework.
- **Client:** React + Vite + TypeScript. Canvas panels render via
  `requestAnimationFrame`; numeric readouts via a `useTick` hook; metadata via
  `useSyncExternalStore`. Env overrides: `PORT`, `UDP_PORT`, `UDP_HOST`.
- `npm run sim` (`server/simulator.js`) sends synthetic 60 Hz packets to
  127.0.0.1:5300, so the pipeline is testable with no console attached. Use
  it before asking the user to drive. See § Simulator below.

## Simulator (verified end to end 2026-10-29)

- **Before 2026-10-29 the simulator could not record.** It wrote car ordinal
  `2523123456`, which overflows s32 to a negative number. The recorder only
  arms on `isRaceOn && carOrdinal > 0` (`server/recorder.js:101`), so RECORD
  sat on "ARMED · waiting for car" forever. It now sends **#999999**
  (committed `2fe4ca1`, 2026-10-29). After the fix, a 49 s sim recording saved
  and rendered in the Tuning Report.
- **Ordinal 999999 is reserved for synthetic runs.** Tunes
  (`fh6.<section>.c.<ordinal>` in localStorage) and bisection history are
  keyed by car ordinal, so a sim reusing a real car's ordinal would mix fake
  runs into that car's tuning loop.
- **Clean up after a sim test:**
  - Delete the run from `sessions/`.
  - Remove the `fh6.*.c.999999` localStorage keys while **no Tuning Report
    is open**; an open report writes them straight back.
  - The in-app browser auto-declines `window.confirm`, so the app's ✕
    "Delete run" does nothing there. Delete the files directly.
- **The sim is not a faithful FH6 stand-in for wear.** It sends 339-byte
  packets that include tire wear, while live FH6 sends 324 bytes with no
  wear. So a wear feature that works in the sim proves nothing about the
  console.

## Test posture (re-checked 2026-10-29)

- **A Vitest unit suite exists since 2026-10-29** (FH6-1, `a1c80c4`).
  - Tests live in `tests/unit/`. Run them from the repo root with
    `npm run test:unit`.
  - 59 tests as of `e97b934`, covering the planner, bisection, handling and
    toe sign, damper and alignment row math, the capture gate, gearing and the
    parser.
- **There is still no CI** (no `.github/workflows/`) and no UI tests.
  Playwright is the *intended* UI framework per `.assert-iq/config.yaml`, but
  it is not wired up.
- **Consequence for QI reasoning:**
  - **Protection** can be graded for modules the unit suite covers.
    `Sessions.tsx` rendering is covered only by browser-preview checks.
  - **Trust** stays UNGRADED, because there is no flake history.
- The outcome oracle is still **recorded live runs by the user**: a top-speed
  run on a long straight, and same-car same-circuit runs alternating A|B|A|B
  with settings entered by hand (2026-08-29/30).
- **Recordings land in whichever checkout runs the server.** `sessions/` is
  resolved relative to `server/recorder.js`. On 2026-10-29 the server ran from
  a Claude worktree, so the day's runs were in
  `.claude/worktrees/<name>/sessions/`, and the main checkout's `sessions/`
  was empty.

## Git and GitHub

- Published to **https://github.com/sayrilamar/fh6-dashboard** — public,
  default branch `main`, `main` tracks `origin/main`.
- Committed as `sayrilamar <sayrilamar@gmail.com>` (repo-local git config).
  Auth is the **`gh` CLI** (HTTPS, keyring). There is no SSH key.
- **Commit only when the user says so** ("commit and push"). "Don't commit
  yet" means verify first. Confirmed across the 2026-08-29/30 and 2026-10-29
  sessions.
- **Delivery since 2026-10-29:**
  1. Commit per story on the session branch.
  2. Open a PR with the `new-pull-request` skill, titled `[FH6-n] …`.
  3. Fast-forward `main` locally to the PR's commits and push. GitHub then
     marks the PR merged.

  This was PRs #1–#3. There is no CI, and `main` is unprotected.
- Early on 2026-10-29, Claude Code's auto-mode check blocked one agent
  `git push origin main`, and the user pushed by hand. The agent's later
  branch pushes and fast-forward pushes of `main` that day went through.
- **Work tracking is markdown stories**: `stories/todo/` and `stories/done/`,
  IDs `FH6-<n>`, with rules in `stories/README.md`. The user decided this on
  2026-10-29, since there is no external tracker. Escaped defects are
  `type: bug` with the label `escape`.
- `.gitignore` covers `node_modules/`, `client/dist/`, `sessions/`,
  `tsconfig.tsbuildinfo`, `.env*`, `.DS_Store`, and (since 2026-10-29)
  `.claude/settings.local.json`. `sessions/` matters — recorded runs are tens
  of MB of JSONL and must stay out of git.
- **No LICENSE file.** The repo is public with default copyright, which grants
  no reuse rights. Still open as of 2026-10-29.

## Assert.IQ pack

- **Committed and public since 2026-10-29.** The user graduated the install
  from trial to committed (`bootstrap.sh --graduate`), it was upgraded 2.1.2 →
  2.2.0, and commit `1052af1` "Adopt the Assert.IQ agent pack (v2.2.0)" was
  pushed to `main`. Install mode in the manifest is `committed`.
- Pack source checkout: `~/assert-iq-agent-pack`. Upgrade from the repo root
  with `bash ~/assert-iq-agent-pack/scripts/bootstrap.sh --upgrade` **after
  checking which branch that checkout is on** — on 2026-10-29 it was sitting on
  a feature branch, and an interrupted upgrade from it left the workspace
  half-upgraded.

## Live telemetry troubleshooting

- On 2026-10-06 no packets reached the Mac at all: UDP 5300 stayed at 0 bytes
  while the user drove, and the Mac could not resolve the Xbox's hardware
  address (ARP incomplete for 192.168.1.229; Mac at 192.168.1.77 on 5 GHz
  Wi-Fi), while other LAN devices resolved fine. The Xbox reported "UPnP not
  successful". Recording had worked on 2026-08-29, so something on the network
  changed. Suspected Wi-Fi client isolation or a second router; unresolved.
  Packets reached the Mac again on 2026-10-29 (a dozen recordings that day),
  and the 2026-10-06 cause was never identified.
- Measure arrival on the server's own socket
  (`nettop -m udp -p <server-pid> -L 1 -J bytes_in`), not the Mac-wide
  `netstat -s -p udp` counter — other UDP traffic gave a false positive
  (2026-10-06).

## iCloud-synced `~/Documents`

The repository lives in iCloud-synced `~/Documents`, which causes two
problems:

- **Evicted ("dataless") files.** Vite, Vitest, npx and `concurrently` can
  hang at 0% CPU when `node_modules` files have been evicted. Check with
  `find node_modules -flags +dataless` before blaming code. This has been
  seen in more than one session.
- **Conflict copies named "name 2".** They appear in the tree and inside
  `.git`. On 2026-10-29 a `refs/heads/main 2` broke `git fetch` with
  "bad object". Before git work, look for them with
  `find .git -name '* 2*' -not -path '*/objects/*'`. Move them out; never
  commit them.

## Note on this workspace

This directory is also used as the working directory for **unrelated** work
(a REAPER audio-mixing project, 2026-08-29). Session transcripts under this
project path are not all about the dashboard — check the subject before
treating a transcript as FH6 signal.

Related: [[recurring-defects]], [[fh6-telemetry-contract]]
