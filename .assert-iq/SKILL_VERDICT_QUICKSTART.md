# Skill Verdict Recording — Quick Start

**For skill maintainers implementing `/risk-assess-pr`, `/release-confidence`, or `/analyze-escaped-defect`.**

## The Five-Minute Integration

### Step 1: Load the Recorder

Copy this snippet into your skill code:

```python
import importlib.util
from pathlib import Path

def load_verdict_recorder():
    """Load the VerdictRecorder module."""
    analysis_dir = Path(".assert-iq/analysis")
    recorder_file = analysis_dir / "verdict-recorder.py"
    
    if not recorder_file.exists():
        return None
    
    try:
        spec = importlib.util.spec_from_file_location("verdict_recorder", recorder_file)
        if spec and spec.loader:
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    except Exception as e:
        print(f"⚠️ Warning: Could not load verdict recorder: {e}")
    
    return None

verdict_module = load_verdict_recorder()
```

### Step 2: Get Your Helpers

Once loaded, you have access to:

```python
# Helper functions
compute_memory_hash = verdict_module.compute_memory_hash
get_layer_state = verdict_module.get_layer_state
load_config = verdict_module.load_config
are_verdicts_enabled = verdict_module.are_verdicts_enabled

# Main class
VerdictRecorder = verdict_module.VerdictRecorder

# Usage
memory_version = compute_memory_hash()  # SHA256 of memory state
layer_state = get_layer_state(0.85)     # "strong" or "weak"
config = load_config()                  # Your config.yaml
recorder = VerdictRecorder()             # Initialize recorder
```

### Step 3: Build and Record Verdict

```python
verdict = {
    "verdict_type": "pr_risk_assessment",       # or "release_confidence"
    "verdict_band": "green",                    # green | amber | red | ungraded
    "verdict_score": 0.92,                      # 0.0-1.0
    "layer_scores": {
        "change": {"state": "strong", "score": 0.90},
        "protection": {"state": "strong", "score": 0.95},
        "trust": {"state": "strong", "score": 0.93},
        "outcome": {"state": "strong", "score": 0.97}
    },
    "layer_weights": {
        "change": 0.25, "protection": 0.25, "trust": 0.25, "outcome": 0.25
    },
    "maturity_tier": config.get("maturity", {}).get("tier", "early"),
    "memory_version": memory_version,
    "issued_by": "risk-assess-pr",              # Your skill name
    "pr_id": "123",                             # Or release_id for releases
    "release_id": None,
    "assumptions": [
        "No new infrastructure changes",
        "Tests are stable"
    ],
    "linked_escape": None                       # Populate if escape discovered
}

# Record (non-blocking — never fails the skill)
try:
    recorder = VerdictRecorder()
    result = recorder.record_verdict(verdict)
    if result['success']:
        print(f"✅ Verdict recorded: {result['verdict_id']}")
    else:
        print(f"⚠️ Warning: {result['message']}")
except Exception as e:
    print(f"⚠️ Warning: Verdict recording failed (non-blocking): {e}")
```

## Complete Working Example

See `.assert-iq/examples/skill-verdict-example.py` — a fully working PR risk assessment that emits verdicts.

Run it:
```bash
cd <workspace>
python3 .assert-iq/examples/skill-verdict-example.py
```

## Key Principles

✅ **Non-blocking**: Verdict recording NEVER fails the skill  
✅ **Graceful degradation**: If config disabled or files missing, continue anyway  
✅ **Immutable audit trail**: Verdicts append to `.assert-iq/verdicts/` — never edited  
✅ **Memory hash**: Computed at verdict time for reproducibility  
✅ **Layer state**: "strong" if score >= 0.7, else "weak"  

## What Gets Recorded

1. **JSONL archive**: `.assert-iq/verdicts/archive/YYYY/MM/verdicts-DD.jsonl`
2. **Index**: `.assert-iq/verdicts/index.json` — counters by band/type
3. **Audit trail**: `.assert-iq/verdicts/VERDICTS.md` — one-liner per verdict

## Testing Your Integration

```bash
# Run example
python3 .assert-iq/examples/skill-verdict-example.py

# Check verdict was recorded
cat .assert-iq/verdicts/VERDICTS.md

# View raw JSONL
cat .assert-iq/verdicts/archive/2026/08/verdicts-11.jsonl | jq .

# View index
cat .assert-iq/verdicts/index.json | jq .
```

## Next Steps

1. Copy the `load_verdict_recorder()` pattern into your skill
2. Follow the build-and-record pattern above
3. Run the example to see it in action
4. Verify against the pack's own suite — **from the pack checkout, not
   this workspace**. `tests/_qi/automated/` validates the pack itself and
   is deliberately not installed, so it is absent here:
   `bash .assert-iq/tests/_qi/automated/e2e-comprehensive-validation.sh`
5. Commit and deploy

## Questions?

Refer to:
- `.assert-iq/VERDICT_INTEGRATION_GUIDE.md` — Full 3-pattern guide
- `.assert-iq/examples/skill-verdict-example.py` — Working code
- `.assert-iq/analysis/verdict-recorder.py` — Implementation details
