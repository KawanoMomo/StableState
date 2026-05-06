"""Diagram model → DSL text generator."""
from __future__ import annotations
from ..models.types import Diagram, State


def generate_dsl(d: Diagram) -> str:
    lines: list[str] = []
    lines.append(f"@canvas width={d.canvas.width} height={d.canvas.height} grid={d.canvas.grid}")
    if d.config.transition != "local":
        lines.append(f"@config transition={d.config.transition}")
    if d.config.orthogonal:
        lines.append("@config orthogonal=true")
    if d.config.history:
        lines.append("@config history=true")

    # Build state map for tree traversal
    state_map = {s.id: s for s in d.states}

    def render_state(st: State, indent: int) -> None:
        pad = "  " * indent
        props = ""
        if st.entry:
            props += f" entry={st.entry}"
        if st.do:
            props += f" do={st.do}"
        if st.exit:
            props += f" exit={st.exit}"
        if st.color:
            props += f" color={st.color}"
        if st.border_color:
            props += f" border={st.border_color}"
        if st.text_color:
            props += f" text={st.text_color}"
        if st.style:
            props += f" style={st.style}"
        if st.round is not None:
            props += f" round={st.round}"

        size = f" size {st.w}x{st.h}" if st.w or st.h else ""
        if st.children:
            lines.append(f'{pad}state {st.id} "{st.label}" at {st.x},{st.y}{size}{props} {{')
            for cid in st.children:
                child = state_map.get(cid)
                if child:
                    render_state(child, indent + 1)
            lines.append(f"{pad}}}")
        else:
            lines.append(f'{pad}state {st.id} "{st.label}" at {st.x},{st.y}{size}{props}')

    # Root states
    for st in d.states:
        if st.parent is None:
            render_state(st, 0)

    # Pseudo-states
    for ps in d.pseudo_states:
        size = f" size {ps.w}x{ps.h}" if ps.w is not None else ""
        lines.append(f"{ps.type} {ps.id} at {ps.x},{ps.y}{size}")

    # Groups
    for g in d.groups:
        props = ""
        if g.color:
            props += f" color={g.color}"
        if g.border_color:
            props += f" border={g.border_color}"
        lines.append(f'group {g.id} "{g.label}" at {g.x},{g.y} size {g.w}x{g.h}{props}')

    # Notes
    for n in d.notes:
        props = ""
        if n.color:
            props += f" color={n.color}"
        if n.text_color:
            props += f" text={n.text_color}"
        lines.append(f'note {n.id} "{n.label}" at {n.x},{n.y} size {n.w}x{n.h}{props}')

    # Transitions
    for t in d.transitions:
        has_label = (
            t.event or t.guard or t.action
            or t.kind != d.config.transition
            or t.cyclic or t.default_target
            or t.width or t.style or t.color
        )
        label = ""
        if has_label:
            parts = []
            if t.event:
                parts.append(t.event)
            if t.guard:
                parts.append(f"[{t.guard}]")
            if t.action:
                parts.append(f"/ {t.action}")
            if t.kind != d.config.transition:
                parts.append(f"@{t.kind}")
            if t.cyclic:
                parts.append("@cyclic")
            attrs = []
            if t.style:
                attrs.append(f"style={t.style}")
            if t.color:
                attrs.append(f"color={t.color}")
            if t.width:
                attrs.append(f"width={t.width}")
            if t.default_target:
                attrs.append(f"default={t.default_target}")
            if attrs:
                parts.extend(attrs)
            if parts:
                label = " : " + " ".join(parts)
        lines.append(f"{t.from_id} -> {t.to_id}{label}")

    # Note connections
    for nc in d.note_connections:
        lines.append(f"{nc.note_id} -> {nc.target_id}")

    return "\n".join(lines) + "\n"
