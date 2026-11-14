import "server-only";

// Server API of the agent API: the read-only JSON endpoints and the MCP server for outside AI agents.
// It reads the chain and prepares unsigned calls. It holds no key and signs nothing.
export { agentDetailJson, gameJson, movesJson } from "./api";
export { apiError, apiJson, apiPreflight, apiRead } from "./http";
