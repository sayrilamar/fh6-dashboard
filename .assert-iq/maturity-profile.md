# Quality Intelligence Maturity Profile

<!-- markdownlint-disable MD033 -->
<!--
HOW TO USE THIS FILE
====================
1. Work through the checklist under "Rationale" — check every indicator
   that genuinely applies to your team today.
2. Count checked boxes to guide your tier choice (see the tier guide below).
3. Set the tier in this file AND in .assert-iq/config.yaml (maturity.tier).
4. Fill in the Effective and Re-evaluation dates.
5. Capture your rationale in plain language — 2–5 sentences is enough.
6. Get sign-off from the roles in the Approval section.
7. Re-run this file as a workspace prompt quarterly, or when a re-evaluation
   trigger fires, to keep the tier current.

TIER QUICK GUIDE
================
  early   → 0–4 indicators checked, or brand-new team / greenfield repo.
             Safest starting point. Agentic Healing disabled.
  mid     → 5–8 indicators checked, stable-but-maturing delivery.
             Healing operates in suggest-only mode.
  higher  → 9+ indicators checked, strong governance and signal pipeline.
             Full pack including autonomous healing within retry bounds.

When in doubt, choose the tier below where you think you are.
You can promote one tier at a time as indicators are established.
-->

## Current tier

**Tier**: `early`  *(options: early | mid | higher)*

**Effective**: `<YYYY-MM-DD>`
**Re-evaluation due**: `<YYYY-MM-DD>` *(recommended: 90 days from Effective)*

## Rationale

<!-- Replace the placeholder text below with 2–5 sentences explaining why
this tier was chosen for your team. Cite specific evidence where possible
(e.g. "We have no regression suite yet", "We run Playwright on every PR but
have no risk-based release process"). This text is read by the agent to
calibrate behavior. -->

> <Describe the evidence basis for this tier. What does your team do well?
> What gaps exist that prevented choosing a higher tier? What would need to
> be true to promote to the next tier?>

### Indicators present *(check every one that genuinely applies today)*

**Foundation**
- [ ] Working agreements documented and followed by the whole team
- [ ] Definition of Ready in active use on incoming work items
- [ ] Definition of Done in active use at the story/PR level

**Test signal**
- [ ] Regression suite exists and runs automatically on every PR
- [ ] Test results are visible to the whole team (dashboard, CI summary, etc.)
- [ ] Requirement-to-test traceability present in any form (comments, matrix, tags)

**Quality metrics**
- [ ] Defect containment rate tracked and reviewed at cadence
- [ ] Escape rate (defects found in prod) tracked and reviewed at cadence
- [ ] Environment stability (flake rate, infra failures) tracked

**Release governance**
- [ ] Risk-based release decisions documented and followed
- [ ] Cross-functional release governance in place (QE, Eng, Product, Ops)
- [ ] Release confidence synthesized from multiple signal sources

**Advanced / AI-assisted**
- [ ] Telemetry or observability signals inform delivery prioritization
- [ ] AI-assisted delivery with governance and human review gates in place
- [ ] Signal pipeline emits structured outcome data to a queryable sink

### Indicators absent *(gaps preventing a higher tier)*

<!-- List the specific indicators above that are not yet true for your team.
Be honest — this is the basis for a realistic promotion path. -->

- <e.g. No regression suite yet — tests run manually before release>
- <e.g. Defect containment not tracked; escape rate unknown>
- <Add more as needed>

### What would shift this tier up

<!-- List the 2–4 changes that, once true, would justify re-evaluating to
the next tier. These become your quality improvement backlog items. -->

- <e.g. Automated regression suite running on every PR for 2+ sprints>
- <e.g. Escape rate tracked and stable below X% for 2 release cycles>
- <Add more as needed>

## Tier behavior summary

The table below shows what the pack does at each tier. The **This tier** column
reflects your current selection above. Update it when the tier changes.

| Behavior | This tier |
|---|---|
| Foundation + traceability + manual generation | enabled |
| Automated test generation | enabled (mid+) / advisory (early) |
| Risk assessment on PRs | enabled (mid+) / advisory (early) |
| Agentic Healing | enabled in suggest-only mode (mid) / autonomous (higher) / disabled (early) |
| Dreaming (memory consolidation) | manual `/dream` only (early) / gate nudge at session start, user-run (mid) / may auto-fire on gate + optional background service (higher) |
| Release confidence reports | enabled (mid+) / disabled (early) |
| Routing classifier flags manual ACs as automation candidates | enabled (higher only) |
| Manual fallback produced even when AC routes to automation | enabled (early only) |

*Update the "This tier" column to reflect the behavior for your chosen tier.*

## Re-evaluation triggers

Re-evaluate the tier ahead of schedule when any of these occur — do not wait
for the quarterly date:

- Compliance posture changes (new regime added or removed)
- New tooling adopted that materially changes signal availability
- Team composition changes by more than 30%
- Sustained escape-rate change (up or down) over 2 consecutive release cycles
- Major architectural shift (e.g. monolith to microservices, platform migration)
- Agentic Healing repeatedly hitting its retry bound — may indicate over-promotion
- _<Add any project-specific triggers here>_

## Approval

| Role | Name | Date | Notes |
|------|------|------|-------|
| QI / Assert.IQ sponsor | `Jarius Hayes` | `5/18/2026` | |
| QE lead | `<name>` | `<date>` | |
| Engineering lead | `<name>` | `<date>` | |
| Delivery lead / EM | `<name>` | `<date>` | |

*Re-approve on tier promotion/demotion or when a re-evaluation trigger fires.*
