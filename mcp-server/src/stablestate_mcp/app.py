"""FastMCP application with tool registration."""
from mcp.server.fastmcp import FastMCP
from .tools import diagram, elements, export, smart

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

# Smart tools
mcp.tool()(smart.ss_validate_layout)
mcp.tool()(smart.ss_suggest_position)
mcp.tool()(smart.ss_auto_fix)

# Export
mcp.tool()(export.ss_export_plantuml)
