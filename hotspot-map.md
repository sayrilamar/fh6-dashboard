# Hotspot Risk Registry

Generated: 2026-10-29T19:15:08Z  
Commit: 1052af1  
Maturity tier: early (churn-only mode: **Volatility Watchlist**, no HRI, no tiers)  
Refresh trigger: on_demand  
HRI basis distribution: V+C+D=0, V+C=0, V+D=0, C+D=0, single-signal=33  
Ungraded signals: complexity (`complexity_source_unset`), defect density (`tracker_none`)

> Advisory only. A single signal never earns a tier: these rows show where change has
> concentrated, not how risky each module is overall.

## Scope used for this run

- **Files:** `client/src/**` and `server/**`, 33 files at `HEAD`. The configured
  `module_globs` are the template defaults and match nothing in this repo.
  `config.yaml` was not changed.
- **Granularity:** per file. The configured `directory` granularity gives 3 modules,
  too few to rank; the roll-up is below.
- **Volatility window:** 90 days. Commit `df3fe57` (the initial import) is excluded:
  it created every file, which would rank files by size, not by change.
- **Uncommitted work is not counted:** the `Sessions.tsx` move and toe text,
  the new `handling.ts`, and the `simulator.js` fix.

## Volatility Watchlist (top 10)

| Module | V | C | D | HRI | Basis | Tier | Suggested control |
|--------|---|---|---|-----|-------|------|-------------------|
| `client/src/components/Sessions.tsx` | 10 | — | — | — | V_only | (watchlist) | Extract the next pure pieces (collectCandidates, the *Target() popup functions) and unit-test them; FH6-10/11 cover the three surfaces end to end |
| `client/src/components/PreRunTune.tsx` | 10 | — | — | — | V_only | (watchlist) | FH6-4 + FH6-5 (final-drive extraction and tests); FH6-11 checks it agrees with the report |
| `client/src/bisect.ts` | 9 | — | — | — | V_only | (watchlist) | Covered. runsRemaining is untested; keep the suite green on every change |
| `server/recorder.js` | 9 | — | — | — | V_only | (watchlist) | FH6-6 covers only the folder override. Race-end detection and duration trimming, where the recorder's escapes were, have no story yet |
| `client/src/gearing.ts` | 8 | — | — | — | V_only | (watchlist) | solveFinalDrive's solved path is untested; FH6-4/5 add the target |
| `client/src/store.ts` | 8 | — | — | — | V_only | (watchlist) | Client state and WebSocket plumbing; low tuning impact; review on change |
| `server/analytics.js` | 7 | — | — | — | V_only | (watchlist) | Every symptom rate the advice reads is computed here (969 lines). Its exports are pure, so it is unit-testable today without production changes; no story yet |
| `client/src/tune.ts` | 7 | — | — | — | V_only | (watchlist) | Adaptive step engine (learnGain/applyGain); add to the unit suite |
| `client/src/components/GripBalance.tsx` | 7 | — | — | — | V_only | (watchlist) | Display only; one convention fix (d81512d); visual check on change |
| `client/src/components/TractionCircle.tsx` | 7 | — | — | — | V_only | (watchlist) | Display only; same convention fix (d81512d); visual check on change |

V = 1–10. Each file is ranked by commits and by lines changed against the other 33 files
in scope, and the two ranks are averaged. 19 files had no change after creation and score 1.

| Module | Commits | Lines changed | Size (lines) | Unit tests today |
|---|---|---|---|---|
| `client/src/components/Sessions.tsx` | 4 | 283 | 2909 | none (handlingDeltas moved out and tested, FH6-2/3) |
| `client/src/components/PreRunTune.tsx` | 3 | 165 | 371 | none |
| `client/src/bisect.ts` | 3 | 108 | 191 | tests/unit/bisect.test.ts (bracketFor) |
| `server/recorder.js` | 2 | 76 | 638 | none |
| `client/src/gearing.ts` | 1 | 450 | 450 | tests/unit/gearing.test.ts (solveGearing, fallback advice) |
| `client/src/store.ts` | 1 | 103 | 367 | none |
| `server/analytics.js` | 1 | 41 | 969 | none |
| `client/src/tune.ts` | 1 | 24 | 219 | none |
| `client/src/components/GripBalance.tsx` | 1 | 23 | 104 | none |
| `client/src/components/TractionCircle.tsx` | 1 | 18 | 103 | none |

### Directory roll-up

| Directory | Files | Commits | Lines changed |
|---|---|---|---|
| `client/src/components/` | 16 | 6 | 501 |
| `client/src/` | 11 | 6 | 698 |
| `server/` | 6 | 3 | 125 |

## Promotion checklist: what unlocks a full HRI registry

1. **Point `hotspot_map.module_globs` at this repo:** `client/src/**` and `server/**`.
   Consider `module_granularity: file`; the repo is small. *(Needs your OK; this run didn't change config.)*
2. **Grade Complexity:** set `hotspot_map.complexity.source` to a tool that runs here,
   for example `eslint_complexity` or `lizard`. Either is a new dev dependency, so it needs
   your confirmation.
3. **Grade Defect density:** the skill only queries GitHub, ADO, Jira or Linear, so with the
   markdown tracker this stays UNGRADED. Logging escapes as `type: bug` stories (label `escape`)
   builds the data; the skill would still need a query for `stories/`.
4. **Leave churn-only mode:** set `early_tier_mode: full`, or move up a maturity tier,
   once at least two signals are graded.

## Footer

- Tier counts: CRITICAL 0 · MEDIUM 0 · LOW 0 · watchlist 10
- hri_basis: single-signal (V_only) for all 33 files
- Ungraded: complexity `complexity_source_unset`; defect density `tracker_none`
- Machine-readable copy: `hotspot-map.json`
