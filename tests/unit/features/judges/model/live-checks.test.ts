import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import {
  booksVerdict,
  codeVerdict,
  keysVerdict,
  matchMoveCalls,
  personalitiesVerdict,
  proveMove,
  runLiveChecks,
  seasonVerdict,
  signaturesVerdict,
  statsSchema,
  type ClaimId,
  type ClaimResult,
  type LivePorts,
  type PublishedBuild,
} from "@/features/judges/model/live-checks";
import { moveViewSchema, nextCutViewSchema, seasonViewSchema } from "@/shared/near";
import { sha256Hex } from "@/shared/near/move-signature";
import type { RecentCall } from "@/shared/near/browser-rpc";

const MODEL = "z-ai/glm-5.3-flash";
const secretKey = ed25519.utils.randomSecretKey();
const SIGNER = bytesToHex(ed25519.getPublicKey(secretKey));
const CUT = 10n ** 18n;
const NS = 1_000_000n;
const AT_MS = 1_794_700_000_000;

const REQUEST_SHA = sha256Hex('{"model":"z-ai/glm-5.3-flash"}');
const response = (content: string) => JSON.stringify({ id: "chatcmpl-1", choices: [{ message: { content } }] });

function wireMove(agent: string, overrides: Record<string, unknown> = {}, body = response('{"move":"hold"}')) {
  return {
    cut_index: 2,
    agent_id: agent,
    move: "hold",
    target: null,
    amount: "0",
    asked_amount: "0",
    heir: null,
    reason: `${agent} holds.`,
    outcome: null,
    chat_id: "chatcmpl-1",
    request_sha256: REQUEST_SHA,
    response_sha256: sha256Hex(body),
    signer: SIGNER,
    submitted_by: "relay.testnet",
    submitted_at: String(BigInt(AT_MS) * NS),
    ...overrides,
  };
}

function submitCall(agent: string, body: string, { atMs = AT_MS, signer = SIGNER, key = secretKey, text }: { atMs?: number; signer?: string; key?: Uint8Array; text?: string } = {}): RecentCall {
  const signed = text ?? `${MODEL}:${REQUEST_SHA}:${sha256Hex(body)}`;
  const signature = bytesToHex(ed25519.sign(new TextEncoder().encode(signed), key));
  return { txHash: `tx-${agent}-${atMs}`, signerId: "relay.testnet", method: "submit_move", args: { agent_id: agent, response: body, signature, signer }, blockTimestampNs: BigInt(atMs) * NS };
}

const model = { modelId: MODEL, modelSigners: [SIGNER] };
const move = (agent: string, overrides: Record<string, unknown> = {}, body?: string) => moveViewSchema.parse(wireMove(agent, overrides, body));

describe("keysVerdict", () => {
  it("holds with no key, fails with a full-access key, is amber with only function-call keys", () => {
    expect(keysVerdict("c.testnet", []).tone).toBe("holds");
    expect(keysVerdict("c.testnet", [{ publicKey: "ed25519:a", fullAccess: true }]).tone).toBe("fails");
    expect(keysVerdict("c.testnet", [{ publicKey: "ed25519:a", fullAccess: false }]).tone).toBe("amber");
  });
});

describe("codeVerdict", () => {
  const build: PublishedBuild = { contract: "c.testnet", wasmSha256: "e1", wasmBs58: "GAZh", deployTx: "tx", deleteKeyTx: "tx2" };
  it("compares code_hash with the recorded build of the same contract only", () => {
    expect(codeVerdict("c.testnet", "GAZh", build).tone).toBe("holds");
    expect(codeVerdict("c.testnet", "Other", build).tone).toBe("fails");
    expect(codeVerdict("d.testnet", "GAZh", build).tone).toBe("amber");
    expect(codeVerdict("c.testnet", "GAZh", null).tone).toBe("amber");
  });
});

describe("booksVerdict", () => {
  const wire = {
    minted: String(10_000_000n * CUT),
    burned: String(500n * CUT),
    total_supply: String(9_999_500n * CUT),
    total_saved: String(30n * CUT),
    fees_since_cut: String(2n * CUT),
    season_pot: String(3n * CUT),
    committed: String(4n * CUT),
    prizes_outstanding: String(5n * CUT),
    pool_cut_reserve: String(1_000n * CUT),
    contract_balance: String(1_044n * CUT),
  };
  it("holds when both equations hold to the unit", () => {
    expect(booksVerdict(statsSchema.parse(wire)).tone).toBe("holds");
  });
  it("fails on one unit off", () => {
    expect(booksVerdict(statsSchema.parse({ ...wire, contract_balance: String(1_044n * CUT + 1n) })).tone).toBe("fails");
    expect(booksVerdict(statsSchema.parse({ ...wire, burned: String(501n * CUT) })).tone).toBe("fails");
  });
});

describe("proveMove", () => {
  const body = response('{"move":"hold","reason":"I wait."}');
  const kiko = move("kiko", {}, body);

  it("verifies the response hash, the signer and the Ed25519 signature of the move's transaction", () => {
    const proof = proveMove(kiko, submitCall("kiko", body), model);
    expect(proof).toMatchObject({ ok: true, txHash: `tx-kiko-${AT_MS}` });
  });

  it("refuses a response that is not the recorded one", () => {
    const proof = proveMove(kiko, submitCall("kiko", body.replace("wait", "attack")), model);
    expect(proof.ok).toBe(false);
    expect(proof.note).toContain("sha256(response)");
  });

  it("refuses a signer outside model_signers and a signature by another key", () => {
    const stranger = ed25519.utils.randomSecretKey();
    const strangerKey = bytesToHex(ed25519.getPublicKey(stranger));
    const other = move("kiko", { signer: strangerKey }, body);
    expect(proveMove(other, submitCall("kiko", body, { signer: strangerKey, key: stranger }), model).note).toContain("not in model_signers");
    expect(proveMove(kiko, submitCall("kiko", body, { key: stranger }), model).note).toBe("the Ed25519 signature does not verify");
  });

  it("refuses a signature over another request", () => {
    const call = submitCall("kiko", body, { text: `${MODEL}:${sha256Hex("another request")}:${sha256Hex(body)}` });
    expect(proveMove(kiko, call, model).ok).toBe(false);
  });

  it("says when the transaction was not found", () => {
    expect(proveMove(kiko, null, model)).toMatchObject({ ok: false, txHash: null });
  });
});

describe("matchMoveCalls", () => {
  it("takes the same agent's call closest in time, and nothing a minute away", () => {
    const kiko = move("kiko");
    const yesterday = submitCall("kiko", "x", { atMs: AT_MS - 86_400_000 });
    const today = submitCall("kiko", "y", { atMs: AT_MS + 1_200 });
    const pixie = submitCall("pixie", "z", { atMs: AT_MS });
    expect(matchMoveCalls([kiko], [yesterday, today, pixie]).get(kiko)).toBe(today);
    expect(matchMoveCalls([kiko], [yesterday, pixie]).get(kiko)).toBeNull();
  });
});

describe("signaturesVerdict", () => {
  const ok = { agentId: "a", cutIndex: 2, txHash: "t", ok: true, note: "" };
  it("holds when all verify, is amber when a transaction is missing, fails when one does not verify", () => {
    expect(signaturesVerdict([ok]).tone).toBe("holds");
    expect(signaturesVerdict([ok, { ...ok, txHash: null, ok: false }]).tone).toBe("amber");
    expect(signaturesVerdict([ok, { ...ok, ok: false }]).tone).toBe("fails");
    expect(signaturesVerdict([]).tone).toBe("amber");
  });
});

describe("personalitiesVerdict", () => {
  const table = [
    { id: "miser" as const, spendBps: 500, mayAttack: true, mayAttackPartner: false, promptLine: "" },
    { id: "generous" as const, spendBps: 4_000, mayAttack: false, mayAttackPartner: false, promptLine: "" },
    { id: "traitor" as const, spendBps: 2_000, mayAttack: true, mayAttackPartner: true, promptLine: "" },
  ];
  const personalityOf = new Map([
    ["mabel", "miser"],
    ["yuna", "generous"],
    ["lila", "traitor"],
  ]);
  const brief = {
    cut_index: 2,
    agents: [
      { id: "mabel", personality: "miser", wallet: "1000", pacts: ["lila"] },
      { id: "yuna", personality: "generous", wallet: "1000", pacts: [] },
      { id: "lila", personality: "traitor", wallet: "1000", pacts: ["mabel"] },
    ],
  };
  const thinkFee = 10n * CUT;

  it("holds for moves within their limits", () => {
    const moves = [move("mabel", { move: "rescue", amount: String(49n * CUT), asked_amount: String(1_000n * CUT), outcome: "clamped" }), move("lila", { move: "attack", target: "mabel", amount: String(10n * CUT), asked_amount: String(10n * CUT) })];
    expect(personalitiesVerdict(moves, personalityOf, table, brief, thinkFee).tone).toBe("holds");
  });

  it("fails on a generous attack, a miser over its cap or a non-traitor attacking its partner", () => {
    expect(personalitiesVerdict([move("yuna", { move: "attack", target: "mabel", amount: "1", asked_amount: "1" })], personalityOf, table, brief, thinkFee).tone).toBe("fails");
    expect(personalitiesVerdict([move("mabel", { move: "rescue", amount: String(60n * CUT), asked_amount: String(60n * CUT) })], personalityOf, table, brief, thinkFee).tone).toBe("fails");
    expect(personalitiesVerdict([move("mabel", { move: "attack", target: "lila", amount: String(CUT), asked_amount: String(CUT) })], personalityOf, table, brief, thinkFee).tone).toBe("fails");
  });
});

describe("seasonVerdict", () => {
  const nextCut = nextCutViewSchema.parse({ index: 3, at: String(BigInt(AT_MS) * NS), moves_close_at: String(BigInt(AT_MS - 3_600_000) * NS), lowest_id: "kiko", gap_to_next: "0", prize_so_far: "0" });
  const season = (active: boolean) => seasonViewSchema.parse({ index: 1, active, day: 2, alive: 9, pot: "0", champion: null, next_start_needs: 0 });
  it("holds while a season runs on time, is amber before it starts or when the cut is late", () => {
    expect(seasonVerdict(season(true), nextCut, new Date(AT_MS - 60_000)).tone).toBe("holds");
    expect(seasonVerdict(season(false), nextCut, new Date(AT_MS - 60_000)).tone).toBe("amber");
    expect(seasonVerdict(season(true), nextCut, new Date(AT_MS + 3_600_000)).tone).toBe("amber");
  });
});

describe("runLiveChecks", () => {
  it("reports every claim once, and a failed read as amber", async () => {
    const body = response('{"move":"hold"}');
    const views: Record<string, unknown> = {
      get_params: {
        total_supply: "1",
        fee_bps: 100,
        pot_bps: 5000,
        burn_bps: 5000,
        savers_bps: 9000,
        agents_bps: 500,
        stage_size: 10,
        min_season: 3,
        first_cut_at: "1",
        cut_interval: "86400000000000",
        move_lead: "3600000000000",
        think_fee: String(10n * CUT),
        min_seed: "1",
        agent_funding: "1",
        register_deposit: "1",
        model_id: MODEL,
        model_signers: [SIGNER],
      },
      get_season: { index: 1, active: true, day: 1, alive: 10, pot: "0", champion: null, next_start_needs: 0 },
      get_next_cut: { index: 2, at: String(BigInt(AT_MS + 3_600_000) * NS), moves_close_at: String(BigInt(AT_MS) * NS), lowest_id: "kiko", gap_to_next: "0", prize_so_far: "0" },
      get_moves: [wireMove("kiko", {}, body)],
      get_personalities: [{ id: "gambler", spend_bps: 5000, may_attack: true, may_attack_partner: false, prompt_line: "" }],
      get_stage: [{ id: "kiko", personality: "gambler" }],
      get_brief: null,
    };
    const ports: LivePorts = {
      view: async <T,>(method: string) => {
        if (method === "get_stats") throw new Error("node is down");
        return views[method] as T;
      },
      accessKeys: async () => [],
      codeHash: async () => "GAZh",
      submitMoveCalls: async () => [submitCall("kiko", body)],
    };
    const results = new Map<ClaimId, ClaimResult>();
    await runLiveChecks(ports, { contractId: "c.testnet", build: null, now: () => new Date(AT_MS) }, (id, result) => results.set(id, result));
    expect(Object.fromEntries([...results].map(([id, result]) => [id, result.tone]))).toEqual({
      keys: "holds",
      code: "amber",
      books: "amber",
      moving: "holds",
      signatures: "holds",
      personalities: "holds",
      season: "holds",
    });
  });
});
