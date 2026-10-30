# Hotspot Risk Registry

Generated: 2026-10-30T02:32:33Z  
Commit: c80e1a3  
Maturity tier: early (churn-only mode: **Volatility Watchlist**, no HRI, no tiers)  
Refresh trigger: on_demand  
HRI basis distribution: V+C+D=0, V+C=0, V+D=0, C+D=0, single-signal=36  
Ungraded signals: complexity (`complexity_source_unset`), defect density (`tracker_none`)

> Advisory only. A single signal never earns a tier: these rows show where change has
> concentrated, not how risky each module is overall.

## Scope used for this run

- **Files:** `client/src/**` and `server/**`, 36 files at `HEAD`, unchanged from the last
  run. The configured `module_globs` are the template defaults and match nothing in this
  repo. `config.yaml` was not changed.
- **Granularity:** per file. The configured `directory` granularity gives 3 modules,
  too few to rank; the roll-up is below.
- **Volatility window:** 90 days (from 2026-07-31). Commit `df3fe57` (the initial import)
  is excluded: it created every file, which would rank files by size, not by change.
- **Same method and script as the previous run** (2026-10-30T02:12Z at `144f1a0`). Since
  then, `main` gained:
  - FH6-4 (`39ca851`): the final-drive target moved out of `PreRunTune.tsx` into
    `gearing.ts`
  - FH6-5 (`c80e1a3`): 8 unit tests for it
  - the hotspot refresh and the pack's runtime untracking, which are outside this scope

## Volatility Watchlist (top 10)

| Module | V | Δ | C | D | HRI | Basis | Tier | Suggested control |
|--------|---|---|---|---|-----|-------|------|-------------------|
| `client/src/components/Sessions.tsx` | 10 | = | — | — | — | V_only | (watchlist) | **The top uncovered hotspot.** Three of the five 2026-10-29 escapes touched it (FH6-17/18/19). Still inline and untested: the ride-height, aero, brake, diff and tire-pressure rows and `collectCandidates`. Its `FinalDrive` section still scales the box value when a run has no recorded final drive, the shape of the `5cf8628` loop (noted in FH6-4). No story covers it. |
| `client/src/components/PreRunTune.tsx` | 10 | +1 | — | — | — | V_only | (watchlist) | Rose because of the FH6-4 extraction, not instability: its riskiest logic now lives in `gearing.ts` with 8 tests. Still untested in place: car-identity resolution, the gear-ratio recommendations and the planner pick. FH6-10 adds test hooks. |
| `client/src/bisect.ts` | 9 | = | — | — | — | V_only | (watchlist) | Covered by 6 tests. `runsRemaining` is untested. |
| `client/src/gearing.ts` | 9 | +1 | — | — | — | V_only | (watchlist) | Rose from FH6-4 and FH6-5 adding code and its tests. Covered by 14 tests, and the final-drive solve's solved path is now exercised through `finalDriveTarget`. |
| `client/src/handling.ts` | 9 | = | — | — | — | V_only | (watchlist) | Covered by 16 tests (toe sign, row moves). |
| `server/recorder.js` | 9 | = | — | — | — | V_only | (watchlist) | Start and stop decisions are tested via `capture-gate.js`. Still untested: file I/O, `buildSummary` and duration trimming. FH6-6 covers only the folder override. |
| `client/src/plan.ts` | 8 | = | — | — | — | V_only | (watchlist) | Covered by 7 tests. An open question remains: should near-floor moves count as "backfired"? |
| `client/src/store.ts` | 7 | = | — | — | — | V_only | (watchlist) | Client state and WebSocket plumbing; low tuning impact; review on change. |
| `server/capture-gate.js` | 7 | = | — | — | — | V_only | (watchlist) | Created by FH6-15; covered by 12 tests built from measured frames. |
| `server/analytics.js` | 7 | = | — | — | — | V_only | (watchlist) | Every symptom rate the advice reads is computed here (969 lines). Its exports are pure, so it is unit-testable without production changes. No story yet. |

V = 1–10. Each file is ranked by commits and by lines changed against the other 35 files in
scope, and the two ranks are averaged. 18 files had no change after creation and score 1.
Δ is the change since the previous run. Only `PreRunTune.tsx` and `gearing.ts` changed, and
both rises come from FH6-4 and FH6-5's own commits.

| Module | Commits | Lines changed | Size (lines) | Unit tests today |
|---|---|---|---|---|
| `client/src/components/Sessions.tsx` | 9 | 460 | 2882 | none in place (row math in `handling.ts` and `damping.ts` is tested) |
| `client/src/components/PreRunTune.tsx` | 4 | 199 | 347 | none in place (`finalDriveTarget` is tested) |
| `client/src/bisect.ts` | 4 | 116 | 193 | `bisect.test.ts` (6) |
| `client/src/gearing.ts` | 3 | 493 | 491 | `gearing.test.ts` (6), `final-drive-target.test.ts` (8) |
| `client/src/handling.ts` | 3 | 164 | 130 | `handling.test.ts` (7), `handling-move.test.ts` (9) |
| `server/recorder.js` | 3 | 158 | 588 | none (the gate is tested in `capture-gate.test.ts`) |
| `client/src/plan.ts` | 3 | 25 | 588 | `plan.test.ts` (4), `plan-backfired.test.ts` (3) |
| `client/src/store.ts` | 1 | 103 | 367 | none |
| `server/capture-gate.js` | 1 | 71 | 71 | `capture-gate.test.ts` (12) |
| `server/analytics.js` | 1 | 41 | 969 | none |

Just below the watchlist at V=6:
- untested: `tune.ts` (the step engine), `GripBalance.tsx`, `TractionCircle.tsx`, `Laps.tsx`,
  `server/index.js`, `server/simulator.js` and `types.ts`
- tested: `damping.ts` (8 tests)

### Directory roll-up

| Directory | Files | Commits | Lines changed |
|---|---|---|---|
| `client/src/components/` | 16 | 12 | 712 |
| `client/src/` (outside `components/`) | 13 | 13 | 951 |
| `server/` | 7 | 5 | 284 |

Commits now count each directory on its own. The previous run's `client/src/` count of 14
included `components/`.

## Next story

FH6-4 and FH6-5 are done. **Next: a new story for `Sessions.tsx`**, the hottest file
(V=10), which no story covers. It took three of the five 2026-10-29 escapes.

| Candidate | Hotspot it addresses | Why / why not first |
|---|---|---|
| **New: the report's final drive uses the recorded run** | `Sessions.tsx` (V=10) | Small. The report's `FinalDrive` section should call `finalDriveTarget` (or share its rule), so it stops scaling the box value when a run has no recorded final drive. That is the same loop `5cf8628` fixed on the pre-run screen, still live on the report. |
| **New: move the rest of the inline row math out of `Sessions.tsx`** | `Sessions.tsx` (V=10) | Larger, the FH6-18/19 pattern again. It would move the ride-height, aero, brake, diff and tire-pressure rows into pure, tested functions and close the ride-height/aero "hold" edge. |
| FH6-7: deterministic simulator mode (ready) | `simulator.js` (V=6) | The first step toward end-to-end tests and CI (FH6-8 → 9 → 10 → 11 → 12), which would let the Trust layer be graded. Best backlog pick if you'd rather not add stories. |
| FH6-6: environment variable for the sessions folder (ready) | `recorder.js` (V=9), folder override only | Also on the end-to-end path. It doesn't touch the parts of `recorder.js` that are still untested. |

**Other gaps the backlog doesn't cover:** the symptom rates in `analytics.js`, and the step
engine in `tune.ts`.

## Promotion checklist: what unlocks a full HRI registry

1. **Point `hotspot_map.module_globs` at this repo:** `client/src/**` and `server/**`.
   Consider `module_granularity: file`, since the repo is small. *(Needs your OK; this run
   didn't change config.)*
2. **Grade Complexity:** set `hotspot_map.complexity.source` to a tool that runs here,
   for example `eslint_complexity` or `lizard`. Either is a new dev dependency, so it needs
   your confirmation.
3. **Grade Defect density:** the skill only queries GitHub, ADO, Jira or Linear, so with the
   markdown tracker this stays UNGRADED. Five escape stories (FH6-15 to FH6-19, `type: bug`,
   label `escape`) list the files they touched in `modules:`. `Sessions.tsx` appears in
   three, and `handling.ts` and `plan.ts` in two each. A query over `stories/` would turn
   that into a D score. Not scored here.
4. **Leave churn-only mode:** set `early_tier_mode: full`, or move up a maturity tier,
   once at least two signals are graded.

## Footer

- Tier counts: CRITICAL 0 · MEDIUM 0 · LOW 0 · watchlist 10
- hri_basis: single-signal (V_only) for all 36 files
- Ungraded: complexity `complexity_source_unset`; defect density `tracker_none`
- Machine-readable copy: `hotspot-map.json`
