import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";
import { moveRequestBody, RULES_PROMPT } from "@/features/moves/model/request";
import { checkMoveSignature, MAX_RESPONSE_BYTES, moveAnswerOf, relayMoves, signedMoveText, type MoveSignature, type RelayPorts } from "@/features/moves/model/relay";

const MODEL = "z-ai/glm-5.3-flash";
const secretKey = ed25519.utils.randomSecretKey();
const SIGNER = bytesToHex(ed25519.getPublicKey(secretKey));

const completion = (content: string, id = "chatcmpl-1") => `${JSON.stringify({ id, choices: [{ index: 0, message: { role: "assistant", content } }] }, null, 2)}\n`;

function signed(requestBody: string, responseBody: string, overrides: Partial<MoveSignature> = {}): MoveSignature {
  const text = signedMoveText(MODEL, requestBody, responseBody);
  return { text, signature: bytesToHex(ed25519.sign(new TextEncoder().encode(text), secretKey)), signing_address: SIGNER, signing_algo: "ed25519", signature_kind: "provider_tee", ...overrides };
}

describe("moveRequestBody", () => {
  const brief = '{"season":1,"agents":[]}';
  const agent = { id: "kiko", name: "Kiko", personality: "traitor" as const, charter: "Trust no one." };

  it("builds the contract's request: fields in order, the brief embedded as stored", () => {
    const body = moveRequestBody({ modelId: MODEL, maxTokens: 1200, reasoningEffort: "low", agent, briefJson: brief });
    const parsed = JSON.parse(body) as { model: string; messages: { role: string; content: string }[]; max_tokens: number; reasoning_effort: string };

    expect(Object.keys(parsed)).toEqual(["model", "messages", "max_tokens", "reasoning_effort"]);
    expect(body.endsWith('],"max_tokens":1200,"reasoning_effort":"low"}')).toBe(true);
    expect(parsed.messages.map((m) => m.role)).toEqual(["system", "user"]);
    // The personality line keeps its own period, with no extra one.
    expect(parsed.messages[0].content).toBe(
      `${RULES_PROMPT}\n\nYou are Kiko (kiko). Personality: traitor - You spend up to 20% a day, and you are the only kind that may attack an agent you have a pact with.\nYour character, in your creator's words:\nTrust no one.`,
    );
    expect(parsed.messages[1].content).toBe(`{"you":"kiko","board":${brief}}`);
  });

  it("leaves reasoning_effort out when the contract has none", () => {
    const body = moveRequestBody({ modelId: MODEL, maxTokens: 600, reasoningEffort: null, agent, briefJson: brief });
    expect(body.endsWith('],"max_tokens":600}')).toBe(true);
    expect(body).not.toContain("reasoning_effort");
  });
});

describe("checkMoveSignature", () => {
  const request = '{"model":"z-ai/glm-5.3-flash"}';
  const response = completion('{"move":"hold"}');
  const check = (signature: MoveSignature, overrides: { responseBody?: string; signers?: string[] } = {}) =>
    checkMoveSignature({ modelId: MODEL, requestBody: request, responseBody: overrides.responseBody ?? response, signature, signers: overrides.signers ?? [SIGNER] });

  it("passes a provider_tee signature over these exact bytes by a listed signer", () => {
    expect(check(signed(request, response))).toEqual({ ok: true, signature: expect.stringMatching(/^[0-9a-f]{128}$/), signer: SIGNER });
  });

  it("normalizes 0x and uppercase hex to what the contract compares", () => {
    const signature = signed(request, response);
    const result = check({ ...signature, signing_address: `0x${SIGNER.toUpperCase()}`, signature: `0x${signature.signature}` }, { signers: [`0x${SIGNER.toUpperCase()}`] });
    expect(result).toEqual({ ok: true, signature: signature.signature, signer: SIGNER });
  });

  it.each([
    ["a gateway signature", signed(request, response, { signature_kind: "gateway" }), /not provider_tee/],
    ["no signature kind", signed(request, response, { signature_kind: undefined }), /missing/],
    ["an ecdsa signature", signed(request, response, { signing_algo: "ecdsa" }), /not ed25519/],
    ["a text over other bytes", signed(request, `${response} `), /signed text/],
    ["a text without the model id", { ...signed(request, response), text: signedMoveText(MODEL, request, response).slice(MODEL.length + 1) }, /signed text/],
    ["a forged signature", { ...signed(request, response), signature: "ab".repeat(64) }, /does not verify/],
    ["a short signature", { ...signed(request, response), signature: "abcd" }, /64 bytes/],
  ])("refuses %s", (_name, signature, reason) => {
    expect(check(signature)).toEqual({ ok: false, reason: expect.stringMatching(reason) });
  });

  it("refuses a signer that is not in model_signers", () => {
    expect(check(signed(request, response), { signers: ["11".repeat(32)] })).toEqual({ ok: false, reason: expect.stringMatching(/not in the contract's model_signers/) });
  });

  it("refuses a response the contract would refuse for its size", () => {
    const big = completion("x".repeat(MAX_RESPONSE_BYTES));
    expect(check(signed(request, big), { responseBody: big })).toEqual({ ok: false, reason: expect.stringMatching(/at most 32768/) });
  });
});

describe("moveAnswerOf", () => {
  it("reads the content from its first { to its last }, like the contract", () => {
    expect(moveAnswerOf(completion('Sure. {"move":"pact","target":"onyx","amount":75,"reason":"Friends {for now}."} Done.'))).toEqual({ move: "pact", target: "onyx", amount: "75", reason: "Friends {for now}." });
  });

  it("is null for an answer the contract records as unreadable", () => {
    expect(moveAnswerOf(completion("I refuse to play."))).toBeNull();
    expect(moveAnswerOf("not json")).toBeNull();
    expect(moveAnswerOf(JSON.stringify({ id: "x", choices: [{ message: { content: null } }] }))).toBeNull();
  });
});

describe("relayMoves", () => {
  const closesAt = new Date("2026-11-15T17:00:00Z");
  const chainNow = new Date("2026-11-15T12:00:00Z");

  function ports(overrides: Partial<RelayPorts> = {}) {
    let inFlight = 0;
    const stats = { maxInFlight: 0, submitted: [] as string[] };
    const p: RelayPorts = {
      window: async () => ({ cutIndex: 4, closesAt, chainNow, modelId: MODEL, signers: [SIGNER] }),
      waitingAgents: async () => ["a", "b", "c", "d"],
      moveRequest: async (id) => `{"agent":"${id}"}`,
      complete: async (body) => completion('{"move":"hold"}', `chat-${body}`),
      signature: async (chatId) => {
        const body = chatId.slice("chat-".length);
        return signed(body, completion('{"move":"hold"}', chatId));
      },
      submit: async (args) => {
        inFlight++;
        stats.maxInFlight = Math.max(stats.maxInFlight, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight--;
        stats.submitted.push(args.agent_id);
        return { status: "success", txHash: `tx-${args.agent_id}` };
      },
      hasMoved: async () => false,
      ...overrides,
    };
    return { ports: p, stats };
  }

  it("works on several agents at once but sends one transaction at a time", async () => {
    const { ports: p, stats } = ports();
    const report = await relayMoves(p, { concurrency: 3, now: () => chainNow });

    expect(report.agents.map((agent) => agent.status)).toEqual(["moved", "moved", "moved", "moved"]);
    expect(stats.submitted.sort()).toEqual(["a", "b", "c", "d"]);
    expect(stats.maxInFlight).toBe(1);
  });

  it("does nothing a few seconds before moves close, by the chain's clock", async () => {
    const { ports: p, stats } = ports({ window: async () => ({ cutIndex: 4, closesAt, chainNow: new Date(closesAt.getTime() - 2_000), modelId: MODEL, signers: [SIGNER] }) });
    // The local clock is hours off; the chain's clock decides.
    const report = await relayMoves(p, { now: () => chainNow });

    expect(report).toMatchObject({ open: false, agents: [] });
    expect(stats.submitted).toEqual([]);
  });

  it("stops submitting when moves close during the run", async () => {
    let now = chainNow.getTime();
    const { ports: p, stats } = ports({
      complete: async (body) => {
        // The model takes five hours: moves close while it thinks.
        now += 5 * 3_600_000;
        return completion('{"move":"hold"}', `chat-${body}`);
      },
    });
    const report = await relayMoves(p, { concurrency: 1, now: () => new Date(now) });

    expect(report.agents.map((agent) => agent.status)).toEqual(["closed", "closed", "closed", "closed"]);
    expect(stats.submitted).toEqual([]);
  });

  it("skips a response over the contract's 32 KB limit before its signature, with no transaction", async () => {
    let signatures = 0;
    const big = completion("x".repeat(MAX_RESPONSE_BYTES), "chat-big");
    const { ports: p, stats } = ports({
      waitingAgents: async () => ["a"],
      complete: async () => big,
      signature: async () => {
        signatures++;
        throw new Error("not reached");
      },
    });
    const [result] = (await relayMoves(p, { now: () => chainNow })).agents;

    expect(result).toEqual({ agentId: "a", status: "too_large", chatId: "chat-big", detail: expect.stringMatching(/at most 32768/) });
    expect(signatures).toBe(0);
    expect(stats.submitted).toEqual([]);
  });

  it("reports a failed submit with the contract's reason when the agent still has no move", async () => {
    const { ports: p } = ports({ waitingAgents: async () => ["a"], submit: async () => ({ status: "failure", txHash: "tx-a", detail: "Smart contract panicked: think fee" }) });
    const [result] = (await relayMoves(p, { now: () => chainNow })).agents;

    expect(result).toMatchObject({ agentId: "a", status: "failed", txHash: "tx-a", detail: expect.stringMatching(/think fee/) });
  });

  it("counts a submit whose answer was lost as moved once the chain shows the move", async () => {
    let moved = false;
    const { ports: p } = ports({
      waitingAgents: async () => ["a"],
      submit: async () => {
        moved = true;
        return { status: "pending", txHash: "tx-a" };
      },
      hasMoved: async () => moved,
    });
    const [result] = (await relayMoves(p, { now: () => chainNow })).agents;

    expect(result).toMatchObject({ status: "moved", txHash: "tx-a" });
  });
});
