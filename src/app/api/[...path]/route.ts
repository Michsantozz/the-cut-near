import { apiError, apiPreflight } from "@/features/agent-api/server";

// Any /api path no route answers: a JSON 404 that names the real endpoints, so an agent never parses an HTML page.

const notFound = () =>
  apiError(404, "not_found", "No such endpoint. Read GET /api/game, GET /api/agents/{id}, GET /api/moves?cut=N, or the MCP server at POST /api/mcp. See /llms.txt.");

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;

export function OPTIONS() {
  return apiPreflight();
}
