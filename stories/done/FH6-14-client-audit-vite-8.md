---
id: FH6-14
title: Clear the client npm audit findings (Vite 5 → 8)
type: chore
labels: [security, dependencies]
modules: [client/package.json, client/package-lock.json]
depends_on: []
created: 2026-10-29
started: 2026-10-29
completed: 2026-10-29
points: null
estimate: null        # not run through /estimate-story
---

# FH6-14 — Clear the client npm audit findings (Vite 5 → 8)

As the developer, I want `npm --prefix client audit` clean, so that the Vite
dev server, which `host: true` exposes on the LAN, doesn't carry known
path-traversal and cross-origin advisories.

Split out of FH6-13, which found these while it cleaned the root audit. On
2026-10-29 the client audit reported 7 vulnerabilities (2 moderate, 5 high):

- **vite 5.4.21** (high, direct): 8 advisories, all ≤ 6.4.3. They include:
  - path traversal in optimized-deps `.map` handling (GHSA-4w7w-66w2-5vf9)
  - files outside `server.fs.allow` served on non-Windows hosts
    (GHSA-rq7h-c2jc-7f22)
  - cross-origin script execution through custom middleware
    (GHSA-9jrq-w75r-8gcw)
  - five `launch-editor` issues that only affect Windows
- **esbuild 0.21.5** (moderate, via vite): any website can send requests to
  the dev server and read the response (GHSA-67mh-4wv8-2f99).
- **browserslist, nanoid, postcss, source-map-js** (high) and
  **baseline-browser-mapping** (moderate): all transitive.

## Acceptance criteria

- **AC-1** `npm --prefix client audit` reports 0 vulnerabilities.
- **AC-2** Non-major fixes go first (`audit fix` without `--force`). The major
  bump covers only what the non-major fixes can't.
- **AC-3** `npm --prefix client run build` passes.
- **AC-4** The dev server still runs on 5173 with `host: true`, so the page's
  WebSocket mapping from 5173 to 8080 (`client/src/store.ts:11`) still finds
  the server.
- **AC-5** Root dependencies are unchanged, and `npm run test:unit` still
  passes.

## Done (2026-10-29)

- **AC-2, step 1:** `npm --prefix client audit fix` bumped 9 transitive
  packages within their existing ranges:
  - postcss 8.5.15 → 8.5.32
  - nanoid 3.3.15 → 3.3.20
  - source-map-js 1.2.1 → 1.2.2
  - browserslist 4.28.4 → 4.29.5
  - baseline-browser-mapping 2.10.38 → 2.11.34
  - caniuse-lite, electron-to-chromium, node-releases and
    update-browserslist-db
  
  The build still passed on Vite 5.4.21. Two findings were left (vite and
  esbuild), and both needed the major bump.
- **AC-2, step 2:** vite ^5.4.11 → **^8.3.5**, and @vitejs/plugin-react
  ^4.3.4 → **^6.1.2**. Plugin-react 6 requires Vite 8. 5.2 also accepts
  Vite 8 but still pulls in Babel. The client install dropped from 69 packages
  to 28: Babel and esbuild are gone, replaced by Rolldown, Oxc and Lightning
  CSS.
- **AC-1:** 0 vulnerabilities.
- **AC-3:** `tsc -b && vite build` passes on Vite 8.3.5. The JS bundle went
  from 305.6 to 299.0 kB (95.1 → 91.9 kB gzip).
- **AC-4:**
  - The Vite 8 dev server started on 5173 and printed both Local and Network
    URLs.
  - The page connected to the server's WebSocket on 8080 and showed live
    telemetry.
  - Editing a component hot-updated it without a full reload.
  - `/@fs/etc/passwd` returned 403.
  - The production bundle, served with `vite preview`, also booted and
    streamed live telemetry. The Live and Tuning Report views showed no
    console errors.
- **AC-5:** neither the root `package.json` nor its lockfile was touched.
  `npm run test:unit` passed all 26 tests in 5 files. The tests import plain
  `client/src` modules through the root's own Vitest, not through the client's
  Vite.

## Migration notes checked (5 → 6 → 7 → 8)

`client/vite.config.ts` uses none of the removed or renamed options:
`build.rollupOptions`, `esbuild`, `optimizeDeps.esbuildOptions`, Sass `api`,
`splitVendorChunkPlugin`, `manualChunks`, or plugin-react's `babel`. No config
change was needed. These changes do apply:

- **Node 20.19+ / 22.12+ is required** by Vite 7+ and plugin-react 5+. This
  Mac runs Node 25.1.
- **The default `build.target` is newer:** Chrome 111, Safari 16.4 and
  Firefox 114. Vite 5's default was Chrome 87, Safari 14 and Firefox 78.
  - Today's bundle emits the ES2021 operators `||=`, `&&=` and `??=`, plus CSS
    `inset`. They run on Safari 14.1+ and Chrome 87+, so LAN devices from about
    2021 onward are fine.
  - If an older tablet ever needs to view the dashboard, pin `build.target` in
    `vite.config.ts`.
- **CSS is now minified by Lightning CSS.** The CSS bundle went from 13.14 to
  12.94 kB.
- **The smaller alternative wasn't taken.** vite 6.4.5 (with esbuild ^0.25)
  would also clear these advisories. But 6.x is the maintenance line, and
  Vite 8 needed no code changes.

## Environment

- **Client:** the main checkout's `client/node_modules` was reinstalled with
  `npm --prefix client ci`. It went from 2,139 iCloud-evicted files to 0.
- **Root:** `node_modules` still has 1,350 evicted files, all in
  `concurrently`'s dependency tree (rxjs, yargs, yargs-parser, escalade).
  - Vitest isn't affected.
  - `npm run dev` at the root can still hang on those files until the root is
    reinstalled. `npm ci` would reinstall the same versions.
