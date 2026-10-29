---
name: measure-qi-impact
mode: agent
description: "Generate quarterly business impact dashboard — measure ROI, escape reduction, triage savings"
---

# Measure QI Impact

Convert QI verdicts, coverage data, and flake records into **business metrics a VP buys on**.

## Inputs

- **Baseline metrics** (from `.assert-iq/business-metrics/baseline.json`)
  - Escape rate (per quarter, pre-QI)
  - Triage hours (per quarter, pre-QI)
  - Cycle time (days, PR→release, pre-QI)
  - Capture date of baseline
  
- **Reporting period** (default: quarterly, configurable in `config.yaml`)

- **Cost model** (from `config.yaml > business_metrics`)
  - Escape incident cost ($)
  - Engineer burden rate ($/hour)

## Procedure

1. **Load config:** Read `.assert-iq/config.yaml > business_metrics`
2. **Load baseline:** Read `.assert-iq/business-metrics/baseline.json`
3. **Query verdict archive:** Read all verdicts in reporting period from `.assert-iq/verdicts/archive/`
4. **Count metrics:**
   - Escapes prevented = count of "red" verdicts (verdicts that predicted risk)
   - Triage hours saved = flake investigation + rootcause analysis hours
   - Cycle time improvement = PR→release time delta vs baseline
5. **Compute ROI:**
   - Economic value = (escapes prevented × incident cost) + (triage hours saved × burden rate)
6. **Generate dashboard:** 
   - **HTML output** → `.assert-iq/business-metrics/reports/YYYY-QN-report.html` (VP-ready, visually engaging)
   - **JSON output** → `.assert-iq/business-metrics/reports/YYYY-QN-report.json` (for trending)
7. **Return:** Markdown summary with link to HTML dashboard

## Output Format

### HTML Dashboard (`YYYY-QN-report.html`)

**Visual Design:**
- Hero section: "QI Business Impact — Q3 2026"
- Metric cards (4 columns, responsive):
  - **Escape Rate Improvement** — Baseline vs current (red→green), % delta, $XXX value
  - **Triage Hours Reclaimed** — Hours saved, $XXX value
  - **Cycle-Time Improvement** — Days delta, extra cycles/year
  - **ROI Per Defect** — Multiplier (16.7x), net value
- Summary bar: "YTD Total Economic Value: $850,000+"
- Recommendation: "✅ Renew Assert.IQ"
- Footnote: "Full data in YYYY-QN-report.json"

**HTML Requirements:**
- Responsive design (mobile-friendly)
- CSS styling embedded (no external dependencies)
- Color scheme: green (improvement), red (baseline), neutral (data)
- Accessibility: semantic HTML, ARIA labels, high contrast
- Print-friendly CSS

### JSON Report (`YYYY-QN-report.json`)

```json
{
  "report_id": "2026-Q3",
  "period": "2026-07-01 to 2026-09-30",
  "generated_at": "2026-09-30T23:59:59Z",
  "baseline": {
    "escape_rate_per_quarter": 12,
    "triage_hours_per_quarter": 200,
    "cycle_time_days": 18,
    "capture_date": "2026-05-01"
  },
  "current_period": {
    "verdicts_analyzed": 127,
    "escape_rate_per_quarter": 8,
    "triage_hours_per_quarter": 80,
    "cycle_time_days": 16
  },
  "metrics": {
    "escape_reduction": {
      "baseline": 12,
      "current": 8,
      "prevented": 4,
      "percent_improvement": 33,
      "economic_value": 200000
    },
    "triage_hours_saved": {
      "investigation_hours": 45,
      "rootcause_analysis_hours": 75,
      "total_hours": 120,
      "burden_rate": 85,
      "economic_value": 10200
    },
    "cycle_time": {
      "baseline_days": 18,
      "current_days": 16,
      "improvement_percent": 11,
      "extra_cycles_per_year": 8
    },
    "roi_per_defect": 16.7
  },
  "total_economic_value": 850000,
  "ytd_total": 850000,
  "recommendation": "Renew Assert.IQ"
}
```

## Configuration (in `.assert-iq/config.yaml`)

```yaml
business_metrics:
  enabled: true
  escape_incident_cost: 50000          # Avg cost to business of one prod incident
  engineer_burden_rate: 85             # $/hour all-in (salary + benefits + overhead)
  baseline_path: .assert-iq/business-metrics/baseline.json
  reporting_period: quarterly          # monthly | quarterly | annual
  report_sink: .assert-iq/business-metrics/reports/
  auto_generate: quarterly             # or false (manual only)
```

## Implementation Notes

- **Data sources:**
  - Verdicts → `.assert-iq/verdicts/archive/YYYY/MM/verdicts-DD.jsonl`
  - Flake records → `signals.sink` (if configured) or fallback to zero
  - Cycle time → Git commit timestamps (PR created → merged) or CI logs
  
- **Non-blocking:** If baseline not found, report "Baseline not set; provide `.assert-iq/business-metrics/baseline.json` to enable ROI tracking"

- **Quarterly generation:** Automatic if `auto_generate: quarterly` in config (runs at quarter boundary, archives report)

- **Trending:** Each report appended to index; user can generate trend analysis over multiple quarters

## Renewal Talking Points (Embedded in Dashboard)

After metrics computed, include:
- "✅ We prevented X production incidents (saved $X)"
- "⏱️ We reclaimed X hours of triage time (worth $X)"
- "🚀 We released 8 extra times this year due to faster cycles"
- "📊 Measured ROI: 16.7x per defect prevented"
- "🎯 Next steps: Continue investment to expand to [adjacent team/service]"
