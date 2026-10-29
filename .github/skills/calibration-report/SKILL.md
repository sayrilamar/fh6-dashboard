---
name: calibration-report
mode: agent
description: "Longitudinal verdict accuracy — Brier score, confusion matrix, per-layer fidelity, and drift, read against real escapes"
---

# Calibration Report

Answer one question with evidence: **are our verdicts actually right?**

Every `/risk-assess-pr` and `/release-confidence` verdict is recorded with its
predicted confidence. Escapes discovered later are linked back to the verdict
that missed them. This skill reads that history and reports how well the
predictions held up — per band, per layer, and over time.

This is the skill the Calibration & Reproducibility section of
`README.assert-iq.md` describes as "the moat": generic tooling cannot tell a
client how accurate *their* release decisions have been, because it never
recorded them.

## When to run it

- **Quarterly**, alongside `/measure-qi-impact` — that one reports business
  impact, this one reports whether the verdicts behind it were trustworthy.
- **After an escape** is linked via `/analyze-escaped-defect`, to see what the
  new data does to the numbers.
- **After a `/dream`** at higher maturity, to confirm consolidation did not
  degrade accuracy. (The automated version of that check is
  `dream-safety.py regression`; this is the human-readable view.)
- **Before an audit.** Regulated clients (SOX, ISO 27001, FedRAMP) use this
  plus the verdict archive as the evidence trail.

## Prerequisites

`verdicts.enabled: true` in `.assert-iq/config.yaml`, and verdicts actually
recorded in `.assert-iq/verdicts/archive/`. With no history there is nothing
to calibrate — say so plainly rather than reporting on an empty set.

Meaningful trend needs roughly **30 days and 20+ verdicts**; below that, report
the numbers but state that the sample is too small to act on.

## Procedure

1. **Check there is data.** If `.assert-iq/verdicts/archive/` is empty or
   missing, stop and tell the user verdict recording has not produced anything
   yet, and what turns it on. Do not fabricate a report.

2. **Run the analysis.** The maths lives in a script — do not reimplement it:

   ```bash
   python3 .assert-iq/analysis/calibration.py --window-days 90 --output calibration-report.json
   ```

   On Windows use `python` or `py -3`: the python.org installer ships
   `python.exe` but no `python3.exe`.

   Exit code **1** means drift was detected; that is a finding to report, not
   a failure to hide.

3. **Read the four sections** of the JSON it produces:

   | Section | What it answers |
   |---|---|
   | `brier_score` | Per band, how far predictions sat from what actually happened. Lower is better; a confident green that escaped is penalized hardest. |
   | `confusion_matrix` | Predicted band vs. actual escape/no-escape, with precision per band. Surfaces *systematic* misprediction. |
   | `layer_fidelity` | Of verdicts marked WEAK on a layer, how many really did escape. Measures whether each layer earns its weight. |
   | `drift_detection` | Rolling windows compared against each other, so degradation shows up as a trend, not a single bad quarter. |

4. **Interpret, don't dump.** A pasted JSON blob is not a report. Lead with the
   verdict on the verdicts, then the evidence:

   - **Where is accuracy weakest?** Name the band or layer, cite its number.
   - **What is the direction?** Improving, flat, or degrading across windows.
   - **What would you change?** Layer weights, a rubric, a gate threshold — tie
     each recommendation to the number that motivates it.

5. **Respect the maturity tier** from `.assert-iq/maturity-profile.md`:
   - **early** — report only. The sample is usually too thin to retune on.
   - **mid** — report and recommend weight adjustments; the human decides.
   - **higher** — recommend concrete config changes and flag any band whose
     precision has fallen below the team's agreed floor.

## Output

Markdown, in this order:

```
## Calibration Report — <period>, <N> verdicts

**Verdict on the verdicts:** <one sentence: are they trustworthy right now?>

### Accuracy by band
<table: band | count | Brier | precision | escapes>

### Per-layer signal fidelity
<table: layer | WEAK verdicts | actual escapes | fidelity>

### Drift
<direction across windows, with the numbers>

### What this means
- <finding, tied to a number>

### Recommendations
- <change, the number that motivates it, owner, timeline>

### Assumptions and limits
- <sample size, gaps, anything UNGRADED>
```

Always close with assumptions and limits. A calibration report that hides a
thin sample is worse than no report, because it invites a decision the data
cannot support.

## Guardrails

- **Never invent verdict history.** If the archive is thin, say so; do not
  extrapolate a trend from three data points.
- **Never edit the verdict archive.** It is append-only and it is audit
  evidence. Escape linkage is `/analyze-escaped-defect`'s job.
- **Do not re-derive the metrics by hand.** `calibration.py` is the single
  implementation; a second one in prose will drift from it.
- **Report drift even when it is unflattering.** Detecting that the pack's own
  verdicts got worse is the feature working, not a failure to soften.

## Related

- `/measure-qi-impact` — business impact; pairs with this for the quarterly review.
- `/analyze-escaped-defect` — links an escape back to the verdict that missed it, which is what makes these numbers possible.
- `/release-confidence`, `/risk-assess-pr` — the skills whose verdicts are being graded here.
- `.github/instructions/qi-foundation.instructions.md` — the calibration contract.
