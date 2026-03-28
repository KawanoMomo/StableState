"""Smart tools: validation, suggestions."""
from __future__ import annotations
from .. import state
from ..core.routing import compute_port_side, get_port_point, build_route, route_midpoint


def _get_abs_box(el, d):
    """Get absolute bounding box in grid units."""
    ox, oy = 0, 0
    pid = getattr(el, "parent", None)
    state_map = {s.id: s for s in d.states}
    while pid:
        p = state_map.get(pid)
        if p:
            ox += p.x
            oy += p.y
            pid = p.parent
        else:
            break
    return {
        "x": el.x + ox,
        "y": el.y + oy,
        "w": getattr(el, "w", None) or 1,
        "h": getattr(el, "h", None) or 1,
    }


def _boxes_overlap(a, b):
    return not (
        a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"]
        or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"]
    )


def _segment_crosses_box(x1, y1, x2, y2, box):
    """Liang-Barsky line clipping — any angle."""
    bx, by = box["x"], box["y"]
    bx2, by2 = bx + box["w"], by + box["h"]
    dx, dy = x2 - x1, y2 - y1
    p = [-dx, dx, -dy, dy]
    q = [x1 - bx, bx2 - x1, y1 - by, by2 - y1]
    t0, t1 = 0.0, 1.0
    for i in range(4):
        if abs(p[i]) < 1e-10:
            if q[i] < 0:
                return False
        else:
            r = q[i] / p[i]
            if p[i] < 0:
                t0 = max(t0, r)
            else:
                t1 = min(t1, r)
            if t0 > t1:
                return False
    return t0 < t1


def _polyline_crosses_box(points, box):
    """Check if any segment of a polyline crosses a box."""
    for i in range(len(points) - 1):
        if _segment_crosses_box(
            points[i]["x"], points[i]["y"],
            points[i + 1]["x"], points[i + 1]["y"],
            box,
        ):
            return True
    return False


def _get_all_routes(d):
    """Compute actual orthogonal routes for all transitions."""
    state_map = {s.id: s for s in d.states}
    pseudo_map = {ps.id: ps for ps in d.pseudo_states}

    # Detect bidirectional pairs for alternate routing
    trans_pairs = {(t.from_id, t.to_id) for t in d.transitions}
    reverse_set = set()
    seen = set()
    for i, t in enumerate(d.transitions):
        pair = tuple(sorted([t.from_id, t.to_id]))
        if (t.to_id, t.from_id) in trans_pairs and pair in seen:
            reverse_set.add(i)
        seen.add(pair)

    routes = []
    label_mids = []

    for ti, t in enumerate(d.transitions):
        src_el = state_map.get(t.from_id) or pseudo_map.get(t.from_id)
        tgt_el = state_map.get(t.to_id) or pseudo_map.get(t.to_id)
        if not src_el or not tgt_el:
            routes.append([])
            label_mids.append(None)
            continue

        src_box = _get_abs_box(src_el, d)
        tgt_box = _get_abs_box(tgt_el, d)

        if t.from_id == t.to_id:
            # Self-loop — skip
            routes.append([])
            label_mids.append(None)
            continue

        is_reverse = ti in reverse_set
        if is_reverse:
            fwd_src, fwd_tgt = compute_port_side(src_box, tgt_box)
            if fwd_src in ("right", "left"):
                src_side, tgt_side = "bottom", "bottom"
            else:
                src_side, tgt_side = "right", "right"
        else:
            src_side, tgt_side = compute_port_side(src_box, tgt_box)

        from_pt = get_port_point(src_box, src_side)
        to_pt = get_port_point(tgt_box, tgt_side)
        route = build_route(from_pt, to_pt, src_side, tgt_side)
        routes.append(route)

        if t.event or t.guard or t.action:
            mid = route_midpoint(route)
            label_text = ""
            if t.event:
                label_text += t.event
            if t.guard:
                label_text += f" [{t.guard}]"
            if t.action:
                label_text += f" / {t.action}"
            label_mids.append({
                "x": mid["x"], "y": mid["y"],
                "text": label_text,
                "tid": f"{t.from_id}->{t.to_id}",
            })
        else:
            label_mids.append(None)

    return routes, label_mids


def ss_validate_layout() -> str:
    """Detect layout issues using actual orthogonal routing."""
    d = state.get()
    g = d.canvas.grid
    cw = d.canvas.width / g
    ch = d.canvas.height / g
    issues = []

    state_map = {s.id: s for s in d.states}
    pseudo_map = {ps.id: ps for ps in d.pseudo_states}

    # All element boxes
    root_states = [s for s in d.states if s.parent is None]
    all_state_boxes = {s.id: _get_abs_box(s, d) for s in d.states}
    pseudo_boxes = {ps.id: _get_abs_box(ps, d) for ps in d.pseudo_states}

    # 1. Overlap detection (same-level states)
    root_ids = [s.id for s in root_states]
    for i in range(len(root_ids)):
        for j in range(i + 1, len(root_ids)):
            a, b = all_state_boxes[root_ids[i]], all_state_boxes[root_ids[j]]
            if _boxes_overlap(a, b):
                issues.append(f"Overlap: {root_ids[i]} and {root_ids[j]}")

    # 2. Out-of-canvas
    for s in d.states:
        box = all_state_boxes[s.id]
        if box["x"] + box["w"] > cw or box["y"] + box["h"] > ch:
            issues.append(f"Out of canvas: {s.id}")
        if box["x"] < 0 or box["y"] < 0:
            issues.append(f"Negative position: {s.id}")

    # Compute actual routes
    routes, label_mids = _get_all_routes(d)

    # 3. Route crosses unrelated block
    for ti, t in enumerate(d.transitions):
        route = routes[ti]
        if not route:
            continue
        src_el = state_map.get(t.from_id) or pseudo_map.get(t.from_id)
        tgt_el = state_map.get(t.to_id) or pseudo_map.get(t.to_id)
        if not src_el or not tgt_el:
            continue
        # Build skip set (source, target, all ancestors)
        skip = {t.from_id, t.to_id}
        for el in [src_el, tgt_el]:
            pid = getattr(el, "parent", None)
            while pid:
                skip.add(pid)
                p = state_map.get(pid)
                pid = p.parent if p else None

        for s in root_states:
            if s.id in skip:
                continue
            if _polyline_crosses_box(route, all_state_boxes[s.id]):
                issues.append(f"Route {t.from_id}->{t.to_id} crosses block {s.id}")

    # 4. Pseudo-state overlaps with route
    for ti, t in enumerate(d.transitions):
        route = routes[ti]
        if not route:
            continue
        src_el = state_map.get(t.from_id) or pseudo_map.get(t.from_id)
        tgt_el = state_map.get(t.to_id) or pseudo_map.get(t.to_id)
        if not src_el or not tgt_el:
            continue
        for ps in d.pseudo_states:
            if ps.id in (t.from_id, t.to_id):
                continue
            # Only check same-scope pseudo-states
            src_parent = getattr(src_el, "parent", None)
            tgt_parent = getattr(tgt_el, "parent", None)
            ps_parent = getattr(ps, "parent", None)
            if ps_parent != src_parent and ps_parent != tgt_parent:
                continue
            pb = pseudo_boxes[ps.id]
            expanded = {
                "x": pb["x"] - 0.5, "y": pb["y"] - 0.5,
                "w": pb["w"] + 1.0, "h": pb["h"] + 1.0,
            }
            if _polyline_crosses_box(route, expanded):
                issues.append(f"Pseudo {ps.id} overlaps route {t.from_id}->{t.to_id}")

    # 5. Label overlap (using actual route midpoints)
    valid_labels = [lm for lm in label_mids if lm is not None]
    for i in range(len(valid_labels)):
        for j in range(i + 1, len(valid_labels)):
            a, b = valid_labels[i], valid_labels[j]
            dist = ((a["x"] - b["x"]) ** 2 + (a["y"] - b["y"]) ** 2) ** 0.5
            if dist < 2.5:
                issues.append(
                    f"Label overlap: {a['tid']} and {b['tid']} (dist={dist:.1f})"
                )

    if not issues:
        return "No issues found. Layout looks good."
    return f"{len(issues)} issue(s) found:\n" + "\n".join(f"  - {i}" for i in issues)


def ss_suggest_position(w: float = 8, h: float = 4) -> str:
    """Suggest a position for a new element that doesn't overlap existing ones."""
    d = state.get()
    g = d.canvas.grid
    cw = d.canvas.width / g
    ch = d.canvas.height / g
    occupied = []
    for s in d.states:
        if s.parent is None:
            occupied.append(_get_abs_box(s, d))
    for grp in d.groups:
        occupied.append(_get_abs_box(grp, d))
    for y in range(1, int(ch - h), 2):
        for x in range(1, int(cw - w), 2):
            candidate = {"x": x, "y": y, "w": w, "h": h}
            if not any(_boxes_overlap(candidate, o) for o in occupied):
                return f"Suggested position: at {x},{y} size {int(w)}x{int(h)}"
    return f"No free position found on canvas {d.canvas.width}x{d.canvas.height}"
