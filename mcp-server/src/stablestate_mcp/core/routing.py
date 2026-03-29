"""Orthogonal routing logic — Python port of stablestate.html's computePortSide + buildRoute."""
from __future__ import annotations


def compute_port_side(src_box: dict, tgt_box: dict) -> tuple[str, str]:
    """Edge-gap algorithm: pick connection sides based on gap between edges."""
    gap_r = tgt_box["x"] - (src_box["x"] + src_box["w"])
    gap_l = src_box["x"] - (tgt_box["x"] + tgt_box["w"])
    gap_b = tgt_box["y"] - (src_box["y"] + src_box["h"])
    gap_t = src_box["y"] - (tgt_box["y"] + tgt_box["h"])
    h_best = max(gap_r, gap_l)
    v_best = max(gap_b, gap_t)
    if v_best >= h_best:
        if gap_b >= gap_t:
            return "bottom", "top"
        return "top", "bottom"
    if gap_r >= gap_l:
        return "right", "left"
    return "left", "right"


def get_port_point(box: dict, side: str, idx: int = 0, count: int = 1) -> dict:
    """Get port coordinate on a box edge."""
    pad = 0.4 if count <= 2 else 0.25 if count <= 4 else 0.15
    t = 0.5 if count <= 1 else pad + (1 - 2 * pad) * idx / (count - 1)
    if side == "top":
        return {"x": box["x"] + box["w"] * t, "y": box["y"]}
    if side == "bottom":
        return {"x": box["x"] + box["w"] * t, "y": box["y"] + box["h"]}
    if side == "left":
        return {"x": box["x"], "y": box["y"] + box["h"] * t}
    if side == "right":
        return {"x": box["x"] + box["w"], "y": box["y"] + box["h"] * t}
    return {"x": box["x"] + box["w"] / 2, "y": box["y"] + box["h"] / 2}


def build_route(from_pt: dict, to_pt: dict, from_side: str, to_side: str,
                channel_offset: float = 0, route_index: int = 0) -> list[dict]:
    """Build orthogonal route (L-shape, U-shape, or straight)."""
    fx, fy = from_pt["x"], from_pt["y"]
    tx, ty = to_pt["x"], to_pt["y"]
    margin = 1.0  # 1 grid unit margin
    ri = route_index * 1.5  # U-shape spread per route index

    # U-shape (same side)
    if from_side == to_side:
        if from_side == "right":
            out_x = max(fx, tx) + margin + ri
            return [from_pt, {"x": out_x, "y": fy}, {"x": out_x, "y": ty}, to_pt]
        if from_side == "left":
            out_x = min(fx, tx) - margin - ri
            return [from_pt, {"x": out_x, "y": fy}, {"x": out_x, "y": ty}, to_pt]
        if from_side == "top":
            out_y = min(fy, ty) - margin - ri
            return [from_pt, {"x": fx, "y": out_y}, {"x": tx, "y": out_y}, to_pt]
        if from_side == "bottom":
            out_y = max(fy, ty) + margin + ri
            return [from_pt, {"x": fx, "y": out_y}, {"x": tx, "y": out_y}, to_pt]

    # Straight (same axis, opposite sides)
    if from_side in ("left", "right") and to_side in ("left", "right"):
        if abs(fy - ty) < 0.01:
            return [from_pt, to_pt]
        mid_x = (fx + tx) / 2
        return [from_pt, {"x": mid_x, "y": fy}, {"x": mid_x, "y": ty}, to_pt]

    if from_side in ("top", "bottom") and to_side in ("top", "bottom"):
        if abs(fx - tx) < 0.01:
            return [from_pt, to_pt]
        mid_y = (fy + ty) / 2
        return [from_pt, {"x": fx, "y": mid_y}, {"x": tx, "y": mid_y}, to_pt]

    # L-shape (perpendicular sides)
    if from_side in ("left", "right") and to_side in ("top", "bottom"):
        return [from_pt, {"x": tx, "y": fy}, to_pt]

    if from_side in ("top", "bottom") and to_side in ("left", "right"):
        return [from_pt, {"x": fx, "y": ty}, to_pt]

    return [from_pt, to_pt]


def route_midpoint(points: list[dict]) -> dict:
    """Find midpoint along a polyline."""
    if len(points) < 2:
        return points[0] if points else {"x": 0, "y": 0}
    total = 0
    for i in range(1, len(points)):
        dx = points[i]["x"] - points[i - 1]["x"]
        dy = points[i]["y"] - points[i - 1]["y"]
        total += (dx * dx + dy * dy) ** 0.5
    half = total / 2
    acc = 0
    for i in range(1, len(points)):
        dx = points[i]["x"] - points[i - 1]["x"]
        dy = points[i]["y"] - points[i - 1]["y"]
        seg = (dx * dx + dy * dy) ** 0.5
        if acc + seg >= half and seg > 0:
            t = (half - acc) / seg
            return {
                "x": points[i - 1]["x"] + dx * t,
                "y": points[i - 1]["y"] + dy * t,
            }
        acc += seg
    return points[-1]
