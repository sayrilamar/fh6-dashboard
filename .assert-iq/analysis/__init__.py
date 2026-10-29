"""
Assert.IQ Analysis & Verdict Recording Utilities

The implementation lives in `verdict-recorder.py`. That hyphen is not a legal
Python identifier, so `from .verdict_recorder import ...` can never resolve —
the module has to be loaded by file path. This mirrors the documented loader
pattern in `.assert-iq/SKILL_VERDICT_QUICKSTART.md`, while still exposing the
names below as a normal package API.
"""

import importlib.util
from pathlib import Path

_RECORDER_PATH = Path(__file__).resolve().parent / "verdict-recorder.py"


def _load_recorder():
    if not _RECORDER_PATH.is_file():
        raise ImportError(f"cannot locate verdict recorder at {_RECORDER_PATH}")
    spec = importlib.util.spec_from_file_location(
        "assert_iq_verdict_recorder", _RECORDER_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_recorder = _load_recorder()

VerdictRecorder = _recorder.VerdictRecorder
compute_memory_hash = _recorder.compute_memory_hash
get_layer_state = _recorder.get_layer_state
load_config = _recorder.load_config
are_verdicts_enabled = _recorder.are_verdicts_enabled

__version__ = "2.0.2"
__all__ = [
    "VerdictRecorder",
    "compute_memory_hash",
    "get_layer_state",
    "load_config",
    "are_verdicts_enabled",
]
