"""Palette / role tools — let an LLM apply a cohesive theme in one call
instead of picking colors per-element.

`ss_set_role` writes role=<name> into the DSL (persists across save/load,
ignored by the HTML preview's parser).

`ss_apply_palette` reads each element's role, looks the role up in the
named palette, and rewrites color/border/text props in place.
"""
from __future__ import annotations
import json

from .. import state
from ..core.parser import parse_dsl
from ..core.dsl_updater import update_prop
from ..core.palettes import PALETTES, ROLES, get_palette, resolve_state_colors


def _refresh() -> None:
    state._current = parse_dsl(state.get_dsl())


def ss_list_palettes() -> str:
    """List built-in palettes with their descriptions and supported roles.

    Use this before `ss_apply_palette` so the LLM picks an appropriate
    theme for the diagram's domain.
    """
    out = []
    for name, p in PALETTES.items():
        out.append({
            "name": name,
            "description": p.get("description", ""),
            "roles": list(p.get("state", {}).keys()),
        })
    return json.dumps({"palettes": out, "standard_roles": list(ROLES)}, indent=2)


def ss_set_role(id: str, role: str) -> str:
    """Tag a state / group / note with a semantic role.

    Standard roles: default, idle, active, init, error, warning, success,
    transient. Custom roles are accepted but only resolve if the active
    palette defines them.

    The role is written as `role=<name>` on the element's DSL line so it
    survives ss_save / ss_open. The HTML preview ignores unknown props,
    so this does not affect rendering on its own — call `ss_apply_palette`
    to actually colour the diagram from roles.
    """
    d = state.get()
    el_type = None
    for s in d.states:
        if s.id == id:
            el_type = "state"; break
    if el_type is None:
        for g in d.groups:
            if g.id == id:
                el_type = "group"; break
    if el_type is None:
        for n in d.notes:
            if n.id == id:
                el_type = "note"; break
    if el_type is None:
        return f"Error: '{id}' is not a state, group, or note (pseudo-states have no role)"

    state.push_history()
    dsl = update_prop(el_type, id, "role", role, state.get_dsl())
    state.set_dsl(dsl)
    _refresh()
    return f"Set role of {el_type} '{id}' to '{role}'"


def ss_apply_palette(name: str, scope: str | None = None) -> str:
    """Apply a palette to all states, groups, and notes (or a scoped subtree).

    Args:
        name: palette key from `ss_list_palettes()`.
        scope: optional state id — when given, only that state's subtree
               (the state itself and its descendants) is recoloured.

    Resolution: each element's `role=` is looked up in the palette. Missing
    roles fall back to "default". Elements without a `role=` get "default".

    Returns a summary of how many elements were updated.
    """
    palette = get_palette(name)
    if palette is None:
        available = ", ".join(PALETTES.keys())
        return f"Error: palette '{name}' not found. Available: {available}"

    d = state.get()
    state.push_history()
    dsl = state.get_dsl()
    updated = {"state": 0, "group": 0, "note": 0}

    # Scope filter
    in_scope = _make_scope_filter(d, scope)

    for s in d.states:
        if not in_scope(s.id):
            continue
        colors = resolve_state_colors(palette, s.role)
        if not colors:
            continue
        if "color" in colors:
            dsl = update_prop("state", s.id, "color", colors["color"], dsl)
        if "border" in colors:
            dsl = update_prop("state", s.id, "border", colors["border"], dsl)
        if "text" in colors:
            dsl = update_prop("state", s.id, "text", colors["text"], dsl)
        updated["state"] += 1

    g_palette = palette.get("group", {})
    for g in d.groups:
        if scope is not None:
            # Groups are top-level; skip when a state subtree is scoped
            continue
        if "color" in g_palette:
            dsl = update_prop("group", g.id, "color", g_palette["color"], dsl)
        if "border" in g_palette:
            dsl = update_prop("group", g.id, "border", g_palette["border"], dsl)
        updated["group"] += 1

    n_palette = palette.get("note", {})
    for n in d.notes:
        if scope is not None:
            continue
        if "color" in n_palette:
            dsl = update_prop("note", n.id, "color", n_palette["color"], dsl)
        if "text" in n_palette:
            dsl = update_prop("note", n.id, "text", n_palette["text"], dsl)
        updated["note"] += 1

    state.set_dsl(dsl)
    _refresh()
    scope_msg = f" (scope={scope})" if scope else ""
    return (
        f"Applied palette '{name}'{scope_msg}: "
        f"{updated['state']} state(s), {updated['group']} group(s), {updated['note']} note(s)"
    )


def _make_scope_filter(d, scope: str | None):
    """Return predicate(state_id) -> bool for the given scope.
    None scope ⇒ accept everything. State scope ⇒ accept the state and its
    transitive descendants."""
    if scope is None:
        return lambda _id: True
    sm = {s.id: s for s in d.states}
    if scope not in sm:
        return lambda _id: False
    descendants = {scope}
    frontier = [scope]
    while frontier:
        node = frontier.pop()
        for child in sm[node].children:
            if child not in descendants and child in sm:
                descendants.add(child)
                frontier.append(child)
    return lambda _id: _id in descendants
