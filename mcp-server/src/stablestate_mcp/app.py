"""FastMCP application with tool registration."""
from mcp.server.fastmcp import FastMCP
from .tools import diagram, elements, export, smart, palette, layout

mcp = FastMCP("stablestate-mcp")

# Diagram management
mcp.tool()(diagram.ss_new)
mcp.tool()(diagram.ss_open)
mcp.tool()(diagram.ss_save)
mcp.tool()(diagram.ss_show)
mcp.tool()(diagram.ss_undo)
mcp.tool()(diagram.ss_get_dsl)

# Element manipulation
mcp.tool()(elements.ss_add_state)
mcp.tool()(elements.ss_add_pseudo)
mcp.tool()(elements.ss_add_transition)
mcp.tool()(elements.ss_add_group)
mcp.tool()(elements.ss_add_note)
mcp.tool()(elements.ss_remove)
mcp.tool()(elements.ss_modify)

# Smart tools — health & guidance
mcp.tool()(smart.ss_validate_layout)
mcp.tool()(smart.ss_suggest_position)
mcp.tool()(smart.ss_summary)

# Palette / role — cohesive theming
mcp.tool()(palette.ss_list_palettes)
mcp.tool()(palette.ss_set_role)
mcp.tool()(palette.ss_apply_palette)

# Auto-layout — replace manual coordinate planning
mcp.tool()(layout.ss_auto_layout)
mcp.tool()(layout.ss_distribute)
mcp.tool()(layout.ss_align)
mcp.tool()(layout.ss_pack_children)

# Export
mcp.tool()(export.ss_export_plantuml)
