"""Tests for palette / role tools."""
import json
import pytest
from stablestate_mcp import state as st
from stablestate_mcp.core.palettes import PALETTES, ROLES, get_palette
from stablestate_mcp.tools import palette


@pytest.fixture(autouse=True)
def reset_state():
    st.set_dsl("@canvas width=960 height=600 grid=20\n")
    palette._refresh()
    yield
    st.clear()


def test_list_palettes_includes_all_themes():
    out = json.loads(palette.ss_list_palettes())
    names = {p["name"] for p in out["palettes"]}
    assert names == set(PALETTES.keys())
    # Every palette must define the standard roles
    for p in out["palettes"]:
        for required in ("default", "active", "error"):
            assert required in p["roles"], f"{p['name']} missing role '{required}'"
    assert set(out["standard_roles"]) == set(ROLES)


def test_set_role_persists_to_dsl():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state idle "Idle" at 1,1 size 8x4\n'
    )
    palette._refresh()
    msg = palette.ss_set_role("idle", "active")
    assert "idle" in msg
    assert "role=active" in st.get_dsl()
    # Round-trip preserves role
    palette._refresh()
    s = next(s for s in st.get().states if s.id == "idle")
    assert s.role == "active"


def test_set_role_rejects_unknown_id():
    msg = palette.ss_set_role("nope", "active")
    assert "not a state" in msg or "Error" in msg


def test_apply_palette_recolors_by_role():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state idle "Idle" at 1,1 size 8x4 role=idle\n'
        'state run "Run" at 12,1 size 8x4 role=active\n'
        'state err "Err" at 23,1 size 8x4 role=error\n'
    )
    palette._refresh()
    msg = palette.ss_apply_palette("slate-amber")
    assert "Applied palette 'slate-amber'" in msg
    palette._refresh()
    states = {s.id: s for s in st.get().states}
    p = get_palette("slate-amber")
    assert states["idle"].border_color == p["state"]["idle"]["border"]
    assert states["run"].border_color == p["state"]["active"]["border"]
    assert states["err"].border_color == p["state"]["error"]["border"]


def test_apply_palette_falls_back_to_default_for_missing_role():
    st.set_dsl(
        "@canvas width=960 height=600 grid=20\n"
        'state x "X" at 1,1 size 8x4\n'  # no role
    )
    palette._refresh()
    palette.ss_apply_palette("mono-light")
    palette._refresh()
    s = next(s for s in st.get().states if s.id == "x")
    p = get_palette("mono-light")
    assert s.border_color == p["state"]["default"]["border"]


def test_apply_palette_unknown_name_errors():
    msg = palette.ss_apply_palette("does-not-exist")
    assert "Error" in msg


def test_apply_palette_scope_limits_recoloring():
    # Composite parent with two children + a sibling
    dsl = (
        "@canvas width=960 height=600 grid=20\n"
        'state outer "Outer" at 1,1 size 30x20 role=idle {\n'
        '  state c1 "C1" at 1,2 size 8x4 role=active\n'
        '  state c2 "C2" at 11,2 size 8x4 role=error\n'
        "}\n"
        'state sibling "Sibling" at 35,1 size 8x4 role=warning\n'
    )
    st.set_dsl(dsl)
    palette._refresh()
    palette.ss_apply_palette("vivid-spectrum", scope="outer")
    palette._refresh()
    p = get_palette("vivid-spectrum")
    states = {s.id: s for s in st.get().states}
    # Inside scope: recolored
    assert states["c1"].border_color == p["state"]["active"]["border"]
    # Outside scope: untouched (still None / unset)
    assert states["sibling"].border_color is None
