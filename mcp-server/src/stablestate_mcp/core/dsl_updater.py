"""DSL text regex updaters — preserve comments and formatting."""
from __future__ import annotations
import re


def update_pos(type_: str, id_: str, x: float, y: float, dsl: str) -> str:
    """Update element position in DSL text."""
    # Format coordinate: use int if whole number
    sx = str(int(x)) if x == int(x) else str(x)
    sy = str(int(y)) if y == int(y) else str(y)
    pattern = re.compile(
        rf"^(\s*{re.escape(type_)}\s+{re.escape(id_)}\s+.*?at\s+)[\d.]+\s*,\s*[\d.]+",
        re.MULTILINE
    )
    return pattern.sub(rf"\g<1>{sx},{sy}", dsl)


def update_size(type_: str, id_: str, w: float, h: float, dsl: str) -> str:
    """Update element size in DSL text."""
    sw = str(int(w)) if w == int(w) else str(w)
    sh = str(int(h)) if h == int(h) else str(h)
    pattern = re.compile(
        rf"^(\s*{re.escape(type_)}\s+{re.escape(id_)}\s+.*?size\s+)[\d.]+\s*x\s*[\d.]+",
        re.MULTILINE
    )
    return pattern.sub(rf"\g<1>{sw}x{sh}", dsl)


def update_label(type_: str, id_: str, label: str, dsl: str) -> str:
    """Update element label in DSL text."""
    pattern = re.compile(
        rf'^(\s*{re.escape(type_)}\s+{re.escape(id_)}\s+)"[^"]*"',
        re.MULTILINE
    )
    return pattern.sub(rf'\g<1>"{label}"', dsl)


def update_prop(type_: str, id_: str, prop: str, val: str, dsl: str) -> str:
    """Add or update a key=value property on an element line."""
    lines = dsl.split("\n")
    line_re = re.compile(rf"^\s*{re.escape(type_)}\s+{re.escape(id_)}\s+")
    prop_re = re.compile(rf"\b{re.escape(prop)}=\S+")
    for i, line in enumerate(lines):
        if line_re.match(line):
            if prop_re.search(line):
                lines[i] = prop_re.sub(f"{prop}={val}", line)
            else:
                lines[i] = line.rstrip() + f" {prop}={val}"
            break
    return "\n".join(lines)


def remove_element(id_: str, dsl: str) -> str:
    """Remove element definition and related transitions from DSL."""
    lines = dsl.split("\n")
    result = []
    skip_depth = 0
    for line in lines:
        trimmed = line.strip()
        # Check if this line defines the element
        if skip_depth == 0 and re.match(rf"^\s*(state|initial|final|choice|history|deephistory|fork|join|group|note)\s+{re.escape(id_)}\b", trimmed):
            if trimmed.endswith("{"):
                skip_depth = 1
            continue
        if skip_depth > 0:
            if trimmed.endswith("{"):
                skip_depth += 1
            if trimmed.startswith("}"):
                skip_depth -= 1
            continue
        # Remove transitions referencing this ID
        # Match bare ID or as leaf of dot-path (e.g., "active.accel")
        bare_or_dot = rf"(?:\S+\.)?{re.escape(id_)}"
        if re.match(rf"^\s*{bare_or_dot}\s*->", trimmed):
            continue
        if re.search(rf"->\s*{bare_or_dot}(\s|$)", trimmed):
            continue
        result.append(line)
    return "\n".join(result)


def add_line(line: str, dsl: str) -> str:
    """Append a DSL line."""
    return dsl.rstrip() + "\n" + line + "\n"
