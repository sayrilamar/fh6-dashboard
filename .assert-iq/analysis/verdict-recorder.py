#!/usr/bin/env python3
"""
Verdict Recorder Library
Provides utilities for skills to record verdicts to the verdict sink.

Usage in skills:
    from verdict_recorder import VerdictRecorder, compute_memory_hash, get_layer_state
    
    recorder = VerdictRecorder()
    memory_version = compute_memory_hash()
    verdict = {...}
    result = recorder.record_verdict(verdict)
"""

import json
import os
from pathlib import Path
from datetime import datetime
import uuid
import hashlib
import unicodedata

# NOTE: PyYAML is deliberately NOT imported here. The pack documents "Python 3"
# as its only Python requirement (README > Environment requirements) and every
# other component parses config.yaml without third-party help. A module-scope
# `import yaml` made this entire module unimportable on a stock interpreter,
# which took VerdictRecorder and compute_memory_hash down with it even though
# neither touches YAML. `load_config` imports it lazily instead.


# Algorithm tag for compute_memory_hash. It is part of the emitted value so a
# verdict stamped by an older algorithm stays distinguishable from one stamped
# by this one. Without it, the v1 -> v2 change below would surface through the
# reproducibility contract as phantom "memory drift" -- the same memory store
# re-hashing to a different value -- instead of as what it is.
#
#   v1 (<= 2.1.0): sorted(rglob("*")) over raw bytes. Not portable; see below.
#   v2:            OS-independent ordering, newline-normalized text,
#                  desktop-metadata files excluded, and length-prefixed
#                  framing over (path, content).
_MEMORY_HASH_ALGORITHM = "sha256-v2"

# Desktop metadata the OS writes into any browsed directory. Same list the
# installers already skip (scripts/bootstrap.sh, scripts/bootstrap.ps1) --
# these are artifacts of a file browser, never memory content.
_DESKTOP_METADATA = frozenset({".DS_Store", "Thumbs.db", "desktop.ini"})


def _is_desktop_metadata(relative_posix_path):
    """True for OS file-browser droppings at any depth in the store."""
    name = relative_posix_path.rsplit("/", 1)[-1]
    # macOS also writes AppleDouble sidecars (._Foo.md) on non-APFS volumes,
    # e.g. a memory store on a USB stick or a SMB share.
    return name in _DESKTOP_METADATA or name.startswith("._")


def compute_memory_hash(memory_path=".assert-iq/memory"):
    """
    Compute a SHA256 hash of the memory directory for reproducibility.

    This value is stamped into every verdict as `memory_version`, and the
    reproducibility contract (qi-foundation > Decision Confidence Calibration)
    requires that the same memory store yield the same hash on any machine.
    Four things had to be fixed for that to hold across Windows and macOS:

    1. Ordering. `sorted(Path.rglob("*"))` compares paths using the OS flavour:
       case-sensitively on POSIX, case-insensitively on Windows. A store with
       `MEMORY.md` and `apple.md` was therefore fed to the digest in a
       different order on each platform. Sorting on the relative POSIX path
       string makes the order a property of the store, not the host.

    2. Line endings. `.gitattributes` marks `*.md` as `text` without pinning
       `eol`, so git checks memory topics out as CRLF on Windows and LF on
       macOS. Reading raw bytes made the same content hash differently.
       Text is newline-normalized before hashing; files containing a NUL byte
       are treated as binary and hashed verbatim, the same way git detects
       binary content.

    3. Framing. Contents were concatenated with nothing marking where one
       file ended and the next began, so distinct stores could collide, empty
       files were invisible, and renames went undetected. Each file now
       contributes a length-prefixed (path, content) record, with the path
       NFC-normalized so macOS's decomposed filenames match everyone else's.

    4. Desktop metadata. Opening `.assert-iq/memory/` in Finder makes macOS
       drop a `.DS_Store` there. It is gitignored, so the working tree still
       looks clean, but it used to change `memory_version` -- browsing a
       folder silently invalidated the audit trail and showed up in drift
       detection as memory that had changed when nothing had. Windows Explorer
       does the same with `Thumbs.db`/`desktop.ini`.

    Args:
        memory_path (str): Path to memory directory

    Returns:
        str: SHA256 hash prefixed with the algorithm tag, e.g. "sha256-v2:..."
    """
    try:
        sha256 = hashlib.sha256()
        memory_dir = Path(memory_path)

        if not memory_dir.exists():
            return f"{_MEMORY_HASH_ALGORITHM}:uninitialized"

        # Sort on the relative POSIX path so ordering is identical on every
        # platform. Sorting Path objects directly is what made this host-dependent.
        entries = []
        for file in memory_dir.rglob("*"):
            if not file.is_file():
                continue
            # NFC-normalize once, here, so ordering and framing below agree.
            # macOS hands back decomposed (NFD) filenames where Linux and
            # Windows keep them composed, so "cafe\u0301.md" and "caf\u00e9.md"
            # are the same name stored differently.
            relative_posix_path = unicodedata.normalize(
                "NFC", file.relative_to(memory_dir).as_posix())
            if _is_desktop_metadata(relative_posix_path):
                continue
            entries.append((relative_posix_path, file))
        entries.sort(key=lambda entry: entry[0])

        for relative_posix_path, file in entries:
            try:
                data = file.read_bytes()
            except (IOError, OSError):
                continue  # Skip unreadable files
            if b"\0" not in data:
                data = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")

            # Length-prefixed framing over (path, content). A bare
            # concatenation of file contents is ambiguous: file boundaries
            # are not encoded, so {"a.md": "ab", "b.md": "c"} and
            # {"a.md": "a", "b.md": "bc"} digest identically; an empty file
            # contributes nothing and is invisible; and a pure rename is
            # undetectable because the name never reaches the digest.
            path_bytes = relative_posix_path.encode("utf-8")
            sha256.update(f"{len(path_bytes)}\0{len(data)}\0".encode("ascii"))
            sha256.update(path_bytes)
            sha256.update(data)

        return f"{_MEMORY_HASH_ALGORITHM}:{sha256.hexdigest()}"
    except Exception as e:
        return f"{_MEMORY_HASH_ALGORITHM}:error-{str(e)[:20]}"


def get_layer_state(score, threshold=0.7):
    """
    Determine layer state (strong/weak) from numeric score.
    
    Args:
        score (float): Layer score 0.0-1.0
        threshold (float): Score above which state is "strong"
    
    Returns:
        str: "strong" or "weak"
    """
    if score is None:
        return "ungraded"
    return "strong" if score >= threshold else "weak"


_DQ_ESCAPES = {
    "n": "\n", "t": "\t", "r": "\r", "b": "\b", "f": "\f",
    "0": "\0", '"': '"', "\\": "\\", "/": "/", "'": "'",
}


def _unescape_double_quoted(body):
    """Decode the YAML double-quoted escapes that appear in pack configs."""
    out = []
    i = 0
    while i < len(body):
        ch = body[i]
        if ch == "\\" and i + 1 < len(body):
            nxt = body[i + 1]
            if nxt in _DQ_ESCAPES:
                out.append(_DQ_ESCAPES[nxt])
                i += 2
                continue
            # Unknown escape: keep it verbatim rather than guessing.
            out.append(ch)
            i += 1
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def _split_top_level(text, sep=","):
    """Split on `sep`, ignoring separators inside quotes or nested brackets."""
    parts = []
    buf = []
    quote = None
    depth = 0
    for ch in text:
        if quote:
            buf.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in ("'", '"'):
            quote = ch
            buf.append(ch)
        elif ch in "[{":
            depth += 1
            buf.append(ch)
        elif ch in "]}":
            depth -= 1
            buf.append(ch)
        elif ch == sep and depth == 0:
            parts.append("".join(buf))
            buf = []
        else:
            buf.append(ch)
    parts.append("".join(buf))
    return [p for p in (x.strip() for x in parts) if p != ""]


def _coerce_scalar(raw):
    """Coerce a YAML scalar or flow collection token to a Python value."""
    text = raw.strip()
    if not text:
        return None
    if text.startswith("[") and text.endswith("]"):
        return [_coerce_scalar(x) for x in _split_top_level(text[1:-1])]
    if text.startswith("{") and text.endswith("}"):
        out = {}
        for item in _split_top_level(text[1:-1]):
            k, sep, v = item.partition(":")
            if sep:
                out[k.strip()] = _coerce_scalar(v)
        return out
    if len(text) >= 2 and text[0] == text[-1] == '"':
        return _unescape_double_quoted(text[1:-1])
    if len(text) >= 2 and text[0] == text[-1] == "'":
        # Single-quoted YAML only escapes '' -> '
        return text[1:-1].replace("''", "'")
    lowered = text.lower()
    if lowered in ("true", "yes", "on"):
        return True
    if lowered in ("false", "no", "off"):
        return False
    if lowered in ("null", "~"):
        return None
    try:
        return int(text)
    except ValueError:
        pass
    try:
        return float(text)
    except ValueError:
        pass
    return text


def _strip_comment(line):
    """Remove a trailing `#` comment, ignoring `#` inside quotes."""
    quote = None
    for i, ch in enumerate(line):
        if quote:
            if ch == quote:
                quote = None
        elif ch in ("'", '"'):
            quote = ch
        elif ch == "#" and (i == 0 or line[i - 1] in " \t"):
            return line[:i]
    return line


def _parse_config_subset(text):
    """
    Indentation-aware reader for the block-mapping subset of config.yaml.

    This is a fallback for interpreters without PyYAML -- NOT a general YAML
    implementation. It resolves nested `section:` mappings down to scalar
    leaves and inline flow collections, which covers the switches the pack's
    own gates read (e.g. `verdicts.enabled`, `oracle.maturity_gating.*`).

    Two constructs are deliberately dropped rather than guessed at, because a
    plausible-looking wrong value is worse than an absent one:
      * block scalars (`key: |`) -- the body is swallowed;
      * block sequences (`- item`) -- the whole block is skipped AND the owning
        key is removed, so a sequence never masquerades as a mapping.
    """
    root = {}
    # Stack of (indent, mapping) frames; the last entry is the current parent.
    stack = [(-1, root)]
    skip_deeper_than = None
    # The key that just opened an empty mapping, so a following `- ` sequence
    # can disown it.
    pending = None

    for line in text.splitlines():
        if skip_deeper_than is not None:
            if line.strip() and (len(line) - len(line.lstrip(" "))) > skip_deeper_than:
                continue
            skip_deeper_than = None

        content = _strip_comment(line).rstrip()
        if not content.strip():
            continue

        indent = len(content) - len(content.lstrip(" "))
        stripped = content.strip()

        if stripped.startswith("-"):
            # A block sequence. Disown the key that opened it and skip the body.
            if pending is not None:
                pending_key, pending_parent, pending_indent = pending
                if pending_indent < indent:
                    pending_parent.pop(pending_key, None)
                    while stack and stack[-1][0] >= pending_indent:
                        stack.pop()
            skip_deeper_than = indent - 1 if indent > 0 else 0
            pending = None
            continue

        if ":" not in stripped:
            continue

        key, _, value = stripped.partition(":")
        key = key.strip()
        value = value.strip()
        if not key:
            continue

        while stack and indent <= stack[-1][0]:
            stack.pop()
        if not stack:
            stack = [(-1, root)]
        parent = stack[-1][1]
        pending = None

        if value in ("|", ">") or (value[:1] in ("|", ">") and value[1:] in ("", "-", "+")):
            skip_deeper_than = indent
            continue

        if value == "":
            child = {}
            parent[key] = child
            stack.append((indent, child))
            pending = (key, parent, indent)
            continue

        parent[key] = _coerce_scalar(value)

    return root


def load_config(config_path=".assert-iq/config.yaml"):
    """
    Load Assert.IQ config.yaml safely.

    Uses PyYAML when it is installed. When it is not -- the documented baseline,
    since the pack requires only "Python 3" -- falls back to a subset reader that
    still resolves the scalar switches the pack gates on. Without that fallback
    a missing PyYAML would read as "no config", silently disabling verdict
    recording and the audit trail it backs.

    Args:
        config_path (str): Path to config.yaml

    Returns:
        dict: Config dict, or empty dict if file doesn't exist
    """
    try:
        if not Path(config_path).exists():
            return {}

        with open(config_path, 'r', encoding="utf-8-sig") as f:
            raw = f.read()

        try:
            import yaml
        except ImportError:
            return _parse_config_subset(raw)

        return yaml.safe_load(raw) or {}
    except Exception as e:
        print(f"⚠️ Warning: Could not load config: {e}")
        return {}


def are_verdicts_enabled(config=None):
    """
    Check if verdict recording is enabled in config.
    
    Args:
        config (dict): Config dict. If None, loads from file.
    
    Returns:
        bool: True if verdicts.enabled is true
    """
    if config is None:
        config = load_config()
    return config.get("verdicts", {}).get("enabled", False)


class VerdictRecorder:
    def __init__(self, workspace_root="."):
        self.workspace_root = Path(workspace_root)
        self.verdicts_dir = self.workspace_root / ".assert-iq" / "verdicts"
        self.archive_dir = self.verdicts_dir / "archive"
        
    def record_verdict(self, verdict_data):
        """
        Record a verdict to the verdict sink.
        
        Args:
            verdict_data (dict): Verdict object with required fields
                - verdict_type: pr_risk_assessment, release_confidence, etc.
                - verdict_band: green, amber, red, ungraded
                - verdict_score: 0.0-1.0
                - layer_scores: {change, protection, trust, outcome}
                - layer_weights: {change, protection, trust, outcome}
                - maturity_tier: early, mid, higher
                - memory_version: SHA256 hash
                - issued_by: skill name
                - pr_id: (optional) PR number
                - release_id: (optional) release tag
                - assumptions: list of assumption strings
                - linked_escape: null or escape dict
        
        Returns:
            dict: {success: bool, verdict_id: str, message: str}
        """
        try:
            # Generate verdict ID if not provided
            if 'verdict_id' not in verdict_data:
                verdict_data['verdict_id'] = str(uuid.uuid4())
            
            # Add issued_at if not provided
            if 'issued_at' not in verdict_data:
                verdict_data['issued_at'] = datetime.utcnow().isoformat() + 'Z'
            
            # Create archive directory structure (YYYY/MM)
            now = datetime.utcnow()
            year_month_dir = self.archive_dir / f"{now.year}" / f"{now.month:02d}"
            year_month_dir.mkdir(parents=True, exist_ok=True)
            
            # Determine verdict file (verdicts-DD.jsonl)
            verdict_file = year_month_dir / f"verdicts-{now.day:02d}.jsonl"
            
            # Append verdict to JSONL file
            with open(verdict_file, 'a', encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(verdict_data) + '\n')
            
            # Update index.json
            self._update_index(verdict_data)
            
            # Append to VERDICTS.md audit trail
            self._append_audit_trail(verdict_data)
            
            return {
                'success': True,
                'verdict_id': verdict_data['verdict_id'],
                'message': f"Verdict recorded: {verdict_file}"
            }
        except Exception as e:
            return {
                'success': False,
                'verdict_id': verdict_data.get('verdict_id'),
                'message': f"Error recording verdict: {str(e)}"
            }
    
    def _update_index(self, verdict_data):
        """Update verdict index."""
        index_file = self.verdicts_dir / "index.json"
        
        if index_file.exists():
            with open(index_file, 'r', encoding="utf-8-sig") as f:
                index = json.load(f)
        else:
            index = {
                'schema_version': '1.0',
                'verdicts_recorded': 0,
                'verdicts_by_band': {'green': 0, 'amber': 0, 'red': 0, 'ungraded': 0},
                'verdicts_by_type': {'pr_risk_assessment': 0, 'release_confidence': 0, 'other': 0},
                'verdicts_with_escapes': 0,
                'last_updated': None,
                'archive_paths': []
            }
        
        # Update counters
        index['verdicts_recorded'] += 1
        band = verdict_data.get('verdict_band', 'ungraded')
        if band in index['verdicts_by_band']:
            index['verdicts_by_band'][band] += 1
        
        v_type = verdict_data.get('verdict_type', 'other')
        if v_type in index['verdicts_by_type']:
            index['verdicts_by_type'][v_type] += 1
        
        if verdict_data.get('linked_escape'):
            index['verdicts_with_escapes'] += 1
        
        index['last_updated'] = datetime.utcnow().isoformat() + 'Z'
        
        # Write back
        with open(index_file, 'w', encoding="utf-8", newline="\n") as f:
            json.dump(index, f, indent=2)
    
    def _append_audit_trail(self, verdict_data):
        """Append one-liner to audit trail."""
        trail_file = self.verdicts_dir / "VERDICTS.md"
        
        now = datetime.utcnow()
        timestamp = now.strftime("%Y-%m-%d %H:%M:%S UTC")
        verdict_id = verdict_data.get('verdict_id', 'unknown')
        v_type = verdict_data.get('verdict_type', 'other')
        band = verdict_data.get('verdict_band', 'ungraded')
        score = verdict_data.get('verdict_score', 0.0)
        pr_id = verdict_data.get('pr_id', 'N/A')
        layers = []
        for layer, info in verdict_data.get('layer_scores', {}).items():
            if isinstance(info, dict):
                layers.append(f"{layer}:{info.get('state', '?')}")
        layer_summary = ' '.join(layers) if layers else 'unknown'
        escape = verdict_data.get('linked_escape')
        escape_str = escape.get('defect_id', 'unknown') if escape else 'none'
        
        line = f"{timestamp} | {verdict_id} | {v_type} | {band} | {score} | {pr_id} | {layer_summary} | {escape_str}\n"
        
        with open(trail_file, 'a', encoding="utf-8", newline="\n") as f:
            f.write(line)


if __name__ == "__main__":
    print("Verdict Recorder Library")
    print("Usage: Import VerdictRecorder in your skill code")
    print("Example:")
    print("  from verdict_recorder import VerdictRecorder")
    print("  recorder = VerdictRecorder()")
    print("  result = recorder.record_verdict(verdict_dict)")
