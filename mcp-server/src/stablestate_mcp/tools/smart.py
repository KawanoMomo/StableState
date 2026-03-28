"""Smart tools: validation, suggestions."""
from __future__ import annotations
from .. import state


def _get_abs_box(el, d):
    """Get absolute bounding box {x, y, w, h} in grid units."""
    g = d.canvas.grid
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
    x = el.x + ox
    y = el.y + oy
    w = getattr(el, "w", None) or 1
    h = getattr(el, "h", None) or 1
    return {"x": x, "y": y, "w": w, "h": h}


def _boxes_overlap(a, b):
    return not (a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"] or
                a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"])


def _segment_crosses_box(x1, y1, x2, y2, box):
    """Check if a line segment (any angle) crosses through a box.
    Uses Liang-Barsky clipping algorithm."""
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


def ss_validate_layout() -> str:
    """Detect layout issues: overlaps, out-of-bounds, transitions crossing blocks."""
    d = state.get()
    g = d.canvas.grid
    cw = d.canvas.width / g
    ch = d.canvas.height / g
    issues = []

    # Collect all element boxes (root-level only for overlap check)
    root_states = [s for s in d.states if s.parent is None]
    all_els = root_states + list(d.groups)
    boxes = {}
    for el in all_els:
        boxes[el.id] = _get_abs_box(el, d)

    # 1. Overlap detection (same-level states only, exclude groups which are visual wrappers)
    state_ids = [s.id for s in root_states]
    for i in range(len(state_ids)):
        for j in range(i + 1, len(state_ids)):
            a, b = boxes[state_ids[i]], boxes[state_ids[j]]
            if _boxes_overlap(a, b):
                issues.append(f"Overlap: {state_ids[i]} and {state_ids[j]}")

    # 2. Out-of-canvas
    for el in d.states:
        box = _get_abs_box(el, d)
        if box["x"] + box["w"] > cw or box["y"] + box["h"] > ch:
            issues.append(f"Out of canvas: {el.id} extends beyond {d.canvas.width}x{d.canvas.height}")
        if box["x"] < 0 or box["y"] < 0:
            issues.append(f"Out of canvas: {el.id} has negative position")

    # 3. Transition route crosses unrelated block
    # Simplified: check if straight line between source center and target center crosses any block
    state_map = {s.id: s for s in d.states}
    pseudo_map = {ps.id: ps for ps in d.pseudo_states}
    for t in d.transitions:
        src_el = state_map.get(t.from_id) or pseudo_map.get(t.from_id)
        tgt_el = state_map.get(t.to_id) or pseudo_map.get(t.to_id)
        if not src_el or not tgt_el:
            continue
        src_box = _get_abs_box(src_el, d)
        tgt_box = _get_abs_box(tgt_el, d)
        # Center points
        sx = src_box["x"] + src_box["w"] / 2
        sy = src_box["y"] + src_box["h"] / 2
        tx = tgt_box["x"] + tgt_box["w"] / 2
        ty = tgt_box["y"] + tgt_box["h"] / 2

        # Check against all root-level states (excluding source, target, and all ancestors)
        skip = {t.from_id, t.to_id}
        # Walk up ancestor chain for both endpoints
        for el in [src_el, tgt_el]:
            pid = getattr(el, "parent", None)
            while pid:
                skip.add(pid)
                p = state_map.get(pid)
                pid = p.parent if p else None

        for s in root_states:
            if s.id in skip:
                continue
            sbox = boxes.get(s.id)
            if not sbox:
                continue
            if _segment_crosses_box(sx, sy, tx, ty, sbox):
                issues.append(
                    f"Transition {t.from_id}->{t.to_id} crosses block {s.id}"
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

    # Collect occupied boxes
    occupied = []
    for s in d.states:
        if s.parent is None:
            occupied.append(_get_abs_box(s, d))
    for grp in d.groups:
        occupied.append(_get_abs_box(grp, d))

    # Scan grid positions for a free spot
    for y in range(1, int(ch - h), 2):
        for x in range(1, int(cw - w), 2):
            candidate = {"x": x, "y": y, "w": w, "h": h}
            if not any(_boxes_overlap(candidate, o) for o in occupied):
                return f"Suggested position: at {x},{y} size {int(w)}x{int(h)}"

    return f"No free position found on canvas {d.canvas.width}x{d.canvas.height}"
