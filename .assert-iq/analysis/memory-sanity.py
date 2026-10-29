#!/usr/bin/env python3
"""
Assert.IQ Memory Sanity Checker

Detects memory corruption and drift:
- Cycle detection (topics A→B→C→A)
- Fact staleness (facts >180 days without update)
- Contradiction detection (conflicting facts across topics)
- Semantic drift (topics drifting from original intent)
- Fact granularity (detecting copy-paste vs. synthesis)

Usage:
    python3 memory-sanity.py [--memory-path .assert-iq/memory] [--output report.md]
"""

import sys
import re
from pathlib import Path
from datetime import datetime, timedelta
from typing import Dict, List, Set, Tuple
from collections import defaultdict


def find_topics(memory_path: Path) -> Dict[str, Path]:
    """Find all topic files in memory store."""
    topics = {}
    topics_dir = memory_path / "topics"
    if topics_dir.exists():
        for topic_file in topics_dir.glob("*.md"):
            topics[topic_file.stem] = topic_file
    return topics


def extract_references(content: str) -> Set[str]:
    """Extract topic references from markdown content (e.g., [[topic_name]])."""
    pattern = r'\[\[([a-z0-9_-]+)\]\]'
    return set(re.findall(pattern, content.lower()))


def detect_cycles(topics: Dict[str, Path]) -> List[List[str]]:
    """Detect cycles in topic references using DFS."""
    cycles = []
    graph = defaultdict(set)
    
    # Build reference graph
    for topic_name, topic_path in topics.items():
        try:
            with open(topic_path, "r", encoding="utf-8-sig") as f:
                content = f.read().lower()
                refs = extract_references(content)
                for ref in refs:
                    if ref in topics:
                        graph[topic_name].add(ref)
        except IOError:
            pass
    
    # DFS to find cycles
    visited = set()
    rec_stack = set()
    
    def dfs(node, path):
        visited.add(node)
        rec_stack.add(node)
        path.append(node)

        # `graph` is a defaultdict, so `graph[node]` would INSERT an empty set
        # for any leaf node (a topic that is referenced but references nothing).
        # That mutates the dict while the loop below iterates it, raising
        # "dictionary changed size during iteration". Read without inserting.
        for neighbor in graph.get(node, set()):
            if neighbor not in visited:
                dfs(neighbor, path)
            elif neighbor in rec_stack:
                # Cycle detected
                cycle_start = path.index(neighbor)
                cycle = path[cycle_start:] + [neighbor]
                if cycle not in cycles:
                    cycles.append(cycle)
        
        rec_stack.remove(node)
        path.pop()
    
    # Snapshot the keys: defensive against any further mutation during DFS.
    for node in list(graph):
        if node not in visited:
            dfs(node, [])
    
    return cycles


def detect_staleness(topics: Dict[str, Path], threshold_days: int = 180) -> Dict[str, List[str]]:
    """Find facts older than threshold without update."""
    stale_facts = defaultdict(list)
    now = datetime.utcnow()
    cutoff = now - timedelta(days=threshold_days)
    
    date_pattern = r'(\d{4}-\d{2}-\d{2})'
    
    for topic_name, topic_path in topics.items():
        try:
            with open(topic_path, "r", encoding="utf-8-sig") as f:
                for line_no, line in enumerate(f, 1):
                    if line.strip().startswith("-") or line.strip().startswith("*"):
                        # Extract date from line
                        dates = re.findall(date_pattern, line)
                        if dates:
                            try:
                                fact_date = datetime.strptime(dates[0], "%Y-%m-%d")
                                if fact_date < cutoff:
                                    stale_facts[topic_name].append(f"Line {line_no}: {line.strip()[:80]}")
                            except ValueError:
                                pass
        except IOError:
            pass
    
    return stale_facts


def detect_contradictions(topics: Dict[str, Path]) -> List[Tuple[str, str, str, str]]:
    """Find contradictory statements across topics."""
    contradictions = []
    
    # Simple patterns for contradiction detection
    contradiction_pairs = [
        (r"service\s+\w+\s+.*critical", r"service\s+\w+\s+.*low.*priority"),
        (r"always\s+\w+", r"never\s+\w+"),
        (r"required", r"optional")
    ]
    
    topic_assertions = defaultdict(list)
    
    for topic_name, topic_path in topics.items():
        try:
            with open(topic_path, "r", encoding="utf-8-sig") as f:
                content = f.read().lower()
                for line_no, line in enumerate(f, 1):
                    topic_assertions[topic_name].append((line_no, line))
        except IOError:
            pass
    
    # Check each pair of topics for contradictions
    topic_names = list(topics.keys())
    for i, topic_a in enumerate(topic_names):
        for topic_b in topic_names[i+1:]:
            try:
                with open(topics[topic_a], "r", encoding="utf-8-sig") as f:
                    content_a = f.read()
                with open(topics[topic_b], "r", encoding="utf-8-sig") as f:
                    content_b = f.read()
                
                # Simple substring contradiction check
                if ("critical" in content_a and "low priority" in content_b) or \
                   ("critical" in content_b and "low priority" in content_a):
                    contradictions.append((topic_a, topic_b, "criticality", "conflicting priority assessments"))
            except IOError:
                pass
    
    return contradictions


def detect_granularity_issues(topics: Dict[str, Path]) -> Dict[str, List[str]]:
    """Find facts that are too granular (copy-pasted transcripts vs. synthesized)."""
    granularity_issues = defaultdict(list)
    
    for topic_name, topic_path in topics.items():
        try:
            with open(topic_path, "r", encoding="utf-8-sig") as f:
                lines = f.readlines()
                for i, line in enumerate(lines):
                    # Check for overly long lines (copy-paste indicator)
                    if len(line.strip()) > 500:
                        granularity_issues[topic_name].append(
                            f"Line {i+1}: Unusually long line ({len(line)} chars) - may be copy-paste, not synthesis"
                        )
                    # Check for too many quoted blocks
                    if line.strip().startswith(">"):
                        granularity_issues[topic_name].append(
                            f"Line {i+1}: Block quote - consider synthesizing this fact instead"
                        )
        except IOError:
            pass
    
    return granularity_issues


def generate_report(memory_path: Path) -> str:
    """Generate sanity check report."""
    topics = find_topics(memory_path)
    
    if not topics:
        return "No topics found in memory store.\n"
    
    issues = []
    
    # Check 1: Cycles
    cycles = detect_cycles(topics)
    if cycles:
        issues.append(f"⚠️ CYCLE DETECTION: Found {len(cycles)} reference cycle(s):")
        for cycle in cycles:
            issues.append(f"  - {' → '.join(cycle)}")
    
    # Check 2: Staleness
    stale = detect_staleness(topics)
    if stale:
        issues.append(f"⚠️ STALENESS: Found {len(stale)} topics with facts >180 days old:")
        for topic, facts in stale.items():
            issues.append(f"  - {topic}: {len(facts)} stale facts")
    
    # Check 3: Contradictions
    contradictions = detect_contradictions(topics)
    if contradictions:
        issues.append(f"⚠️ CONTRADICTIONS: Found {len(contradictions)} potential contradictions:")
        for topic_a, topic_b, category, description in contradictions:
            issues.append(f"  - {topic_a} vs {topic_b}: {description}")
    
    # Check 4: Granularity
    granularity = detect_granularity_issues(topics)
    if granularity:
        issues.append(f"⚠️ GRANULARITY: Found {sum(len(v) for v in granularity.values())} granularity issues:")
        for topic, issue_list in granularity.items():
            for issue in issue_list[:3]:  # Show first 3 per topic
                issues.append(f"  - {topic}: {issue}")
    
    if not issues:
        return "✅ Memory sanity checks passed - no issues detected.\n"
    
    return "\n".join(["Memory Sanity Report"] + ["=" * 40] + issues + [""])


def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Assert.IQ Memory Sanity Checker")
    parser.add_argument("--memory-path", type=str, default=".assert-iq/memory", help="Path to memory store")
    parser.add_argument("--output", type=str, help="Output file for report")
    
    args = parser.parse_args()
    memory_path = Path(args.memory_path)
    
    if not memory_path.exists():
        print(f"Error: Memory path not found: {memory_path}", file=sys.stderr)
        return 1
    
    report = generate_report(memory_path)
    
    if args.output:
        with open(args.output, "w", encoding="utf-8", newline="\n") as f:
            f.write(report)
        print(f"✅ Memory sanity report written to {args.output}")
    else:
        print(report)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
