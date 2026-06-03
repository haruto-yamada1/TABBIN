# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# APM

- Verify MCP server names exist in registry before adding to apm.yml by running 'apm mcp search <server-name>'. Confidence: 0.70

# Workflow

- Always run `bun run lint` (oxlint) along with type checks and tests before reporting task completion. Confidence: 0.80

# Code Style

- Always use curly braces after if/else conditions (oxlint curly rule is enforced). Confidence: 0.70
- Prefix unused variables with `_` to satisfy the no-unused-vars lint rule. Confidence: 0.70

# i18n

- When using t() function with placeholders like {{variable}}, always pass values as third parameter: t(key, undefined, { variable: value }). Confidence: 0.70
- Convert numbers to strings with String() when passing to t() function values parameter, as it expects Record<string, string>. Confidence: 0.70
