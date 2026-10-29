---
id: FH6-13
title: Clear the shell-quote advisories pulled in by concurrently
type: chore
labels: [security, dependencies]
modules: [package.json, package-lock.json]
depends_on: []
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate: null        # not run through /estimate-story
---

# FH6-13 — Clear the shell-quote advisories pulled in by concurrently

As the developer, I want the root `npm audit` clean, so that the dev tooling
doesn't carry a known command-injection advisory.

Found while installing Vitest for FH6-1. `concurrently` 9.2.3 pinned
`shell-quote` 1.8.4, which is affected by:

- **GHSA-395f-4hp3-45gv** (critical): quadratic-time DoS in `parse()`
  (≤ 1.8.4).
- **GHSA-pqg4-j6r4-53mv:** command injection in `quote()` (≥ 1.8.4,
  < 1.11.0).

## Acceptance criteria

- **AC-1** The root `npm audit` reports no `shell-quote` or `concurrently`
  advisories.
- **AC-2** No blanket `npm audit fix --force`, and no major-version bump
  unless one is needed.
- **AC-3** `npm run dev` still starts both the server and the Vite client.

## Done (2026-10-29)

- **AC-1:** `concurrently` ^9.1.0 → **^9.2.5**, a patch release that pins
  `shell-quote` **1.12.0**. Root `npm audit`: 0 vulnerabilities.
- **AC-2:** neither the 10.x major bump nor an `overrides` entry was needed.
  The range floor was raised to ^9.2.5, so a fresh resolve can't land on a
  vulnerable 9.x.
- **AC-3:** with the new version, `npm run dev` spawns both processes. The
  server listened on 8080 and streamed live telemetry over its WebSocket,
  and Vite reported ready on 5173.
  - **Vite never answered a page request.** It blocked on
    `client/node_modules/@babel/types/…/toStatement.js`, which iCloud had
    evicted (`compressed,dataless`); more than 3,000 dependency files were
    in that state.
  - **This is an environment problem, not the upgrade.** `concurrently`
    9.2.3 and 9.2.5 behave identically once their files are local.
- **Added a dev preview entry:** `fh6-dev` in `.claude/launch.json` runs
  `PORT=8080 npm run dev`. The preview tool sets `PORT` to the config's port,
  which otherwise puts the server on 5173 and pushes Vite to 5174, where the
  page's WebSocket mapping (`client/src/store.ts:11`) no longer finds the
  server.
- **Out of scope, tracked separately:** `client/` has its own audit findings,
  none of them `shell-quote`. Five are high (Vite 5 needs a major bump to 8
  for two of them).
