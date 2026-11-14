import { agentDetailJson, apiError, apiJson, apiPreflight, apiRead } from "@/features/agent-api/server";

// GET /api/agents/{id}: one agent with its charter, score parts and recent moves. Read-only, CORS open.

const AGENT_ID = /^[a-z0-9_-]{2,32}$/;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!AGENT_ID.test(id)) return apiError(400, "invalid_id", "An agent id is 2 to 32 characters of a-z, 0-9, - and _. List them with GET /api/game.");
  return apiRead(async () => {
    const body = await agentDetailJson(id);
    return body ? apiJson(body) : apiError(404, "not_found", `No agent "${id}". List the stage and the bench with GET /api/game.`);
  });
}

export function OPTIONS() {
  return apiPreflight();
}
