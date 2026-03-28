"""Smart tools: pixel-level validation, suggestions.
Loop/fix logic is intentionally NOT here — the calling LLM drives the fix loop.
"""
from __future__ import annotations
import json
from .. import state
from ..core.routing import compute_port_side, get_port_point, build_route, route_midpoint

MARGIN = 1.0


def _get_abs_box(el, d):
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
    bx, by = box["x"], box["y"]
    bx2, by2 = bx + box["w"], by + box["h"]
    dx, dy = x2 - x1, y2 - y1
    p = [-dx, dx, -dy, dy]
    q = [x1 - bx, bx2 - x1, y1 - by, by2 - y1]
    t0, t1 = 0.0, 1.0
    for i in range(4):
        if abs(p[i]) < 1e-10:
            if q[i] < 0: return False
        else:
            r = q[i] / p[i]
            if p[i] < 0: t0 = max(t0, r)
            else: t1 = min(t1, r)
            if t0 > t1: return False
    return t0 < t1


def _polyline_crosses_box(points, box):
    for i in range(len(points) - 1):
        if _segment_crosses_box(
            points[i]["x"], points[i]["y"],
            points[i + 1]["x"], points[i + 1]["y"], box,
        ):
            return True
    return False


def _estimate_action_boxes(el, d):
    """Estimate bounding boxes for entry/do/exit action text below state label."""
    if not hasattr(el, "entry") and not hasattr(el, "do") and not hasattr(el, "exit"):
        return []
    box = _get_abs_box(el, d)
    char_w = 0.3
    line_h = 0.7
    boxes = []
    y_off = 1.6  # below state label
    for attr in ("entry", "do", "exit"):
        val = getattr(el, attr, None)
        if val:
            prefix = f"{attr} / "
            text = prefix + val
            w = len(text) * char_w
            boxes.append({
                "x": box["x"] + 0.5,
                "y": box["y"] + y_off,
                "w": w,
                "h": line_h,
                "text": text,
                "state_id": el.id,
            })
            y_off += line_h
    return boxes


def _estimate_label_box(mid, text):
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
            fss, _ = compute_port_side(sb, tb)
            ss, ts = ("bottom", "bottom") if fss in ("right", "left") else ("right", "right")
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
                "box": _estimate_label_box(mid, text),
            })
        else:
            labels.append(None)
    return routes, labels


def ss_validate_layout() -> str:
    """Pixel-level layout validation. Returns structured JSON list of issues.

    Each issue: {"type": str, "elements": [ids], "detail": str, "suggestion": str}
    Types: child_overflow, sibling_overlap, out_of_canvas, route_crosses_block,
           pseudo_on_route, label_overlap, label_on_block, label_on_pseudo
    """
    d = state.get()
    g = d.canvas.grid
    cw, ch = d.canvas.width / g, d.canvas.height / g
    issues = []
    sm = {s.id: s for s in d.states}
    pm = {ps.id: ps for ps in d.pseudo_states}
    all_boxes = {s.id: _get_abs_box(s, d) for s in d.states}
    ps_boxes = {ps.id: _get_abs_box(ps, d) for ps in d.pseudo_states}

    # 1. Child overflow
    for s in d.states:
        if not s.parent: continue
        parent = sm.get(s.parent)
        if not parent: continue
        if s.x + s.w > parent.w - MARGIN:
            issues.append({"type": "child_overflow", "elements": [s.id, parent.id],
                "detail": f"{s.id} x+w={s.x+s.w} > parent {parent.id} w={parent.w}",
                "suggestion": f"ss_modify('{parent.id}', w={s.x + s.w + 2})"})
        if s.y + s.h > parent.h - MARGIN:
            issues.append({"type": "child_overflow", "elements": [s.id, parent.id],
                "detail": f"{s.id} y+h={s.y+s.h} > parent {parent.id} h={parent.h}",
                "suggestion": f"ss_modify('{parent.id}', h={s.y + s.h + 2})"})

    # 2. Sibling overlap (including root-level: parent=None)
    by_parent: dict = {}
    for s in d.states:
        by_parent.setdefault(s.parent, []).append(s)
    for pid, siblings in by_parent.items():
        for i in range(len(siblings)):
            for j in range(i + 1, len(siblings)):
                a, b = siblings[i], siblings[j]
                if pid is None:
                    ab = {"x": a.x - 0.5, "y": a.y - 0.5, "w": a.w + 1, "h": a.h + 1}
                    bb = {"x": b.x, "y": b.y, "w": b.w, "h": b.h}
                else:
                    ab = {"x": a.x - 0.5, "y": a.y - 0.5, "w": a.w + 1, "h": a.h + 1}
                    bb = {"x": b.x, "y": b.y, "w": b.w, "h": b.h}
                if _boxes_overlap(ab, bb):
                    issues.append({"type": "sibling_overlap", "elements": [a.id, b.id],
                        "detail": f"in {pid}",
                        "suggestion": f"ss_modify('{b.id}', x={b.x + a.w + 2})"})

    # 3. Out-of-canvas
    for s in d.states:
        box = all_boxes[s.id]
        if box["x"] + box["w"] > cw or box["y"] + box["h"] > ch:
            issues.append({"type": "out_of_canvas", "elements": [s.id],
                "detail": f"extends beyond {d.canvas.width}x{d.canvas.height}",
                "suggestion": f"expand canvas or move {s.id}"})

    routes, labels = _get_all_routes(d)

    # 4. Route crosses unrelated block (ALL states)
    for ti, t in enumerate(d.transitions):
        route = routes[ti]
        if not route: continue
        src = sm.get(t.from_id) or pm.get(t.from_id)
        tgt = sm.get(t.to_id) or pm.get(t.to_id)
        if not src or not tgt: continue
        skip = {t.from_id, t.to_id}
        for el in [src, tgt]:
            pid = getattr(el, "parent", None)
            while pid:
                skip.add(pid)
                p = sm.get(pid)
                pid = p.parent if p else None
            if hasattr(el, "children"):
                for cid in el.children: skip.add(cid)
        for s in d.states:
            if s.id in skip: continue
            if _polyline_crosses_box(route, all_boxes[s.id]):
                issues.append({"type": "route_crosses_block",
                    "elements": [t.from_id, t.to_id, s.id],
                    "detail": f"{t.from_id}->{t.to_id} through {s.id}",
                    "suggestion": f"move {t.from_id} or {t.to_id} so route avoids {s.id}"})

    # 5. Pseudo on route
    for ti, t in enumerate(d.transitions):
        route = routes[ti]
        if not route: continue
        src = sm.get(t.from_id) or pm.get(t.from_id)
        tgt = sm.get(t.to_id) or pm.get(t.to_id)
        if not src or not tgt: continue
        for ps in d.pseudo_states:
            if ps.id in (t.from_id, t.to_id): continue
            ps_parent = getattr(ps, "parent", None)
            src_parent = getattr(src, "parent", None)
            tgt_parent = getattr(tgt, "parent", None)
            if ps_parent != src_parent and ps_parent != tgt_parent: continue
            pb = ps_boxes[ps.id]
            exp = {"x": pb["x"] - 0.8, "y": pb["y"] - 0.8, "w": pb["w"] + 1.6, "h": pb["h"] + 1.6}
            if _polyline_crosses_box(route, exp):
                issues.append({"type": "pseudo_on_route",
                    "elements": [ps.id, t.from_id, t.to_id],
                    "detail": f"{ps.id} overlaps {t.from_id}->{t.to_id}",
                    "suggestion": f"ss_modify('{ps.id}', y={ps.y + 2})"})

    # 6. Label-label overlap (skip bidir pairs)
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
            if a_ids == b_ids and a_ids in bidir_pairs: continue
            if _boxes_overlap(a["box"], b["box"]):
                issues.append({"type": "label_overlap",
                    "elements": [a["tid"], b["tid"]],
                    "detail": f"labels too close",
                    "suggestion": f"spread the target states of these transitions apart"})

    # 7. Label on block (exclude ancestors and same-scope siblings)
    for lbl in valid_labels:
        lb = lbl["box"]
        tid_parts = lbl["tid"].split("->")
        src_id, tgt_id = tid_parts[0], tid_parts[1]
        skip_ids = {src_id, tgt_id}
        for eid in [src_id, tgt_id]:
            el = sm.get(eid) or pm.get(eid)
            pid = getattr(el, "parent", None) if el else None
            while pid:
                skip_ids.add(pid); p = sm.get(pid); pid = p.parent if p else None
        for s in d.states:
            if s.id in skip_ids: continue
            src_el = sm.get(src_id) or pm.get(src_id)
            tgt_el2 = sm.get(tgt_id) or pm.get(tgt_id)
            src_parent = getattr(src_el, "parent", None) if src_el else None
            tgt_parent = getattr(tgt_el2, "parent", None) if tgt_el2 else None
            if s.parent and (s.parent == src_parent or s.parent == tgt_parent): continue
            s_ancestors = set()
            pid = s.parent
            while pid:
                s_ancestors.add(pid); p = sm.get(pid); pid = p.parent if p else None
            if skip_ids & s_ancestors: continue
            if _boxes_overlap(lb, all_boxes[s.id]):
                issues.append({"type": "label_on_block",
                    "elements": [lbl["tid"], s.id],
                    "detail": f"{lbl['tid']} label overlaps {s.id}",
                    "suggestion": f"move {s.id} or adjust transition endpoints"})

    # 8. Label on pseudo-state (NEW)
    for lbl in valid_labels:
        lb = lbl["box"]
        tid_parts = lbl["tid"].split("->")
        for ps in d.pseudo_states:
            if ps.id in tid_parts: continue
            pb = ps_boxes[ps.id]
            ps_exp = {"x": pb["x"] - 0.5, "y": pb["y"] - 0.5, "w": pb["w"] + 1, "h": pb["h"] + 1}
            if _boxes_overlap(lb, ps_exp):
                issues.append({"type": "label_on_pseudo",
                    "elements": [lbl["tid"], ps.id],
                    "detail": f"{lbl['tid']} label overlaps pseudo {ps.id}",
                    "suggestion": f"ss_modify('{ps.id}', x={ps.x + 2}) or ss_modify('{ps.id}', y={ps.y + 2})"})

    # 9. Action text (entry/do/exit) overlaps pseudo-state
    all_action_boxes = []
    for s in d.states:
        all_action_boxes.extend(_estimate_action_boxes(s, d))
    for ab in all_action_boxes:
        for ps in d.pseudo_states:
            pb = ps_boxes[ps.id]
            ps_exp = {"x": pb["x"] - 0.5, "y": pb["y"] - 0.5, "w": pb["w"] + 1, "h": pb["h"] + 1}
            if _boxes_overlap(ab, ps_exp):
                issues.append({"type": "action_on_pseudo",
                    "elements": [ab["state_id"], ps.id],
                    "detail": f"{ab['state_id']} action '{ab['text']}' overlaps pseudo {ps.id}",
                    "suggestion": f"ss_modify('{ps.id}', y={ps.y + 2}) or move {ps.id} away from {ab['state_id']}"})

    # 10. Transition label extends outside canvas bounds
    for lbl in valid_labels:
        lb = lbl["box"]
        if lb["x"] < 0 or lb["x"] + lb["w"] > cw or lb["y"] < 0 or lb["y"] + lb["h"] > ch:
            issues.append({"type": "label_out_of_canvas",
                "elements": [lbl["tid"]],
                "detail": f"{lbl['tid']} label extends outside canvas",
                "suggestion": f"move transition endpoints closer together or toward canvas center"})

    if not issues:
        return "No issues found."
    summary = f"{len(issues)} issue(s):\n"
    for iss in issues:
        summary += f"  [{iss['type']}] {iss['detail']} → {iss['suggestion']}\n"
    return summary


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
