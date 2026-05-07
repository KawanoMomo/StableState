"""Tests for auto-layout tools."""
import pytest
from stablestate_mcp import state as st
from stablestate_mcp.tools import layout


@pytest.fixture(autouse=True)
def reset_state():
    st.set_dsl("@canvas width=960 height=600 grid=20\n")
    layout._refresh()
    yield
    st.clear()


def test_auto_layout_hierarchical_orders_by_bfs_rank():
    # Linear chain a -> b -> c -> d, with initial pseudo
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        "initial ini at 0.5,3\n"
        'state a "A" at 50,50 size 8x4\n'
        'state b "B" at 50,50 size 8x4\n'
        'state c "C" at 50,50 size 8x4\n'
        'state d "D" at 50,50 size 8x4\n'
        "ini -> a\n"
        "a -> b\n"
        "b -> c\n"
        "c -> d\n"
    )
    layout._refresh()
    msg = layout.ss_auto_layout("hierarchical")
    assert "Re-laid out 4" in msg
    layout._refresh()
    states = {s.id: s for s in st.get().states}
    # Ranks must be strictly increasing in x
    assert states["a"].x < states["b"].x < states["c"].x < states["d"].x


def test_auto_layout_grid_places_n_states_in_sqrt_grid():
    # 4 disconnected states → 2x2 grid
    dsl_lines = ["@canvas width=960 height=600 grid=20"]
    for i in range(4):
        dsl_lines.append(f'state s{i} "S{i}" at 100,100 size 8x4')
    st.set_dsl("\n".join(dsl_lines) + "\n")
    layout._refresh()
    layout.ss_auto_layout("grid")
    layout._refresh()
    states = {s.id: s for s in st.get().states}
    xs = sorted({states[f"s{i}"].x for i in range(4)})
    ys = sorted({states[f"s{i}"].y for i in range(4)})
    assert len(xs) == 2  # 2 columns
    assert len(ys) == 2  # 2 rows


def test_auto_layout_unknown_algorithm_errors():
    msg = layout.ss_auto_layout("graphviz")
    assert "Error" in msg


def test_distribute_x_evenly_spaces_elements():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state a "A" at 1,1 size 8x4\n'
        'state b "B" at 30,1 size 8x4\n'
        'state c "C" at 50,1 size 8x4\n'
    )
    layout._refresh()
    layout.ss_distribute(["a", "b", "c"], axis="x", spacing=2)
    layout._refresh()
    states = {s.id: s for s in st.get().states}
    # b should be at a.x + a.w + 2 = 1 + 8 + 2 = 11
    # c should be at b.x + b.w + 2 = 11 + 8 + 2 = 21
    assert states["b"].x == 11
    assert states["c"].x == 21


def test_distribute_rejects_lt_2_ids():
    msg = layout.ss_distribute(["x"], axis="x")
    assert "Error" in msg


def test_align_top_matches_anchor_y():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state a "A" at 1,5 size 8x4\n'
        'state b "B" at 12,10 size 8x4\n'
        'state c "C" at 23,15 size 8x4\n'
    )
    layout._refresh()
    layout.ss_align(["a", "b", "c"], edge="top")
    layout._refresh()
    states = {s.id: s for s in st.get().states}
    assert states["a"].y == 5
    assert states["b"].y == 5
    assert states["c"].y == 5


def test_align_unknown_edge_errors():
    msg = layout.ss_align(["a", "b"], edge="diagonal")
    assert "Error" in msg


def test_pack_children_arranges_children_inside_parent():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state outer "Outer" at 1,1 size 30x20 {\n'
        '  state c1 "C1" at 50,50 size 8x4\n'
        '  state c2 "C2" at 50,50 size 8x4\n'
        '  state c3 "C3" at 50,50 size 8x4\n'
        '  state c4 "C4" at 50,50 size 8x4\n'
        "}\n"
    )
    layout._refresh()
    msg = layout.ss_pack_children("outer")
    assert "Packed 4" in msg
    layout._refresh()
    sm = {s.id: s for s in st.get().states}
    # All children should be at small x/y inside parent (not at 50,50)
    for cid in ("c1", "c2", "c3", "c4"):
        assert sm[cid].x < 30
        assert sm[cid].y < 20


def test_pack_children_unknown_parent_errors():
    msg = layout.ss_pack_children("does-not-exist")
    assert "Error" in msg


def test_auto_layout_warns_when_layout_exceeds_canvas():
    # 12 states, narrow canvas
    dsl_lines = ["@canvas width=400 height=300 grid=20"]
    for i in range(12):
        dsl_lines.append(f'state s{i} "S{i}" at 1,1 size 8x4')
    st.set_dsl("\n".join(dsl_lines) + "\n")
    layout._refresh()
    msg = layout.ss_auto_layout("grid")
    # 400/20=20 grid wide; 4 cols * (8+4) - last gap = 44 → exceeds 20
    assert "extends" in msg or "expand" in msg or "exceeds" in msg or "consider" in msg
