"""Diagram management tools."""
from __future__ import annotations
from pathlib import Path
from .. import state
from ..models.types import Diagram, Canvas
from ..core.parser import parse_dsl
from ..core.generator import generate_dsl


def ss_new(width: int = 960, height: int = 600, grid: int = 20) -> str:
    """Create a new empty state machine diagram."""
    d = Diagram(canvas=Canvas(width=width, height=height, grid=grid))
    state.set_diagram(d)
    return f"Created new diagram ({width}x{height}, grid={grid})"


def ss_open(path: str) -> str:
    """Open an .sstate file and load it as the current diagram."""
    p = Path(path)
    if not p.exists():
        return f"Error: file not found: {path}"
    text = p.read_text(encoding="utf-8")
    d = parse_dsl(text)
    state.set_diagram(d)
    errs = f" ({len(d.errors)} warnings)" if d.errors else ""
    return (
        f"Loaded {path}: {len(d.states)} states, "
        f"{len(d.pseudo_states)} pseudo-states, "
        f"{len(d.transitions)} transitions{errs}"
    )


def ss_save(path: str) -> str:
    """Save the current diagram to an .sstate file."""
    d = state.get()
    text = generate_dsl(d)
    Path(path).write_text(text, encoding="utf-8")
    return f"Saved to {path}"


def ss_show(detail: bool = False) -> str:
    """Show current diagram summary."""
    d = state.get()
    lines = [
        f"Canvas: {d.canvas.width}x{d.canvas.height} grid={d.canvas.grid}",
        f"States: {len(d.states)}",
        f"Pseudo-states: {len(d.pseudo_states)}",
        f"Transitions: {len(d.transitions)}",
        f"Groups: {len(d.groups)}",
        f"Notes: {len(d.notes)}",
    ]
    if detail:
        for s in d.states:
            lines.append(f"  state {s.id} \"{s.label}\" at {s.x},{s.y} size {s.w}x{s.h}")
        for ps in d.pseudo_states:
            lines.append(f"  {ps.type} {ps.id} at {ps.x},{ps.y}")
        for t in d.transitions:
            label = ""
            if t.event:
                label += f" {t.event}"
            if t.guard:
                label += f" [{t.guard}]"
            lines.append(f"  {t.from_id} -> {t.to_id}{label}")
    return "\n".join(lines)


def ss_undo() -> str:
    """Undo the last operation."""
    if state.undo():
        return "Undo successful"
    return "Nothing to undo"
