"""Built-in color palettes for diagram theming.

Each palette maps semantic *roles* (idle/active/error/...) to color triples
{color, border, text}. Tools resolve element.role → palette[role] → color
properties at apply time. Roles default to "default" when unset.

Adding a palette: append to PALETTES with a description, ensure all standard
roles are present (or rely on the "default" fallback), and add a test in
test_palette.py to lock the contract.
"""
from __future__ import annotations

# Standard role names. Tools may accept others, but apply_palette only
# guarantees a result when role is in this set OR "default" is defined.
ROLES: tuple[str, ...] = (
    "default", "idle", "active", "init",
    "error", "warning", "success", "transient",
)


PALETTES: dict[str, dict] = {
    "slate-amber": {
        "description": "Dark slate base with amber/red/green semantic accents. "
                       "Good for embedded / ECU diagrams.",
        "canvas_bg": "#0f172a",
        "state": {
            "default":   {"color": "#1e293b", "border": "#475569", "text": "#E2E8F0"},
            "idle":      {"color": "#1e293b", "border": "#64748B", "text": "#CBD5E1"},
            "active":    {"color": "#1e293b", "border": "#22C55E", "text": "#BBF7D0"},
            "init":      {"color": "#1e293b", "border": "#6366F1", "text": "#E0E7FF"},
            "error":     {"color": "#1e293b", "border": "#EF4444", "text": "#FCA5A5"},
            "warning":   {"color": "#1e293b", "border": "#F59E0B", "text": "#FDE68A"},
            "success":   {"color": "#1e293b", "border": "#22C55E", "text": "#BBF7D0"},
            "transient": {"color": "#1e293b", "border": "#A78BFA", "text": "#DDD6FE"},
        },
        "group": {"color": "#0f172a", "border": "#334155"},
        "note":  {"color": "#FEF3C7", "text": "#92400E"},
    },
    "tcp-quadrant": {
        "description": "Distinct hue per logical quadrant — useful for "
                       "client/server or layered diagrams.",
        "canvas_bg": "#0f172a",
        "state": {
            "default":   {"color": "#1e293b", "border": "#64748B", "text": "#E2E8F0"},
            "idle":      {"color": "#1e293b", "border": "#3B82F6", "text": "#BFDBFE"},
            "active":    {"color": "#0f172a", "border": "#22C55E", "text": "#BBF7D0"},
            "init":      {"color": "#1e293b", "border": "#6366F1", "text": "#E0E7FF"},
            "error":     {"color": "#1e293b", "border": "#EF4444", "text": "#FCA5A5"},
            "warning":   {"color": "#1e293b", "border": "#F59E0B", "text": "#FDE68A"},
            "success":   {"color": "#1e293b", "border": "#22C55E", "text": "#BBF7D0"},
            "transient": {"color": "#1e293b", "border": "#06B6D4", "text": "#A5F3FC"},
        },
        "group": {"color": "#0f172a", "border": "#3B82F6"},
        "note":  {"color": "#FEF3C7", "text": "#92400E"},
    },
    "mono-light": {
        "description": "Minimal grayscale — paper-friendly, prints clearly.",
        "canvas_bg": "#FFFFFF",
        "state": {
            "default":   {"color": "#FFFFFF", "border": "#475569", "text": "#0F172A"},
            "idle":      {"color": "#F1F5F9", "border": "#94A3B8", "text": "#1E293B"},
            "active":    {"color": "#FFFFFF", "border": "#0F172A", "text": "#0F172A"},
            "init":      {"color": "#FFFFFF", "border": "#1E40AF", "text": "#1E3A8A"},
            "error":     {"color": "#FFFFFF", "border": "#991B1B", "text": "#7F1D1D"},
            "warning":   {"color": "#FFFFFF", "border": "#92400E", "text": "#78350F"},
            "success":   {"color": "#FFFFFF", "border": "#166534", "text": "#14532D"},
            "transient": {"color": "#F8FAFC", "border": "#475569", "text": "#1E293B"},
        },
        "group": {"color": "#F8FAFC", "border": "#94A3B8"},
        "note":  {"color": "#FEF9C3", "text": "#713F12"},
    },
    "vivid-spectrum": {
        "description": "Distinct vivid hue per role — useful when debugging "
                       "to scan-find a state at a glance.",
        "canvas_bg": "#0F172A",
        "state": {
            "default":   {"color": "#3B82F6", "border": "#1E40AF", "text": "#FFFFFF"},
            "idle":      {"color": "#64748B", "border": "#334155", "text": "#FFFFFF"},
            "active":    {"color": "#22C55E", "border": "#166534", "text": "#FFFFFF"},
            "init":      {"color": "#6366F1", "border": "#3730A3", "text": "#FFFFFF"},
            "error":     {"color": "#EF4444", "border": "#991B1B", "text": "#FFFFFF"},
            "warning":   {"color": "#F59E0B", "border": "#92400E", "text": "#FFFFFF"},
            "success":   {"color": "#10B981", "border": "#065F46", "text": "#FFFFFF"},
            "transient": {"color": "#A78BFA", "border": "#5B21B6", "text": "#FFFFFF"},
        },
        "group": {"color": "#1E293B", "border": "#475569"},
        "note":  {"color": "#FEF3C7", "text": "#92400E"},
    },
    "traffic": {
        "description": "Green / Yellow / Red semantic — fits status / health "
                       "/ readiness flows where role conveys risk level.",
        "canvas_bg": "#0F172A",
        "state": {
            "default":   {"color": "#1E293B", "border": "#64748B", "text": "#CBD5E1"},
            "idle":      {"color": "#1E293B", "border": "#94A3B8", "text": "#E2E8F0"},
            "active":    {"color": "#14532D", "border": "#22C55E", "text": "#BBF7D0"},
            "init":      {"color": "#1E3A8A", "border": "#3B82F6", "text": "#BFDBFE"},
            "error":     {"color": "#7F1D1D", "border": "#EF4444", "text": "#FECACA"},
            "warning":   {"color": "#78350F", "border": "#F59E0B", "text": "#FDE68A"},
            "success":   {"color": "#14532D", "border": "#22C55E", "text": "#BBF7D0"},
            "transient": {"color": "#1E293B", "border": "#A78BFA", "text": "#DDD6FE"},
        },
        "group": {"color": "#0F172A", "border": "#334155"},
        "note":  {"color": "#FEF3C7", "text": "#92400E"},
    },
}


def get_palette(name: str) -> dict | None:
    """Return palette dict by name, or None if not found."""
    return PALETTES.get(name)


def resolve_state_colors(palette: dict, role: str | None) -> dict:
    """Pick {color, border, text} for a state given its role; fallback chain:
    role → 'default' → first available."""
    states = palette.get("state", {})
    if role and role in states:
        return states[role]
    if "default" in states:
        return states["default"]
    return next(iter(states.values()), {})
