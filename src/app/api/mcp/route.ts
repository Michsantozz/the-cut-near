import { handleMcpPost, mcpMethodNotAllowed, mcpPreflight, type MovePorts } from "@/features/agent-api/server";
import { checkMoveSignature, sha256Hex, signedMoveText } from "@/features/moves/model/relay";
import { moveRequestBody } from "@/features/moves/model/request";

// POST /api/mcp: the MCP server for outside AI agents (Streamable HTTP, stateless, no auth). It reads the chain
// and prepares unsigned calls. It holds no key and signs nothing. The move relay's template and checks come from
// the moves feature, composed here because features never import each other.

const movePorts: MovePorts = { check: checkMoveSignature, signedText: signedMoveText, sha256Hex, requestBody: moveRequestBody };

export async function POST(request: Request) {
  return handleMcpPost(request, movePorts);
}

export function GET() {
  return mcpMethodNotAllowed();
}

export function DELETE() {
  return mcpMethodNotAllowed();
}

export function OPTIONS() {
  return mcpPreflight();
}
