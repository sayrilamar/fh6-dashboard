---
name: generate-exploratory-charter
mode: agent
description: "Generate a session-based exploratory test charter for high-risk or novel areas."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW TO CUSTOMIZE THIS SKILL
===========================

This skill is a universal template. It works out of the box for **any
team, tracker, manual-test management tool, domain, or risk model** —
it produces session-based exploratory charters in whatever idiom your
team uses; it does not impose one. You'll get sharper, faster results
if you fill in the per-repo specifics below.

**How placeholders work**: `{{NAME}}` strings are **documentation
placeholders, not runtime variables** — nothing substitutes them
automatically. The agent reads this file, then reads
`.assert-iq/config.yaml` to find the corresponding key (cited next to
each point). If the key is absent, the agent infers from repo signals
or asks you. Wire the values once in `.assert-iq/config.yaml` and they
flow into every skill that references them — no per-skill editing
required.

1. **Manual-test management tool** — set
   `.assert-iq/config.yaml > manual_test_management.tool`. Supported
   tools and the charter format the agent will produce:
   - `markdown` (default) — `.md` file under
     `manual_test_management.charter_path`
   - `azure_devops_test_plans` — ADO Test Plan / Suite entry
   - `testrail` — TestRail Test / Case
   - `xray` (Jira) — Xray Test of type "Exploratory"
   - `zephyr` (Jira) — Zephyr exploratory test
   - `qase` — Qase test case (Exploratory type)
   - `practitest` — PractiTest test
   - `tricentis_qtest` — qTest exploratory session
   - `sessiontester` / `rapid_reporter` — SBTM-native tools
   - `notion` / `confluence` — wiki-style charter page
   - `none` — produce text output only

2. **Charter output path** — for the `markdown` tool, set
   `.assert-iq/config.yaml > manual_test_management.charter_path`
   (default `./tests/_qi/exploratory/`). For tracker-backed tools,
   the charter is created via API / MCP at the configured location.

3. **Time-box default** — set
   `.assert-iq/config.yaml > exploratory_charter.timebox_minutes`
   (default `60`). Session-based test management (SBTM) convention is
   60–120 minutes; longer sessions degrade focus.

4. **Tester-skill tier** — set
   `.assert-iq/config.yaml > exploratory_charter.tester_skill_default`:
   - `novice` — agent includes more guidance, suggested touring
     heuristics, and explicit oracle examples
   - `intermediate` (default) — agent provides mission + oracles +
     light heuristics
   - `expert` — agent provides mission + risk hypothesis only; assumes
     tester brings the rest
   Override per-invocation.

5. **Risk-model / heuristics library** — set
   `.assert-iq/config.yaml > exploratory_charter.heuristics`. The
   agent draws charter ideas from the named heuristics. Options:
   - `satisfice_heuristics` (default) — Bach/Bolton SBTM heuristics
   - `touring` — Whittaker's tours (Guidebook, Money, FedEx,
     Saboteur, etc.)
   - `riskstorming`
   - `pacmad` — mobile-specific (Performance, Accuracy, Cognitive
     load, Memorability, Aesthetic, Disability)
   - `heuristic_test_strategy_model` (HTSM)
   - `custom` — point to a file under
     `exploratory_charter.heuristics_path`

6. **Domain mnemonics** — set
   `.assert-iq/config.yaml > exploratory_charter.domain_mnemonics`
   for domain-specific coverage cues. The agent ships with:
   - `SFDIPOT` (Structure / Function / Data / Interfaces /
     Platform / Operations / Time)
   - `CRUSSPIC_STMPL` (Capability / Reliability / Usability /
     Security / Scalability / Performance / Installability /
     Compatibility — quality criteria)
   - `FCC_CUTS_VIDS` (mobile)
   - `accessibility` (POUR — Perceivable / Operable / Understandable
     / Robust)
   - `i18n_l10n`
   - `data_privacy` (GDPR / CCPA / HIPAA cues)
   - `none`

7. **Escape-history lookup** — set
   `.assert-iq/config.yaml > escape_analysis.results_store` (shared
   with `analyze-escaped-defect`). The agent pulls recent escaped
   defects on the touched component(s) to focus the mission. If
   absent, the agent skips this step and notes the gap.

8. **Tracker** — set `.assert-iq/config.yaml > tracker.system` so
   charter findings can be filed via the
   [`generate-bug-report`](../generate-bug-report/SKILL.md) skill
   (ADO, Jira, GitHub Issues, GitLab, Linear, etc.).

9. **Session-report format** — set
   `.assert-iq/config.yaml > exploratory_charter.report_format`:
   - `sbtm` (default) — Session-Based Test Management report
     (Charter / Time / Test Notes / Bugs / Issues / Task Breakdown)
   - `freeform` — narrative notes
   - `tracker_native` — use the tool's built-in session report
     (TestRail, Xray, qTest)

10. **Re-charter cadence** — set
    `.assert-iq/config.yaml > exploratory_charter.recharter_after_days`
    (default `30`) — used in the follow-up recommendation when an
    area remains high-risk after the session.

11. **Platform notes** — this skill is platform- and domain-agnostic
    (web, mobile, desktop, embedded, API, ML model, infrastructure).
    Use `domain_mnemonics` to cue domain-specific exploration.
-->

# Generate exploratory charter

Produce a **session-based exploratory test charter** that targets areas
where scripted tests (automated or manual) are insufficient — new
features, integration seams, recent escapes, subjective qualities, or
pre-release confidence-building.

A charter is a **mission, not a script**. It names what to investigate,
suggests oracles, and time-boxes the work. The tester decides the
moves.

This skill is **tool-, tracker-, language-, platform-, and
team-agnostic** (see customization points 1–6 above).

## When to use this skill

- New or significantly changed area with limited existing coverage.
- Integration points across multiple services or third parties.
- Areas with recent escape history (informed by
  `escape_analysis.results_store`).
- Subjective qualities (UX, content, perceived performance,
  cross-cultural appropriateness, accessibility).
- Pre-release confidence-building before a high-stakes ship.
- When a scripted case would over-constrain investigation.

## Pre-conditions

- An area / work item / component is identified.
- The configured manual-test management tool
  (`manual_test_management.tool`) is reachable (MCP / API / local
  path).
- If using tracker-backed escape history, the configured
  `escape_analysis.results_store` is reachable.

## Inputs you must collect

- **Area or work item** under investigation (component, screen,
  endpoint, ML model, integration, work-item ID).
- **Time-box** (default from
  `exploratory_charter.timebox_minutes`).
- **Risk hypothesis** — what could go wrong; what would a customer
  notice; what is the worst-case business impact.
- **Tester skill tier** (default from
  `exploratory_charter.tester_skill_default`).
- **Domain context** — choose the relevant entries from
  `exploratory_charter.domain_mnemonics`.

## Procedure

1. **Pull context.**
   - If a work-item ID is provided, fetch it via the configured
     tracker (`tracker.system`) for AC and recent activity.
   - Pull the last N escaped defects on the touched component(s)
     from `escape_analysis.results_store` (default lookback: 90
     days). If unavailable, note the gap.
   - Pull recent change activity (PRs / commits / deploys) for the
     area to surface freshness signals.

2. **Frame the mission.** A charter mission has three parts:
   - **Explore** [target area / feature / component]
   - **With** [resources, tools, environments, data conditions]
   - **To discover** [risks, behaviors, qualities — the
     investigation goal]
   Keep the mission tight enough to scope the time-box and loose
   enough to permit improvisation.

3. **Surface the risk hypothesis** explicitly — "what is the most
   important thing we might learn?". Tie it to one or more QI signal
   layers (Outcome / Trust / Protection / Change).

4. **Recommend at least three oracles** the tester can apply to
   decide pass / fail / suspicious. Universal oracle classes:
   - **Specification** (AC, contract, RFC, design doc)
   - **Comparable product** (competitor, prior version, sister
     feature)
   - **Statistical** (telemetry baseline, expected distribution)
   - **User expectation** (mental model, conventions)
   - **Self-consistency** (does the system contradict itself?)
   - **Standards** (W3C, WCAG, RFC, regulatory)
   - **Domain heuristic** (per `exploratory_charter.heuristics`)
   - **Risk-pattern oracle** (recurring escape modes for this
     component)

5. **Cue coverage** using the configured
   `exploratory_charter.domain_mnemonics`. Surface 4–8 cues the
   tester might tour. Examples (SFDIPOT shown):
   - **Structure** — what is the system made of?
   - **Function** — what does it do?
   - **Data** — what kinds of inputs does it process?
   - **Interfaces** — what touches the outside world?
   - **Platform** — what does it run on / depend on?
   - **Operations** — how is it used / maintained?
   - **Time** — what happens over time, sequences, races?

6. **Set the time-box and session structure** per SBTM:
   - **Charter time** (planned)
   - **Test design / execution split** (typically 80/20 or 70/30)
   - **Bug / setup overhead allowance**
   - **Debrief slot** (10–15 min at the end)

7. **State explicit out-of-scope** — what this session is NOT
   investigating. Protects focus.

8. **Recommend follow-up actions:**
   - Convert findings to scripted cases (route to
     [`generate-manual-test-case`](../generate-manual-test-case/SKILL.md)
     when one exists, or `generate-automated-*-test`).
   - File defects via
     [`generate-bug-report`](../generate-bug-report/SKILL.md).
   - Propose automation backfill where exploration revealed a
     stable, repeatable hazard.
   - Schedule a re-charter after
     `exploratory_charter.recharter_after_days` if the area remains
     high-risk.

9. **Emit the charter** in the format set by
   `manual_test_management.tool` (markdown / ADO / TestRail / Xray /
   Zephyr / Qase / Notion / etc.), to the path or tracker location.

10. **Surface the debrief expectation.** Charter findings must be
    captured **before the session ends** — the deliverable explicitly
    asks for: Test Notes, Bugs found, Issues / Questions raised,
    Task Breakdown (charter / opportunity / setup / bug
    investigation). Use `exploratory_charter.report_format` (`sbtm`
    default).

## Stop conditions

- The investigation target fits a scripted case better than a charter
  — route to `generate-manual-test-case` or
  `generate-automated-*-test` and explain why.
- No risk hypothesis can be articulated even after probing — surface
  the gap; a charter without a "what we might learn" degenerates into
  unfocused poking.
- The time-box is < 30 minutes — too short for meaningful exploration;
  recommend either expanding the window or running a scripted smoke.
- The area requires destructive operations on shared infrastructure
  that exploration could surprise — require an isolated environment
  first.

## Governance

- **A charter is a mission, not a script.** Do **not** pre-write
  steps. Suggesting oracles, cues, and out-of-scope boundaries is
  fine; dictating moves is not.
- Reserve charters for genuinely exploratory work. If a scripted case
  fits, route appropriately.
- Charter findings must be captured before the session ends — the
  deliverable enforces this expectation.
- Exploratory sessions targeting production data must use synthetic
  or pre-sanitized data per `governance.mask_secrets`.
- The charter is a **draft** — the tester adapts the mission as they
  learn; the agent does not "grade" deviation from the charter.

## Output

A charter artifact in the format set by `manual_test_management.tool`:

- **Mission** — Explore / With / To discover
- **Risk hypothesis**
- **Time-box and session structure**
- **Suggested oracles** (≥ 3)
- **Coverage cues** (4–8 from `domain_mnemonics`)
- **Out-of-scope**
- **Debrief expectations** — Test Notes / Bugs / Issues / Task
  Breakdown per `exploratory_charter.report_format`
- **Follow-up recommendations** — convert / file / automate /
  re-charter
- **Tracker reference** to the work item or area, in the configured
  tracker's idiom

## Signals emitted

When the QI signal sink is wired, this skill emits a
`test.exploratory_charter` signal per generation conforming to
`.assert-iq/signal-schema.json`, carrying: `area`, `tool`,
`timebox_minutes`, `tester_skill`, `heuristics_used`,
`domain_mnemonics_used`, `escape_history_consulted` (boolean),
`oracle_count`, `signal_layer` (`outcome` | `trust` | `protection` |
`change`), and `tracker_ref`.
