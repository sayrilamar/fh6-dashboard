#!/usr/bin/env python3
"""
Example: How to emit verdicts from an Assert.IQ skill
Complete, working example for skill maintainers.
"""

import sys
import json
import importlib.util
from pathlib import Path

def load_verdict_recorder():
    """Load the VerdictRecorder module dynamically."""
    analysis_dir = Path(".assert-iq/analysis")
    recorder_file = analysis_dir / "verdict-recorder.py"
    
    if not recorder_file.exists():
        print("⚠️ Warning: verdict-recorder.py not found, skipping verdict emission")
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


def perform_pr_risk_assessment(pr_id, files_changed, test_coverage, flake_rate):
    """Example PR risk assessment that emits a verdict."""
    
    # Compute four-layer scores
    if files_changed <= 3:
        change_score = 0.95
    elif files_changed <= 10:
        change_score = 0.75
    else:
        change_score = 0.45
    
    if test_coverage >= 0.8:
        protection_score = 0.95
    elif test_coverage >= 0.6:
        protection_score = 0.70
    else:
        protection_score = 0.40
    
    if flake_rate < 0.05:
        trust_score = 0.95
    elif flake_rate < 0.15:
        trust_score = 0.75
    else:
        trust_score = 0.40
    
    outcome_score = 0.85
    
    avg_score = (change_score + protection_score + trust_score + outcome_score) / 4
    
    if avg_score >= 0.8:
        verdict_band = "green"
    elif avg_score >= 0.5:
        verdict_band = "amber"
    else:
        verdict_band = "red"
    
    # Load helpers
    verdict_module = load_verdict_recorder()
    
    if verdict_module:
        compute_memory_hash = verdict_module.compute_memory_hash
        load_config = verdict_module.load_config
        VerdictRecorder = verdict_module.VerdictRecorder
        
        memory_version = compute_memory_hash()
        config = load_config()
        maturity_tier = config.get("maturity", {}).get("tier", "early")
    else:
        memory_version = "sha256:unavailable"
        maturity_tier = "early"
    
    # Build verdict object
    verdict = {
        "verdict_type": "pr_risk_assessment",
        "verdict_band": verdict_band,
        "verdict_score": avg_score,
        "layer_scores": {
            "change": {"state": "strong" if change_score >= 0.7 else "weak", "score": change_score},
            "protection": {"state": "strong" if protection_score >= 0.7 else "weak", "score": protection_score},
            "trust": {"state": "strong" if trust_score >= 0.7 else "weak", "score": trust_score},
            "outcome": {"state": "strong" if outcome_score >= 0.7 else "weak", "score": outcome_score}
        },
        "layer_weights": {"change": 0.25, "protection": 0.25, "trust": 0.25, "outcome": 0.25},
        "maturity_tier": maturity_tier,
        "memory_version": memory_version,
        "issued_by": "risk-assess-pr",
        "pr_id": str(pr_id),
        "release_id": None,
        "assumptions": [
            f"Change risk based on {files_changed} files modified",
            f"Protection based on {test_coverage*100:.1f}% test coverage",
            f"Trust based on {flake_rate*100:.1f}% flake rate"
        ],
        "linked_escape": None
    }
    
    # Record verdict (non-blocking)
    verdict_result = None
    if verdict_module:
        try:
            recorder = verdict_module.VerdictRecorder()
            verdict_result = recorder.record_verdict(verdict)
            
            if verdict_result['success']:
                print(f"✅ Verdict recorded: {verdict_result['verdict_id']}")
            else:
                print(f"⚠️ Verdict recording warning: {verdict_result['message']}")
        except Exception as e:
            print(f"⚠️ Warning: Verdict recording failed (non-blocking): {e}")
    
    return {
        "verdict_id": verdict_result.get('verdict_id') if verdict_result else "N/A",
        "verdict_band": verdict_band,
        "verdict_score": avg_score,
        "recommendation": {
            "green": "✅ Approve — Low risk",
            "amber": "⚠️ Review — Medium risk",
            "red": "🛑 Block — High risk"
        }[verdict_band],
        "details": {
            "change_risk": f"{change_score:.2f}",
            "protection": f"{protection_score:.2f}",
            "trust": f"{trust_score:.2f}",
            "outcome": f"{outcome_score:.2f}"
        }
    }


if __name__ == "__main__":
    print("=" * 80)
    print("EXAMPLE: Skill Verdict Integration")
    print("=" * 80)
    print()
    
    result = perform_pr_risk_assessment(
        pr_id="123",
        files_changed=5,
        test_coverage=0.82,
        flake_rate=0.03
    )
    
    print(f"\nResult:")
    print(json.dumps(result, indent=2))
