"""DSL text → Diagram parser. Port of parseDSL() from stablestate.html."""
from __future__ import annotations
import re
from ..models.types import (
    Diagram, Canvas, Config, State, PseudoState, Group,
    Transition, Note, NoteConnection, ParseError,
)

_RE_CANVAS = re.compile(r"^@canvas\s+(.+)$")
_RE_CONFIG = re.compile(r"^@config\s+(\w+)=(\S+)$")
_RE_INCLUDE = re.compile(r'^@include\s+"([^"]+)"')
_RE_STATE = re.compile(
    r'^state\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+)\s*,\s*([\d.]+)'
    r'(?:\s+size\s+([\d.]+)\s*x\s*([\d.]+))?(.*?)(\{)?\s*$'
)
_RE_PSEUDO = re.compile(
    r"^(initial|final|choice|history|deephistory|fork|join)"
    r"\s+(\S+)\s+at\s+([\d.]+)\s*,\s*([\d.]+)"
    r"(?:\s+size\s+([\d.]+)\s*x\s*([\d.]+))?"
)
_RE_GROUP = re.compile(
    r'^group\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+)\s*,\s*([\d.]+)'
    r"\s+size\s+([\d.]+)\s*x\s*([\d.]+)(.*)"
)
_RE_NOTE = re.compile(
    r'^note\s+(\S+)\s+"([^"]*)"\s+at\s+([\d.]+)\s*,\s*([\d.]+)'
    r"\s+size\s+([\d.]+)\s*x\s*([\d.]+)(.*)"
)
_RE_TRANS = re.compile(r"^(\S+)\s*->\s*(\S+)(.*)$")
_RE_PROP = re.compile(r"(\w+)=(\S+)")


def _parse_props(text: str) -> dict[str, str]:
    return dict(_RE_PROP.findall(text))


def parse_dsl(text: str) -> Diagram:
    d = Diagram()
    state_map: dict[str, State] = {}
    note_map: dict[str, Note] = {}
    nesting_stack: list[str] = []

    for i, raw in enumerate(text.split("\n")):
        line_num = i + 1
        trimmed = raw.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        if trimmed == "}":
            if nesting_stack:
                nesting_stack.pop()
            continue

        # @include
        m = _RE_INCLUDE.match(trimmed)
        if m:
            d.errors.append(ParseError(
                line=line_num,
                msg=f'@include "{m.group(1)}" — use preprocessInclude() to resolve before parsing',
            ))
            continue

        # @canvas
        m = _RE_CANVAS.match(trimmed)
        if m:
            props = _parse_props(m.group(1))
            if "width" in props:
                d.canvas.width = int(props["width"])
            if "height" in props:
                d.canvas.height = int(props["height"])
            if "grid" in props:
                d.canvas.grid = int(props["grid"])
            continue

        # @config
        m = _RE_CONFIG.match(trimmed)
        if m:
            key, val = m.group(1), m.group(2)
            if key == "transition":
                d.config.transition = val
            elif key == "orthogonal":
                d.config.orthogonal = val == "true"
            elif key == "history":
                d.config.history = val == "true"
            continue

        # state
        m = _RE_STATE.match(trimmed)
        if m:
            sid, label = m.group(1), m.group(2)
            props = _parse_props(m.group(7) or "")
            parent = nesting_stack[-1] if nesting_stack else None
            st = State(
                id=sid, label=label,
                x=float(m.group(3)), y=float(m.group(4)),
                w=float(m.group(5) or 8), h=float(m.group(6) or 4),
                parent=parent,
                entry=props.get("entry"), do=props.get("do"), exit=props.get("exit"),
                color=props.get("color"), border_color=props.get("border"),
                text_color=props.get("text"), style=props.get("style"),
                round=int(props["round"]) if "round" in props else None,
                line=line_num,
            )
            d.states.append(st)
            state_map[sid] = st
            if parent and parent in state_map:
                state_map[parent].children.append(sid)
            if m.group(8) == "{":
                nesting_stack.append(sid)
            continue

        # pseudo-state
        m = _RE_PSEUDO.match(trimmed)
        if m:
            parent = nesting_stack[-1] if nesting_stack else None
            ps = PseudoState(
                type=m.group(1), id=m.group(2),
                x=float(m.group(3)), y=float(m.group(4)),
                w=float(m.group(5)) if m.group(5) else None,
                h=float(m.group(6)) if m.group(6) else None,
                parent=parent, line=line_num,
            )
            d.pseudo_states.append(ps)
            continue

        # group
        m = _RE_GROUP.match(trimmed)
        if m:
            props = _parse_props(m.group(7))
            g = Group(
                id=m.group(1), label=m.group(2),
                x=float(m.group(3)), y=float(m.group(4)),
                w=float(m.group(5)), h=float(m.group(6)),
                color=props.get("color"), border_color=props.get("border"),
                text_color=props.get("text"), line=line_num,
            )
            d.groups.append(g)
            continue

        # note
        m = _RE_NOTE.match(trimmed)
        if m:
            props = _parse_props(m.group(7))
            n = Note(
                id=m.group(1), label=m.group(2),
                x=float(m.group(3)), y=float(m.group(4)),
                w=float(m.group(5)), h=float(m.group(6)),
                color=props.get("color"), text_color=props.get("text"),
                border_color=props.get("border"), line=line_num,
            )
            d.notes.append(n)
            note_map[n.id] = n
            continue

        # transition / note connection
        m = _RE_TRANS.match(trimmed)
        if m:
            from_id, to_id = m.group(1), m.group(2)
            rest = m.group(3).strip()

            # Note connection
            if from_id in note_map:
                d.note_connections.append(NoteConnection(
                    note_id=from_id, target_id=to_id, line=line_num,
                ))
                continue

            event, guard, action, kind = None, None, None, None
            width, style, color = None, None, None

            if rest.startswith(":"):
                detail = rest[1:].strip()
                remaining = detail
                # Extract key=value attrs
                for am in _RE_PROP.finditer(remaining):
                    k, v = am.group(1), am.group(2)
                    if k == "width":
                        width = float(v)
                    elif k == "style":
                        style = v
                    elif k == "color":
                        color = v
                remaining = re.sub(r"\b(width|style|color)=\S+", "", remaining).strip()
                # @kind
                km = re.search(r"@(local|external|internal)\s*$", remaining)
                if km:
                    kind = km.group(1)
                    remaining = remaining[: remaining.rfind("@" + kind)].strip()
                # / Action
                si = remaining.find("/")
                if si != -1:
                    action = remaining[si + 1 :].strip() or None
                    remaining = remaining[:si].strip()
                # [Guard]
                gm = re.search(r"\[([^\]]*)\]", remaining)
                if gm:
                    guard = gm.group(1).strip() or None
                    remaining = remaining[: remaining.index("[")].strip()
                event = remaining.strip() or None

            d.transitions.append(Transition(**{
                "from": from_id, "to": to_id,
                "event": event, "guard": guard, "action": action,
                "kind": kind or d.config.transition,
                "width": width, "style": style, "color": color,
                "line": line_num,
            }))
            continue

    return d
