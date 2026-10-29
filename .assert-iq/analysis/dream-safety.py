#!/usr/bin/env python3
"""
Dream safety: the pre- and post-dream steps qi-foundation requires.

WHY THIS EXISTS

`qi-foundation.instructions.md` > Memory Poisoning Prevention states that
before /dream consolidates memory the pack will (1) run sanity checks,
(2) snapshot the memory store, (3) log the cycle in provenance.json, and
(4) regression-test the golden corpus afterwards. None of that was wired to
anything: the /dream skill never mentioned steps 1, 2 or 4, nothing ever
wrote provenance.json, and `.snapshots/` stayed empty -- while
`integration-dream-provenance.sh` passed, because it only checked that the
provenance file existed and parsed.

That gap mattered beyond tidiness. The reproducibility contract in the same
instruction file opens with "restore memory snapshot:
tar xzf .snapshots/mem-<version>.tar.gz" -- a step that could never work,
because no snapshot was ever taken.

This module is the deterministic half of that procedure. The judgement half
(deciding what to consolidate; re-running assessments for the regression
corpus) stays in the /dream skill, where a model does it.

USAGE

    python3 .assert-iq/analysis/dream-safety.py pre
    python3 .assert-iq/analysis/dream-safety.py post --cycle-id <id>
    python3 .assert-iq/analysis/dream-safety.py regression --cycle-id <id> \
        --results actual.jsonl

On Windows use `python` or `py -3`: the python.org installer ships
python.exe but no python3.exe.

EXIT CODES
    0  proceed
    1  blocked -- a gate failed and the maturity tier enforces it
    2  usage or environment error

PORTABILITY: stdlib only, and every path is built with pathlib so the same
file works on Windows, macOS and Linux.
"""

import argparse
import importlib.util
import json
import sys
import tarfile
from datetime import datetime, timezone
from pathlib import Path

# Windows consoles default to cp1252 and would raise UnicodeEncodeError on the
# status markers below.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

ANALYSIS_DIR = Path(__file__).resolve().parent

EXIT_OK = 0
EXIT_BLOCKED = 1
EXIT_ERROR = 2


def _load(filename, module_name):
    """Import a sibling module whose filename has a hyphen in it.

    `verdict-recorder.py` and `memory-sanity.py` are not legal Python
    identifiers, so they can only be loaded by path. Mirrors the loader in
    .assert-iq/analysis/__init__.py.
    """
    path = ANALYSIS_DIR / filename
    if not path.is_file():
        raise ImportError(f"cannot locate {filename} at {path}")
    spec = importlib.util.spec_from_file_location(module_name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def utc_now():
    return datetime.now(timezone.utc)


def stamp(moment):
    """Compact UTC stamp usable inside a filename on every platform."""
    return moment.strftime("%Y%m%dT%H%M%SZ")


def iso(moment):
    return moment.isoformat().replace("+00:00", "Z")


def read_json(path, default):
    try:
        # utf-8-sig: Windows PowerShell 5.1 writes a BOM, which json.load rejects.
        with open(path, "r", encoding="utf-8-sig") as handle:
            return json.load(handle)
    except (IOError, OSError, ValueError):
        return default


def write_json(path, payload):
    """Write JSON via a temp file so an interrupted run cannot truncate it.

    provenance.json is an append-only audit log; a half-written file would
    lose every prior cycle.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")
    tmp.replace(path)


class Context:
    """Resolved config + paths for one invocation."""

    def __init__(self, workspace="."):
        self.workspace = Path(workspace).resolve()
        recorder = _load("verdict-recorder.py", "aiq_dream_safety_recorder")
        self.compute_memory_hash = recorder.compute_memory_hash
        self.config = recorder.load_config(str(self.workspace / ".assert-iq" / "config.yaml"))

    def _cfg(self, section, key, default):
        block = self.config.get(section)
        if not isinstance(block, dict):
            return default
        value = block.get(key, default)
        return default if value is None else value

    @property
    def tier(self):
        return str(self._cfg("maturity", "tier", "early")).strip().lower()

    @property
    def memory_dir(self):
        return self.workspace / self._cfg("dreaming", "memory_dir", ".assert-iq/memory")

    @property
    def snapshot_dir(self):
        return self.workspace / self._cfg(
            "dreaming_provenance", "snapshot_path", ".assert-iq/dreaming/.snapshots")

    @property
    def snapshot_retention(self):
        try:
            return max(1, int(self._cfg("dreaming_provenance", "snapshot_retention", 10)))
        except (TypeError, ValueError):
            return 10

    @property
    def provenance_path(self):
        return self.workspace / ".assert-iq" / "dreaming" / "provenance.json"

    @property
    def provenance_enabled(self):
        return bool(self._cfg("dreaming_provenance", "enabled", True))

    @property
    def sanity_enabled(self):
        return bool(self._cfg("memory_sanity", "enabled", True))

    @property
    def regression_enabled(self):
        return bool(self._cfg("regression_testing", "enabled", False))

    @property
    def golden_corpus_path(self):
        return self.workspace / self._cfg(
            "regression_testing", "golden_corpus_path",
            ".assert-iq/tests/_qi/regression/golden-corpus.jsonl")

    @property
    def max_divergence_pct(self):
        try:
            return float(self._cfg("regression_testing", "max_verdict_divergence_pct", 5))
        except (TypeError, ValueError):
            return 5.0

    @property
    def block_on_regression(self):
        return bool(self._cfg("regression_testing", "block_dream_on_regression", False))

    def enforces(self):
        """Whether a failed gate blocks, or only warns.

        qi-foundation: "Higher maturity tiers enforce regression blocking;
        lower tiers alert only."
        """
        return self.tier == "higher"


def run_sanity(ctx):
    """Structured memory sanity result.

    Calls memory-sanity.py's individual checks rather than parsing its
    printed report, so a wording change there cannot silently turn this
    into a no-op.
    """
    sanity = _load("memory-sanity.py", "aiq_dream_safety_sanity")
    topics = sanity.find_topics(ctx.memory_dir)
    if not topics:
        return {"clean": True, "topics": 0, "issues": 0, "detail": {},
                "note": "no topics in the memory store yet"}

    detail = {
        "cycles": len(sanity.detect_cycles(topics)),
        "stale_topics": len(sanity.detect_staleness(topics)),
        "contradictions": len(sanity.detect_contradictions(topics)),
        "granularity": sum(len(v) for v in sanity.detect_granularity_issues(topics).values()),
    }
    total = sum(detail.values())
    return {"clean": total == 0, "topics": len(topics), "issues": total, "detail": detail}


def make_snapshot(ctx, cycle_id):
    """Tar the memory store to .snapshots/mem-<cycle>.tar.gz.

    Named after the cycle id rather than a bare timestamp so a second dream
    in the same second cannot overwrite the first one's archive.

    Paths inside the archive are relative to the store's parent, so
    `tar xzf mem-<cycle>.tar.gz -C .assert-iq` restores in place -- exactly
    the command the reproducibility contract documents.
    """
    ctx.snapshot_dir.mkdir(parents=True, exist_ok=True)
    target = ctx.snapshot_dir / f"mem-{cycle_id[len('dream-'):]}.tar.gz"
    with tarfile.open(target, "w:gz") as tar:
        tar.add(str(ctx.memory_dir), arcname=ctx.memory_dir.name)
    return target


def prune_snapshots(ctx):
    """Keep the newest N snapshots; report what was removed."""
    if not ctx.snapshot_dir.is_dir():
        return []
    snaps = sorted(ctx.snapshot_dir.glob("mem-*.tar.gz"), key=lambda p: p.name)
    doomed = snaps[:-ctx.snapshot_retention] if len(snaps) > ctx.snapshot_retention else []
    removed = []
    for old in doomed:
        try:
            old.unlink()
            removed.append(old.name)
        except OSError:
            pass
    return removed


def load_provenance(ctx):
    log = read_json(ctx.provenance_path, None)
    if not isinstance(log, dict) or not isinstance(log.get("dream_cycles"), list):
        log = {
            "schema_version": "1.0",
            "description": "Append-only log of dream cycles with memory versioning for reproducibility",
            "dream_cycles": [],
        }
    return log


def find_cycle(log, cycle_id):
    for record in log["dream_cycles"]:
        if record.get("cycle_id") == cycle_id:
            return record
    return None


def cmd_pre(ctx, args):
    if not ctx.memory_dir.is_dir():
        print(f"✗ memory store not found: {ctx.memory_dir}", file=sys.stderr)
        print("  Run the installer first, or pass --workspace.", file=sys.stderr)
        return EXIT_ERROR

    moment = utc_now()
    # The stamp is second-resolution, so two runs inside the same second would
    # collide -- and a duplicate cycle_id makes the audit log ambiguous, since
    # find_cycle() returns the first match. Disambiguate rather than corrupt.
    existing = {r.get("cycle_id") for r in load_provenance(ctx)["dream_cycles"]}
    cycle_id = base_id = f"dream-{stamp(moment)}"
    suffix = 2
    while cycle_id in existing:
        cycle_id = f"{base_id}-{suffix}"
        suffix += 1
    print(f"Dream safety — pre-dream  ({cycle_id})")
    print(f"  tier: {ctx.tier}   memory: {ctx.memory_dir}")

    # 1. Sanity checks
    if ctx.sanity_enabled:
        sanity = run_sanity(ctx)
        if sanity["clean"]:
            note = sanity.get("note")
            print(f"  ✓ sanity: clean ({sanity['topics']} topics)" + (f" — {note}" if note else ""))
        else:
            bits = ", ".join(f"{k}={v}" for k, v in sanity["detail"].items() if v)
            print(f"  ⚠ sanity: {sanity['issues']} issue(s) — {bits}")
            print("    Full detail: python3 .assert-iq/analysis/memory-sanity.py")
    else:
        sanity = {"clean": True, "skipped": True, "issues": 0, "detail": {}}
        print("  – sanity: disabled in config (memory_sanity.enabled)")

    # 2. Snapshot + 3. provenance
    snapshot_rel = None
    if ctx.provenance_enabled:
        snapshot = make_snapshot(ctx, cycle_id)
        snapshot_rel = snapshot.relative_to(ctx.workspace).as_posix()
        size_kb = max(1, snapshot.stat().st_size // 1024)
        print(f"  ✓ snapshot: {snapshot_rel} ({size_kb} KB)")
        for name in prune_snapshots(ctx):
            print(f"    pruned old snapshot: {name}")
    else:
        print("  – snapshot: disabled in config (dreaming_provenance.enabled)")

    memory_before = ctx.compute_memory_hash(str(ctx.memory_dir))
    print(f"  ✓ memory_version_before: {memory_before}")

    if ctx.provenance_enabled:
        log = load_provenance(ctx)
        log["dream_cycles"].append({
            "cycle_id": cycle_id,
            "status": "in_progress",
            "started_at": iso(moment),
            "completed_at": None,
            "maturity_tier": ctx.tier,
            "memory_version_before": memory_before,
            "memory_version_after": None,
            "snapshot": snapshot_rel,
            "sanity": sanity,
            "regression": None,
        })
        write_json(ctx.provenance_path, log)
        print(f"  ✓ provenance: opened cycle in {ctx.provenance_path.name}")

    # Gate
    if not sanity["clean"] and ctx.enforces():
        print()
        print("✗ BLOCKED — sanity checks found issues and tier is 'higher',")
        print("  which qi-foundation says enforces rather than warns.")
        print("  Fix the memory store, or re-run once the issues are resolved.")
        return EXIT_BLOCKED

    print()
    print(f"✓ Ready to dream. Pass --cycle-id {cycle_id} to the post step.")
    print(f"CYCLE_ID={cycle_id}")
    return EXIT_OK


def cmd_post(ctx, args):
    log = load_provenance(ctx)
    record = find_cycle(log, args.cycle_id)
    if record is None:
        print(f"✗ no open dream cycle with id {args.cycle_id}", file=sys.stderr)
        print("  Run the `pre` step first; it prints the cycle id.", file=sys.stderr)
        return EXIT_ERROR

    moment = utc_now()
    memory_after = ctx.compute_memory_hash(str(ctx.memory_dir))
    record["completed_at"] = iso(moment)
    record["memory_version_after"] = memory_after
    record["status"] = "aborted" if args.aborted else "completed"
    record["memory_changed"] = memory_after != record.get("memory_version_before")
    write_json(ctx.provenance_path, log)

    print(f"Dream safety — post-dream  ({args.cycle_id})")
    print(f"  memory_version_after: {memory_after}")
    print(f"  memory changed: {'yes' if record['memory_changed'] else 'no'}")
    print(f"  ✓ provenance: cycle marked {record['status']}")
    if record.get("snapshot"):
        print(f"  restore with: tar xzf {record['snapshot']} -C .assert-iq")
    return EXIT_OK


def read_jsonl(path):
    rows = []
    with open(path, "r", encoding="utf-8-sig") as handle:
        for line_no, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except ValueError as exc:
                raise ValueError(f"{path}: line {line_no} is not valid JSON: {exc}")
    return rows


def cmd_regression(ctx, args):
    """Compare re-run verdicts against the golden corpus.

    The re-running itself is the model's job -- a script cannot reproduce a
    risk assessment. The agent writes its results as JSONL
    ({"pr_id": ..., "actual_verdict_band": ...}) and this computes the
    divergence and applies the configured gate.
    """
    if not ctx.regression_enabled and not args.force:
        print("– regression testing disabled in config (regression_testing.enabled).")
        print("  Nothing to check. Pass --force to run it anyway.")
        return EXIT_OK

    corpus_path = ctx.golden_corpus_path
    if not corpus_path.is_file():
        print(f"✗ golden corpus not found: {corpus_path}", file=sys.stderr)
        return EXIT_ERROR

    try:
        corpus = read_jsonl(corpus_path)
        actual_rows = read_jsonl(Path(args.results))
    except (IOError, OSError, ValueError) as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return EXIT_ERROR

    if not corpus:
        print("– golden corpus is empty; nothing to compare.")
        return EXIT_OK

    actual = {row.get("pr_id"): row.get("actual_verdict_band") for row in actual_rows}
    compared, diverged, missing, details = 0, 0, [], []
    for entry in corpus:
        pr_id = entry.get("pr_id")
        expected = entry.get("expected_verdict_band")
        got = actual.get(pr_id)
        if got is None:
            missing.append(pr_id)
            continue
        compared += 1
        if got != expected:
            diverged += 1
            details.append({"pr_id": pr_id, "expected": expected, "actual": got})

    if compared == 0:
        print("✗ no corpus entries had matching results; cannot judge divergence.",
              file=sys.stderr)
        if missing:
            print(f"  missing results for: {', '.join(str(m) for m in missing[:10])}",
                  file=sys.stderr)
        return EXIT_ERROR

    pct = (diverged / compared) * 100.0
    over = pct > ctx.max_divergence_pct

    print(f"Dream safety — regression  ({args.cycle_id})")
    print(f"  compared: {compared}/{len(corpus)} corpus entries")
    if missing:
        print(f"  no result supplied for: {', '.join(str(m) for m in missing[:10])}")
    print(f"  diverged: {diverged}  ({pct:.1f}%, threshold {ctx.max_divergence_pct:.1f}%)")
    for d in details:
        print(f"    {d['pr_id']}: expected {d['expected']}, got {d['actual']}")

    log = load_provenance(ctx)
    record = find_cycle(log, args.cycle_id)
    if record is not None:
        record["regression"] = {
            "compared": compared, "diverged": diverged,
            "divergence_pct": round(pct, 2),
            "threshold_pct": ctx.max_divergence_pct,
            "over_threshold": over,
            "missing_results": missing,
            "details": details,
        }
        write_json(ctx.provenance_path, log)
        print("  ✓ provenance: regression result recorded")

    if over and ctx.block_on_regression and ctx.enforces():
        print()
        print("✗ BLOCKED — divergence is over threshold, block_dream_on_regression")
        print("  is set, and tier is 'higher'. Review the memory changes; restore")
        print("  the snapshot from this cycle if the dream degraded accuracy.")
        return EXIT_BLOCKED
    if over:
        print()
        print("⚠ Divergence is over threshold. Not blocking: that requires")
        print("  block_dream_on_regression AND tier 'higher'.")
    return EXIT_OK


def main():
    parser = argparse.ArgumentParser(
        description="Pre/post-dream safety steps (sanity, snapshot, provenance, regression).")
    parser.add_argument("--workspace", default=".", help="Workspace root (default: cwd)")
    sub = parser.add_subparsers(dest="command")

    sub.add_parser("pre", help="Sanity-check, snapshot, and open a provenance cycle.")

    p_post = sub.add_parser("post", help="Close the provenance cycle after consolidating.")
    p_post.add_argument("--cycle-id", required=True)
    p_post.add_argument("--aborted", action="store_true",
                        help="Mark the cycle aborted rather than completed.")

    p_reg = sub.add_parser("regression", help="Compare re-run verdicts to the golden corpus.")
    p_reg.add_argument("--cycle-id", required=True)
    p_reg.add_argument("--results", required=True,
                       help='JSONL of {"pr_id":..., "actual_verdict_band":...}')
    p_reg.add_argument("--force", action="store_true",
                       help="Run even when regression_testing.enabled is false.")

    args = parser.parse_args()
    if not args.command:
        parser.print_help()
        return EXIT_ERROR

    try:
        ctx = Context(args.workspace)
    except ImportError as exc:
        print(f"✗ {exc}", file=sys.stderr)
        return EXIT_ERROR

    return {"pre": cmd_pre, "post": cmd_post, "regression": cmd_regression}[args.command](ctx, args)


if __name__ == "__main__":
    sys.exit(main())
