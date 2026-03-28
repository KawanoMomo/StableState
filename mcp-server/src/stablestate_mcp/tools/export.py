"""Export tools."""
from __future__ import annotations
from pathlib import Path
from .. import state
from ..core.generator import generate_dsl


def ss_export_plantuml(path: str) -> str:
    """Export the current diagram as PlantUML."""
    d = state.get()
    initial_ids = {ps.id for ps in d.pseudo_states if ps.type == "initial"}
    final_ids = {ps.id for ps in d.pseudo_states if ps.type == "final"}
    state_map = {s.id: s for s in d.states}

    lines = ["@startuml"]

    def render_state(st, indent):
        pad = "  " * indent
        if st.children:
            lines.append(f'{pad}state "{st.label}" as {st.id} {{')
            for cid in st.children:
                c = state_map.get(cid)
                if c:
                    render_state(c, indent + 1)
            lines.append(f"{pad}}}")
        else:
            lines.append(f'{pad}state "{st.label}" as {st.id}')

    for st in d.states:
        if st.parent is None:
            render_state(st, 0)

    lines.append("")
    for t in d.transitions:
        f = "[*]" if t.from_id in initial_ids else t.from_id
        to = "[*]" if t.to_id in final_ids else t.to_id
        label = ""
        if t.event or t.guard or t.action:
            parts = []
            if t.event:
                parts.append(t.event)
            if t.guard:
                parts.append(f"[{t.guard}]")
            if t.action:
                parts.append(f"/ {t.action}")
            label = " : " + " ".join(parts)
        lines.append(f"{f} --> {to}{label}")

    lines.append("@enduml")
    text = "\n".join(lines)
    Path(path).write_text(text, encoding="utf-8")
    return f"Exported PlantUML to {path}"
