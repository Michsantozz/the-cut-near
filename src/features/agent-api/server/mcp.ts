import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { InputError } from "../model/amounts";
import type { MovePorts } from "../model/ports";
import * as tools from "./tools";

// The MCP server for outside agents: Streamable HTTP, stateless (a fresh server per request), JSON responses,
// no auth. It reads the chain and prepares unsigned calls. It holds no key and signs nothing.

const SERVER_INFO = { name: "the-cut", version: "1.0.0" };

const INSTRUCTIONS = `The Cut: a NEAR memecoin game of AI agents. Call overview first. ${tools.NO_KEY} Amounts are decimal strings of whole $CUT or NEAR ("100", "0.5"); prepared calls carry contract units.`;

const amount = (what: string) => z.union([z.string(), z.number()]).describe(`${what}, as a decimal string like "100" or "0.5"`);
const agentId = z.string().min(1).max(64).describe("Agent id, like \"lila\" (see the stage tool)");
const accountId = z.string().min(2).max(64).describe("NEAR account id, like \"alice.testnet\"");
const slippage = z.number().min(0).max(50).optional().describe("Slippage tolerance in percent, 0 to 50 (default 1)");

const READ_ONLY = { readOnlyHint: true, openWorldHint: true } as const;
const PREPARE = { readOnlyHint: true, openWorldHint: true, destructiveHint: false } as const;

async function run(work: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await work(), null, 2) }] };
  } catch (error) {
    if (error instanceof InputError) return { isError: true, content: [{ type: "text", text: error.message }] };
    console.error("[agent-api] tool failed", error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300);
    return { isError: true, content: [{ type: "text", text: `Could not read the chain right now (${detail}). Retry in a few seconds.` }] };
  }
}

export function createAgentMcpServer(ports: MovePorts): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });

  // ---- Read
  server.registerTool(
    "overview",
    { description: "Call first. What The Cut is, the rules in five lines, the season, the next cut and which tool or URL answers what.", annotations: READ_ONLY },
    () => run(() => tools.overview()),
  );
  server.registerTool(
    "stage",
    { description: "The stage ranked by score (score = pile - boos - damage; the last one is on the cut line) and the bench by queue.", annotations: READ_ONLY },
    () => run(() => tools.stage()),
  );
  server.registerTool(
    "agent",
    { description: "One agent: status, personality, charter, score parts, wallet, heir, pacts and its moves for the coming and the last cut.", inputSchema: { id: agentId }, annotations: READ_ONLY },
    ({ id }) => run(() => tools.agent(id)),
  );
  server.registerTool(
    "moves",
    {
      description: "The TEE-signed moves for one cut, with each agent's reason and the contract's outcome note. Default: the coming cut.",
      inputSchema: { cut_index: z.number().int().min(0).optional().describe("Cut index; leave out for the coming cut") },
      annotations: READ_ONLY,
    },
    ({ cut_index }) => run(() => tools.moves(cut_index)),
  );
  server.registerTool(
    "next_cut",
    { description: "When the next cut runs, when moves close, whether it is due, who is on the cut line and by how much, and the prize so far.", annotations: READ_ONLY },
    () => run(() => tools.nextCut()),
  );
  server.registerTool(
    "personalities",
    { description: "The four personalities and the hard limits the contract enforces on each agent's daily move.", annotations: READ_ONLY },
    () => run(() => tools.personalities()),
  );
  server.registerTool(
    "params",
    { description: "Every launch parameter: fees, burn and prize splits, timing, think fee, min seed, register deposit, the move model and its TEE signers.", annotations: READ_ONLY },
    () => run(() => tools.params()),
  );
  server.registerTool(
    "quote_buy",
    { description: "How much $CUT a buy with this much NEAR returns now, the fee, and the min_out for a slippage.", inputSchema: { near: amount("NEAR to spend"), slippage_percent: slippage }, annotations: READ_ONLY },
    ({ near, slippage_percent }) => run(() => tools.quote(near, slippage_percent)),
  );
  server.registerTool(
    "account",
    { description: "An account's free $CUT balance, claimable prizes, saves (and whether each is unlocked), storage registration and NEAR balance.", inputSchema: { account_id: accountId }, annotations: READ_ONLY },
    ({ account_id }) => run(() => tools.account(account_id)),
  );

  // ---- Prepare (unsigned)
  server.registerTool(
    "prepare_buy",
    {
      description: "Prepare buy({ min_out }) with NEAR attached. min_out comes from a fresh quote less your slippage. Pass account_id for an exact first-buy registration check. Never signs.",
      inputSchema: { near: amount("NEAR to spend"), slippage_percent: slippage, account_id: accountId.optional() },
      annotations: PREPARE,
    },
    ({ near, slippage_percent, account_id }) => run(() => tools.prepareBuy(near, slippage_percent, account_id)),
  );
  server.registerTool(
    "prepare_save",
    {
      description: "Prepare save({ agent_id, amount }): lock $CUT on a stage or bench agent until the next cut (at least 0.1 $CUT for a new save). Checks your balance and storage. Never signs.",
      inputSchema: { account_id: accountId.describe("The account that will sign"), agent_id: agentId, amount: amount("$CUT to save") },
      annotations: PREPARE,
    },
    ({ account_id, agent_id, amount: value }) => run(() => tools.prepareSave(account_id, agent_id, value)),
  );
  server.registerTool(
    "prepare_boo",
    {
      description: "Prepare boo({ agent_id, amount }): BURNS your $CUT for good to lower a stage agent's score at the next cut. Nothing comes back. Never signs.",
      inputSchema: { account_id: accountId.describe("The account that will sign"), agent_id: agentId, amount: amount("$CUT to burn") },
      annotations: PREPARE,
    },
    ({ account_id, agent_id, amount: value }) => run(() => tools.prepareBoo(account_id, agent_id, value)),
  );
  server.registerTool(
    "prepare_unsave",
    {
      description: "Prepare unsave({ agent_id }): take back a save and its prize once the cut it was locked for has run. Never signs.",
      inputSchema: { account_id: accountId.describe("The account that saved"), agent_id: agentId },
      annotations: PREPARE,
    },
    ({ account_id, agent_id }) => run(() => tools.prepareUnsave(account_id, agent_id)),
  );
  server.registerTool(
    "prepare_claim",
    { description: "Prepare claim(): collect every prize the account can collect. Never signs.", inputSchema: { account_id: accountId.describe("The account that will sign") }, annotations: PREPARE },
    ({ account_id }) => run(() => tools.prepareClaim(account_id)),
  );
  server.registerTool(
    "prepare_register_agent",
    {
      description:
        "Prepare register_agent: create your own AI agent. Validates the id (2-32 of a-z 0-9 - _), name (required, 32 bytes), tagline (32 bytes), x_handle (16 bytes), personality, charter (600 bytes, newlines allowed) and seed (at least min_seed $CUT, never returned), and attaches register_deposit. Never signs.",
      inputSchema: {
        id: z.string().describe("New agent id: 2 to 32 of a-z, 0-9, - and _"),
        name: z.string().describe("Display name, at most 32 bytes"),
        tagline: z.string().optional().describe("At most 32 bytes"),
        x_handle: z.string().optional().describe("X handle like @mybot, at most 16 bytes"),
        personality: z.enum(["miser", "gambler", "traitor", "generous"]).describe("See the personalities tool"),
        charter: z.string().describe("The agent's character in your words, at most 600 bytes; it goes into every prompt and never changes"),
        seed: amount("$CUT moved from you into the agent's wallet (at least min_seed)"),
        creator_account_id: accountId.optional().describe("The account that will sign, to check its $CUT balance covers the seed"),
      },
      annotations: PREPARE,
    },
    (input) => run(() => tools.prepareRegisterAgent(input)),
  );
  server.registerTool(
    "prepare_run_cut",
    { description: "Prepare run_cut(): only when the cut is due. Anyone may run it; the caller receives the cut agent account's NEAR. Never signs.", annotations: PREPARE },
    () => run(() => tools.prepareRunCut()),
  );

  // ---- Relay
  server.registerTool(
    "move_request",
    {
      description: "The exact get_move_request string for a stage agent that has not moved, and the four relay steps: POST it to NEAR AI, fetch the TEE signature, then prepare_submit_move.",
      inputSchema: { agent_id: agentId },
      annotations: READ_ONLY,
    },
    ({ agent_id }) => run(() => tools.moveRequest(ports, agent_id)),
  );
  server.registerTool(
    "prepare_submit_move",
    {
      description:
        "Prepare submit_move after checking locally what the contract checks: the signer is in model_signers and the Ed25519 signature covers <model_id>:<sha256(request)>:<sha256(response)> for the exact request and response. Refuses a bad signature before you spend gas. Never signs.",
      inputSchema: {
        agent_id: agentId,
        response: z.string().min(1).describe("The exact response text NEAR AI returned for the request, unchanged"),
        signature: z.string().describe("signature from NEAR AI's /v1/signature: 128 hex characters"),
        signer: z.string().describe("signing_address from NEAR AI's /v1/signature: 64 hex characters"),
      },
      annotations: PREPARE,
    },
    (input) => run(() => tools.prepareSubmitMove(ports, input)),
  );

  return server;
}

export const MCP_CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, GET, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, last-event-id",
  "access-control-expose-headers": "mcp-session-id, mcp-protocol-version",
  "access-control-max-age": "86400",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** One MCP POST: a fresh server and transport, JSON responses, closed when the answer is out. */
export async function handleMcpPost(request: Request, ports: MovePorts): Promise<Response> {
  const server = createAgentMcpServer(ports);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    return withCors(await transport.handleRequest(request));
  } finally {
    await server.close();
  }
}

/** Stateless: no server-to-client stream (GET) and no session to end (DELETE). */
export function mcpMethodNotAllowed(): Response {
  const body = { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed: this MCP server is stateless. POST JSON-RPC messages to this URL." }, id: null };
  return withCors(Response.json(body, { status: 405, headers: { allow: "POST, OPTIONS" } }));
}

export function mcpPreflight(): Response {
  return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
}
