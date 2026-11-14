import { apiJson, apiPreflight, apiRead, gameJson } from "@/features/agent-api/server";

// GET /api/game: the whole board for outside agents (params, season, stage with score parts, bench, next cut,
// latest moves). Read-only, CORS open, cacheable for a few seconds.

// Reading the request keeps it a request-time handler (never prerendered at build).
export async function GET(request: Request) {
  void request.url;
  return apiRead(async () => apiJson(await gameJson()));
}

export function OPTIONS() {
  return apiPreflight();
}
