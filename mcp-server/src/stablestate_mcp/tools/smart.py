"""Smart tools: pixel-level validation, suggestions, auto-fix."""
from __future__ import annotations
from .. import state
from ..core.routing import compute_port_side, get_port_point, build_route, route_midpoint

MARGIN = 1.0  # grid units margin for overlap checks


def _get_abs_box(el, d):
    """Get absolute bounding box in grid units."""
    ox, oy = 0, 0
    pid = getattr(el, "parent", None)
    sm = {s.id: s for s in d.states}
    while pid:
        p = sm.get(pid)
        if p:
            ox += p.x; oy += p.y; pid = p.parent
        else:
            break
    return {
        "x": el.x + ox, "y": el.y + oy,
        "w": getattr(el, "w", None) or 1,
        "h": getattr(el, "h", None) or 1,
    }


def _boxes_overlap(a, b):
    return not (
        a["x"] + a["w"] <= b["x"] or b["x"] + b["w"] <= a["x"]
        or a["y"] + a["h"] <= b["y"] or b["y"] + b["h"] <= a["y"]
    )


def _segment_crosses_box(x1, y1, x2, y2, box):
    """Liang-Barsky line clipping."""
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
    for i in range(len(points) - 1):
        if _segment_crosses_box(
            points[i]["x"], points[i]["y"],
            points[i + 1]["x"], points[i + 1]["y"], box,
        ):
            return True
    return False


def _estimate_label_box(mid, text, d):
    """Estimate label bounding box in grid units (text width ~0.5 grid per char)."""
    char_w = 0.25  # ~5px per char at 11px font / 20px grid
    line_h = 0.8
    lines = text.split("\n") if "\n" in text else [text]
    max_len = max(len(l) for l in lines)
    w = max_len * char_w
    h = len(lines) * line_h
    return {"x": mid["x"] - w / 2, "y": mid["y"] - h - 0.3, "w": w, "h": h}


def _get_all_routes(d):
    sm = {s.id: s for s in d.states}
    pm = {ps.id: ps for ps in d.pseudo_states}
    trans_pairs = {(t.from_id, t.to_id) for t in d.transitions}
    reverse_set = set()
    seen = set()
    for i, t in enumerate(d.transitions):
        pair = tuple(sorted([t.from_id, t.to_id]))
        if (t.to_id, t.from_id) in trans_pairs and pair in seen:
            reverse_set.add(i)
        seen.add(pair)

    routes, labels = [], []
    for ti, t in enumerate(d.transitions):
        src = sm.get(t.from_id) or pm.get(t.from_id)
        tgt = sm.get(t.to_id) or pm.get(t.to_id)
        if not src or not tgt or t.from_id == t.to_id:
            routes.append([]); labels.append(None); continue

        sb, tb = _get_abs_box(src, d), _get_abs_box(tgt, d)
        if ti in reverse_set:
            fss, fts = compute_port_side(sb, tb)
            if fss in ("right", "left"):
                ss, ts = "bottom", "bottom"
            else:
                ss, ts = "right", "right"
        else:
            ss, ts = compute_port_side(sb, tb)

        fp = get_port_point(sb, ss)
        tp = get_port_point(tb, ts)
        route = build_route(fp, tp, ss, ts)
        routes.append(route)

        if t.event or t.guard or t.action:
            mid = route_midpoint(route)
            text = ""
            if t.event: text += t.event
            if t.guard: text += f" [{t.guard}]"
            if t.action: text += f" / {t.action}"
            labels.append({
                "mid": mid, "text": text,
                "tid": f"{t.from_id}->{t.to_id}",
                "box": _estimate_label_box(mid, text, d),
            })
        else:
            labels.append(None)
    return routes, labels


def ss_validate_layout() -> str:
    """Pixel-level layout validation with margins."""
    d = state.get()
    g = d.canvas.grid
    cw = d.canvas.width / g
    ch = d.canvas.height / g
    issues = []
    sm = {s.id: s for s in d.states}
    pm = {ps.id: ps for ps in d.pseudo_states}
    all_boxes = {s.id: _get_abs_box(s, d) for s in d.states}
    ps_boxes = {ps.id: _get_abs_box(ps, d) for ps in d.pseudo_states}

    # 1. Child overflow: child must fit inside parent with margin
    for s in d.states:
        if not s.parent:
            continue
        parent = sm.get(s.parent)
        if not parent:
            continue
        if s.x + s.w > parent.w - MARGIN:
            issues.append(f"Child overflow X: {s.id} (x={s.x}+w={s.w}={s.x+s.w}) exceeds parent {parent.id} (w={parent.w})")
        if s.y + s.h > parent.h - MARGIN:
            issues.append(f"Child overflow Y: {s.id} (y={s.y}+h={s.h}={s.y+s.h}) exceeds parent {parent.id} (h={parent.h})")
        if s.x < MARGIN:
            issues.append(f"Child margin X: {s.id} (x={s.x}) too close to parent {parent.id} left edge")
        if s.y < MARGIN:
            issues.append(f"Child margin Y: {s.id} (y={s.y}) too close to parent {parent.id} top edge")

    # 2. Pseudo-state inside parent bounds
    for ps in d.pseudo_states:
        if not ps.parent:
            continue
        parent = sm.get(ps.parent)
        if not parent:
            continue
        if ps.x < 0 or ps.y < 0 or ps.x > parent.w or ps.y > parent.h:
            issues.append(f"Pseudo overflow: {ps.id} at ({ps.x},{ps.y}) outside parent {parent.id} ({parent.w}x{parent.h})")

    # 3. Root-level overlap
    root_ids = [s.id for s in d.states if s.parent is None]
    for i in range(len(root_ids)):
        for j in range(i + 1, len(root_ids)):
            a, b = all_boxes[root_ids[i]], all_boxes[root_ids[j]]
            if _boxes_overlap(a, b):
                issues.append(f"Root overlap: {root_ids[i]} and {root_ids[j]}")

    # 4. Same-parent sibling overlap (with margin)
    by_parent: dict[str | None, list] = {}
    for s in d.states:
        by_parent.setdefault(s.parent, []).append(s)
    for parent_id, siblings in by_parent.items():
        if parent_id is None:
            continue
        for i in range(len(siblings)):
            for j in range(i + 1, len(siblings)):
                a, b = siblings[i], siblings[j]
                ab = {"x": a.x - MARGIN/2, "y": a.y - MARGIN/2, "w": a.w + MARGIN, "h": a.h + MARGIN}
                bb = {"x": b.x, "y": b.y, "w": b.w, "h": b.h}
                if _boxes_overlap(ab, bb):
                    issues.append(f"Sibling overlap: {a.id} and {b.id} in {parent_id}")

    # 5. Out-of-canvas
    for s in d.states:
        box = all_boxes[s.id]
        if box["x"] + box["w"] > cw or box["y"] + box["h"] > ch:
            issues.append(f"Out of canvas: {s.id}")

    # Compute routes
    routes, labels = _get_all_routes(d)

    # 6. Route crosses unrelated block (using polyline)
    root_states = [s for s in d.states if s.parent is None]
    for ti, t in enumerate(d.transitions):
        route = routes[ti]
        if not route:
            continue
        src = sm.get(t.from_id) or pm.get(t.from_id)
        tgt = sm.get(t.to_id) or pm.get(t.to_id)
        if not src or not tgt:
            continue
        skip = {t.from_id, t.to_id}
        for el in [src, tgt]:
            pid = getattr(el, "parent", None)
            while pid:
                skip.add(pid)
                p = sm.get(pid)
                pid = p.parent if p else None
        for s in root_states:
            if s.id in skip:
                continue
            if _polyline_crosses_box(route, all_boxes[s.id]):
                issues.append(f"Route crosses block: {t.from_id}->{t.to_id} through {s.id}")

    # 7. Pseudo-state overlaps with route (same scope)
    for ti, t in enumerate(d.transitions):
        route = routes[ti]
        if not route:
            continue
        src = sm.get(t.from_id) or pm.get(t.from_id)
        tgt = sm.get(t.to_id) or pm.get(t.to_id)
        if not src or not tgt:
            continue
        for ps in d.pseudo_states:
            if ps.id in (t.from_id, t.to_id):
                continue
            ps_parent = getattr(ps, "parent", None)
            src_parent = getattr(src, "parent", None)
            tgt_parent = getattr(tgt, "parent", None)
            if ps_parent != src_parent and ps_parent != tgt_parent:
                continue
            pb = ps_boxes[ps.id]
            exp = {"x": pb["x"] - 0.8, "y": pb["y"] - 0.8, "w": pb["w"] + 1.6, "h": pb["h"] + 1.6}
            if _polyline_crosses_box(route, exp):
                issues.append(f"Pseudo on route: {ps.id} overlaps {t.from_id}->{t.to_id}")

    # 8. Label-label overlap (box intersection, skip bidirectional pairs)
    trans_pairs_set = {(t.from_id, t.to_id) for t in d.transitions}
    bidir_pairs = set()
    for t in d.transitions:
        if (t.to_id, t.from_id) in trans_pairs_set:
            bidir_pairs.add(tuple(sorted([t.from_id, t.to_id])))

    valid_labels = [l for l in labels if l is not None]
    for i in range(len(valid_labels)):
        for j in range(i + 1, len(valid_labels)):
            a, b = valid_labels[i], valid_labels[j]
            a_ids = tuple(sorted(a["tid"].split("->")))
            b_ids = tuple(sorted(b["tid"].split("->")))
            if a_ids == b_ids and a_ids in bidir_pairs:
                continue
            if _boxes_overlap(a["box"], b["box"]):
                issues.append(f"Label overlap: {a['tid']} and {b['tid']}")

    # 9. Label overlaps with state box (exclude ancestors of transition endpoints)
    for lbl in valid_labels:
        lb = lbl["box"]
        tid_parts = lbl["tid"].split("->")
        src_id, tgt_id = tid_parts[0], tid_parts[1]
        # Build ancestor set for both endpoints
        skip_ids = {src_id, tgt_id}
        for eid in [src_id, tgt_id]:
            el = sm.get(eid) or pm.get(eid)
            pid = getattr(el, "parent", None) if el else None
            while pid:
                skip_ids.add(pid)
                p = sm.get(pid)
                pid = p.parent if p else None
        for s in d.states:
            if s.id in skip_ids:
                continue
            # Skip blocks that share an ancestor with the transition endpoints
            # (labels within a composite naturally overlap child blocks)
            src_el = sm.get(src_id) or pm.get(src_id)
            tgt_el2 = sm.get(tgt_id) or pm.get(tgt_id)
            src_parent = getattr(src_el, "parent", None) if src_el else None
            tgt_parent = getattr(tgt_el2, "parent", None) if tgt_el2 else None
            s_parent = s.parent
            # Same parent = siblings in same visual space
            if s_parent and (s_parent == src_parent or s_parent == tgt_parent):
                continue
            # s is a child of src/tgt ancestor
            s_ancestors = set()
            pid = s_parent
            while pid:
                s_ancestors.add(pid)
                p = sm.get(pid)
                pid = p.parent if p else None
            if skip_ids & s_ancestors:
                continue
            box = all_boxes[s.id]
            if _boxes_overlap(lb, box):
                issues.append(f"Label on block: {lbl['tid']} label overlaps {s.id}")

    if not issues:
        return "No issues found. Layout looks good."
    return f"{len(issues)} issue(s) found:\n" + "\n".join(f"  - {i}" for i in issues)


def ss_suggest_position(w: float = 8, h: float = 4) -> str:
    """Suggest a free position for a new element."""
    d = state.get()
    g = d.canvas.grid
    cw, ch = d.canvas.width / g, d.canvas.height / g
    occupied = [_get_abs_box(s, d) for s in d.states if s.parent is None]
    occupied += [_get_abs_box(grp, d) for grp in d.groups]
    for y in range(1, int(ch - h), 2):
        for x in range(1, int(cw - w), 2):
            c = {"x": x, "y": y, "w": w, "h": h}
            if not any(_boxes_overlap(c, o) for o in occupied):
                return f"Suggested: at {x},{y} size {int(w)}x{int(h)}"
    return "No free position found."


def ss_auto_fix() -> str:
    """Iteratively fix all layout issues. Returns summary of changes."""
    MAX_ROUNDS = 15
    fixes = []

    for round_num in range(1, MAX_ROUNDS + 1):
        result = ss_validate_layout()
        if "No issues" in result:
            break

        lines = result.split("\n")
        fixed_any = False

        for line in lines[1:]:
            issue = line.strip().lstrip("- ")

            if issue.startswith("Child overflow Y:"):
                # Expand parent height
                child_id = issue.split(":")[1].split("(")[0].strip()
                d = state.get()
                sm = {s.id: s for s in d.states}
                child = sm.get(child_id)
                if child and child.parent:
                    parent = sm.get(child.parent)
                    if parent:
                        need = child.y + child.h + MARGIN
                        if need > parent.h:
                            from ..tools.elements import ss_modify
                            ss_modify(parent.id, h=need + 1)
                            fixes.append(f"R{round_num}: expanded {parent.id} h -> {need + 1}")
                            fixed_any = True

            elif issue.startswith("Child overflow X:"):
                child_id = issue.split(":")[1].split("(")[0].strip()
                d = state.get()
                sm = {s.id: s for s in d.states}
                child = sm.get(child_id)
                if child and child.parent:
                    parent = sm.get(child.parent)
                    if parent:
                        need = child.x + child.w + MARGIN
                        if need > parent.w:
                            from ..tools.elements import ss_modify
                            ss_modify(parent.id, w=need + 1)
                            fixes.append(f"R{round_num}: expanded {parent.id} w -> {need + 1}")
                            fixed_any = True

            elif issue.startswith("Label overlap:"):
                # Move target of second transition to spread labels
                parts = issue.split("Label overlap: ")[1]
                tids = parts.split(" and ")
                tid2 = tids[1].strip()
                tgt2 = tid2.split("->")[1]
                d = state.get()
                sm = {s.id: s for s in d.states}
                pm = {ps.id: ps for ps in d.pseudo_states}
                el = sm.get(tgt2) or pm.get(tgt2)
                if el:
                    from ..tools.elements import ss_modify
                    ss_modify(tgt2, x=el.x + 3)
                    fixes.append(f"R{round_num}: moved {tgt2} x+3")
                    fixed_any = True

            elif issue.startswith("Pseudo on route:"):
                ps_id = issue.split("Pseudo on route: ")[1].split(" overlaps")[0]
                d = state.get()
                pm = {ps.id: ps for ps in d.pseudo_states}
                el = pm.get(ps_id)
                if el:
                    from ..tools.elements import ss_modify
                    ss_modify(ps_id, y=el.y - 1.5)
                    fixes.append(f"R{round_num}: moved {ps_id} y-1.5")
                    fixed_any = True

            elif issue.startswith("Sibling overlap:"):
                ids = issue.split("Sibling overlap: ")[1].split(" in ")[0]
                id2 = ids.split(" and ")[1].strip()
                d = state.get()
                sm = {s.id: s for s in d.states}
                el = sm.get(id2)
                if el:
                    from ..tools.elements import ss_modify
                    ss_modify(id2, x=el.x + 2)
                    fixes.append(f"R{round_num}: moved {id2} x+2")
                    fixed_any = True

            if fixed_any:
                break  # Re-validate after each fix

        if not fixed_any:
            fixes.append(f"R{round_num}: no auto-fix available for remaining issues")
            break

    final = ss_validate_layout()
    summary = f"Applied {len(fixes)} fix(es) in {round_num} round(s):\n"
    summary += "\n".join(f"  {f}" for f in fixes)
    summary += f"\n\nFinal: {final}"
    return summary
