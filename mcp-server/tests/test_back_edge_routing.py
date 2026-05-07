"""Sprint 1 of channel-routing rewrite — back-edge bus.

Spec ref: docs/specs/2026-05-06-channel-routing-moc.html section 3.

Edge classification: a transition `from -> to` is
  - FORWARD  if rank[to] >  rank[from]   (most common; bezier OK)
  - BACKWARD if rank[to] <  rank[from]   (retry/cancel arcs; route via bus)
  - LATERAL  if rank[to] == rank[from]   (siblings; existing logic)
  - SELF     if from == to

Sprint 1 only re-routes BACKWARD edges. The rest go through the existing
buildRoute path unchanged.

Sprint 1.5 (this update) adds:
  - per-edge lane assignment so multiple back-edges don't overlap on the bus
  - pseudo-state-as-source classification (choice/fork-originated back-edges)
"""
import pytest
from stablestate_mcp.core.parser import parse_dsl
from stablestate_mcp.core.routing import (
    compute_ranks, classify_edge, compute_bus_y, build_back_edge_route,
    assign_back_edge_lanes, derive_pseudo_ranks,
    polyline_crosses_box, compute_top_channel_y, build_top_channel_route,
    assign_detour_lanes, build_forward_detour_route,
)


# ─────────────────── compute_ranks ───────────────────

def test_rank_linear_chain_from_initial():
    dsl = (
        "@canvas width=960 height=600 grid=20\n"
        "initial ini at 0.5,3\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,2 size 8x4\n'
        'state c "C" at 25,2 size 8x4\n'
        "ini -> a\n"
        "a -> b\n"
        "b -> c\n"
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    assert ranks["a"] == 0
    assert ranks["b"] == 1
    assert ranks["c"] == 2


def test_rank_treats_pseudo_as_transparent():
    """A -> choice -> B should give rank[B] = rank[A] + 1, not break the
    chain. This mirrors _hierarchical_layout's pseudo-transparent BFS."""
    dsl = (
        "@canvas width=960 height=600 grid=20\n"
        'state a "A" at 5,2 size 8x4\n'
        "choice c1 at 15,4\n"
        'state b "B" at 25,2 size 8x4\n'
        "a -> c1\n"
        "c1 -> b\n"
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    assert ranks["b"] == ranks["a"] + 1


def test_rank_branching_takes_max_path_length():
    """Diamond: a→b, a→c, b→d, c→d ⇒ rank[d] is max from any path."""
    dsl = (
        "@canvas width=960 height=600 grid=20\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,2 size 8x4\n'
        'state c "C" at 15,8 size 8x4\n'
        'state d "D" at 25,5 size 8x4\n'
        "a -> b\n"
        "a -> c\n"
        "b -> d\n"
        "c -> d\n"
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    assert ranks["a"] == 0
    assert ranks["b"] == 1 and ranks["c"] == 1
    assert ranks["d"] == 2


# ─────────────────── classify_edge ───────────────────

def test_classify_forward():
    ranks = {"a": 0, "b": 1, "c": 2}
    assert classify_edge("a", "b", ranks) == "forward"
    assert classify_edge("a", "c", ranks) == "forward"


def test_classify_backward():
    ranks = {"a": 0, "b": 1, "c": 2}
    assert classify_edge("c", "a", ranks) == "backward"
    assert classify_edge("b", "a", ranks) == "backward"


def test_classify_lateral():
    ranks = {"a": 1, "b": 1}
    assert classify_edge("a", "b", ranks) == "lateral"


def test_classify_self():
    ranks = {"a": 0}
    assert classify_edge("a", "a", ranks) == "self"


def test_classify_unknown_state_falls_back_to_lateral():
    """If a state isn't in the rank map (parent-child? unranked) treat as
    lateral so the original routing handles it."""
    ranks = {"a": 0}
    assert classify_edge("a", "z", ranks) == "lateral"


# ─────────────────── compute_bus_y ───────────────────

def test_bus_y_is_below_all_top_level_states():
    """Bus runs below every top-level state's bottom edge plus a margin."""
    dsl = (
        "@canvas width=960 height=600 grid=20\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,5 size 8x6\n'  # extends to y=11
        'state c "C" at 25,8 size 8x4\n'  # extends to y=12
    )
    d = parse_dsl(dsl)
    g = d.canvas.grid
    bus_y = compute_bus_y(d)
    # Largest bottom is C at y+h = 12 (grid units) = 240px
    # Bus must be strictly below: at least 12*g + margin
    assert bus_y > 12 * g
    # And not absurdly far (within 4 grid units)
    assert bus_y < 12 * g + 8 * g


def test_bus_y_handles_empty_diagram():
    dsl = "@canvas width=960 height=600 grid=20\n"
    d = parse_dsl(dsl)
    bus_y = compute_bus_y(d)
    # Default: 2 grid units below origin (sane fallback)
    assert bus_y > 0


# ─────────────────── build_back_edge_route ───────────────────

def test_back_edge_route_shape_is_4_point_polyline():
    """src.bottom → (src.x, bus_y) → (tgt.x, bus_y) → tgt.bottom"""
    src = {"x": 100, "y": 40, "w": 160, "h": 80}    # right edge=260, bottom=120
    tgt = {"x": 400, "y": 40, "w": 160, "h": 80}    # right edge=560, bottom=120
    bus_y = 280
    route = build_back_edge_route(src, tgt, bus_y)
    assert len(route) == 4
    # Both endpoints attach to bottom edges
    assert route[0]["y"] == src["y"] + src["h"]
    assert route[-1]["y"] == tgt["y"] + tgt["h"]
    # Middle two waypoints sit on the bus
    assert route[1]["y"] == bus_y
    assert route[2]["y"] == bus_y
    # X coords align: src port → middle1 same x; middle2 → tgt port same x
    assert abs(route[0]["x"] - route[1]["x"]) < 0.01
    assert abs(route[2]["x"] - route[3]["x"]) < 0.01


def test_back_edge_route_endpoints_are_centered_on_bottom():
    """Default port placement: center of the bottom edge."""
    src = {"x": 100, "y": 40, "w": 160, "h": 80}
    tgt = {"x": 400, "y": 40, "w": 160, "h": 80}
    route = build_back_edge_route(src, tgt, 280)
    assert route[0]["x"] == src["x"] + src["w"] / 2
    assert route[-1]["x"] == tgt["x"] + tgt["w"] / 2


def test_back_edge_route_supports_port_offset_for_fan_in():
    """When multiple back-edges target the same state, the caller can
    specify an offset (port_idx, port_count) to spread fan-in entries."""
    src = {"x": 100, "y": 40, "w": 160, "h": 80}
    tgt = {"x": 400, "y": 40, "w": 160, "h": 80}
    # 3 back-edges entering tgt → idx=0, 1, 2 / count=3
    r0 = build_back_edge_route(src, tgt, 280, tgt_idx=0, tgt_count=3)
    r1 = build_back_edge_route(src, tgt, 280, tgt_idx=1, tgt_count=3)
    r2 = build_back_edge_route(src, tgt, 280, tgt_idx=2, tgt_count=3)
    # x positions on tgt's bottom must be distinct and increasing
    assert r0[-1]["x"] < r1[-1]["x"] < r2[-1]["x"]


# ─────────────── Sprint 1.5: lane assignment ───────────────

def test_assign_lanes_gives_each_back_edge_a_unique_lane():
    """Three back-edges → three distinct lane indices (0, 1, 2)."""
    dsl = (
        "@canvas width=2000 height=400 grid=20\n"
        "initial ini at 0.5,3\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,2 size 8x4\n'
        'state c "C" at 25,2 size 8x4\n'
        'state d "D" at 35,2 size 8x4\n'
        "ini -> a\n"
        "a -> b\n"
        "b -> c\n"
        "c -> d\n"
        "d -> a\n"      # back-edge 1 (long)
        "c -> b\n"      # back-edge 2 (medium)
        "b -> a\n"      # back-edge 3 (short)
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    lanes = assign_back_edge_lanes(d, ranks)
    # Three back-edges → three lanes
    assert len(lanes) == 3
    assert sorted(lanes.values()) == [0, 1, 2]


def test_assign_lanes_longest_span_gets_deepest_lane():
    """When sorted by span descending, the longest back-edge gets the
    highest lane index (deepest = most distant from the states)."""
    dsl = (
        "@canvas width=2000 height=400 grid=20\n"
        "initial ini at 0.5,3\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,2 size 8x4\n'
        'state c "C" at 25,2 size 8x4\n'
        'state d "D" at 35,2 size 8x4\n'
        "ini -> a\n"
        "a -> b\n"
        "b -> c\n"
        "c -> d\n"
        "b -> a\n"      # short
        "d -> a\n"      # longest
        "c -> b\n"      # medium
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    lanes = assign_back_edge_lanes(d, ranks)
    # Find transition indices for b->a and d->a
    ti_short = next(i for i, t in enumerate(d.transitions) if t.from_id == "b" and t.to_id == "a")
    ti_long  = next(i for i, t in enumerate(d.transitions) if t.from_id == "d" and t.to_id == "a")
    # Longest span gets the deepest (highest) lane
    assert lanes[ti_long] > lanes[ti_short]


def test_assign_lanes_returns_empty_when_no_back_edges():
    dsl = (
        "@canvas width=960 height=400 grid=20\n"
        "initial ini at 0.5,3\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,2 size 8x4\n'
        "ini -> a\n"
        "a -> b\n"
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    assert assign_back_edge_lanes(d, ranks) == {}


# ─────────────── Sprint 1.5: pseudo-state derived ranks ───────────────

# ─────────────── Sprint 2: detour channel for crossings ───────────────

def test_polyline_crosses_box_detects_horizontal_through():
    """A horizontal segment passing through a box should be detected."""
    box = {"x": 100, "y": 50, "w": 100, "h": 50}  # 100..200 x 50..100
    pts = [{"x": 50, "y": 70}, {"x": 250, "y": 70}]  # crosses horizontally
    assert polyline_crosses_box(pts, box) is True


def test_polyline_crosses_box_above_no_crossing():
    """A segment above the box should not be detected as crossing."""
    box = {"x": 100, "y": 50, "w": 100, "h": 50}
    pts = [{"x": 50, "y": 30}, {"x": 250, "y": 30}]  # above box
    assert polyline_crosses_box(pts, box) is False


def test_polyline_crosses_box_polyline_with_one_crossing_segment():
    """Polyline whose middle segment crosses the box."""
    box = {"x": 100, "y": 50, "w": 100, "h": 50}
    pts = [
        {"x": 50, "y": 30},   # above-left
        {"x": 50, "y": 70},   # left of box, same y
        {"x": 250, "y": 70},  # crosses through
        {"x": 250, "y": 30},  # above-right
    ]
    assert polyline_crosses_box(pts, box) is True


def test_compute_top_channel_y_is_above_topmost_state():
    dsl = (
        "@canvas width=960 height=600 grid=20\n"
        'state a "A" at 5,4 size 8x4\n'    # top y = 4
        'state b "B" at 15,2 size 8x4\n'   # top y = 2 (highest)
    )
    d = parse_dsl(dsl)
    g = d.canvas.grid
    top = compute_top_channel_y(d)
    assert top < 2 * g          # strictly above top-most state
    assert top > -8 * g         # within a few grid units


def test_build_top_channel_route_shape_4_points():
    """src.top → (src_port.x, channel_y) → (tgt_port.x, channel_y) → tgt.top"""
    src = {"x": 100, "y": 200, "w": 160, "h": 80}
    tgt = {"x": 600, "y": 200, "w": 160, "h": 80}
    channel_y = 80
    r = build_top_channel_route(src, tgt, channel_y)
    assert len(r) == 4
    assert r[0]["y"] == src["y"]      # src top edge
    assert r[-1]["y"] == tgt["y"]     # tgt top edge
    assert r[1]["y"] == channel_y     # channel waypoints
    assert r[2]["y"] == channel_y


def test_assign_detour_lanes_flags_crossing_forward_edges():
    """Three states a, b, c at same y. a -> c skipping b. Direct route at
    same y crosses b. assign_detour_lanes should flag the a->c edge."""
    dsl = (
        "@canvas width=1200 height=400 grid=20\n"
        "initial ini at 0.5,3\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,2 size 8x4\n'
        'state c "C" at 25,2 size 8x4\n'
        "ini -> a\n"
        "a -> c\n"
        "c -> b\n"
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    lanes = assign_detour_lanes(d, ranks)
    ti_ac = next(i for i, t in enumerate(d.transitions) if t.from_id == "a" and t.to_id == "c")
    assert ti_ac in lanes  # a->c needs a detour lane


def test_assign_detour_lanes_skips_clear_edges():
    """Two adjacent states with no obstacle between → no detour."""
    dsl = (
        "@canvas width=960 height=400 grid=20\n"
        "initial ini at 0.5,3\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,2 size 8x4\n'
        "ini -> a\n"
        "a -> b\n"
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    lanes = assign_detour_lanes(d, ranks)
    ti_ab = next(i for i, t in enumerate(d.transitions) if t.from_id == "a" and t.to_id == "b")
    assert ti_ab not in lanes


def test_assign_detour_lanes_handles_pseudo_state_target():
    """Forward edge into a pseudo (final) on the far side of the diagram
    must still trigger detour when the direct route would cross an
    unrelated state — initial-template `error -> fin` regression."""
    dsl = (
        "@canvas width=960 height=600 grid=20\n"
        "initial ini at 1,5\n"
        'state idle "Idle" at 3,3 size 8x5\n'
        'state active "Active" at 15,1 size 24x14\n'
        'state error "Error" at 3,18 size 8x5\n'
        "final fin at 40,14\n"
        "ini -> idle\n"
        "idle -> active\n"
        "error -> fin\n"
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    lanes = assign_detour_lanes(d, ranks)
    ti_ef = next(i for i, t in enumerate(d.transitions)
                 if t.from_id == "error" and t.to_id == "fin")
    assert ti_ef in lanes  # error -> fin should be flagged for detour


def test_assign_detour_lanes_skips_back_edges():
    """Back-edges already handled by bus; detour shouldn't double-route."""
    dsl = (
        "@canvas width=960 height=400 grid=20\n"
        "initial ini at 0.5,3\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,2 size 8x4\n'
        'state c "C" at 25,2 size 8x4\n'
        "ini -> a\n"
        "a -> b\n"
        "b -> c\n"
        "c -> a\n"      # back-edge — should NOT be detour-flagged
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    lanes = assign_detour_lanes(d, ranks)
    ti_ca = next(i for i, t in enumerate(d.transitions) if t.from_id == "c" and t.to_id == "a")
    assert ti_ca not in lanes


# ─────────────── Sprint 3: forward-detour entry direction ───────────────

def test_forward_detour_5_points_for_rightward_target():
    """Forward edge going right: leaves src.bottom, traverses lane,
    rises just before target's left edge, enters target.left."""
    src = {"x": 100, "y": 100, "w": 160, "h": 80}    # right edge=260
    tgt = {"x": 600, "y": 100, "w": 160, "h": 80}    # left edge=600
    lane_y = 240
    r = build_forward_detour_route(src, tgt, lane_y)
    assert len(r) == 5
    assert r[0]["y"] == src["y"] + src["h"]      # src bottom
    # Entry into target: at target.left
    assert r[-1]["x"] == tgt["x"]
    # Traverse on lane y
    assert r[1]["y"] == lane_y
    assert r[2]["y"] == lane_y
    # Approach point sits just before target's left edge
    assert r[2]["x"] < tgt["x"]
    assert r[3]["x"] < tgt["x"]


def test_forward_detour_uses_target_right_when_leftward():
    """Rare case: target is to the LEFT of source. Enter from target.right."""
    src = {"x": 600, "y": 100, "w": 160, "h": 80}
    tgt = {"x": 100, "y": 100, "w": 160, "h": 80}    # right edge=260
    r = build_forward_detour_route(src, tgt, 240)
    # Entry into target: at target.right
    assert r[-1]["x"] == tgt["x"] + tgt["w"]
    # Approach point sits just past target's right edge
    assert r[2]["x"] > tgt["x"] + tgt["w"]


def test_forward_detour_target_y_centered_when_count_one():
    src = {"x": 100, "y": 100, "w": 160, "h": 80}
    tgt = {"x": 600, "y": 100, "w": 160, "h": 80}
    r = build_forward_detour_route(src, tgt, 240)
    # Target port y should be centered on left edge (h/2 from top)
    assert r[-1]["y"] == tgt["y"] + tgt["h"] / 2


def test_forward_detour_falls_back_to_bottom_when_riser_crosses_obstacle():
    """Initial-template `error -> fin` regression: the leading-edge riser
    (vertical segment from lane to tgt.left) would cross Active, so the
    route must fall back to entering target from the bottom."""
    src = {"x": 60,  "y": 360, "w": 160, "h": 100}     # error
    tgt = {"x": 788, "y": 268, "w": 24,  "h": 24}      # fin (final pseudo)
    active = {"x": 300, "y": 20, "w": 480, "h": 280}   # obstacle
    lane_y = 520
    r = build_forward_detour_route(src, tgt, lane_y, obstacles=[active])
    # 4-point bottom-entry, not 5-point leading-entry
    assert len(r) == 4
    # Last point is tgt.bottom (y = tgt.y + tgt.h)
    assert r[-1]["y"] == tgt["y"] + tgt["h"]
    # The riser column is at tgt.x_center (not tgt.left - margin)
    expected_x = tgt["x"] + tgt["w"] / 2
    assert abs(r[2]["x"] - expected_x) < 0.01


def test_forward_detour_keeps_leading_edge_when_riser_is_clear():
    """No obstacle blocks the riser → keep the natural 5-point shape."""
    src = {"x": 60,  "y": 100, "w": 160, "h": 80}
    tgt = {"x": 600, "y": 100, "w": 160, "h": 80}
    r = build_forward_detour_route(src, tgt, 240, obstacles=[])
    assert len(r) == 5
    assert r[-1]["x"] == tgt["x"]   # tgt.left


def test_forward_detour_obstacles_argument_is_optional():
    """Backward-compatible: callers that don't pass obstacles still get
    the original 5-point leading-edge route."""
    src = {"x": 60, "y": 100, "w": 160, "h": 80}
    tgt = {"x": 600, "y": 100, "w": 160, "h": 80}
    r = build_forward_detour_route(src, tgt, 240)  # no obstacles
    assert len(r) == 5


def test_derive_pseudo_ranks_choice_inherits_from_incoming():
    """A choice pseudo-state's effective rank should be max rank of incoming
    real states + 1, so its outgoing edges to lower-rank states are
    classified as backward."""
    dsl = (
        "@canvas width=1500 height=400 grid=20\n"
        "initial ini at 0.5,3\n"
        'state a "A" at 5,2 size 8x4\n'
        'state b "B" at 15,2 size 8x4\n'
        "choice c1 at 30,4\n"
        'state d "D" at 40,2 size 8x4\n'
        "ini -> a\n"
        "a -> b\n"
        "b -> c1\n"
        "c1 -> d\n"
        "c1 -> a\n"      # back-edge through pseudo (c1 should outrank a)
    )
    d = parse_dsl(dsl)
    ranks = compute_ranks(d)
    # Without pseudo ranks, c1 has no rank → edges from c1 fall through
    pseudo_ranks = derive_pseudo_ranks(d, ranks)
    assert pseudo_ranks["c1"] > ranks["a"]
    # Now classify_edge with merged ranks should call c1 -> a backward
    merged = {**ranks, **pseudo_ranks}
    assert classify_edge("c1", "a", merged) == "backward"
