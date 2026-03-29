"""TDD tests for StableState DSL parser."""
import pytest
from stablestate_mcp.core.parser import parse_dsl, resolve_state_ref
from stablestate_mcp.core.generator import generate_dsl


def test_canvas():
    d = parse_dsl("@canvas width=800 height=400 grid=10")
    assert d.canvas.width == 800
    assert d.canvas.height == 400
    assert d.canvas.grid == 10


def test_config():
    d = parse_dsl("@config transition=external\n@config history=true")
    assert d.config.transition == "external"
    assert d.config.history is True


def test_state():
    d = parse_dsl('state idle "Idle" at 2,3 size 8x4 entry=E1 do=D1 exit=X1 color=#6366F1')
    assert len(d.states) == 1
    s = d.states[0]
    assert s.id == "idle"
    assert s.label == "Idle"
    assert s.x == 2 and s.y == 3
    assert s.w == 8 and s.h == 4
    assert s.entry == "E1"
    assert s.do == "D1"
    assert s.exit == "X1"
    assert s.color == "#6366F1"


def test_composite_state():
    dsl = '''state active "Active" at 5,5 size 20x12 {
  state accel "Accel" at 1,2 size 8x3
  state cruise "Cruise" at 10,2 size 8x3
}'''
    d = parse_dsl(dsl)
    assert len(d.states) == 3
    active = next(s for s in d.states if s.id == "active")
    assert len(active.children) == 2
    accel = next(s for s in d.states if s.id == "accel")
    assert accel.parent == "active"


def test_pseudo_states():
    dsl = "initial ini at 1,4\nfinal fin at 30,4\nchoice c1 at 10,8"
    d = parse_dsl(dsl)
    assert len(d.pseudo_states) == 3
    types = {ps.type for ps in d.pseudo_states}
    assert types == {"initial", "final", "choice"}


def test_transition():
    dsl = '''state a "A" at 2,3 size 8x4
state b "B" at 15,3 size 8x4
a -> b : EvStart [IsReady] / ActInit @external style=dashed color=#FF0000 width=2.5'''
    d = parse_dsl(dsl)
    assert len(d.transitions) == 1
    t = d.transitions[0]
    assert t.from_id == "a"
    assert t.to_id == "b"
    assert t.event == "EvStart"
    assert t.guard == "IsReady"
    assert t.action == "ActInit"
    assert t.kind == "external"
    assert t.style == "dashed"
    assert t.color == "#FF0000"
    assert t.width == 2.5


def test_transition_minimal():
    d = parse_dsl("a -> b")
    assert len(d.transitions) == 1
    t = d.transitions[0]
    assert t.from_id == "a" and t.to_id == "b"
    assert t.event is None and t.guard is None and t.action is None


def test_group():
    d = parse_dsl('group g1 "Power" at 1,1 size 30x14 color=#EEF2FF border=#818CF8')
    assert len(d.groups) == 1
    g = d.groups[0]
    assert g.id == "g1" and g.label == "Power"
    assert g.color == "#EEF2FF" and g.border_color == "#818CF8"


def test_note():
    d = parse_dsl('note tip "Important" at 2,1 size 10x2 color=#FEF3C7')
    assert len(d.notes) == 1
    n = d.notes[0]
    assert n.id == "tip" and n.label == "Important"
    assert n.color == "#FEF3C7"


def test_note_connection():
    dsl = 'note tip "Tip" at 2,1 size 10x2\ntip -> idle'
    d = parse_dsl(dsl)
    assert len(d.note_connections) == 1
    assert d.note_connections[0].note_id == "tip"
    assert d.note_connections[0].target_id == "idle"


def test_include_warning():
    d = parse_dsl('@include "shared.sstate"')
    assert any("@include" in e.msg for e in d.errors)


def test_comment_and_empty():
    d = parse_dsl("# comment\n\n@canvas width=960 height=600 grid=20")
    assert d.canvas.width == 960
    assert len(d.errors) == 0


def test_generator_roundtrip():
    dsl = '''@canvas width=960 height=600 grid=20
state idle "Idle" at 2,3 size 8x4
state active "Active" at 15,3 size 8x4
initial ini at 1,4
ini -> idle
idle -> active : EvStart [Ready] / Init'''
    d = parse_dsl(dsl)
    out = generate_dsl(d)
    d2 = parse_dsl(out)
    assert len(d2.states) == len(d.states)
    assert len(d2.transitions) == len(d.transitions)
    assert d2.transitions[1].event == "EvStart"


def test_dotpath_transition_stored():
    dsl = '@canvas width=960 height=600 grid=20\nstate active "Active" at 5,5 size 20x12 {\n  state accel "Accel" at 1,2 size 8x3\n  state cruise "Cruise" at 10,2 size 8x3\n}\nactive.accel -> active.cruise : EvSpeedOk'
    d = parse_dsl(dsl)
    assert d.transitions[0].from_id == "active.accel"
    assert d.transitions[0].to_id == "active.cruise"


def test_resolve_state_ref_bare():
    dsl = '@canvas width=960 height=600 grid=20\nstate idle "Idle" at 2,3 size 8x4'
    d = parse_dsl(dsl)
    assert resolve_state_ref("idle", d).id == "idle"


def test_resolve_state_ref_dotpath():
    dsl = '@canvas width=960 height=600 grid=20\nstate active "Active" at 5,5 size 20x12 {\n  state accel "Accel" at 1,2 size 8x3\n}'
    d = parse_dsl(dsl)
    el = resolve_state_ref("active.accel", d)
    assert el is not None
    assert el.id == "accel"
    assert el.parent == "active"


def test_resolve_state_ref_pseudo():
    dsl = '@canvas width=960 height=600 grid=20\nstate active "Active" at 5,5 size 20x12 {\n  initial ini at 1,1\n}'
    d = parse_dsl(dsl)
    el = resolve_state_ref("active.ini", d)
    assert el is not None
    assert el.id == "ini"
