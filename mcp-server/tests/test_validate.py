"""TDD tests for ss_validate_layout."""
import pytest
from stablestate_mcp import state
from stablestate_mcp.tools.diagram import ss_new, ss_open
from stablestate_mcp.tools.elements import ss_add_state, ss_add_pseudo, ss_add_transition
from stablestate_mcp.tools.smart import ss_validate_layout


@pytest.fixture(autouse=True)
def clean():
    state.clear()
    ss_new()
    yield
    state.clear()


def test_no_issues():
    ss_add_state("a", "A", 2, 2, 8, 4)
    ss_add_state("b", "B", 15, 2, 8, 4)
    result = ss_validate_layout()
    assert "No issues" in result or "0 issues" in result


def test_overlap_detected():
    ss_add_state("a", "A", 2, 2, 8, 4)
    ss_add_state("b", "B", 5, 3, 8, 4)  # overlaps with a
    result = ss_validate_layout()
    assert "overlap" in result.lower()


def test_out_of_canvas():
    ss_add_state("a", "A", 45, 25, 8, 4)  # 45+8=53 grids * 20 = 1060 > 960
    result = ss_validate_layout()
    assert "canvas" in result.lower() or "bound" in result.lower()


def test_transition_crosses_block():
    # a at left, b at right, c in the middle — a->b route crosses c
    ss_add_state("a", "A", 2, 5, 6, 4)
    ss_add_state("b", "B", 30, 5, 6, 4)
    ss_add_state("c", "C", 16, 4, 8, 6)  # sits between a and b
    ss_add_transition("a", "b", event="Go")
    result = ss_validate_layout()
    assert "cross" in result.lower() or "overlap" in result.lower()


def test_pseudo_on_transition_line():
    # Transition a->b goes right. Pseudo-state p sits on that line.
    ss_add_state("a", "A", 2, 5, 6, 4)
    ss_add_state("b", "B", 25, 5, 6, 4)
    ss_add_pseudo("initial", "p", 15, 7)  # center of line path
    ss_add_transition("a", "b", event="Go")
    result = ss_validate_layout()
    assert "pseudo" in result.lower() or "p" in result.lower()


def test_label_overlap():
    # Two transitions from same source, close targets — labels overlap
    ss_add_state("a", "A", 2, 5, 6, 4)
    ss_add_state("b", "B", 15, 5, 6, 4)
    ss_add_state("c", "C", 15, 6, 6, 4)  # very close to b
    ss_add_transition("a", "b", event="EvLong1", guard="SomeGuard1", action="Action1")
    ss_add_transition("a", "c", event="EvLong2", guard="SomeGuard2", action="Action2")
    result = ss_validate_layout()
    assert "label" in result.lower()
