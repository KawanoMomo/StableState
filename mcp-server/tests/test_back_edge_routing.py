"""Sprint 1 of channel-routing rewrite — back-edge bus.

Spec ref: docs/specs/2026-05-06-channel-routing-moc.html section 3.

Edge classification: a transition `from -> to` is
  - FORWARD  if rank[to] >  rank[from]   (most common; bezier OK)
  - BACKWARD if rank[to] <  rank[from]   (retry/cancel arcs; route via bus)
  - LATERAL  if rank[to] == rank[from]   (siblings; existing logic)
  - SELF     if from == to

Sprint 1 only re-routes BACKWARD edges. The rest go through the existing
buildRoute path unchanged.
"""
import pytest
from stablestate_mcp.core.parser import parse_dsl
from stablestate_mcp.core.routing import (
    compute_ranks, classify_edge, compute_bus_y, build_back_edge_route,
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
