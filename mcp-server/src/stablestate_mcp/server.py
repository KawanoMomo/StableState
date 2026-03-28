"""StableState MCP Server entry point."""
from .app import mcp


def main():
    mcp.run()


if __name__ == "__main__":
    main()
