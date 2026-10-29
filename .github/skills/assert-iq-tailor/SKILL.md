---
name: assert-iq-tailor
mode: agent
description: "Tailor a freshly-installed Assert.IQ pack to THIS codebase — discover the stack once, then customize config.yaml, governance.md, maturity-profile.md, the six instruction files, the skills, and mcp.json in dependency order, gated by human review. WHEN: customize the pack, tailor Assert.IQ, configure config.yaml for my repo, fill in the placeholders, set up governance, just installed the pack what next, onboard the pack to my codebase."
---

<!-- markdownlint-disable MD033 -->
<!--
HOW THIS SKILL RELATES TO /assert-iq-bootstrap
==============================================
`/assert-iq-bootstrap` does PLACEMENT — it copies the twelve pack
surfaces into the workspace (trial vs committed, presets, graduate,
uninstall). It never edits file CONTENT; everything it drops still
carries `<PLACEHOLDER>` values and universal-template defaults.

This skill does TAILORING — it takes that freshly-placed pack and
rewrites the configurable content so it describes THIS team: the right
tracker, VCS, test frameworks, traceability marker, governance posture,
maturity tier, and MCP servers. Run bootstrap first, then this.

WHY config.yaml IS THE KEYSTONE
===============================
Every skill in the pack is a universal template that reads its values
from `.assert-iq/config.yaml` at runtime (the `{{PLACEHOLDER}}` blocks
resolve from config keys). A thorough config.yaml pass therefore makes
~90% of per-skill customization happen automatically. This skill does
NOT rewrite skill bodies by default — that would diverge from the
shipped templates and make future pack upgrades a merge headache.
Instead it CONFIG-DRIVES the skills and only gap-checks them. Deep
skill-body rewriting is opt-in and tier-gated (see Phase 6).
-->

# /assert-iq-tailor

Walk a user who just installed the Assert.IQ pack through a thorough,
evidence-driven customization pass. You discover the codebase once, then
tailor the pack's configurable surfaces **in dependency order** so the
keystone (`config.yaml`) is set before anything that reads from it.

This skill is **language-, framework-, tracker-, VCS-, and
cloud-agnostic**. It tailors whatever stack the repo actually uses; it
does not impose one.

## When to use

- The user just ran `/assert-iq-bootstrap` (or `install.sh`) and wants
  the pack tailored to their codebase rather than left on defaults.
- The user explicitly typed `/assert-iq-tailor`, or asked to
  "customize the pack / fill in the placeholders / configure this for
  my repo."
- The agent detected unresolved `<PLACEHOLDER>` values in
  `.assert-iq/config.yaml` and the user wants them filled.

Do **not** use this skill to install or place the pack — that is
`/assert-iq-bootstrap`. If `.assert-iq/config.yaml` does not exist,
stop and route the user to `/assert-iq-bootstrap` first.

## Core principles

1. **config.yaml first, everything else after.** It is the keystone;
   downstream files and skills read from it.
2. **Discover once, tailor many.** Build a single Stack Profile up
   front, then reuse it for every file. Do not re-scan per file.
3. **Human review is a gate, not a formality.** Present the Stack
   Profile and proposed changes before writing. This is the QI
   human-review gate — never tailor governance or compliance silently.
4. **Infer the technical, ask the judgemental.** Frameworks, trackers,
   markers, and CI systems are detectable — infer them. Compliance
   regimes, tier rationale, and org URLs are not — ask.
5. **Never invent compliance.** Detecting a `payment/` path raises a
   PCI-DSS *question*; it never flips a regime to `yes`.
6. **Reversible and idempotent.** Snapshot every file before editing;
   re-running the skill must not double-edit.
7. **Preserve upgradability.** Prefer config keys over skill-body
   rewrites so the team can pull future pack versions cleanly.

## Phase 0 — Preconditions

1. Confirm `.assert-iq/config.yaml` exists. If absent → route to
   `/assert-iq-bootstrap` and stop.
2. Read `.assert-iq/config.yaml > maturity.tier`. It gates Phase 6.
3. Confirm the working tree is under version control and reviewable
   (so every edit shows up in `git diff`). If not, warn the user that
   changes will be harder to review and ask to proceed.
3b. Run the environment doctor and report anything it flags. **The doctor
   lives in the pack, not in this workspace** — `scripts/` is never part
   of the install payload, so a bare `scripts/check-environment.sh` will
   not resolve here. Resolve the pack root first:

   ```bash
   # macOS / Linux — $CLAUDE_PLUGIN_ROOT is set for installed packs;
   # fall back to the cloned checkout only if you are running inside it.
   bash "${CLAUDE_PLUGIN_ROOT:-.}/scripts/check-environment.sh"
   ```

   ```powershell
   # Windows
   pwsh -File "$env:CLAUDE_PLUGIN_ROOT\scripts\check-environment.ps1"
   ```

   If `$CLAUDE_PLUGIN_ROOT` is unset and this workspace is not the pack
   checkout, the doctor is genuinely unreachable. That is **expected for
   a normal install — not a sign of a broken or partial one.** Say so
   plainly, note the checks you could not run, and continue to Phase 1.
   Do not tell the user their install is missing files or predates the
   scripts; `.assert-iq/.install-manifest.json` lists exactly what was
   installed, and `scripts/` is correctly absent from it.

   When the doctor *does* run, tailoring only edits text, so a warning
   is not a hard stop — but a config that reads perfectly while the
   environment cannot run the pack is the worst outcome of this skill.
   Two failures in particular make later phases
   misleading: **no working Python 3** (the calibration, memory-sanity
   and verdict tooling this config points at will not run) and
   **`.claude/skills` present as a copy rather than a symlink** (Claude
   then reads a stale snapshot, so skill-facing config changes appear to
   do nothing until the installer is re-run). Surface these before
   Phase 2, not after the user has approved a plan.
4. Note whether this is a first run (placeholders present) or a re-run
   (snapshots already exist). On a re-run, treat existing
   `*.assert-iq.pre-tailor` snapshots as the baseline — do not
   overwrite them.

## Phase 1 — Discovery (read-only)

Build a **Stack Profile** by scanning the workspace. Do this once. Be thorough - no hand-waving. For
large repos, run the independent scans in parallel. Detect:

| Dimension | Signals to read |
|---|---|
| Languages | file extensions, `*.csproj` / `*.sln`, `package.json`, `pyproject.toml`, `go.mod`, `pom.xml`, `Gemfile`, `Cargo.toml` |
| Test framework(s) | test deps + test dirs: xUnit/NUnit/MSTest (`*Tests.csproj`), Jest/Vitest (`package.json`), pytest (`pyproject`/`conftest.py`), JUnit/TestNG, Playwright/Cypress configs |
| Run / coverage commands | `dotnet test`, `npm test`, `pytest`, `go test ./...`; coverage flags from CI or scripts |
| CI system | `.github/workflows/**` → GitHub Actions; `azure-pipelines.yml` → Azure Pipelines; `*.gitlab-ci.yml`; `Jenkinsfile` |
| Tracker | infer from CI/links/remote: GitHub Issues, Azure Boards (ADO), Jira, Linear |
| VCS host | `git remote -v` host: github.com / dev.azure.com / gitlab / bitbucket |
| API contracts | `openapi*.y?ml`, `swagger*.json`, `asyncapi*.y?ml`, `*.proto`, Pact files |
| Topology | one repo with code+tests (monorepo) vs split prod/tests |
| Sensitive paths | dirs matching `payment*`, `billing`, `auth`, `checkout`, `export*`, `migrations`, PII/PCI hints |
| Manual test tooling | ADO Test Plans (tracker is ADO), Xray / Zephyr (Jira apps), TestRail (links, `testrail` in CI or scripts), else markdown |
| Data factories | AutoFixture, Bogus, Faker, factory_boy, FactoryBot present in deps |
| Traceability idiom | dominant language → marker style (C#/XAML → `qi_trace_xml`, JS/TS → `jsdoc`, Python → `python_doc`, Go → `go_comment`, etc.) |

Record the evidence for each detection (the file/path that proves it),
so the review step can show its work. Where a dimension cannot be
detected, mark it **needs input** — do not guess.

## Phase 2 — Align (the review gate)

Present the Stack Profile to the user as a compact table: each detected
value, the evidence, and the proposed config key it will set. Then:

1. Ask **only** for what could not be inferred or is a judgement call:
   - Tracker org/project URL + project key (e.g. ADO organization URL
     and project; Jira base URL + key).
   - Compliance regimes that apply (offer the detected sensitive-path
     hints as *prompts*, e.g. "I see `checkout/` and `payment/` — does
     PCI-DSS apply?").
   - Maturity tier confirmation + a 2–5 sentence rationale, and the
     Effective / Re-evaluation dates.
   - `governance.escalation_owner` (who gets paged on a policy violation
     or failed heal) and, if a regime applies, `governance.compliance`.
   - Whether verdicts must be tracked in git (`verdicts.track_in_git`) —
     yes for regulated clients (SOX/ISO 27001/FedRAMP), no otherwise.
   - Real `business_metrics` figures — `escape_incident_cost`,
     `engineer_burden_rate`, and the actual pre-QI baseline (escape
     rate, triage hours, cycle time) for `.assert-iq/business-metrics/baseline.json`.
     If the team has no data yet, mark **needs input** and leave the
     shipped placeholder with a `TODO(tailor):` rather than inventing
     numbers.
2. Confirm the proposed marker style and test commands.
2b. Confirm the two settings that ship as **working defaults rather than
   placeholders**. Nothing else will ever prompt for them, and both fail
   silently when wrong:
   - `manual_test_management.tool` — ships as `markdown`. A team on ADO
     Test Plans, Xray, Zephyr or TestRail otherwise keeps generating
     markdown into `./tests/_qi/manual/` forever. It works, which is
     exactly why nobody notices.
   - `signals.sink` — ships as `type: file` writing to
     `./.assert-iq/runs/`. Ask where QI outcome payloads should actually
     land (file artifact, webhook, telemetry endpoint), because
     `qi-signal-emission.instructions.md` makes CI publish there.
3. Get explicit go-ahead before writing anything. This is the mandatory
   human-review gate.

## Phase 3 — Tailor `config.yaml` (keystone)

Snapshot, then fill **every** `<PLACEHOLDER>` you have evidence or an
answer for. If you're unsure, ask the user. Leave a clearly-marked `TODO(tailor):` only where a secret
or human-only value is required.

- `client.name`, `client.account_id`, `client.embedded_team`, `client.context` (1–3 sentence
  domain/stack summary from the Stack Profile).
- `tracker.type` **and** `tracker.system` (keep the alias in sync); fill
  the matching sub-block (github/ado/jira/linear); comment out the rest.
- `vcs.type` **and** `vcs.host` (keep in sync); `default_branch`.
- `maturity.tier` + `rationale` (mirror what you set in the profile).
- `test_framework.primary` / `language` / `test_command` /
  `targeted_test_command` / `coverage_command` / `test_root`; plus
  `unit`, `api`, `api_contract`, `api_auth`, `data_factory` where known.
- `traceability.marker_style` to the detected idiom.
- `client.account_id` ships as a live `<Engagement or project ID>`
  placeholder — do not skip it.
- `manual_test_management.tool` / `output_path` / `charter_path` — set
  from the Phase 2 answer, plus the matching `project_key` sub-block for
  Xray / Zephyr / TestRail. **Never leave this on the shipped `markdown`
  default without asking.** It is a working default, not a placeholder,
  so it never shows up as an unfilled value, and it drives
  `/generate-manual-test-case`, `/generate-exploratory-charter`, and the
  import format `qi-manual-test-design.instructions.md` expects.
- `signals.emit_on_ci` / `signals.sink.type` / `signals.sink.path` (or
  `webhook_url`) / `signals.schema_path` — set from the Phase 2 answer.
  Phase 5 points the CI emission step at "the configured signal sink";
  this is where that sink actually gets configured.
- `dreaming.enabled` and `dreaming.gate.*` — confirm rather than assume.
  The gate thresholds (`min_hours_between_dreams`,
  `min_sessions_between_dreams`) decide how often `/dream` is nudged.
  Leave `dreaming.background_service.enabled: false` unless the team has
  an `ANTHROPIC_API_KEY` available and wants autonomous consolidation.
- `pr.risk_thresholds.sensitive_paths` — add the detected sensitive
  dirs to the shipped defaults.
- `workspace.role` + `companion_repo` when split-repo was detected.
- `governance.escalation_owner` (and `governance.compliance` when a
  regime applies) — mirror the Phase 2 answers; never leave the
  shipped placeholder on a reviewed repo.
- `oracle.grader.model` / `oracle.verdict_sink` / `defaults_by_artifact_type`
  — confirm the rubric IDs referenced actually exist under
  `.assert-iq/oracles/rubrics/`; `maturity_gating` already mirrors
  `maturity.tier` by default and rarely needs a manual edit.
- **Validate every model ID against the current model list**, even when
  the shipped default looks plausible. Model IDs are lowercase and carry
  no date suffix; as of v2.1.0 the pack ships `claude-opus-5` in both
  `oracle.grader.model` and `dreaming.background_service.model`. Other
  current IDs are `claude-opus-4-8`, `claude-sonnet-5`, and
  `claude-haiku-4-5`. Do not reconstruct an ID from memory — if unsure,
  ask the user or check the provider's published model list.
  This check exists because the pack shipped
  `"claude-3-5-sonnet"` and `"claude-Opus-4-8"` for several releases: the
  second is not a valid ID at all (note the capital O), and neither key
  is read by any code, so nothing failed and nobody noticed. A wrong
  model ID in config surfaces only at the first real call — long after
  the tailoring pass that should have caught it.
- `verdicts.track_in_git` — set per the Phase 2 compliance answer.
- `business_metrics.escape_incident_cost` / `engineer_burden_rate` —
  fill with the real figures from Phase 2, and tailor
  `.assert-iq/business-metrics/baseline.json` (`escape_rate_per_quarter`,
  `triage_hours_per_quarter`, `cycle_time_days_pr_to_release`) with the
  team's actual pre-QI numbers. Never leave the shipped sample data in
  place silently — either replace it or flag it `TODO(tailor):` with a
  note that ROI reporting will be inaccurate until it's real.
- `story_estimation.scale` and `story_estimation.tracker_fields` — set the
  team's pointing scale and confirm the Story Points field for their
  tracker (the Jira custom field ID varies per instance). Do **not** fill
  in `.assert-iq/team-profile.yaml` here: `/estimate-story` scaffolds it
  with the team on first run, role slots only.
- `dreaming_provenance`, `regression_testing`, `calibration`,
  `memory_sanity` — these ship with sane defaults and rarely need
  edits; only touch them if the user has an explicit opinion (e.g.
  enabling `regression_testing` once they've populated a golden
  corpus, or raising `calibration.min_verdicts_for_stats` for a
  high-volume team).

Do not remove the explanatory comments — they help the next maintainer.

## Phase 4 — Tailor `governance.md` + `maturity-profile.md`

Snapshot each, then:

- **governance.md**: set each regime's "Applies" to the user's answers
  from Phase 2 (`yes` / `partial` / `no`). For every `yes`/`partial`,
  fill the per-regime block (data classes, where they live, refusal
  pattern). Delete rows the user said don't apply. **Never** set a
  regime to `yes` without an explicit user answer.
- **maturity-profile.md**: set the tier (matching `config.yaml`), the
  Effective and Re-evaluation dates, the plain-language rationale, and
  check the indicators the user confirmed. Keep the two tier values in
  lockstep — a mismatch is a defect.

## Phase 5 — Tailor the six instruction files

Snapshot each, then tailor to the detected stack:

- `qi-traceability.instructions.md` — **narrow** the `applyTo` glob to the
  languages this repo ships (it deliberately ships inclusive so a fresh
  install is never silently inert), and set
  `traceability.marker_style` in `config.yaml` to the detected idiom. The
  file resolves its marker from that key, so prefer setting the key over
  editing the file's style table. Leave the table itself intact: it must
  keep listing every value `config.yaml` accepts, or a later
  `marker_style` change will point at a style the file does not document.
- `qi-signal-emission.instructions.md` — point the emission step at the
  detected CI system and the configured signal sink.
- `qi-test-design.instructions.md` / `qi-manual-test-design.instructions.md`
  — adjust framework-specific examples only where they conflict with
  the detected framework. Do not over-edit; these are mostly universal.
- `qi-oracle.instructions.md` — confirm the maturity-tier gating table
  matches `oracle.maturity_gating` in `config.yaml`; leave the rubric
  immutability/versioning rules untouched — those are universal, not
  per-client.
- `qi-foundation.instructions.md` — leave as-is unless the user wants a
  client-specific note; it is the shared rulebook.

## Phase 6 — Skills pass (LIGHT by default)

Default behavior — a **config-driven gap-check**, not a rewrite:

1. For each skill in `.github/skills/` that was installed with the pack, read its HOW-TO-CUSTOMIZE    block
   and identify the `config.yaml` keys it depends on. This includes the
   newer skill families, not just the original generation/review set:
   Oracle (`define-quality-rubric`, `grade-with-rubric` → `oracle.*`),
   Business Impact (`measure-qi-impact` → `business_metrics.*` +
   `.assert-iq/business-metrics/baseline.json`), and Memory
   (`dream` → `dreaming.*`, `dreaming_provenance.*`, `memory_sanity.*`).
2. Report any keys that are still unset or still `<PLACEHOLDER>` after
   Phase 3 — these are the only places a skill won't behave correctly.
3. Offer to fill the remaining keys (preferred) rather than editing the
   skill body.
4. Optionally offer to trim the long HOW-TO-CUSTOMIZE comment blocks for
   a leaner repo — for model token management, opt-in.

**Deep mode (opt-in, tier-gated):** only when the user explicitly asks
to rewrite skill bodies AND `maturity.tier` is `mid` or `higher`. Below
`mid`, decline deep rewrites and explain that config-driving keeps the
pack upgradable. Warn that deep edits complicate future pack upgrades.

**Agents are out of scope for this skill — and one half of them is
generated.** Deep mode covers skill bodies only. `.github/agents/` and
`.claude/agents/` are not tailoring surfaces: they carry reasoning
prose, not per-client values. If the user insists on editing a
specialist agent, the source of truth is
`.claude/agents/specialists/*.md`; the Copilot side
(`.github/agents/specialists/*.agent.md`) is **generated** from it by
`scripts/sync-agents.sh` (`sync-agents.ps1` on Windows).

**Where that sync can run depends on where you are.** In the pack
checkout, edit the Claude source, re-run the sync, then the parity
check (P5/P6 in `e2e-agent-parity.sh`). In an installed workspace
`scripts/` does not exist — both agent trees there are install *output*,
not a build product, so there is nothing to regenerate. Edit both sides
by hand to keep them consistent and tell the user the change is local:
the next pack upgrade overwrites it unless the same edit lands in the
pack source.

## Phase 7 — Tailor `mcp.json`

Snapshot `.vscode/mcp.json`, then:

- Keep the MCP server entries the Stack Profile needs (the detected
  tracker + VCS host, plus `git`; add `playwright` when UI tests were
  detected, observability servers when that telemetry was detected).
- Comment out — do not delete — the servers the team does not use, so
  re-enabling later is trivial.
- Leave all `${input:...}` secret placeholders intact; never inline a
  credential. Note any inputs the user must supply at first run.

## Phase 8 — Review & summary

1. Print a per-file change table: file, what changed, snapshot path.
2. List remaining `TODO(tailor):` items that need a human (secrets,
   org URLs, sign-off).
3. Remind the user to **review the diff** before committing — AI-tailored
   config is a draft pending the human-review gate.
4. Remind them to **reload the editor** so instruction changes load
   (VS Code: `⇧⌘P` → "Reload Window"; Claude Code: restart session).
5. Close with **Recommendation, Next Steps, Owners, Timeline**.

## Safety model

- Before editing any file, snapshot it to `<file>.assert-iq.pre-tailor`
  (mirrors bootstrap's `*.assert-iq.pre-install` convention). This makes
  the pass reversible and idempotent: on a re-run, an existing
  `.pre-tailor` snapshot is the baseline and is **not** overwritten.
- To revert a single file: copy its `.pre-tailor` snapshot back over it.
- The `*.assert-iq.pre-tailor` glob is already in the bootstrap-managed
  `.git/info/exclude` block, so snapshots never leak into git. If you
  create a snapshot outside the dirs bootstrap manages, add an exclude
  entry yourself. The skill never commits, pushes, or touches anything
  outside the workspace.
- These snapshots are **not** in the install manifest. Bootstrap
  `--uninstall` sweeps any leftover `*.assert-iq.pre-tailor` files (under
  `.assert-iq/`, `.github/instructions/`, `.vscode/`) so uninstall leaves
  no tailor litter behind. If you snapshot elsewhere, remove it manually
  when done.

## Anti-patterns (do not do these)

- Do **not** tailor `config.yaml` last — keystone goes first.
- Do **not** set a compliance regime to `yes` without an explicit user
  answer.
- Do **not** rewrite skill bodies by default; config-drive them.
- Do **not** let `maturity.tier` differ between `config.yaml` and
  `maturity-profile.md`.
- Do **not** inline secrets into `mcp.json`; keep `${input:...}`.
- Do **not** leave `manual_test_management.tool` or `signals.sink` on
  their shipped defaults without asking. They are working defaults, not
  placeholders, so they satisfy every "unfilled value" check while being
  wrong for most teams.
- Do **not** leave a model ID unvalidated because it looks plausible.
  `config.yaml` shipped `claude-Opus-4-8` for several releases, which is
  not a valid ID.
- Do **not** edit `.github/agents/specialists/*.agent.md` in the pack
  checkout — they are generated from `.claude/agents/specialists/*.md`.
  Edit the source and re-run `scripts/sync-agents.sh`. In an installed
  workspace that script is absent by design; see Phase 6.
- Do **not** skip the snapshot step — every edit must be reversible.
