# OpenAI Agents SDK for TypeScript example notes

- Keep this package independently installable with its committed lockfile.
- Use the framework's native MCP adapter and keep it open through tool use, then close it in `finally`.
- `npm test` and `npm run smoke -- --fixture --mode tools|code` use a loopback-only MCP fixture with synthetic data. They do not contact Weavz, connected apps, or a model provider.
- Tool Mode and Code Mode come from the selected MCP server configuration. The fixture `--mode` flag only selects which fixture catalog to test.
- Use a custom MCP endpoint with `WEAVZ_MCP_TOKEN`. Never use a Weavz REST API key (`wvz_...`) as an MCP bearer token.
- The hosted `/mcp/weavz` resource uses OAuth and is not configured with these bearer-token variables.
- Live discovery needs only the MCP URL and token. A live agent run also needs the provider variables in `.env.example`.
