"""TDD tests for MCP tools."""
import pytest
from stablestate_mcp import state
from stablestate_mcp.tools.diagram import ss_new, ss_show, ss_undo
from stablestate_mcp.tools.elements import (
    ss_add_state, ss_add_pseudo, ss_add_transition,
    ss_add_group, ss_add_note, ss_remove, ss_modify,
)


@pytest.fixture(autouse=True)
def clean_state():
    state.clear()
    ss_new()
    yield
    state.clear()


def test_new_and_show():
    result = ss_show()
    assert "States: 0" in result
    assert "960x600" in result


def test_add_state():
    result = ss_add_state("idle", "Idle", 2, 3)
    assert "Added state" in result
    d = state.get()
    assert len(d.states) == 1
    assert d.states[0].id == "idle"


def test_add_state_duplicate():
    ss_add_state("idle", "Idle", 2, 3)
    result = ss_add_state("idle", "Idle2", 5, 5)
    assert "Error" in result


def test_add_pseudo():
    result = ss_add_pseudo("initial", "ini", 1, 4)
    assert "Added initial" in result
    d = state.get()
    assert len(d.pseudo_states) == 1


def test_add_transition():
    ss_add_state("a", "A", 2, 3)
    ss_add_state("b", "B", 15, 3)
    result = ss_add_transition("a", "b", event="EvGo", guard="Ready")
    assert "Added transition" in result
    d = state.get()
    assert len(d.transitions) == 1
    assert d.transitions[0].event == "EvGo"


def test_add_group():
    result = ss_add_group("g1", "Power", 1, 1, 30, 14, color="#EEF2FF")
    assert "Added group" in result


def test_add_note():
    result = ss_add_note("tip", "Important", 2, 1)
    assert "Added note" in result


def test_remove_state():
    ss_add_state("idle", "Idle", 2, 3)
    ss_add_state("active", "Active", 15, 3)
    ss_add_transition("idle", "active", event="Go")
    result = ss_remove("idle")
    assert "Removed state" in result
    d = state.get()
    assert len(d.states) == 1
    assert len(d.transitions) == 0  # Transition also removed


def test_modify():
    ss_add_state("idle", "Idle", 2, 3)
    result = ss_modify("idle", label="Waiting", x=5, color="#FF0000")
    assert "Modified" in result
    d = state.get()
    assert d.states[0].label == "Waiting"
    assert d.states[0].x == 5
    assert d.states[0].color == "#FF0000"


def test_undo():
    ss_add_state("idle", "Idle", 2, 3)
    d = state.get()
    assert len(d.states) == 1
    ss_undo()
    d = state.get()
    assert len(d.states) == 0


def test_show_detail():
    ss_add_state("idle", "Idle", 2, 3)
    ss_add_transition("idle", "idle", event="Refresh")
    result = ss_show(detail=True)
    assert 'state idle "Idle"' in result
    assert "idle -> idle" in result
