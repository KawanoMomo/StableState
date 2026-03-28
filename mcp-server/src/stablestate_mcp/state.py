"""Global diagram state management with undo history and DSL text preservation."""
from __future__ import annotations
from .models.types import Diagram

_current: Diagram | None = None
_dsl_text: str = ""
_history: list[tuple[str, str]] = []  # (model_json, dsl_text)
_MAX_HISTORY = 30


def get() -> Diagram:
    if _current is None:
        raise RuntimeError("No diagram loaded. Use ss_new or ss_open first.")
    return _current


def get_dsl() -> str:
    return _dsl_text


def set_dsl(text: str) -> None:
    global _dsl_text
    _dsl_text = text


def set_diagram(d: Diagram, dsl: str | None = None) -> None:
    global _current, _dsl_text
    push_history()
    _current = d
    if dsl is not None:
        _dsl_text = dsl


def push_history() -> None:
    if _current is not None:
        _history.append((_current.model_dump_json(), _dsl_text))
        if len(_history) > _MAX_HISTORY:
            _history.pop(0)


def undo() -> bool:
    global _current, _dsl_text
    if not _history:
        return False
    json_str, dsl = _history.pop()
    _current = Diagram.model_validate_json(json_str)
    _dsl_text = dsl
    return True


def clear() -> None:
    global _current, _dsl_text
    _current = None
    _dsl_text = ""
    _history.clear()
