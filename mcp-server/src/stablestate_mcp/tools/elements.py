"""Element manipulation tools."""
from __future__ import annotations
from .. import state
from ..models.types import State, PseudoState, Group, Transition, Note


def ss_add_state(
    id: str, label: str, x: float, y: float,
    w: float = 8, h: float = 4, parent: str | None = None,
    entry: str | None = None, do: str | None = None, exit: str | None = None,
    color: str | None = None,
) -> str:
    """Add a new state to the diagram."""
    d = state.get()
    state.push_history()
    if any(s.id == id for s in d.states):
        return f"Error: state '{id}' already exists"
    st = State(id=id, label=label, x=x, y=y, w=w, h=h, parent=parent,
               entry=entry, do=do, exit=exit, color=color)
    d.states.append(st)
    if parent:
        for s in d.states:
            if s.id == parent:
                s.children.append(id)
                break
    return f"Added state '{id}' at ({x},{y})"


def ss_add_pseudo(
    type: str, id: str, x: float, y: float,
    parent: str | None = None,
) -> str:
    """Add a pseudo-state (initial, final, choice, history, deephistory)."""
    d = state.get()
    state.push_history()
    ps = PseudoState(type=type, id=id, x=x, y=y, parent=parent)
    d.pseudo_states.append(ps)
    return f"Added {type} '{id}' at ({x},{y})"


def ss_add_transition(
    from_id: str, to_id: str,
    event: str | None = None, guard: str | None = None,
    action: str | None = None, kind: str | None = None,
) -> str:
    """Add a transition between two states."""
    d = state.get()
    state.push_history()
    t = Transition(**{
        "from": from_id, "to": to_id,
        "event": event, "guard": guard, "action": action,
        "kind": kind or d.config.transition,
    })
    d.transitions.append(t)
    label = event or "(no event)"
    return f"Added transition {from_id} -> {to_id} : {label}"


def ss_add_group(
    id: str, label: str, x: float, y: float, w: float, h: float,
    color: str | None = None,
) -> str:
    """Add a visual group."""
    d = state.get()
    state.push_history()
    g = Group(id=id, label=label, x=x, y=y, w=w, h=h, color=color)
    d.groups.append(g)
    return f"Added group '{id}' at ({x},{y})"


def ss_add_note(
    id: str, label: str, x: float, y: float,
    w: float = 8, h: float = 2, color: str | None = None,
) -> str:
    """Add an annotation note."""
    d = state.get()
    state.push_history()
    n = Note(id=id, label=label, x=x, y=y, w=w, h=h, color=color or "#FEF3C7")
    d.notes.append(n)
    return f"Added note '{id}' at ({x},{y})"


def ss_remove(id: str) -> str:
    """Remove a state, pseudo-state, group, or note and its transitions."""
    d = state.get()
    state.push_history()
    # Remove from states
    for s in d.states:
        if s.id == id:
            d.states.remove(s)
            # Remove children references
            for other in d.states:
                if id in other.children:
                    other.children.remove(id)
            # Remove transitions
            d.transitions = [t for t in d.transitions if t.from_id != id and t.to_id != id]
            return f"Removed state '{id}'"
    # Pseudo-states
    for ps in d.pseudo_states:
        if ps.id == id:
            d.pseudo_states.remove(ps)
            d.transitions = [t for t in d.transitions if t.from_id != id and t.to_id != id]
            return f"Removed {ps.type} '{id}'"
    # Groups
    for g in d.groups:
        if g.id == id:
            d.groups.remove(g)
            return f"Removed group '{id}'"
    # Notes
    for n in d.notes:
        if n.id == id:
            d.notes.remove(n)
            d.note_connections = [nc for nc in d.note_connections if nc.note_id != id]
            return f"Removed note '{id}'"
    return f"Error: '{id}' not found"


def ss_modify(
    id: str, label: str | None = None, x: float | None = None,
    y: float | None = None, w: float | None = None, h: float | None = None,
    color: str | None = None, entry: str | None = None,
    do: str | None = None, exit: str | None = None,
) -> str:
    """Modify properties of a state, group, or note."""
    d = state.get()
    state.push_history()
    # Find element
    for s in d.states:
        if s.id == id:
            if label is not None: s.label = label
            if x is not None: s.x = x
            if y is not None: s.y = y
            if w is not None: s.w = w
            if h is not None: s.h = h
            if color is not None: s.color = color
            if entry is not None: s.entry = entry
            if do is not None: s.do = do
            if exit is not None: s.exit = exit
            return f"Modified state '{id}'"
    for g in d.groups:
        if g.id == id:
            if label is not None: g.label = label
            if x is not None: g.x = x
            if y is not None: g.y = y
            if w is not None: g.w = w
            if h is not None: g.h = h
            if color is not None: g.color = color
            return f"Modified group '{id}'"
    for n in d.notes:
        if n.id == id:
            if label is not None: n.label = label
            if x is not None: n.x = x
            if y is not None: n.y = y
            if w is not None: n.w = w
            if h is not None: n.h = h
            if color is not None: n.color = color
            return f"Modified note '{id}'"
    return f"Error: '{id}' not found"
