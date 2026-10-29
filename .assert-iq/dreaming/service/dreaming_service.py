#!/usr/bin/env python3
"""
dreaming_service.py — OPTIONAL background memory consolidation ("dreaming")
for the Assert.IQ markdown memory store.

This is NOT required. The `/dream` skill is the default, dependency-free
consolidation engine. This service is the turnkey "dream while you sleep"
path for teams that want it. It stays inert unless BOTH are true:
  - the `anthropic` SDK is importable, AND
  - ANTHROPIC_API_KEY is set in the environment.

Enable it only at `higher` maturity tier with
`dreaming.background_service.enabled: true` in .assert-iq/config.yaml.

Design: Template Method (DreamCycle defines the 4-phase skeleton; the LLM
call is the pluggable strategy) + a file-lock guard.

Usage:
    python3 dreaming_service.py /path/to/repo            # gated run
    python3 dreaming_service.py /path/to/repo --force    # bypass the gate
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

# ---- single-writer lock -----------------------------------------------------
# fcntl is POSIX-only. A bare `import fcntl` at module scope made this entire
# service unimportable on Windows, so the pack's own sandbox test could not
# even load it. Probe both primitives at import time and degrade explicitly:
# on a platform with neither, the lock is a no-op -- concurrent dreams become
# possible, but nothing crashes.
try:  # POSIX
    import fcntl as _fcntl
except ImportError:
    _fcntl = None
try:  # Windows
    import msvcrt as _msvcrt
except ImportError:
    _msvcrt = None


def _lock_exclusive_nb(fh) -> bool:
    """Take an exclusive non-blocking lock. False = held by another process."""
    if _fcntl is not None:
        try:
            _fcntl.flock(fh, _fcntl.LOCK_EX | _fcntl.LOCK_NB)
            return True
        except BlockingIOError:
            return False
    if _msvcrt is not None:
        try:
            _msvcrt.locking(fh.fileno(), _msvcrt.LK_NBLCK, 1)
            return True
        except OSError:
            return False
    return True  # no locking primitive available; proceed unguarded


def _unlock(fh) -> None:
    try:
        if _fcntl is not None:
            _fcntl.flock(fh, _fcntl.LOCK_UN)
        elif _msvcrt is not None:
            fh.seek(0)
            _msvcrt.locking(fh.fileno(), _msvcrt.LK_UNLCK, 1)
    except OSError:
        pass  # releasing a lock we may not hold is not worth failing a dream



@dataclass(frozen=True)
class DreamConfig:
    project_root: Path
    memory_rel: str = ".assert-iq/memory"
    transcripts_rel: str = "transcripts"
    min_hours_between_dreams: int = 24
    min_sessions_between_dreams: int = 5
    index_max_lines: int = 200
    model: str = "claude-opus-5"
    max_tokens: int = 8000

    @property
    def memory_dir(self) -> Path:
        return self.project_root / self.memory_rel

    @property
    def transcripts_dir(self) -> Path:
        return self.project_root / self.transcripts_rel

    @property
    def logs_dir(self) -> Path:
        return self.memory_dir / "logs"

    @property
    def state_path(self) -> Path:
        return self.memory_dir / ".dream" / "state.json"

    @property
    def lock_path(self) -> Path:
        return self.memory_dir / ".dream" / "dream.lock"


class DreamGate:
    """Dual-gate trigger: dream only if BOTH time and session-volume
    thresholds are met since the last consolidation."""

    def __init__(self, config: DreamConfig) -> None:
        self._cfg = config

    def _load_state(self) -> dict:
        try:
            return json.loads(self._cfg.state_path.read_text(encoding="utf-8-sig"))
        except (FileNotFoundError, json.JSONDecodeError):
            return {"last_dream_utc": None, "sessions_since_dream": 0}

    def _save_state(self, state: dict) -> None:
        self._cfg.state_path.parent.mkdir(parents=True, exist_ok=True)
        self._cfg.state_path.write_text(json.dumps(state, indent=2))

    def should_dream(self, force: bool = False) -> bool:
        if force:
            return True
        state = self._load_state()
        sessions_ok = (
            state.get("sessions_since_dream", 0)
            >= self._cfg.min_sessions_between_dreams
        )
        last = state.get("last_dream_utc")
        if last is None:
            time_ok = True
        else:
            elapsed = datetime.now(timezone.utc) - datetime.fromisoformat(last)
            time_ok = elapsed >= timedelta(hours=self._cfg.min_hours_between_dreams)
        return sessions_ok and time_ok

    def mark_dreamed(self) -> None:
        self._save_state({
            "last_dream_utc": datetime.now(timezone.utc).isoformat(),
            "sessions_since_dream": 0,
        })


class SignalGatherer:
    """Targeted extraction from daily logs and (optionally) JSONL transcripts.
    Grep narrowly; never read whole files."""

    SIGNAL_PATTERNS = (
        "remember this", "always ", "never ", "actually,",
        "that's wrong", "instead of", "we decided", "switch to",
        "don't use", "prefer ",
    )

    def __init__(self, config: DreamConfig) -> None:
        self._cfg = config

    def gather(self, max_lines_per_pattern: int = 40) -> str:
        roots = [d for d in (self._cfg.logs_dir, self._cfg.transcripts_dir) if d.exists()]
        if not roots:
            return "(no daily logs or transcripts found)"
        chunks: list[str] = []
        for pattern in self.SIGNAL_PATTERNS:
            for root in roots:
                result = subprocess.run(
                    ["grep", "-rin", pattern, str(root)],
                    capture_output=True, text=True, check=False,
                )
                if result.stdout:
                    lines = result.stdout.splitlines()[-max_lines_per_pattern:]
                    chunks.append(f"### Matches for '{pattern}' in {root.name}\n" + "\n".join(lines))
        return "\n\n".join(chunks) or "(no high-signal patterns found)"


DREAM_PROMPT_TEMPLATE = """\
# Dream: Memory Consolidation Pass

You are performing an offline consolidation pass over an Assert.IQ project's
markdown memory. Rewrite the memory so future sessions orient quickly.

RULES:
- MEMORY.md is an INDEX only: one-line pointers to topic files, hard cap
  {index_max_lines} lines. Never inline memory content.
- Convert relative dates to absolute dates (today is {today}).
- Delete contradicted or stale facts at the source.
- Merge duplicates into one canonical entry.
- Preserve exact wording of recorded decisions.
- Do NOT invent facts not present in the inputs.

## Current memory index (MEMORY.md)
{index}

## Current topic files
{topics}

## High-signal digest (Phase 2 output)
{signal}

## Output format (STRICT)
Respond ONLY with JSON, no markdown fences, matching:
{{
  "files": {{ "<relative-path-under-memory/>": "<full new file content>" }},
  "deletions": ["<relative-path-under-memory/>", ...],
  "report": "<3-6 sentence dream report>"
}}
Only include files that changed. Paths must stay inside the memory dir.
"""


class DreamCycle:
    """Template Method: orient -> gather -> consolidate (LLM) -> apply."""

    def __init__(self, config: DreamConfig, client=None) -> None:
        self._cfg = config
        self._client = client
        self._gatherer = SignalGatherer(config)

    def _orient(self) -> tuple[str, str]:
        index_path = self._cfg.memory_dir / "MEMORY.md"
        index = index_path.read_text(encoding="utf-8-sig") if index_path.exists() else "(empty)"
        topics: list[str] = []
        topics_dir = self._cfg.memory_dir / "topics"
        if topics_dir.exists():
            for f in sorted(topics_dir.glob("*.md")):
                topics.append(f"--- {f.relative_to(self._cfg.memory_dir)} ---\n{f.read_text(encoding="utf-8-sig")}")
        return index, "\n\n".join(topics) or "(no topic files)"

    def _consolidate(self, index: str, topics: str, signal: str) -> dict:
        prompt = DREAM_PROMPT_TEMPLATE.format(
            index_max_lines=self._cfg.index_max_lines,
            today=datetime.now(timezone.utc).date().isoformat(),
            index=index, topics=topics, signal=signal,
        )
        response = self._client.messages.create(
            model=self._cfg.model,
            max_tokens=self._cfg.max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = "".join(b.text for b in response.content if b.type == "text")
        raw = raw.replace("```json", "").replace("```", "").strip()
        return json.loads(raw)

    def _apply(self, plan: dict) -> str:
        memory_root = self._cfg.memory_dir.resolve()
        for rel_path, content in plan.get("files", {}).items():
            target = (memory_root / rel_path).resolve()
            if not str(target).startswith(str(memory_root)):
                raise PermissionError(f"Dream attempted write outside sandbox: {rel_path}")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(content)
        for rel_path in plan.get("deletions", []):
            target = (memory_root / rel_path).resolve()
            if str(target).startswith(str(memory_root)) and target.exists():
                target.unlink()
        return plan.get("report", "(no report)")

    def run(self) -> str:
        index, topics = self._orient()
        signal = self._gatherer.gather()
        plan = self._consolidate(index, topics, signal)
        return self._apply(plan)


def _make_client():
    """Return an Anthropic client, or None if the service should stay inert."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("dreaming_service: ANTHROPIC_API_KEY not set; nothing to do. "
              "Use the /dream skill instead.")
        return None
    try:
        import anthropic  # noqa: WPS433 — optional dependency
    except ImportError:
        print("dreaming_service: anthropic SDK not installed "
              "(`pip install anthropic`); nothing to do. Use the /dream skill.")
        return None
    return anthropic.Anthropic()


def dream(project_root: str, force: bool = False) -> str:
    """Entry point. Safe to call from cron or a post-session hook."""
    cfg = DreamConfig(project_root=Path(project_root))
    client = _make_client()
    if client is None:
        return "Inactive (no API key / SDK)."

    gate = DreamGate(cfg)
    if not gate.should_dream(force=force):
        return "Gate not met (need 24h AND 5+ sessions). Skipping."

    cfg.lock_path.parent.mkdir(parents=True, exist_ok=True)
    with open(cfg.lock_path, "w", encoding="utf-8", newline="\n") as lock:
        if not _lock_exclusive_nb(lock):
            return "Another dream is in progress. Skipping."
        try:
            report = DreamCycle(cfg, client).run()
            gate.mark_dreamed()
            return f"Dream complete.\n{report}"
        finally:
            _unlock(lock)


if __name__ == "__main__":
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    forced = "--force" in sys.argv
    print(dream(root, force=forced))
