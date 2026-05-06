"""Tests for ss_summary diagnosis."""
import json
import pytest
from stablestate_mcp import state as st
from stablestate_mcp.tools import smart, palette


@pytest.fixture(autouse=True)
def reset_state():
    st.set_dsl("@canvas width=960 height=600 grid=20\n")
    palette._refresh()
    yield
    st.clear()


def test_summary_counts_basic_elements():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state a "A" at 1,1 size 8x4\n'
        'state b "B" at 12,1 size 8x4\n'
        "initial ini at 0.5,3\n"
        "ini -> a\n"
        "a -> b\n"
    )
    palette._refresh()
    out = json.loads(smart.ss_summary())
    assert out["counts"]["states"] == 2
    assert out["counts"]["pseudo_states"] == 1
    assert out["counts"]["transitions"] == 2


def test_summary_flags_high_fan_state():
    # Hub-and-spoke: hub has many edges
    lines = ["@canvas width=2000 height=2000 grid=20"]
    lines.append('state hub "Hub" at 1,1 size 8x4')
    for i in range(7):
        lines.append(f'state s{i} "S{i}" at {12 + i * 11},1 size 8x4')
        lines.append(f"hub -> s{i}")
    st.set_dsl("\n".join(lines) + "\n")
    palette._refresh()
    out = json.loads(smart.ss_summary())
    assert out["busiest"][0]["id"] == "hub"
    assert out["busiest"][0]["fan"] == 7
    assert any("hub" in s for s in out["suggestions"])


def test_summary_flags_unconnected_states():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state lonely "Lonely" at 1,1 size 8x4\n'
        'state a "A" at 12,1 size 8x4\n'
        'state b "B" at 23,1 size 8x4\n'
        "a -> b\n"
    )
    palette._refresh()
    out = json.loads(smart.ss_summary())
    assert "lonely" in out["unconnected"]


def test_summary_suggests_palette_when_no_roles_set():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state a "A" at 1,1 size 8x4\n'
    )
    palette._refresh()
    out = json.loads(smart.ss_summary())
    assert any("ss_apply_palette" in s for s in out["suggestions"])


def test_summary_role_coverage_counts_set_roles():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state a "A" at 1,1 size 8x4 role=idle\n'
        'state b "B" at 12,1 size 8x4\n'
    )
    palette._refresh()
    out = json.loads(smart.ss_summary())
    assert out["role_coverage"]["set"] == 1
    assert out["role_coverage"]["themable_total"] == 2
