# Hotspot Risk Registry

Generated: 2026-10-29T20:02:35Z  
Commit: 9093e68  
Maturity tier: early (churn-only mode: **Volatility Watchlist**, no HRI, no tiers)  
Refresh trigger: on_demand  
HRI basis distribution: V+C+D=0, V+C=0, V+D=0, C+D=0, single-signal=34  
Ungraded signals: complexity (`complexity_source_unset`), defect density (`tracker_none`)

> Advisory only. A single signal never earns a tier: these rows show where change has
> concentrated, not how risky each module is overall.

## Scope used for this run

- **Files:** `client/src/**` and `server/**`, 34 files at `HEAD`. The configured
  `module_globs` are the template defaults and match nothing in this repo.
  `config.yaml` was not changed.
- **Granularity:** per file. The configured `directory` granularity gives 3 modules,
  too few to rank; the roll-up is below.
- **Volatility window:** 90 days (from 2026-07-31). Commit `df3fe57` (the initial import)
  is excluded: it created every file, which would rank files by size, not by change.
- **Same method as the previous run** (2026-10-29T19:15Z at `1052af1`): the scoring
  script reproduces all 33 of that run's V scores at `1052af1`. Since then, `main` gained
  the FH6-1/2/3/13/14 work, the toe-text fix and the simulator fix.

## Volatility Watchlist (top 10, plus one tie)

| Module | V | Δ | C | D | HRI | Basis | Tier | Suggested control |
|--------|---|---|---|---|-----|-------|------|-------------------|
| `client/src/components/Sessions.tsx` | 10 | = | — | — | — | V_only | (watchlist) | Two of its 6 commits are the FH6-2 move and the toe-text fix. Still untested in place: `collectCandidates` and the `*Target()` popup functions; FH6-10/11 cover the three recommendation surfaces end to end |
| `client/src/components/PreRunTune.tsx` | 10 | = | — | — | — | V_only | (watchlist) | **Highest-volatility file with no unit tests**, and the site of the final-drive escape (`5cf8628`). FH6-4 extracts the target calculation, FH6-5 pins it |
| `client/src/bisect.ts` | 9 | = | — | — | — | V_only | (watchlist) | Covered. `runsRemaining` is untested; keep the suite green on every change |
| `server/recorder.js` | 9 | = | — | — | — | V_only | (watchlist) | Both commits fixed race-end detection; the first shipped broken. FH6-6 covers only the folder override; race-end detection and duration trimming have no story yet |
| `client/src/gearing.ts` | 8 | = | — | — | — | V_only | (watchlist) | `solveFinalDrive`'s solved path is untested; FH6-4/5 add the target |
| `client/src/store.ts` | 7 | −1 | — | — | — | V_only | (watchlist) | Client state and WebSocket plumbing; low tuning impact; review on change |
| `client/src/handling.ts` | 7 | new | — | — | — | V_only | (watchlist) | Created by the FH6-2 move, so its volatility is creation, not instability. Covered by 7 tests (FH6-3) |
| `server/analytics.js` | 7 | = | — | — | — | V_only | (watchlist) | Every symptom rate the advice reads is computed here (969 lines). Its exports are pure, so it's unit-testable without production changes; no story yet |
| `client/src/tune.ts` | 7 | = | — | — | — | V_only | (watchlist) | Adaptive step engine (`learnGain`/`applyGain`); add to the unit suite; no story yet |
| `client/src/components/GripBalance.tsx` | 7 | = | — | — | — | V_only | (watchlist) | Display only; one convention fix (`d81512d`); visual check on change |
| `client/src/components/TractionCircle.tsx` | 7 | = | — | — | — | V_only | (watchlist) | Display only; same convention fix (`d81512d`); visual check on change |

V = 1–10. Each file is ranked by commits and by lines changed against the other 33 files
in scope, and the two ranks are averaged. 18 files had no change after creation and score 1.
Δ is the change since the previous run. `store.ts` slipped one point only because
`handling.ts` joined the ranking, not because of any change of its own.

| Module | Commits | Lines changed | Size (lines) | Unit tests today |
|---|---|---|---|---|
| `client/src/components/Sessions.tsx` | 6 | 385 | 2909 | none (`handlingDeltas` moved out and tested, FH6-2/3) |
| `client/src/components/PreRunTune.tsx` | 3 | 165 | 371 | none |
| `client/src/bisect.ts` | 3 | 108 | 191 | `tests/unit/bisect.test.ts` (`bracketFor`) |
| `server/recorder.js` | 2 | 76 | 638 | none |
| `client/src/gearing.ts` | 1 | 450 | 450 | `tests/unit/gearing.test.ts` (`solveGearing`, fallback advice) |
| `client/src/store.ts` | 1 | 103 | 367 | none |
| `client/src/handling.ts` | 1 | 89 | 89 | `tests/unit/handling.test.ts` (7 tests) |
| `server/analytics.js` | 1 | 41 | 969 | none |
| `client/src/tune.ts` | 1 | 24 | 219 | none |
| `client/src/components/GripBalance.tsx` | 1 | 23 | 104 | none |
| `client/src/components/TractionCircle.tsx` | 1 | 18 | 103 | none |

Just below the watchlist at V=6: `server/simulator.js` (1 → 6, from the positive-ordinal fix
in `2fe4ca1`; FH6-7 and FH6-9 touch it next), `Laps.tsx`, `plan.ts`, `server/index.js`
and `types.ts`.

### Directory roll-up

| Directory | Files | Commits | Lines changed |
|---|---|---|---|
| `client/src/components/` | 16 | 8 | 603 |
| `client/src/` | 12 | 7 | 787 |
| `server/` | 6 | 4 | 131 |

## Next story

**FH6-4, then FH6-5.**

| Ready now | Hotspot it addresses | Why / why not first |
|---|---|---|
| **FH6-4**: move the final-drive target out of `PreRunTune` | `PreRunTune.tsx` (V=10), `gearing.ts` (V=8) | No dependencies. It turns the hottest untested file's riskiest logic into a pure function, and FH6-5 (1–3 pts) then pins it to a recorded run. This is the logic that already escaped once (`5cf8628`). |
| FH6-7: deterministic simulator mode | `simulator.js` (V=6) | First step on the end-to-end path (FH6-8 → 9 → 10 → 11 → 12). Do this first if a CI gate matters more than unit coverage of the hottest file. |
| FH6-6: environment variable for the sessions folder | `recorder.js` (V=9), folder override only | Also on the end-to-end path. It doesn't touch the race-end logic that made `recorder.js` hot. |

**Gaps the backlog doesn't cover:** race-end detection in `recorder.js` (V=9, already shipped
broken once), the symptom rates in `analytics.js`, and the step engine in `tune.ts`. Each is
pure or nearly pure and could get its own unit-test story.

## Promotion checklist: what unlocks a full HRI registry

1. **Point `hotspot_map.module_globs` at this repo:** `client/src/**` and `server/**`.
   Consider `module_granularity: file`; the repo is small. *(Needs your OK; this run didn't change config.)*
2. **Grade Complexity:** set `hotspot_map.complexity.source` to a tool that runs here,
   for example `eslint_complexity` or `lizard`. Either is a new dev dependency, so it needs
   your confirmation.
3. **Grade Defect density:** the skill only queries GitHub, ADO, Jira or Linear, so with the
   markdown tracker this stays UNGRADED. Logging escapes as `type: bug` stories (label `escape`)
   builds the data; the skill would still need a query for `stories/`. The toe-sign text fix
   (`f5f6c47`) is a candidate first entry.
4. **Leave churn-only mode:** set `early_tier_mode: full`, or move up a maturity tier,
   once at least two signals are graded.

## Footer

- Tier counts: CRITICAL 0 · MEDIUM 0 · LOW 0 · watchlist 11
- hri_basis: single-signal (V_only) for all 34 files
- Ungraded: complexity `complexity_source_unset`; defect density `tracker_none`
- Machine-readable copy: `hotspot-map.json`
