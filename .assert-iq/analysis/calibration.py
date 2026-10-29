#!/usr/bin/env python3
"""
Assert.IQ Calibration Analysis Engine

Computes Brier score, confusion matrix, per-layer signal fidelity, and drift detection
over verdict and escape records. Provides structured calibration reports for decision
confidence measurement and reproducibility.

Usage:
    python3 calibration.py [--window-days 90] [--output report.json]
"""

import json
import sys
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple, Optional
from collections import defaultdict
import statistics


def load_verdicts(archive_path: Path) -> List[Dict]:
    """Load all verdicts from archive/YYYY/MM/verdicts-DD.jsonl files."""
    verdicts = []
    if not archive_path.exists():
        return verdicts
    
    for jsonl_file in archive_path.rglob("verdicts-*.jsonl"):
        try:
            with open(jsonl_file, "r", encoding="utf-8-sig") as f:
                for line in f:
                    if line.strip():
                        verdicts.append(json.loads(line))
        except (json.JSONDecodeError, IOError) as e:
            print(f"Warning: Error reading {jsonl_file}: {e}", file=sys.stderr)
    
    return verdicts


def parse_issued_at(verdict: Dict) -> Optional[datetime]:
    """
    Parse a verdict's `issued_at` into a timezone-aware UTC datetime.

    Verdicts are written as `datetime.utcnow().isoformat() + "Z"`, so the
    parsed value must be pinned to UTC before it can be compared against
    `utc_now()`. Timestamps that carry no offset are assumed to be UTC.
    Returns None when the field is missing or unparseable.
    """
    raw = verdict.get("issued_at") or ""
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def utc_now() -> datetime:
    """Current time as a timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def compute_brier_score(verdicts: List[Dict], window_days: Optional[int] = None) -> Dict:
    """
    Compute Brier score per verdict band.
    
    Brier score = mean((predicted_confidence - actual_outcome)^2)

    `verdict_score` is the predicted probability that the release is SOUND
    (0.95 = highly confident nothing escapes). `actual_outcome` must encode
    the same event, so:
      For verdicts without escapes: actual_outcome = 1.0 (release held)
      For verdicts with escapes:    actual_outcome = 0.0 (release did not hold)

    Lower is better: a confident green verdict that held scores ~0.0, while a
    confident green verdict that escaped is penalized heavily.
    """
    now = utc_now()
    cutoff = now - timedelta(days=window_days) if window_days else None
    
    verdicts_by_band = defaultdict(list)
    
    for verdict in verdicts:
        # Check if verdict is in time window
        if cutoff:
            verdict_time = parse_issued_at(verdict)
            # An unparseable timestamp cannot be placed in or out of the
            # window, so keep the verdict rather than silently dropping it.
            if verdict_time is not None and verdict_time < cutoff:
                continue
        
        band = verdict.get("verdict_band", "ungraded")
        score = verdict.get("verdict_score", 0.5)
        has_escape = verdict.get("linked_escape") is not None
        # Same-polarity as verdict_score (P(release is sound)): an escape means
        # the predicted event did NOT occur, so it drives actual_outcome to 0.0.
        actual_outcome = 0.0 if has_escape else 1.0

        # Brier penalty
        brier_penalty = (score - actual_outcome) ** 2
        verdicts_by_band[band].append({
            "verdict_score": score,
            "actual_outcome": actual_outcome,
            "brier_penalty": brier_penalty,
            "has_escape": has_escape
        })
    
    # Compute per-band Brier scores
    brier_scores = {}
    for band in ["green", "amber", "red", "ungraded"]:
        if verdicts_by_band[band]:
            penalties = [v["brier_penalty"] for v in verdicts_by_band[band]]
            brier_scores[band] = {
                "score": statistics.mean(penalties),
                "count": len(penalties),
                "stdev": statistics.stdev(penalties) if len(penalties) > 1 else 0.0,
                "escaped_count": sum(1 for v in verdicts_by_band[band] if v["has_escape"])
            }
        else:
            brier_scores[band] = {"score": None, "count": 0, "stdev": 0.0, "escaped_count": 0}
    
    # Aggregate Brier score
    all_penalties = [v["brier_penalty"] for verdicts in verdicts_by_band.values() for v in verdicts]
    aggregate_score = statistics.mean(all_penalties) if all_penalties else None
    
    return {
        "per_band": brier_scores,
        "aggregate": {
            "score": aggregate_score,
            "count": len(all_penalties),
            "window_days": window_days
        }
    }


def confusion_matrix(verdicts: List[Dict]) -> Dict:
    """
    Compute confusion matrix: predicted band vs. actual outcome (escape or not).
    
    Returns matrix keyed by predicted band with counts of TP (no escape) / FP (escaped).
    """
    matrix = {
        "green": {"correct": 0, "escaped": 0},
        "amber": {"correct": 0, "escaped": 0},
        "red": {"correct": 0, "escaped": 0},
        "ungraded": {"correct": 0, "escaped": 0}
    }
    
    for verdict in verdicts:
        band = verdict.get("verdict_band", "ungraded")
        has_escape = verdict.get("linked_escape") is not None
        
        if band in matrix:
            if has_escape:
                matrix[band]["escaped"] += 1
            else:
                matrix[band]["correct"] += 1
    
    # Compute metrics
    metrics = {}
    for band, counts in matrix.items():
        total = counts["correct"] + counts["escaped"]
        if total > 0:
            precision = counts["correct"] / total if total > 0 else 0.0
            metrics[band] = {
                "count": total,
                "correct": counts["correct"],
                "escaped": counts["escaped"],
                "precision": precision
            }
    
    return metrics


def layer_fidelity(verdicts: List[Dict]) -> Dict:
    """
    Compute per-layer signal fidelity:
    - Of verdicts with Change=WEAK, what fraction had actual escapes?
    - Same for Protection, Trust, Outcome
    """
    layer_signals = defaultdict(lambda: {"weak_verdicts": 0, "weak_with_escape": 0, "strong_verdicts": 0, "strong_with_escape": 0})
    
    for verdict in verdicts:
        has_escape = verdict.get("linked_escape") is not None
        layer_scores = verdict.get("layer_scores", {})
        
        for layer in ["change", "protection", "trust", "outcome"]:
            layer_info = layer_scores.get(layer, {})
            state = layer_info.get("state", "ungraded")
            
            if state == "weak":
                layer_signals[layer]["weak_verdicts"] += 1
                if has_escape:
                    layer_signals[layer]["weak_with_escape"] += 1
            elif state == "strong":
                layer_signals[layer]["strong_verdicts"] += 1
                if has_escape:
                    layer_signals[layer]["strong_with_escape"] += 1
    
    # Compute fidelity (predictiveness)
    fidelity = {}
    for layer, signals in layer_signals.items():
        weak_fidelity = (
            signals["weak_with_escape"] / signals["weak_verdicts"] 
            if signals["weak_verdicts"] > 0 else None
        )
        strong_fidelity = (
            1.0 - (signals["strong_with_escape"] / signals["strong_verdicts"])
            if signals["strong_verdicts"] > 0 else None
        )
        
        fidelity[layer] = {
            "weak_count": signals["weak_verdicts"],
            "weak_escaped": signals["weak_with_escape"],
            "weak_fidelity": weak_fidelity,
            "strong_count": signals["strong_verdicts"],
            "strong_escaped": signals["strong_with_escape"],
            "strong_fidelity": strong_fidelity
        }
    
    return fidelity


def drift_detection(verdicts: List[Dict], window_days: int = 30) -> Dict:
    """
    Detect drift in calibration accuracy over rolling windows.
    Compares Brier score across multiple windows to detect degradation.
    """
    now = utc_now()
    windows = []
    
    # Compute Brier score for each rolling window
    for i in range(0, 90, window_days):
        window_cutoff = now - timedelta(days=i + window_days)
        window_verdicts = []
        
        for verdict in verdicts:
            verdict_time = parse_issued_at(verdict)
            # Verdicts with no usable timestamp cannot be bucketed into a
            # rolling window, so they sit out of drift detection.
            if verdict_time is None:
                continue
            if window_cutoff <= verdict_time < (now - timedelta(days=i)):
                window_verdicts.append(verdict)
        
        if window_verdicts:
            brier = compute_brier_score(window_verdicts)
            windows.append({
                "window_days": i,
                "verdict_count": len(window_verdicts),
                "brier_aggregate": brier["aggregate"]["score"]
            })
    
    # Detect drift (increasing Brier score = degradation)
    drift_detected = False
    drift_trend = None
    if len(windows) >= 2:
        recent = windows[0]["brier_aggregate"]
        older = windows[-1]["brier_aggregate"]
        if recent and older:
            drift_trend = recent - older
            drift_detected = drift_trend > 0.05  # Threshold: 0.05 degradation
    
    return {
        "windows": windows,
        "drift_detected": drift_detected,
        "drift_trend": drift_trend,
        "recommendation": "Memory quality or feature changes may be degrading accuracy. Review recent updates." if drift_detected else "No significant drift detected."
    }


def main():
    """Main entry point for calibration analysis."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Assert.IQ Calibration Analysis")
    parser.add_argument("--window-days", type=int, default=90, help="Calibration window in days")
    parser.add_argument("--output", type=str, help="Output file for report (JSON)")
    parser.add_argument("--verdicts-path", type=str, default=".assert-iq/verdicts", help="Path to verdicts directory")
    
    args = parser.parse_args()
    
    # Load verdicts
    archive_path = Path(args.verdicts_path) / "archive"
    verdicts = load_verdicts(archive_path)
    
    if not verdicts:
        print(f"No verdicts found in {archive_path}", file=sys.stderr)
        sys.exit(1)
    
    # Compute calibration metrics
    report = {
        "timestamp": utc_now().isoformat().replace("+00:00", "Z"),
        "verdicts_analyzed": len(verdicts),
        "brier_score": compute_brier_score(verdicts, args.window_days),
        "confusion_matrix": confusion_matrix(verdicts),
        "layer_fidelity": layer_fidelity(verdicts),
        "drift_detection": drift_detection(verdicts)
    }
    
    # Output
    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="\n") as f:
            json.dump(report, f, indent=2)
        print(f"✅ Calibration report written to {args.output}")
    else:
        print(json.dumps(report, indent=2))
    
    return 0 if not report["drift_detection"]["drift_detected"] else 1


if __name__ == "__main__":
    sys.exit(main())
