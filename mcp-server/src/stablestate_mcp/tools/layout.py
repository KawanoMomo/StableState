"""Auto-layout tools — let an LLM ask the server to arrange states instead
of computing coordinates manually (the latter is a major source of crowded /
overlapping diagrams).

`ss_auto_layout` is the headline tool: pass an algorithm name and the server
re-positions every state in the chosen scope.

`ss_distribute`, `ss_align`, `ss_pack_children` are incremental cleanup
operations the LLM can apply after manual edits.

All tools rewrite `at x,y` (and sometimes `size WxH`) in the DSL and then
re-parse, so the result is fully persisted.
"""
from __future__ import annotations
import math
from collections import defaultdict, deque

from .. import state
from ..core.parser import parse_dsl
from ..core.dsl_updater import update_pos, update_size


# ─── Constants ───
DEFAULT_W = 8.0
DEFAULT_H = 4.0
DEFAULT_GAP_X = 4.0   # horizontal gap between adjacent states
DEFAULT_GAP_Y = 3.0   # vertical gap


def _refresh() -> None:
    state._current = parse_dsl(state.get_dsl())


def _root_states(d) -> list:
    """States whose parent is None (top-level only) — auto-layout never
    crosses into a composite's interior."""
    return [s for s in d.states if s.parent is None]


def _children_of(d, parent_id: str) -> list:
    return [s for s in d.states if s.parent == parent_id]


def _initial_targets(d) -> list[str]:
    """Top-level states reached by an `initial` pseudo-state. These act as
    rank-0 roots for hierarchical layout. Falls back to states with no
    incoming transitions, then to the first state in declaration order."""
    initials = [ps for ps in d.pseudo_states if ps.type == "initial" and ps.parent is None]
    targets: list[str] = []
    sm = {s.id: s for s in d.states if s.parent is None}
    for ini in initials:
        for t in d.transitions:
            if t.from_id == ini.id and t.to_id in sm:
                targets.append(t.to_id)
    if targets:
        return targets

    # Fallback: states with no incoming edges
    incoming = {t.to_id for t in d.transitions}
    no_in = [s.id for s in _root_states(d) if s.id not in incoming]
    if no_in:
        return no_in

    roots = _root_states(d)
    return [roots[0].id] if roots else []


def ss_auto_layout(algorithm: str = "hierarchical", scope: str | None = None) -> str:
    """Auto-position states. The LLM should call this once after declaring
    states + transitions instead of choosing coordinates per state.

    Args:
        algorithm: 'hierarchical' (BFS from initial pseudo-state, depth → x,
                   breadth → y) — best for state machines with a clear flow.
                   'grid' — square grid in declaration order; good for
                   topologies with no obvious flow.
        scope: state id whose children should be laid out (composite
               state interior). None ⇒ top-level states.

    Pseudo-states are placed adjacent to their first connected state
    (left edge for outgoing, right edge for incoming).

    Returns a summary including new canvas dimensions when the layout
    extends beyond the current canvas.
    """
    d = state.get()
    if algorithm not in ("hierarchical", "grid"):
        return f"Error: unknown algorithm '{algorithm}'. Use 'hierarchical' or 'grid'."

    if scope is not None:
        sm = {s.id: s for s in d.states}
        if scope not in sm:
            return f"Error: scope state '{scope}' not found"
        targets = _children_of(d, scope)
        if not targets:
            return f"No children to lay out in '{scope}'"
        # Use local coordinates inside parent
        positions = _compute_layout(targets, d, algorithm, origin_x=1.5, origin_y=2.0)
    else:
        targets = _root_states(d)
        if not targets:
            return "No top-level states to lay out"
        positions = _compute_layout(targets, d, algorithm, origin_x=2.0, origin_y=2.0)

    state.push_history()
    dsl = state.get_dsl()
    moved = 0
    max_x, max_y = 0.0, 0.0
    for s in targets:
        if s.id not in positions:
            continue
        nx, ny = positions[s.id]
        dsl = update_pos("state", s.id, nx, ny, dsl)
        moved += 1
        max_x = max(max_x, nx + s.w)
        max_y = max(max_y, ny + s.h)

    # Place pseudo-states near their connected partners (top-level only)
    if scope is None:
        ps_positions = _place_pseudo_states(d, positions)
        for ps_id, (nx, ny) in ps_positions.items():
            ps = next((p for p in d.pseudo_states if p.id == ps_id), None)
            if ps is None or ps.parent is not None:
                continue
            dsl = update_pos(ps.type, ps_id, nx, ny, dsl)
            max_x = max(max_x, nx)
            max_y = max(max_y, ny)

    state.set_dsl(dsl)
    _refresh()

    canvas = state.get().canvas
    cw = canvas.width / canvas.grid
    ch = canvas.height / canvas.grid
    canvas_msg = ""
    if max_x > cw - 1 or max_y > ch - 1:
        canvas_msg = (
            f" (NOTE: layout extends to {math.ceil(max_x)}x{math.ceil(max_y)} grid; "
            f"current canvas is {int(cw)}x{int(ch)} -- consider expanding)"
        )
    scope_msg = f" in '{scope}'" if scope else ""
    return f"Re-laid out {moved} state(s){scope_msg} using '{algorithm}'{canvas_msg}"


def _compute_layout(targets: list, d, algorithm: str, origin_x: float, origin_y: float) -> dict:
    """Return {state_id: (x, y)} for the requested targets."""
    if algorithm == "grid":
        return _grid_layout(targets, origin_x, origin_y)
    return _hierarchical_layout(targets, d, origin_x, origin_y)


def _grid_layout(targets: list, origin_x: float, origin_y: float) -> dict:
    n = len(targets)
    cols = max(1, int(math.ceil(math.sqrt(n))))
    positions: dict[str, tuple[float, float]] = {}
    for i, s in enumerate(targets):
        col, row = i % cols, i // cols
        x = origin_x + col * (s.w + DEFAULT_GAP_X)
        y = origin_y + row * (s.h + DEFAULT_GAP_Y)
        positions[s.id] = (x, y)
    return positions


def _hierarchical_layout(targets: list, d, origin_x: float, origin_y: float) -> dict:
    """BFS from initial-pseudo targets. Each rank becomes a column.

    Pseudo-states (choice/fork/join/...) are treated as transparent: a
    chain `A -> choice -> B` contributes `A -> B` to the BFS adjacency so
    they don't break the ranking flow."""
    target_ids = {s.id for s in targets}
    sm = {s.id: s for s in targets}
    pseudo_ids = {ps.id for ps in d.pseudo_states}

    # Resolve any transition target through a chain of pseudo-states until
    # we hit a real state in target_ids (or give up).
    out_via_pseudo: dict[str, list[str]] = defaultdict(list)
    for t in d.transitions:
        out_via_pseudo[t.from_id].append(t.to_id)

    def resolve_real(start: str, _seen: set | None = None) -> list[str]:
        """Return all real-state targets reachable from `start` via 0+ pseudo-state hops."""
        _seen = _seen or set()
        if start in _seen:
            return []
        _seen.add(start)
        if start in target_ids:
            return [start]
        if start not in pseudo_ids:
            return []
        out: list[str] = []
        for nxt in out_via_pseudo.get(start, []):
            out.extend(resolve_real(nxt, _seen))
        return out

    adj: dict[str, list[str]] = defaultdict(list)
    for t in d.transitions:
        if t.from_id in target_ids:
            for real in resolve_real(t.to_id):
                if real != t.from_id:
                    adj[t.from_id].append(real)

    # Seeds: initial-pseudo targets restricted to scope, else states with no incoming
    seeds_all = _initial_targets(d)
    seeds = [sid for sid in seeds_all if sid in target_ids]
    if not seeds:
        incoming = defaultdict(int)
        for t in d.transitions:
            if t.from_id in target_ids and t.to_id in target_ids:
                incoming[t.to_id] += 1
        seeds = [sid for sid in target_ids if incoming[sid] == 0]
    if not seeds:
        seeds = [targets[0].id]

    rank: dict[str, int] = {}
    q = deque()
    for sid in seeds:
        rank[sid] = 0
        q.append(sid)
    while q:
        node = q.popleft()
        for nxt in adj[node]:
            if nxt not in rank:
                rank[nxt] = rank[node] + 1
                q.append(nxt)
    # Unranked (cycle islands): assign rank by following any edge into ranked set
    for sid in target_ids:
        if sid in rank:
            continue
        rank[sid] = max(rank.values(), default=0) + 1

    # Group by rank, preserving declaration order
    by_rank: dict[int, list[str]] = defaultdict(list)
    for s in targets:
        by_rank[rank[s.id]].append(s.id)

    # Column widths and row heights are sized to the largest element in each band
    rank_widths: dict[int, float] = {
        r: max(sm[sid].w for sid in ids) for r, ids in by_rank.items()
    }
    max_rows_h = max((sm[sid].h for sid in target_ids), default=DEFAULT_H)

    # x position per rank
    rank_x: dict[int, float] = {}
    cur_x = origin_x
    for r in sorted(by_rank.keys()):
        rank_x[r] = cur_x
        cur_x += rank_widths[r] + DEFAULT_GAP_X

    positions: dict[str, tuple[float, float]] = {}
    for r, ids in by_rank.items():
        for i, sid in enumerate(ids):
            y = origin_y + i * (max_rows_h + DEFAULT_GAP_Y)
            positions[sid] = (rank_x[r], y)
    return positions


def _place_pseudo_states(d, positions: dict) -> dict[str, tuple[float, float]]:
    """Place top-level pseudo-states adjacent to their first connected state.
    initial → left of target; final → right of source; choice/etc → above source."""
    out: dict[str, tuple[float, float]] = {}
    sm = {s.id: s for s in d.states}
    for ps in d.pseudo_states:
        if ps.parent is not None:
            continue
        # Find connected state in same scope
        partner_id = None
        is_outgoing = True
        for t in d.transitions:
            if t.from_id == ps.id and t.to_id in positions:
                partner_id = t.to_id; is_outgoing = True; break
            if t.to_id == ps.id and t.from_id in positions:
                partner_id = t.from_id; is_outgoing = False; break
        if partner_id is None or partner_id not in sm:
            continue
        px, py = positions[partner_id]
        ph = sm[partner_id].h
        pw = sm[partner_id].w
        if ps.type == "initial":
            out[ps.id] = (max(0.5, px - 1.5), py + ph / 2)
        elif ps.type == "final":
            out[ps.id] = (px + pw + 1.5, py + ph / 2)
        else:  # choice / history / fork / join
            if is_outgoing:
                out[ps.id] = (px + pw + 1.5, py + ph / 2)
            else:
                out[ps.id] = (max(0.5, px - 1.5), py + ph / 2)
    return out


def ss_distribute(ids: list[str], axis: str = "x", spacing: float | None = None) -> str:
    """Evenly distribute the given elements along the chosen axis.

    Args:
        ids: state / group / note IDs (>=2). Order in the list determines
             the linear sequence; first element keeps its position.
        axis: 'x' or 'y'.
        spacing: gap (grid units) between successive elements. Defaults to
                 4 (axis=x) or 3 (axis=y).

    The first element anchors the sequence; subsequent ones are placed at
    `prev.end + spacing`.
    """
    if axis not in ("x", "y"):
        return f"Error: axis must be 'x' or 'y' (got '{axis}')"
    if len(ids) < 2:
        return "Error: need at least 2 IDs to distribute"
    spacing = spacing if spacing is not None else (DEFAULT_GAP_X if axis == "x" else DEFAULT_GAP_Y)

    d = state.get()
    items = []
    for eid in ids:
        info = _resolve_movable(d, eid)
        if info is None:
            return f"Error: '{eid}' is not a movable element"
        items.append(info)

    state.push_history()
    dsl = state.get_dsl()
    anchor = items[0]
    cursor = (anchor["x"] + anchor["w"]) if axis == "x" else (anchor["y"] + anchor["h"])
    for it in items[1:]:
        if axis == "x":
            new_x = cursor + spacing
            dsl = update_pos(it["type"], it["id"], new_x, it["y"], dsl)
            cursor = new_x + it["w"]
        else:
            new_y = cursor + spacing
            dsl = update_pos(it["type"], it["id"], it["x"], new_y, dsl)
            cursor = new_y + it["h"]

    state.set_dsl(dsl)
    _refresh()
    return f"Distributed {len(ids)} elements along {axis} (spacing={spacing})"


def ss_align(ids: list[str], edge: str) -> str:
    """Align the given elements to a common edge.

    Args:
        ids: state / group / note IDs (>=2). The first element is the
             anchor (its edge defines the target); others move to match.
        edge: 'left' / 'right' / 'top' / 'bottom' / 'center_x' / 'center_y'.
    """
    valid = ("left", "right", "top", "bottom", "center_x", "center_y")
    if edge not in valid:
        return f"Error: edge must be one of {valid}"
    if len(ids) < 2:
        return "Error: need at least 2 IDs to align"

    d = state.get()
    items = []
    for eid in ids:
        info = _resolve_movable(d, eid)
        if info is None:
            return f"Error: '{eid}' is not a movable element"
        items.append(info)
    anchor = items[0]

    if edge == "left":         target = anchor["x"]
    elif edge == "right":      target = anchor["x"] + anchor["w"]
    elif edge == "top":        target = anchor["y"]
    elif edge == "bottom":     target = anchor["y"] + anchor["h"]
    elif edge == "center_x":   target = anchor["x"] + anchor["w"] / 2
    elif edge == "center_y":   target = anchor["y"] + anchor["h"] / 2

    state.push_history()
    dsl = state.get_dsl()
    for it in items[1:]:
        nx, ny = it["x"], it["y"]
        if edge == "left":         nx = target
        elif edge == "right":      nx = target - it["w"]
        elif edge == "top":        ny = target
        elif edge == "bottom":     ny = target - it["h"]
        elif edge == "center_x":   nx = target - it["w"] / 2
        elif edge == "center_y":   ny = target - it["h"] / 2
        dsl = update_pos(it["type"], it["id"], max(0, nx), max(0, ny), dsl)
    state.set_dsl(dsl)
    _refresh()
    return f"Aligned {len(ids)} elements to {edge}"


def ss_pack_children(parent_id: str, columns: int | None = None) -> str:
    """Pack the children of a composite state in a tidy grid and resize the
    parent to fit. Useful after `ss_add_state(parent=...)` has been called
    several times without coordinate planning.

    Args:
        parent_id: composite state id.
        columns: number of columns (default: ceil(sqrt(n))).
    """
    d = state.get()
    sm = {s.id: s for s in d.states}
    parent = sm.get(parent_id)
    if parent is None:
        return f"Error: state '{parent_id}' not found"
    children = [s for s in d.states if s.parent == parent_id]
    if not children:
        return f"State '{parent_id}' has no children"

    cols = columns if columns and columns > 0 else max(1, int(math.ceil(math.sqrt(len(children)))))
    margin_x = 1.5  # space inside parent before first child
    margin_top = 2.0  # leave room for parent label
    gap_x, gap_y = DEFAULT_GAP_X, DEFAULT_GAP_Y

    # Use widest / tallest child as the cell size so children with mixed
    # sizes still align in clean rows
    cell_w = max(c.w for c in children)
    cell_h = max(c.h for c in children)

    state.push_history()
    dsl = state.get_dsl()
    for i, c in enumerate(children):
        col, row = i % cols, i // cols
        nx = margin_x + col * (cell_w + gap_x)
        ny = margin_top + row * (cell_h + gap_y)
        dsl = update_pos("state", c.id, nx, ny, dsl)

    rows = (len(children) + cols - 1) // cols
    new_w = margin_x + cols * cell_w + (cols - 1) * gap_x + margin_x
    new_h = margin_top + rows * cell_h + (rows - 1) * gap_y + 1.0
    if new_w > parent.w or new_h > parent.h:
        dsl = update_size("state", parent_id, max(new_w, parent.w), max(new_h, parent.h), dsl)

    state.set_dsl(dsl)
    _refresh()
    return f"Packed {len(children)} children of '{parent_id}' into {cols}x{rows} grid"


def _resolve_movable(d, eid: str) -> dict | None:
    """Resolve an id to a movable element descriptor or None."""
    for s in d.states:
        if s.id == eid:
            return {"type": "state", "id": eid, "x": s.x, "y": s.y, "w": s.w, "h": s.h}
    for g in d.groups:
        if g.id == eid:
            return {"type": "group", "id": eid, "x": g.x, "y": g.y, "w": g.w, "h": g.h}
    for n in d.notes:
        if n.id == eid:
            return {"type": "note", "id": eid, "x": n.x, "y": n.y, "w": n.w, "h": n.h}
    for ps in d.pseudo_states:
        if ps.id == eid:
            return {
                "type": ps.type, "id": eid,
                "x": ps.x, "y": ps.y,
                "w": ps.w or 1, "h": ps.h or 1,
            }
    return None
