# Hotspot Risk Registry

Generated: 2026-10-30T02:12:21Z  
Commit: 144f1a0  
Maturity tier: early (churn-only mode: **Volatility Watchlist**, no HRI, no tiers)  
Refresh trigger: on_demand  
HRI basis distribution: V+C+D=0, V+C=0, V+D=0, C+D=0, single-signal=36  
Ungraded signals: complexity (`complexity_source_unset`), defect density (`tracker_none`)

> Advisory only. A single signal never earns a tier: these rows show where change has
> concentrated, not how risky each module is overall.

## Scope used for this run

- **Files:** `client/src/**` and `server/**`, 36 files at `HEAD`. That is two more than
  last run: `server/capture-gate.js` (FH6-15) and `client/src/damping.ts` (FH6-18). The
  configured `module_globs` are the template defaults and match nothing in this repo.
  `config.yaml` was not changed.
- **Granularity:** per file. The configured `directory` granularity gives 3 modules,
  too few to rank; the roll-up is below.
- **Volatility window:** 90 days (from 2026-07-31). Commit `df3fe57` (the initial import)
  is excluded: it created every file, which would rank files by size, not by change.
- **Same method and script as the previous run** (2026-10-29T20:02Z at `9093e68`). Since
  then, `main` gained FH6-15 to FH6-19, which are five escaped defects fixed on 2026-10-29,
  plus the memory and registry commits, which are outside this scope.

## Volatility Watchlist (top 10)

| Module | V | Δ | C | D | HRI | Basis | Tier | Suggested control |
|--------|---|---|---|---|-----|-------|------|-------------------|
| `client/src/components/Sessions.tsx` | 10 | = | — | — | — | V_only | (watchlist) | **Three of today's five escapes touched it** (FH6-17/18/19). The damper and alignment row math moved out and is now tested. Still inline and untested: the ride-height, aero, brake, diff and tire-pressure rows and `collectCandidates`. The ride-height and aero rows can still label a planned move "hold". |
| `client/src/bisect.ts` | 9 | = | — | — | — | V_only | (watchlist) | Covered by 6 tests, including the move-cap print fixed in FH6-17. `runsRemaining` is untested. |
| `client/src/components/PreRunTune.tsx` | 9 | −1 | — | — | — | V_only | (watchlist) | **Highest-volatility file with no unit tests**, and the site of the final-drive escape (`5cf8628`). It has no new commits; it slipped only because `handling.ts` rose past it. FH6-4 extracts the target calculation, and FH6-5 pins it. |
| `client/src/handling.ts` | 9 | +2 | — | — | — | V_only | (watchlist) | Rising because of fixes (the FH6-17 toe flip and FH6-19's `handlingMove`), not instability. Covered by 16 tests. |
| `server/recorder.js` | 9 | = | — | — | — | V_only | (watchlist) | FH6-15 moved the start and stop decisions into `capture-gate.js`, which has 12 tests. Still untested here: file I/O, `buildSummary` and duration trimming. FH6-6 covers only the folder override. |
| `client/src/plan.ts` | 8 | +2 | — | — | — | V_only | (watchlist) | FH6-16 fixed the backfire-message crash. Covered by 7 tests. An open question remains: should near-floor moves count as "backfired"? |
| `client/src/gearing.ts` | 8 | = | — | — | — | V_only | (watchlist) | `solveFinalDrive`'s solved path is untested; FH6-4/5 add the target. |
| `client/src/store.ts` | 7 | = | — | — | — | V_only | (watchlist) | Client state and WebSocket plumbing; low tuning impact; review on change. |
| `server/capture-gate.js` | 7 | new | — | — | — | V_only | (watchlist) | Created by FH6-15, so its volatility is creation, not instability. Covered by 12 tests built from measured frames. |
| `server/analytics.js` | 7 | = | — | — | — | V_only | (watchlist) | Every symptom rate the advice reads is computed here (969 lines). Its exports are pure, so it is unit-testable without production changes. No story yet. |

V = 1–10. Each file is ranked by commits and by lines changed against the other 35 files in
scope, and the two ranks are averaged. 18 files had no change after creation and score 1.
Δ is the change since the previous run. `PreRunTune.tsx`, `tune.ts`, `GripBalance.tsx` and
`TractionCircle.tsx` each slipped one point only because other files rose or joined the
ranking.

| Module | Commits | Lines changed | Size (lines) | Unit tests today |
|---|---|---|---|---|
| `client/src/components/Sessions.tsx` | 9 | 460 | 2882 | none in place (row math in `handling.ts` and `damping.ts` is tested) |
| `client/src/bisect.ts` | 4 | 116 | 193 | `tests/unit/bisect.test.ts` (6) |
| `client/src/components/PreRunTune.tsx` | 3 | 165 | 371 | none |
| `client/src/handling.ts` | 3 | 164 | 130 | `handling.test.ts` (7), `handling-move.test.ts` (9) |
| `server/recorder.js` | 3 | 158 | 588 | none (the gate is tested in `capture-gate.test.ts`) |
| `client/src/plan.ts` | 3 | 25 | 588 | `plan.test.ts` (4), `plan-backfired.test.ts` (3) |
| `client/src/gearing.ts` | 1 | 450 | 450 | `gearing.test.ts` (6) |
| `client/src/store.ts` | 1 | 103 | 367 | none |
| `server/capture-gate.js` | 1 | 71 | 71 | `capture-gate.test.ts` (12) |
| `server/analytics.js` | 1 | 41 | 969 | none |

Just below the watchlist at V=6:
- untested: `tune.ts` (the step engine), `GripBalance.tsx`, `TractionCircle.tsx`, `Laps.tsx`,
  `server/index.js`, `server/simulator.js` and `types.ts`
- tested: `damping.ts` (new, FH6-18, 8 tests)

### Directory roll-up

| Directory | Files | Commits | Lines changed |
|---|---|---|---|
| `client/src/components/` | 16 | 11 | 678 |
| `client/src/` | 13 | 14 | 908 |
| `server/` | 7 | 5 | 284 |

## Next story

**FH6-4, then FH6-5.** This is unchanged from the previous run.

| Ready now | Hotspot it addresses | Why / why not first |
|---|---|---|
| **FH6-4**: move the final-drive target out of `PreRunTune` | `PreRunTune.tsx` (V=9), `gearing.ts` (V=8) | No dependencies. It turns the hottest untested file's riskiest logic into a pure function, and FH6-5 (1–3 pts) then pins it to a recorded run. This logic already escaped once (`5cf8628`). |
| FH6-7: deterministic simulator mode | `simulator.js` (V=6) | First step on the end-to-end path (FH6-8 → 9 → 10 → 11 → 12). Do this first if a CI gate matters more than unit coverage of the hottest untested file. |
| FH6-6: environment variable for the sessions folder | `recorder.js` (V=9), folder override only | Also on the end-to-end path. It doesn't touch the parts of `recorder.js` that are still untested. |

**Gaps the backlog doesn't cover:**

- **The rest of `Sessions.tsx`'s inline row math** (V=10, three escapes on 2026-10-29). This
  is the strongest candidate for a new story. It would move the ride-height, aero, brake,
  diff and tire-pressure row math into pure, tested functions, the pattern FH6-18 and FH6-19
  used, and close the ride-height and aero "hold" edge.
- **The symptom rates in `analytics.js`.**
- **The step engine in `tune.ts`.**

The race-end detection gap from the previous run is closed by FH6-15.

## Promotion checklist: what unlocks a full HRI registry

1. **Point `hotspot_map.module_globs` at this repo:** `client/src/**` and `server/**`.
   Consider `module_granularity: file`, since the repo is small. *(Needs your OK; this run
   didn't change config.)*
2. **Grade Complexity:** set `hotspot_map.complexity.source` to a tool that runs here,
   for example `eslint_complexity` or `lizard`. Either is a new dev dependency, so it needs
   your confirmation.
3. **Grade Defect density:** the skill only queries GitHub, ADO, Jira or Linear, so with the
   markdown tracker this stays UNGRADED. The data now exists: **five escape stories**
   (FH6-15 to FH6-19, `type: bug`, label `escape`) list the files they touched in
   `modules:`. `Sessions.tsx` appears in three, and `handling.ts` and `plan.ts` in two each.
   A query over `stories/` would turn that into a D score. Not scored here.
4. **Leave churn-only mode:** set `early_tier_mode: full`, or move up a maturity tier,
   once at least two signals are graded.

## Footer

- Tier counts: CRITICAL 0 · MEDIUM 0 · LOW 0 · watchlist 10
- hri_basis: single-signal (V_only) for all 36 files
- Ungraded: complexity `complexity_source_unset`; defect density `tracker_none`
- Machine-readable copy: `hotspot-map.json`
