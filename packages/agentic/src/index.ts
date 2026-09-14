// `@devframes/agentic` is not imported by users: it carries the MCP
// implementation (and the MCP SDK) that `devframe` loads through its own
// `devframe/adapters/mcp` entry and the `devframe connect` command. Installing
// the package next to devframe is what enables those surfaces; the `/mcp` and
// `/connect` subpaths exist for devframe's loaders.
//
// Importing the bare package is always a mistake, so it throws with a pointer
// at the user-facing API instead of silently resolving to nothing. (devframe's
// probe for this optional peer resolves `package.json`, never this entry.)
throw new Error(
  '[@devframes/agentic] is not imported directly; installing it enables devframe\'s agent surfaces.\n'
  + '  • import from "devframe/adapters/mcp" to serve a devframe over MCP\n'
  + '  • run "devframe connect" for the stdio discovery gateway\n',
)
