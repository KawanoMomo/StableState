"""Global diagram state management with undo history."""
from __future__ import annotations
from .models.types import Diagram

_current: Diagram | None = None
_history: list[str] = []
_MAX_HISTORY = 30


def get() -> Diagram:
    if _current is None:
        raise RuntimeError("No diagram loaded. Use ss_new or ss_open first.")
    return _current


def set_diagram(d: Diagram) -> None:
    global _current
    push_history()
    _current = d


def push_history() -> None:
    global _current
    if _current is not None:
        _history.append(_current.model_dump_json())
        if len(_history) > _MAX_HISTORY:
            _history.pop(0)


def undo() -> bool:
    global _current
    if not _history:
        return False
    _current = Diagram.model_validate_json(_history.pop())
    return True


def clear() -> None:
    global _current
    _current = None
    _history.clear()
