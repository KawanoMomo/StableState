"""Orthogonal routing logic — Python port of stablestate.html's computePortSide + buildRoute.

Sprint 1 of channel-routing rewrite adds:
  - compute_ranks: BFS rank from initial pseudo-state targets
  - classify_edge: forward / backward / lateral / self
  - compute_bus_y: y coord of the back-edge bus (below all top-level states)
  - build_back_edge_route: 4-point polyline that drops to the bus and rises
    again at the target. Used in place of buildRoute() for backward edges.

Spec ref: docs/specs/2026-05-06-channel-routing-moc.html
"""
from __future__ import annotations
from collections import defaultdict, deque

# Margins (in grid units) for the back-edge bus
_BUS_MARGIN_BELOW = 3.0   # gap between deepest state and the bus line
_BUS_DEFAULT_Y = 2.0      # fallback bus position when diagram is empty


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


def compute_ranks(diagram) -> dict[str, int]:
    """BFS rank from initial-pseudo targets. Pseudo-states (choice/fork/join
    /history/...) are treated as transparent: chains like A → choice → B
    contribute A → B for ranking so they don't break the layered flow.

    Returns {state_id: rank} for every top-level state. States not reachable
    from any initial pseudo-state are assigned `max(rank)+1` in declaration
    order so back-edge classification still produces a useful answer.
    """
    top_level = [s for s in diagram.states if s.parent is None]
    target_ids = {s.id for s in top_level}
    pseudo_ids = {ps.id for ps in diagram.pseudo_states}

    # Outgoing edges from any node (state or pseudo) for transparency walk
    out_edges: dict[str, list[str]] = defaultdict(list)
    for t in diagram.transitions:
        out_edges[t.from_id].append(t.to_id)

    def resolve_real(start: str, _seen: set | None = None) -> list[str]:
        """Real-state targets reachable from start via 0+ pseudo hops."""
        _seen = _seen if _seen is not None else set()
        if start in _seen:
            return []
        _seen.add(start)
        if start in target_ids:
            return [start]
        if start not in pseudo_ids:
            return []
        out: list[str] = []
        for nxt in out_edges.get(start, []):
            out.extend(resolve_real(nxt, _seen))
        return out

    # Adjacency among top-level real states (pseudo-collapsed)
    adj: dict[str, list[str]] = defaultdict(list)
    for t in diagram.transitions:
        if t.from_id in target_ids:
            for real in resolve_real(t.to_id):
                if real != t.from_id:
                    adj[t.from_id].append(real)

    # Seeds: initial-pseudo targets resolved to real top-level states
    seeds: list[str] = []
    for ps in diagram.pseudo_states:
        if ps.type != "initial" or ps.parent is not None:
            continue
        for nxt in out_edges.get(ps.id, []):
            for real in resolve_real(nxt):
                if real not in seeds:
                    seeds.append(real)
    if not seeds:
        # Fallback: states with no incoming pseudo-resolved edges. Use the
        # already-built `adj` map (which already collapses pseudo chains) —
        # any state never appearing as a destination is a candidate seed.
        incoming = set()
        for src, dests in adj.items():
            for dst in dests:
                incoming.add(dst)
        seeds = [s.id for s in top_level if s.id not in incoming]
    if not seeds and top_level:
        seeds = [top_level[0].id]

    # BFS shortest-path ranking. Cycles in the state machine (retry loops
    # like idle → checking → idle) make longest-path relaxation diverge,
    # so we use shortest-path which is sufficient for back-edge detection
    # (any edge whose target rank is <= source rank counts as a back-edge).
    ranks: dict[str, int] = {}
    q: deque[str] = deque()
    for sid in seeds:
        if sid not in ranks:
            ranks[sid] = 0
            q.append(sid)
    while q:
        node = q.popleft()
        for nxt in adj.get(node, []):
            if nxt not in ranks:
                ranks[nxt] = ranks[node] + 1
                q.append(nxt)

    # Unranked states (cycle islands or unreachable from any seed): rank
    # them in declaration order beyond the BFS frontier so they still get
    # a deterministic rank.
    base = max(ranks.values(), default=-1) + 1
    for s in top_level:
        if s.id not in ranks:
            ranks[s.id] = base
            base += 1
    return ranks


def classify_edge(from_id: str, to_id: str, ranks: dict[str, int]) -> str:
    """Classify an edge as forward / backward / lateral / self.

    `ranks` comes from compute_ranks(). If either endpoint is missing
    from the rank map (e.g. a transition involving a pseudo-state),
    we return 'lateral' so the existing routing handles it; backward-bus
    routing is for top-level state→state retry/cancel arcs only.
    """
    if from_id == to_id:
        return "self"
    if from_id not in ranks or to_id not in ranks:
        return "lateral"
    rf, rt = ranks[from_id], ranks[to_id]
    if rt > rf:
        return "forward"
    if rt < rf:
        return "backward"
    return "lateral"


def compute_bus_y(diagram) -> float:
    """Pixel y of the back-edge bus.

    The bus runs horizontally below every top-level state. We pick the
    lowest bottom edge among top-level states/groups, plus a fixed margin.
    Empty / state-less diagrams fall back to a small positive value.
    """
    g = diagram.canvas.grid
    bottoms_grid: list[float] = []
    for s in diagram.states:
        if s.parent is None:
            bottoms_grid.append(s.y + s.h)
    for grp in diagram.groups:
        bottoms_grid.append(grp.y + grp.h)
    if not bottoms_grid:
        return _BUS_DEFAULT_Y * g
    deepest = max(bottoms_grid)
    return (deepest + _BUS_MARGIN_BELOW) * g


def derive_pseudo_ranks(diagram, ranks: dict[str, int]) -> dict[str, int]:
    """Give each top-level pseudo-state an effective rank derived from its
    incoming real-state edges, so back-edges originating at choice/fork/etc.
    can be classified correctly.

    Rule: pseudo_rank = max(rank[from] for incoming real-state edges) + 1.
    Pseudo-states without any ranked incoming edge are skipped.
    """
    out: dict[str, int] = {}
    incoming: dict[str, list[str]] = defaultdict(list)
    for t in diagram.transitions:
        incoming[t.to_id].append(t.from_id)
    for ps in diagram.pseudo_states:
        if ps.parent is not None:
            continue
        ranked_in = [ranks[fid] for fid in incoming.get(ps.id, []) if fid in ranks]
        if ranked_in:
            out[ps.id] = max(ranked_in) + 1
    return out


def assign_back_edge_lanes(diagram, ranks: dict[str, int]) -> dict[int, int]:
    """Assign each back-edge a unique lane index so multiple back-edges
    don't overlap on a single horizontal line.

    Strategy: sort back-edges by horizontal span (|src.x - tgt.x|) descending,
    then assign lane 0, 1, 2, ... so the LONGEST span goes deepest. This
    prevents short edges from being covered by long ones.

    Returns {transition_index: lane_index}. Transitions that are not
    back-edges are absent from the dict.
    """
    state_x: dict[str, float] = {}
    for s in diagram.states:
        if s.parent is None:
            state_x[s.id] = s.x + s.w / 2
    pseudo_x: dict[str, float] = {}
    for ps in diagram.pseudo_states:
        if ps.parent is None:
            pseudo_x[ps.id] = ps.x

    def _x_of(eid: str) -> float | None:
        return state_x.get(eid, pseudo_x.get(eid))

    back: list[tuple[int, float]] = []  # (transition_index, span)
    for ti, t in enumerate(diagram.transitions):
        if classify_edge(t.from_id, t.to_id, ranks) != "backward":
            continue
        sx = _x_of(t.from_id)
        tx = _x_of(t.to_id)
        if sx is None or tx is None:
            continue
        back.append((ti, abs(sx - tx)))

    # Sort by span descending; assign lanes 0..N-1 (longest = deepest = highest index)
    # We want: longest span → lane N-1 (deepest), shortest → lane 0 (shallowest).
    back.sort(key=lambda p: p[1])  # ascending span
    return {ti: idx for idx, (ti, _) in enumerate(back)}


def _segment_crosses_box(x1: float, y1: float, x2: float, y2: float,
                          box: dict) -> bool:
    """Liang-Barsky line-clip — does the segment intersect the box interior?"""
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


def polyline_crosses_box(points: list[dict], box: dict, margin: float = 0) -> bool:
    """True if any segment of the polyline crosses the box interior.

    `margin` shrinks the box slightly so segments that just graze an edge
    don't count as crossings (use 1.0 for ~1px tolerance).
    """
    if margin:
        box = {
            "x": box["x"] + margin, "y": box["y"] + margin,
            "w": max(0.001, box["w"] - 2 * margin),
            "h": max(0.001, box["h"] - 2 * margin),
        }
    for i in range(len(points) - 1):
        if _segment_crosses_box(
            points[i]["x"], points[i]["y"],
            points[i + 1]["x"], points[i + 1]["y"], box,
        ):
            return True
    return False


def compute_top_channel_y(diagram) -> float:
    """Pixel y above all top-level states for forward-edge detour routing."""
    g = diagram.canvas.grid
    tops_grid = [s.y for s in diagram.states if s.parent is None]
    tops_grid += [grp.y for grp in diagram.groups]
    if not tops_grid:
        return -2.0 * g
    return (min(tops_grid) - 3.0) * g


def build_top_channel_route(
    src_box: dict, tgt_box: dict, channel_y: float,
    src_idx: int = 0, src_count: int = 1,
    tgt_idx: int = 0, tgt_count: int = 1,
) -> list[dict]:
    """Route via top channel: src.top → (src_port.x, channel_y) →
    (tgt_port.x, channel_y) → tgt.top. Mirror of build_back_edge_route
    on the top edge."""
    def _top_port(box, idx, count):
        pad = 0.4 if count <= 2 else 0.25 if count <= 4 else 0.15
        t = 0.5 if count <= 1 else pad + (1 - 2 * pad) * idx / (count - 1)
        return {"x": box["x"] + box["w"] * t, "y": box["y"]}

    src_port = _top_port(src_box, src_idx, src_count)
    tgt_port = _top_port(tgt_box, tgt_idx, tgt_count)
    return [
        src_port,
        {"x": src_port["x"], "y": channel_y},
        {"x": tgt_port["x"], "y": channel_y},
        tgt_port,
    ]


def assign_detour_lanes(diagram, ranks: dict[str, int]) -> dict[int, int]:
    """Detect forward / lateral edges whose direct route would cross an
    unrelated top-level state, and assign each a top-channel lane index.

    Algorithm:
      1. Skip self / backward / pseudo-only transitions.
      2. For each candidate, compute a tentative straight route from
         src center to tgt center (acts as a coarse crossing probe).
      3. If the segment crosses any unrelated top-level state's box,
         flag for detour.
      4. Assign lanes by span ascending (short = lane 0, long = deeper).

    Returns {transition_index: lane_index}.
    """
    # Pre-compute boxes for top-level states
    boxes: dict[str, dict] = {}
    g = diagram.canvas.grid
    for s in diagram.states:
        if s.parent is None:
            boxes[s.id] = {
                "x": s.x * g, "y": s.y * g,
                "w": s.w * g, "h": s.h * g,
            }

    candidates: list[tuple[int, float]] = []
    for ti, t in enumerate(diagram.transitions):
        cls = classify_edge(t.from_id, t.to_id, ranks)
        if cls in ("self", "backward"):
            continue
        if t.from_id not in boxes or t.to_id not in boxes:
            continue
        sb = boxes[t.from_id]
        tb = boxes[t.to_id]
        # Probe segment: center to center
        s_pt = {"x": sb["x"] + sb["w"] / 2, "y": sb["y"] + sb["h"] / 2}
        t_pt = {"x": tb["x"] + tb["w"] / 2, "y": tb["y"] + tb["h"] / 2}
        crosses = False
        for other_id, other_box in boxes.items():
            if other_id == t.from_id or other_id == t.to_id:
                continue
            if _segment_crosses_box(s_pt["x"], s_pt["y"], t_pt["x"], t_pt["y"], other_box):
                crosses = True
                break
        if crosses:
            span = abs(s_pt["x"] - t_pt["x"]) + abs(s_pt["y"] - t_pt["y"])
            candidates.append((ti, span))

    candidates.sort(key=lambda p: p[1])
    return {ti: idx for idx, (ti, _) in enumerate(candidates)}


def build_back_edge_route(
    src_box: dict, tgt_box: dict, bus_y: float,
    src_idx: int = 0, src_count: int = 1,
    tgt_idx: int = 0, tgt_count: int = 1,
) -> list[dict]:
    """Route a back-edge through the bus.

    Path shape (4 points):
        src.bottom → (src_port.x, bus_y) → (tgt_port.x, bus_y) → tgt.bottom

    Port distribution on the bottom edge mirrors get_port_point so multiple
    back-edges sharing the same source/target spread out instead of overlapping.
    """
    def _bottom_port(box, idx, count):
        pad = 0.4 if count <= 2 else 0.25 if count <= 4 else 0.15
        t = 0.5 if count <= 1 else pad + (1 - 2 * pad) * idx / (count - 1)
        return {"x": box["x"] + box["w"] * t, "y": box["y"] + box["h"]}

    src_port = _bottom_port(src_box, src_idx, src_count)
    tgt_port = _bottom_port(tgt_box, tgt_idx, tgt_count)
    return [
        src_port,
        {"x": src_port["x"], "y": bus_y},
        {"x": tgt_port["x"], "y": bus_y},
        tgt_port,
    ]


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
