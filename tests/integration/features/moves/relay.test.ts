import { KeyPair } from "near-api-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as movesRoute } from "@/app/api/cron/moves/route";
import { moveRequestBody } from "@/features/moves/model/request";
import { relayMovesJob } from "@/features/moves/server";
import { fakeMoveCloud, type FakeMoveCloudOptions } from "../../../msw/near-ai-moves";
import { FakeChain } from "../../../msw/near-rpc";
import { server } from "../../../msw/server";

const RPC = "https://rpc.moves.test";
const CONTRACT = "thecut.testnet";
const KEEPER = "keeper.testnet";
const SECRET = "cron-secret-0123456789";
const keeperKey = KeyPair.fromRandom("ed25519");
const CUT_AT = Date.UTC(2026, 10, 15, 18, 0, 0);
const CLOSES_AT = CUT_AT - 3_600_000;
const ns = (ms: number) => (BigInt(ms) * 1_000_000n).toString();
const BRIEF = '{"season":1,"day":3,"cut_index":4,"agents":[{"id":"kiko","name":"Kiko","personality":"traitor","pile":"4100","wallet":"860"}],"last_cut":null,"last_moves":[]}';

const requestFor = (id: string, charter = `I am ${id}.`) =>
  moveRequestBody({ modelId: "z-ai/glm-5.3-flash", maxTokens: 1200, reasoningEffort: "low", agent: { id, name: id.toUpperCase(), personality: "traitor", charter }, briefJson: BRIEF });

let chain: FakeChain;
let moved: Set<string>;
let requests: Map<string, string>;

function setup(cloudOptions: FakeMoveCloudOptions = {}) {
  const cloud = fakeMoveCloud(cloudOptions);
  chain.view("get_params", { value: { model_id: cloud.model, model_signers: [cloud.signer], max_tokens: 1200, reasoning_effort: "low", move_lead: "3600000000000" } });
  server.use(chain.handler(RPC), ...cloud.handlers);
  return cloud;
}

beforeEach(() => {
  for (const [key, value] of Object.entries({
    DATA_SOURCE: "live",
    DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
    SESSION_SECRET: "s".repeat(32),
    CRON_SECRET: SECRET,
    NEAR_RPC_URL: RPC,
    KEEPER_ACCOUNT_ID: KEEPER,
    KEEPER_PRIVATE_KEY: keeperKey.toString(),
    NEAR_AI_API_KEY: "test-key",
    NEAR_AI_MAX_RETRIES: "0",
  })) vi.stubEnv(key, value);

  moved = new Set(["onyx"]);
  requests = new Map(["kiko", "pixie", "onyx"].map((id) => [id, requestFor(id)]));
  chain = new FakeChain(CONTRACT);
  chain.block.timestampMs = CLOSES_AT - 5 * 3_600_000;
  chain.addKey(KEEPER, keeperKey.getPublicKey().toString(), { FunctionCall: { allowance: "250000000000000000000000", receiver_id: CONTRACT, method_names: ["run_cut", "submit_move"] } });
  chain.view("get_next_cut", () => ({ value: { index: 4, at: ns(CUT_AT), moves_close_at: ns(CLOSES_AT), lowest_id: "pixie", gap_to_next: "0", prize_so_far: "0" } }));
  chain.view("get_stage", () => ({ value: ["kiko", "pixie", "onyx"].map((id) => ({ id, moved: moved.has(id) })) }));
  chain.view("get_agent", (args) => ({ value: { id: args.id, moved: moved.has(String(args.id)) } }));
  chain.view("get_move_request", (args) => ({ value: moved.has(String(args.agent_id)) ? null : (requests.get(String(args.agent_id)) ?? null) }));
  chain.onSend = (call) => {
    const { agent_id } = call.args as { agent_id: string };
    if (call.methodName !== "submit_move") return { status: "failure", panic: "unexpected method" };
    if (moved.has(agent_id)) return { status: "failure", panic: "already moved this cut" };
    moved.add(agent_id);
    return { status: "success" };
  };
});
afterEach(() => vi.unstubAllEnvs());

const byAgent = (report: Awaited<ReturnType<typeof relayMovesJob>>) => Object.fromEntries(report.agents.map((agent) => [agent.agentId, agent]));

describe("relayMovesJob", () => {
  it("relays one signed move per waiting agent and skips agents that moved", async () => {
    const cloud = setup({ content: (body) => (body.includes("KIKO") ? 'Here: {"move":"attack","target":"pixie","amount":"120","heir":null,"reason":"Pixie had it coming."}' : JSON.stringify({ move: "hold", target: null, amount: "0", heir: null, reason: "Not today." })) });
    const report = await relayMovesJob();

    expect(report).toMatchObject({ cutIndex: 4, open: true, closesAt: new Date(CLOSES_AT).toISOString() });
    const agents = byAgent(report);
    expect(Object.keys(agents).sort()).toEqual(["kiko", "pixie"]);
    expect(agents.kiko).toMatchObject({ status: "moved", answer: { move: "attack", target: "pixie", amount: "120", reason: "Pixie had it coming." } });
    expect(agents.pixie).toMatchObject({ status: "moved", answer: { move: "hold" } });
    expect(cloud.calls.chat).toBe(2);

    expect(chain.sent.map((call) => call.methodName)).toEqual(["submit_move", "submit_move"]);
    for (const call of chain.sent) {
      const args = call.args as { agent_id: string; response: string; signature: string; signer: string };
      expect(call).toMatchObject({ signerId: KEEPER, receiverId: CONTRACT, deposit: 0n });
      expect(Object.keys(args).sort()).toEqual(["agent_id", "response", "signature", "signer"]);
      // The response goes on chain exactly as NEAR AI sent it, and the signer as lowercase hex without 0x.
      const chat = [...cloud.chats.values()].find((c) => c.request === requests.get(args.agent_id));
      expect(args.response).toBe(chat?.response);
      expect(args.signer).toBe(cloud.signer);
      expect(args.signature).toMatch(/^[0-9a-f]{128}$/);
    }
  });

  it("posts the view's string byte for byte, with the signature headers", async () => {
    // Escapes and spacing that a parse-and-stringify round trip would change.
    const odd = requestFor("kiko", 'Café \u{1F680} "quoted" \\ </tags>\ttab\nnew line').replace('"max_tokens":1200', '"max_tokens": 1200').replace("Café", "Caf\\u00e9");
    expect(JSON.stringify(JSON.parse(odd))).not.toBe(odd);
    requests.set("kiko", odd);
    requests.delete("pixie");
    const cloud = setup();

    const report = await relayMovesJob();

    expect(byAgent(report).kiko.status).toBe("moved");
    expect(byAgent(report).pixie.status).toBe("no_request");
    expect(cloud.posted).toHaveLength(1);
    const [{ bytes, headers }] = cloud.posted;
    expect(bytes).toEqual(new TextEncoder().encode(odd));
    expect(headers.get("x-no-aliasing")).toBe("true");
    expect(headers.get("accept-encoding")).toBe("identity");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("authorization")).toBe("Bearer test-key");
  });

  it.each([
    ["the signed text does not match the bytes", { tamper: true }, /signed text/],
    ["the signer is not in model_signers", { rogue: true }, /not in the contract's model_signers/],
    ["the gateway signed instead of the model TEE", { signatureKind: "gateway" }, /not provider_tee/],
  ] as const)("refuses before submitting when %s", async (_name, options, reason) => {
    setup(options);
    const report = await relayMovesJob();

    for (const agent of report.agents) expect(agent).toMatchObject({ status: "refused", detail: expect.stringMatching(reason) });
    expect(chain.sent).toEqual([]);
  });

  it("treats an agent another relayer moved first as done, before or after sending", async () => {
    // pixie: someone moves it while the model is thinking, so nothing is sent.
    // kiko: someone moves it between our check and our transaction, so the contract refuses ours.
    let checks = 0;
    chain.view("get_agent", (args) => {
      const id = String(args.id);
      if (id === "kiko" && checks++ === 0) return { value: { id, moved: false } };
      return { value: { id, moved: moved.has(id) } };
    });
    setup({
      onCompletion: (body) => {
        if (body.includes("PIXIE")) moved.add("pixie");
        if (body.includes("KIKO")) moved.add("kiko");
      },
    });
    const report = await relayMovesJob({ concurrency: 1 });

    expect(byAgent(report).pixie.status).toBe("already_moved");
    expect(byAgent(report).kiko.status).toBe("already_moved");
    expect(chain.sent.map((call) => (call.args as { agent_id: string }).agent_id)).toEqual(["kiko"]);
  });

  it("lets agents hold when NEAR AI is down", async () => {
    const cloud = setup({ down: true });
    const report = await relayMovesJob();

    expect(report.agents.map((agent) => agent.status)).toEqual(["ai_unavailable", "ai_unavailable"]);
    expect(report.agents[0].detail).toMatch(/503/);
    expect(cloud.calls.signature).toBe(0);
    expect(chain.sent).toEqual([]);
  });

  it("does nothing once moves are closed", async () => {
    chain.block.timestampMs = CLOSES_AT + 1_000;
    const cloud = setup();
    const report = await relayMovesJob();

    expect(report).toMatchObject({ open: false, agents: [] });
    expect(cloud.calls.chat).toBe(0);
    expect(chain.sent).toEqual([]);
  });

  it("refuses a key that cannot call submit_move", async () => {
    chain.addKey(KEEPER, keeperKey.getPublicKey().toString(), { FunctionCall: { allowance: null, receiver_id: CONTRACT, method_names: ["run_cut"] } });
    setup();
    await expect(relayMovesJob()).rejects.toThrow(/submit_move/);
  });
});

describe("/api/cron/moves", () => {
  const call = (authorization: string | null) => movesRoute(new Request("https://thecut.app/api/cron/moves", { headers: authorization ? { authorization } : {} }));

  it("needs the bearer secret", async () => {
    setup();
    expect((await call(null)).status).toBe(401);
    expect((await call(`Bearer ${SECRET}-x`)).status).toBe(401);
    expect(chain.calls).toEqual([]);
  });

  it("reports each agent", async () => {
    setup();
    const response = await call(`Bearer ${SECRET}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; result: { agents: { agentId: string; status: string }[] } };
    expect(body.ok).toBe(true);
    expect(body.result.agents.map((agent) => [agent.agentId, agent.status])).toEqual([
      ["kiko", "moved"],
      ["pixie", "moved"],
    ]);
  });
});
