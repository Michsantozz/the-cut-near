import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, OPTIONS, POST } from "@/app/api/mcp/route";

// The MCP server over Streamable HTTP in sample mode: real JSON-RPC requests through the route handler.

// Noon UTC: the sample world's moves are open (they close at 17:00 UTC).
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  vi.stubEnv("DATA_SOURCE", "sample");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

let nextId = 1;

async function rpc(method: string, params: Record<string, unknown> = {}) {
  const response = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18" },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  return response.json();
}

type ToolResult = { isError?: boolean; content: { type: string; text: string }[] };

async function callTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const body = await rpc("tools/call", { name, arguments: args });
  expect(body.error).toBeUndefined();
  return body.result;
}

const json = (result: ToolResult) => JSON.parse(result.content[0].text);

describe("MCP /api/mcp", () => {
  it("initializes statelessly with instructions", async () => {
    const body = await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    expect(body.result.serverInfo.name).toBe("the-cut");
    expect(body.result.capabilities.tools).toBeDefined();
    expect(body.result.instructions).toContain("signs nothing");
  });

  it("lists every tool with a description and an input schema", async () => {
    const { result } = await rpc("tools/list");
    const names = result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual([
      "overview",
      "stage",
      "agent",
      "moves",
      "next_cut",
      "personalities",
      "params",
      "quote_buy",
      "account",
      "prepare_buy",
      "prepare_save",
      "prepare_boo",
      "prepare_unsave",
      "prepare_claim",
      "prepare_register_agent",
      "prepare_run_cut",
      "move_request",
      "prepare_submit_move",
    ]);
    for (const tool of result.tools) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("overview: the rules, the season and the next cut, from sample data", async () => {
    const overview = json(await callTool("overview"));
    expect(overview.source).toBe("sample");
    expect(overview.rules).toHaveLength(5);
    expect(overview.season.index).toBe(1);
    expect(overview.next_cut).toMatchObject({ index: 5, lowest_id: "yuna", moves_open: true });
    expect(overview.keys).toContain("holds no key");
  });

  it("prepare_save: exact units from decimal $CUT, a storage top-up, never signed", async () => {
    const call = json(await callTool("prepare_save", { account_id: "mika.near", agent_id: "lila", amount: "100.5" }));
    expect(call).toMatchObject({
      source: "sample",
      method_name: "save",
      args: { agent_id: "lila", amount: "100500000000000000000" },
      deposit: "5000000000000000000000",
      gas: "100000000000000",
    });
    expect(call.receiver_id).toMatch(/\./);
    expect(call.explain).toContain("100.5 $CUT");
  });

  it("prepare_save: refuses more than the balance and a bad amount, saying what to do", async () => {
    const tooMuch = await callTool("prepare_save", { account_id: "mika.near", agent_id: "lila", amount: "5000" });
    expect(tooMuch.isError).toBe(true);
    expect(tooMuch.content[0].text).toContain("prepare_buy");
    const bad = await callTool("prepare_save", { account_id: "mika.near", agent_id: "lila", amount: "1e3" });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain("decimal string");
  });

  it("prepare_register_agent: validates the id, the texts and the seed", async () => {
    const bad = await callTool("prepare_register_agent", { id: "Bad Id", name: "", personality: "miser", charter: "I hoard.", seed: "1000" });
    expect(bad.isError).toBe(true);
    expect(bad.content[0].text).toContain("Agent id may use only a-z, 0-9, - and _");
    expect(bad.content[0].text).toContain("name cannot be empty");
    const small = await callTool("prepare_register_agent", { id: "newbie", name: "Newbie", personality: "miser", charter: "I hoard.", seed: "999.9" });
    expect(small.isError).toBe(true);
    expect(small.content[0].text).toContain("at least 1000 $CUT");
    const ok = json(await callTool("prepare_register_agent", { id: "newbie", name: "Newbie", personality: "gambler", charter: "Line one.\nLine two.", seed: "1500" }));
    expect(ok).toMatchObject({
      method_name: "register_agent",
      deposit: "1000000000000000000000000",
      args: { id: "newbie", personality: "gambler", seed: "1500000000000000000000", tagline: "", x_handle: "" },
    });
    expect(BigInt(ok.gas)).toBeGreaterThanOrEqual(50_000_000_000_000n);
  });

  it("move_request returns the exact request; prepare_submit_move refuses a bad signature", async () => {
    const request = json(await callTool("move_request", { agent_id: "pixie" }));
    expect(JSON.parse(request.request).model).toBe("z-ai/glm-5.3-flash");
    expect(request.steps).toHaveLength(4);
    const response = JSON.stringify({ id: "chat-1", choices: [{ message: { content: '{"move":"hold","target":null,"amount":"0","heir":null,"reason":"Wait."}' } }] });
    const forged = await callTool("prepare_submit_move", {
      agent_id: "pixie",
      response,
      signature: "ab".repeat(64),
      signer: "5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff",
    });
    expect(forged.isError).toBe(true);
    expect(forged.content[0].text).toContain("The Ed25519 signature does not verify.");
    const stranger = await callTool("prepare_submit_move", { agent_id: "pixie", response, signature: "ab".repeat(64), signer: "cd".repeat(32) });
    expect(stranger.content[0].text).toContain("not in the contract's model_signers");
    const moved = await callTool("move_request", { agent_id: "lila" });
    expect(moved.isError).toBe(true);
    expect(moved.content[0].text).toContain("already moved");
  });

  it("prepare_run_cut refuses before the cut is due", async () => {
    const early = await callTool("prepare_run_cut");
    expect(early.isError).toBe(true);
    expect(early.content[0].text).toContain("not due yet");
  });

  it("is stateless: GET is 405 and the preflight is open", async () => {
    expect(GET().status).toBe(405);
    expect(OPTIONS().headers.get("access-control-allow-origin")).toBe("*");
  });
});
