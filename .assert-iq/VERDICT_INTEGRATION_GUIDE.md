# Verdict Integration Guide for Assert.IQ Skills

This guide shows how to integrate verdict recording into Assert.IQ skills.

## Overview

The v1.7.0+ skills emit verdicts that feed into Decision Confidence Calibration. 
Three core skills must record verdicts:
- `/risk-assess-pr` — PR risk assessment verdicts
- `/release-confidence` — Release go/no-go verdicts
- `/analyze-escaped-defect` — Escape linkage to prior verdicts

## Helper Library: VerdictRecorder

Location: `.assert-iq/analysis/verdict-recorder.py`

### Quick Start

```python
from verdict_recorder import VerdictRecorder
import uuid

recorder = VerdictRecorder()

verdict = {
    "verdict_type": "pr_risk_assessment",
    "verdict_band": "green",
    "verdict_score": 0.95,
    "layer_scores": {
        "change": {"state": "strong", "score": 0.9},
        "protection": {"state": "strong", "score": 0.95},
        "trust": {"state": "strong", "score": 0.93},
        "outcome": {"state": "strong", "score": 0.97}
    },
    "layer_weights": {
        "change": 0.25, "protection": 0.25, "trust": 0.25, "outcome": 0.25
    },
    "maturity_tier": "higher",
    "memory_version": "sha256:abc123...",  # Compute at verdict time
    "issued_by": "risk-assess-pr",
    "pr_id": "123",
    "release_id": None,
    "assumptions": ["No new infrastructure changes", "Tests are stable"],
    "linked_escape": None  # Populated later if escape discovered
}

result = recorder.record_verdict(verdict)
# result = {"success": True, "verdict_id": "...", "message": "..."}
```

## Integration Patterns

### Pattern 1: `/risk-assess-pr` Integration

At the end of PR risk assessment (before issuing final verdict):

```python
def issue_verdict(pr_id, change_score, protection_score, trust_score, outcome_score):
    """Issue risk assessment verdict and record to sink."""
    
    # Compute verdict band from layer scores
    avg_score = (change_score + protection_score + trust_score + outcome_score) / 4
    if avg_score >= 0.8:
        band = "green"
    elif avg_score >= 0.5:
        band = "amber"
    else:
        band = "red"
    
    # Compute memory version SHA256
    memory_version = compute_memory_hash(".assert-iq/memory")
    
    # Build verdict
    verdict = {
        "verdict_type": "pr_risk_assessment",
        "verdict_band": band,
        "verdict_score": avg_score,
        "layer_scores": {
            "change": {"state": "strong" if change_score >= 0.7 else "weak", "score": change_score},
            "protection": {"state": "strong" if protection_score >= 0.7 else "weak", "score": protection_score},
            "trust": {"state": "strong" if trust_score >= 0.7 else "weak", "score": trust_score},
            "outcome": {"state": "strong" if outcome_score >= 0.7 else "weak", "score": outcome_score},
        },
        "layer_weights": {"change": 0.25, "protection": 0.25, "trust": 0.25, "outcome": 0.25},
        "maturity_tier": config.get("maturity_tier"),
        "memory_version": memory_version,
        "issued_by": "risk-assess-pr",
        "pr_id": str(pr_id),
        "release_id": None,
        "assumptions": [
            "Change risk based on git diff scope",
            "Protection based on test coverage",
            "Trust based on flake history",
            "Outcome based on recent escapes"
        ],
        "linked_escape": None
    }
    
    # Record verdict (non-blocking)
    try:
        from verdict_recorder import VerdictRecorder
        recorder = VerdictRecorder()
        result = recorder.record_verdict(verdict)
        if not result['success']:
            print(f"⚠️ Warning: Verdict recording failed: {result['message']}")
    except Exception as e:
        print(f"⚠️ Warning: Could not record verdict: {e}")
    
    # Return verdict for PR comment
    return {
        "verdict_id": verdict.get("verdict_id"),
        "band": band,
        "score": avg_score,
        "decision": "Approve" if band == "green" else "Review" if band == "amber" else "Block"
    }
```

### Pattern 2: `/release-confidence` Integration

Similar to `/risk-assess-pr`, but for releases:

```python
def issue_release_verdict(release_id, decision_confidence):
    """Issue release confidence verdict."""
    
    verdict = {
        "verdict_type": "release_confidence",
        "verdict_band": "green" if decision_confidence >= 0.8 else "amber" if decision_confidence >= 0.5 else "red",
        "verdict_score": decision_confidence,
        "layer_scores": {...},  # Computed from signal analysis
        "layer_weights": {...},
        "maturity_tier": config.get("maturity_tier"),
        "memory_version": compute_memory_hash(".assert-iq/memory"),
        "issued_by": "release-confidence",
        "pr_id": None,
        "release_id": str(release_id),
        "assumptions": [...],
        "linked_escape": None
    }
    
    # Record verdict
    from verdict_recorder import VerdictRecorder
    recorder = VerdictRecorder()
    result = recorder.record_verdict(verdict)  # Non-blocking
    
    return result
```

### Pattern 3: `/analyze-escaped-defect` Integration (Linkage)

When an escape is discovered, find the original verdict and link it:

```python
def link_escape_to_verdict(defect_id, discovery_date, pr_id):
    """Link an escape to its original PR risk verdict."""
    
    # Query verdict sink for PRs matching pr_id
    import json
    from pathlib import Path
    
    verdicts_dir = Path(".assert-iq/verdicts/archive")
    matching_verdicts = []
    
    for jsonl_file in verdicts_dir.rglob("verdicts-*.jsonl"):
        with open(jsonl_file, 'r') as f:
            for line in f:
                verdict = json.loads(line)
                if verdict.get("pr_id") == str(pr_id) and verdict.get("verdict_type") == "pr_risk_assessment":
                    matching_verdicts.append(verdict)
    
    # Link escape to most recent verdict for this PR
    if matching_verdicts:
        original_verdict = max(matching_verdicts, key=lambda v: v.get("issued_at"))
        
        # Determine which layer failed
        change_score = original_verdict.get("layer_scores", {}).get("change", {}).get("score", 0)
        if change_score < 0.5:
            failed_layer = "change"
        # ... similar for other layers
        
        # Record linkage by appending updated verdict to audit trail
        escape_link = {
            "defect_id": defect_id,
            "discovery_date": discovery_date,
            "layer_failure": failed_layer
        }
        
        # Update verdict's linked_escape field (in practice, append new record)
        print(f"✅ Linked escape {defect_id} to verdict {original_verdict.get('verdict_id')}")
        print(f"   Defect: {defect_id}")
        print(f"   Original band: {original_verdict.get('verdict_band')}")
        print(f"   Layer that failed: {failed_layer}")
        
        # For calibration: this verdict becomes misprediction data
        return {"linked": True, "verdict_id": original_verdict.get("verdict_id")}
    
    return {"linked": False, "reason": "No matching PR verdict found"}
```

## Configuration for Skills

Add to skill code:

```python
import os
import sys

# Load config
config_file = ".assert-iq/config.yaml"
if os.path.exists(config_file):
    import yaml
    with open(config_file) as f:
        config = yaml.safe_load(f)
    
    # Check if verdicts are enabled
    verdicts_enabled = config.get("verdicts", {}).get("enabled", False)
    
    if verdicts_enabled:
        # Emit verdict as part of final output
        print(f"[VERDICT] Recorded to {config.get('verdicts', {}).get('record_path')}")
    else:
        print("[INFO] Verdict recording disabled")
else:
    print("[INFO] No Assert.IQ config found, skipping verdict recording")
```

## Helper Functions

### Compute Memory Version (SHA256)

**Call the library — do not reimplement this.** `memory_version` underpins the
reproducibility contract, so it has to produce the same value on every platform
the pack supports. Three details are easy to get wrong and were all wrong in an
earlier version of this guide:

- `sorted(Path(...).rglob("*"))` collates paths using the OS flavour —
  case-sensitively on POSIX, case-folded on Windows — so a store holding
  `MEMORY.md` and `apple.md` hashes in a different order on each platform.
- `.gitattributes` marks `*.md` as `text` without pinning `eol`, so memory
  topics check out CRLF on Windows and LF on macOS. Hashing raw bytes makes
  identical content hash differently.
- Opening the folder in Finder makes macOS drop a `.DS_Store` in it. It is
  gitignored, so nothing looks amiss, but an unfiltered walk folds it into the
  digest — browsing a directory silently moves `memory_version`.

```python
import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "verdict_recorder", Path(".assert-iq/analysis/verdict-recorder.py"))
verdict_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verdict_module)

memory_version = verdict_module.compute_memory_hash(".assert-iq/memory")
# -> "sha256-v2:<hex>"
```

The `sha256-v2` tag is part of the value. It keeps verdicts stamped by the
older algorithm distinguishable from current ones, so an algorithm change
never reads as memory drift.

### Layer State Determination

```python
def get_layer_state(score):
    """Map numeric score to state."""
    return "strong" if score >= 0.7 else "weak"
```

## Testing

These are the **pack's own** tests. `tests/_qi/automated/` validates the pack,
not your code, so it is deliberately not installed into a workspace — run these
from the pack checkout. They are plain scripts, not pytest cases, and the `.py`
one runs under whichever interpreter your box resolves (`python3` does not exist
on Windows even when Python is installed correctly).

Unit tests for verdict recording:

```bash
python3 .assert-iq/tests/_qi/automated/unit-verdict-recorder-stdlib.py
```

Integration tests for skill-level recording:

```bash
bash .assert-iq/tests/_qi/automated/integration-verdict-recording.sh
```

## Non-Blocking Guarantee

Verdict recording must NEVER block skill execution. Always wrap in try-except and log warnings only.

```python
try:
    recorder.record_verdict(verdict)
except Exception as e:
    print(f"⚠️ Verdict recording failed (non-blocking): {e}")
    # Continue anyway
```

## Questions?

Refer to:
- `.github/instructions/qi-foundation.instructions.md` — Verdict Recording section
- `.assert-iq/signal-schema.json` — Verdict object schema
- `.assert-iq/analysis/verdict-recorder.py` — Implementation reference
