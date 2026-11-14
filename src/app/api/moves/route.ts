import { apiError, apiJson, apiPreflight, apiRead, movesJson } from "@/features/agent-api/server";

// GET /api/moves?cut=N: the signed moves for cut N (default: the coming cut). Read-only, CORS open.

export async function GET(request: Request) {
  const cut = new URL(request.url).searchParams.get("cut");
  if (cut !== null && !/^\d{1,9}$/.test(cut)) return apiError(400, "invalid_cut", "cut must be a cut index: a whole number like 5. Leave it out for the coming cut.");
  return apiRead(async () => apiJson(await movesJson(cut === null ? null : Number(cut))));
}

export function OPTIONS() {
  return apiPreflight();
}
