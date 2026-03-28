"""TDD tests: DSL text preservation through MCP operations."""
import pytest
import tempfile
from pathlib import Path
from stablestate_mcp import state
from stablestate_mcp.tools.diagram import ss_new, ss_open, ss_save, ss_get_dsl
from stablestate_mcp.tools.elements import ss_modify, ss_add_state, ss_remove


SAMPLE_DSL = """@canvas width=960 height=600 grid=20
@config transition=local

# Power Management System
group pwr "Power" at 0,0 size 40x20 color=#0f172a border=#334155

initial ini at 1,5
state idle "Idle" at 3,3 size 8x5 entry=IdleEntry
state active "Active" at 15,3 size 8x5

ini -> idle
idle -> active : EvStart [Ready] / Init
active -> idle : EvStop
"""


@pytest.fixture(autouse=True)
def clean():
    state.clear()
    yield
    state.clear()


def test_open_preserves_comments():
    with tempfile.NamedTemporaryFile(suffix=".sstate", mode="w", delete=False, encoding="utf-8") as f:
        f.write(SAMPLE_DSL)
        f.flush()
        ss_open(f.name)

    dsl = ss_get_dsl()
    assert "# Power Management System" in dsl


def test_modify_preserves_dsl_structure():
    with tempfile.NamedTemporaryFile(suffix=".sstate", mode="w", delete=False, encoding="utf-8") as f:
        f.write(SAMPLE_DSL)
        f.flush()
        ss_open(f.name)

    ss_modify("idle", x=5, y=4)
    dsl = ss_get_dsl()
    # Comment preserved
    assert "# Power Management System" in dsl
    # Group preserved
    assert 'group pwr "Power"' in dsl
    # Position updated
    assert "at 5,4" in dsl
    # Other lines intact
    assert "idle -> active : EvStart [Ready] / Init" in dsl


def test_modify_label_preserves_dsl():
    with tempfile.NamedTemporaryFile(suffix=".sstate", mode="w", delete=False, encoding="utf-8") as f:
        f.write(SAMPLE_DSL)
        f.flush()
        ss_open(f.name)

    ss_modify("idle", label="Waiting")
    dsl = ss_get_dsl()
    assert '"Waiting"' in dsl
    assert '"Idle"' not in dsl
    assert "# Power Management System" in dsl


def test_save_preserves_comments(tmp_path):
    src = tmp_path / "test.sstate"
    src.write_text(SAMPLE_DSL, encoding="utf-8")
    ss_open(str(src))
    ss_modify("idle", x=5)

    out = tmp_path / "out.sstate"
    ss_save(str(out))
    saved = out.read_text(encoding="utf-8")
    assert "# Power Management System" in saved
    assert "at 5," in saved


def test_add_state_appends_to_dsl():
    with tempfile.NamedTemporaryFile(suffix=".sstate", mode="w", delete=False, encoding="utf-8") as f:
        f.write(SAMPLE_DSL)
        f.flush()
        ss_open(f.name)

    ss_add_state("err", "Error", 30, 3)
    dsl = ss_get_dsl()
    assert "# Power Management System" in dsl
    assert 'state err "Error" at 30,3' in dsl


def test_remove_cleans_dsl():
    with tempfile.NamedTemporaryFile(suffix=".sstate", mode="w", delete=False, encoding="utf-8") as f:
        f.write(SAMPLE_DSL)
        f.flush()
        ss_open(f.name)

    ss_remove("active")
    dsl = ss_get_dsl()
    assert "# Power Management System" in dsl
    assert "state active" not in dsl
    assert "idle -> active" not in dsl
    assert "active -> idle" not in dsl
    assert "state idle" in dsl
