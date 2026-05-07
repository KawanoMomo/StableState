"""Element manipulation tools — uses DSL regex updaters to preserve formatting."""
from __future__ import annotations
from .. import state
from ..core.parser import parse_dsl
from ..core.dsl_updater import update_pos, update_size, update_label, update_prop, remove_element, add_line


def _refresh():
    """Re-parse DSL text to update the model."""
    dsl = state.get_dsl()
    d = parse_dsl(dsl)
    state._current = d


def ss_add_state(
    id: str, label: str, x: float, y: float,
    w: float = 8, h: float = 4, parent: str | None = None,
    entry: str | None = None, do: str | None = None, exit: str | None = None,
    color: str | None = None,
) -> str:
    """Add a new state to the diagram. When parent is given, the new state
    is inserted inside the parent's composite-block (the parent is converted
    to a composite if it was a leaf state)."""
    d = state.get()
    if any(s.id == id for s in d.states):
        return f"Error: state '{id}' already exists"
    if parent is not None and not any(s.id == parent for s in d.states):
        return f"Error: parent state '{parent}' not found"

    state.push_history()
    sx = str(int(x)) if x == int(x) else str(x)
    sy = str(int(y)) if y == int(y) else str(y)
    sw = str(int(w)) if w == int(w) else str(w)
    sh = str(int(h)) if h == int(h) else str(h)
    body = f'state {id} "{label}" at {sx},{sy} size {sw}x{sh}'
    if entry:
        body += f" entry={entry}"
    if do:
        body += f" do={do}"
    if exit:
        body += f" exit={exit}"
    if color:
        body += f" color={color}"

    if parent is None:
        dsl = add_line(body, state.get_dsl())
    else:
        dsl = _insert_inside(parent, body, state.get_dsl())

    state.set_dsl(dsl)
    _refresh()
    parent_msg = f" inside '{parent}'" if parent else ""
    return f"Added state '{id}' at ({x},{y}){parent_msg}"


def _insert_inside(parent_id: str, child_body: str, dsl: str) -> str:
    """Insert child_body as a nested state inside parent_id's brace block.
    If parent has no { } block yet, convert parent's line to a composite
    by appending { and adding a matching } afterwards. Indentation is
    inferred from the parent line so nested composites stay readable."""
    import re
    lines = dsl.split("\n")
    # Locate parent line
    parent_re = re.compile(rf"^(\s*)state\s+{re.escape(parent_id)}\b")
    p_idx = None
    p_indent = ""
    for i, ln in enumerate(lines):
        m = parent_re.match(ln)
        if m:
            p_idx = i
            p_indent = m.group(1)
            break
    if p_idx is None:
        return dsl  # caller already validated; defensive

    child_indent = p_indent + "  "
    child_line = child_indent + child_body

    parent_line = lines[p_idx].rstrip()
    if parent_line.endswith("{"):
        # Already composite — insert just before the matching }
        depth = 1
        for j in range(p_idx + 1, len(lines)):
            stripped = lines[j].strip()
            if stripped.endswith("{"):
                depth += 1
            elif stripped.startswith("}"):
                depth -= 1
                if depth == 0:
                    lines.insert(j, child_line)
                    return "\n".join(lines)
        # No matching } found — append at end
        lines.append(child_line)
        lines.append(p_indent + "}")
        return "\n".join(lines)

    # Convert leaf to composite: append ` {` to parent line, then child, then `}`
    lines[p_idx] = parent_line + " {"
    lines.insert(p_idx + 1, child_line)
    lines.insert(p_idx + 2, p_indent + "}")
    return "\n".join(lines)


def ss_add_pseudo(
    type: str, id: str, x: float, y: float,
    parent: str | None = None,
) -> str:
    """Add a pseudo-state (initial, final, choice, history, deephistory)."""
    state.push_history()
    sx = str(int(x)) if x == int(x) else str(x)
    sy = str(int(y)) if y == int(y) else str(y)
    line = f"{type} {id} at {sx},{sy}"
    dsl = add_line(line, state.get_dsl())
    state.set_dsl(dsl)
    _refresh()
    return f"Added {type} '{id}' at ({x},{y})"


def ss_add_transition(
    from_id: str, to_id: str,
    event: str | None = None, guard: str | None = None,
    action: str | None = None, kind: str | None = None,
) -> str:
    """Add a transition between two states."""
    state.push_history()
    line = f"{from_id} -> {to_id}"
    parts = []
    if event:
        parts.append(event)
    if guard:
        parts.append(f"[{guard}]")
    if action:
        parts.append(f"/ {action}")
    if kind:
        parts.append(f"@{kind}")
    if parts:
        line += " : " + " ".join(parts)
    dsl = add_line(line, state.get_dsl())
    state.set_dsl(dsl)
    _refresh()
    label = event or "(no event)"
    return f"Added transition {from_id} -> {to_id} : {label}"


def ss_add_group(
    id: str, label: str, x: float, y: float, w: float, h: float,
    color: str | None = None,
) -> str:
    """Add a visual group."""
    state.push_history()
    sx, sy = str(int(x)) if x == int(x) else str(x), str(int(y)) if y == int(y) else str(y)
    sw, sh = str(int(w)) if w == int(w) else str(w), str(int(h)) if h == int(h) else str(h)
    line = f'group {id} "{label}" at {sx},{sy} size {sw}x{sh}'
    if color:
        line += f" color={color}"
    dsl = add_line(line, state.get_dsl())
    state.set_dsl(dsl)
    _refresh()
    return f"Added group '{id}' at ({x},{y})"


def ss_add_note(
    id: str, label: str, x: float, y: float,
    w: float = 8, h: float = 2, color: str | None = None,
) -> str:
    """Add an annotation note."""
    state.push_history()
    sx, sy = str(int(x)) if x == int(x) else str(x), str(int(y)) if y == int(y) else str(y)
    sw, sh = str(int(w)) if w == int(w) else str(w), str(int(h)) if h == int(h) else str(h)
    line = f'note {id} "{label}" at {sx},{sy} size {sw}x{sh} color={color or "#FEF3C7"}'
    dsl = add_line(line, state.get_dsl())
    state.set_dsl(dsl)
    _refresh()
    return f"Added note '{id}' at ({x},{y})"


def ss_remove(id: str) -> str:
    """Remove a state, pseudo-state, group, or note and its transitions."""
    d = state.get()
    found = (
        any(s.id == id for s in d.states)
        or any(ps.id == id for ps in d.pseudo_states)
        or any(g.id == id for g in d.groups)
        or any(n.id == id for n in d.notes)
    )
    if not found:
        return f"Error: '{id}' not found"
    state.push_history()
    dsl = remove_element(id, state.get_dsl())
    state.set_dsl(dsl)
    _refresh()
    return f"Removed '{id}'"


def ss_modify(
    id: str, label: str | None = None, x: float | None = None,
    y: float | None = None, w: float | None = None, h: float | None = None,
    color: str | None = None, entry: str | None = None,
    do: str | None = None, exit: str | None = None,
) -> str:
    """Modify properties of a state, group, or note."""
    d = state.get()
    # Find element and determine type
    el_type = None
    el = None
    for s in d.states:
        if s.id == id:
            el_type = "state"
            el = s
            break
    if not el:
        for g in d.groups:
            if g.id == id:
                el_type = "group"
                el = g
                break
    if not el:
        for n in d.notes:
            if n.id == id:
                el_type = "note"
                el = n
                break
    if not el:
        for ps in d.pseudo_states:
            if ps.id == id:
                el_type = ps.type
                el = ps
                break
    if not el:
        return f"Error: '{id}' not found"

    state.push_history()
    dsl = state.get_dsl()

    if x is not None or y is not None:
        nx = x if x is not None else el.x
        ny = y if y is not None else el.y
        dsl = update_pos(el_type, id, nx, ny, dsl)
    if w is not None or h is not None:
        nw = w if w is not None else getattr(el, "w", 8)
        nh = h if h is not None else getattr(el, "h", 4)
        dsl = update_size(el_type, id, nw, nh, dsl)
    if label is not None:
        dsl = update_label(el_type, id, label, dsl)
    if color is not None:
        dsl = update_prop(el_type, id, "color", color, dsl)
    if entry is not None:
        dsl = update_prop(el_type, id, "entry", entry, dsl)
    if do is not None:
        dsl = update_prop(el_type, id, "do", do, dsl)
    if exit is not None:
        dsl = update_prop(el_type, id, "exit", exit, dsl)

    state.set_dsl(dsl)
    _refresh()
    return f"Modified {el_type} '{id}'"
