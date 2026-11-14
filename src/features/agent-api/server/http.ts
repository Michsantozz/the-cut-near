import "server-only";

import { sourceInfo } from "./read";

// HTTP plumbing shared by the JSON API routes: open CORS, a few seconds of shared caching, readable errors.

export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
  "access-control-max-age": "86400",
};

/** Browsers and CDNs may reuse an answer for 5 seconds, and serve it stale for 25 more while refreshing. */
export const CACHE_HEADER = "public, max-age=5, s-maxage=5, stale-while-revalidate=25";

export function apiJson(body: unknown, status = 200): Response {
  const headers = { ...CORS_HEADERS, "cache-control": status === 200 ? CACHE_HEADER : "no-store" };
  return Response.json(body, { status, headers });
}

export function apiPreflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function apiError(status: number, error: string, message: string): Response {
  return apiJson({ ...sourceInfo(), error, message }, status);
}

/** Runs a read; a chain or config failure becomes a 503 that says to retry, never a stack trace. */
export async function apiRead(read: () => Promise<Response>): Promise<Response> {
  try {
    return await read();
  } catch (error) {
    console.error("[agent-api] read failed", error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    return apiError(503, "unavailable", `Could not read the game right now (${detail}). Retry in a few seconds.`);
  }
}
