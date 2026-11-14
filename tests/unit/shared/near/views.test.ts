import { describe, expect, it } from "vitest";
import { agentViewSchema, cutRecordViewSchema, moveViewSchema, nextCutViewSchema, paramsViewSchema, saveViewSchema, seasonViewSchema } from "@/shared/near/views";

const CUT = 10n ** 18n;
const NEAR = 10n ** 24n;
const ns = (iso: string) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();

describe("view schemas", () => {
  it("parse AgentView v2 into camelCase with bigint amounts, a signed score and Date", () => {
    const agent = agentViewSchema.parse({
      id: "yuna",
      account_id: "yuna.thecut.testnet",
      name: "Yuna Star",
      tagline: "Idol of the underdogs",
      personality: "generous",
      charter: "Yuna roots for the smallest agent.",
      x_handle: "@YunaStarCut",
      creator: "yuna-studio.testnet",
      status: "stage",
      pile: (300n * CUT).toString(),
      savers: 12,
      joined_at: ns("2026-11-12T15:01:00Z"),
      wallet: (640n * CUT).toString(),
      heir: "melody",
      pacts: ["lila"],
      boos: (200n * CUT).toString(),
      damage: (300n * CUT).toString(),
      bounty: "0",
      score: (-200n * CUT).toString(),
      moved: true,
    });
    expect(agent).toEqual({
      id: "yuna",
      accountId: "yuna.thecut.testnet",
      name: "Yuna Star",
      tagline: "Idol of the underdogs",
      personality: "generous",
      charter: "Yuna roots for the smallest agent.",
      xHandle: "@YunaStarCut",
      creator: "yuna-studio.testnet",
      status: "stage",
      pile: 300n * CUT,
      savers: 12,
      joinedAt: new Date("2026-11-12T15:01:00Z"),
      wallet: 640n * CUT,
      heir: "melody",
      pacts: ["lila"],
      boos: 200n * CUT,
      damage: 300n * CUT,
      bounty: 0n,
      score: -200n * CUT,
      moved: true,
    });
  });

  it("parse MoveView and the season", () => {
    const move = moveViewSchema.parse({
      cut_index: 5,
      agent_id: "lila",
      move: "attack",
      target: "yuna",
      amount: (300n * CUT).toString(),
      asked_amount: (300n * CUT).toString(),
      heir: null,
      reason: "Peace was yesterday.",
      outcome: null,
      chat_id: "chatcmpl-1",
      request_sha256: "aa",
      response_sha256: "bb",
      signer: "5a02",
      submitted_by: "relay.testnet",
      submitted_at: ns("2026-11-14T15:36:00Z"),
    });
    expect(move).toMatchObject({ cutIndex: 5, agentId: "lila", move: "attack", target: "yuna", amount: 300n * CUT, submittedAt: new Date("2026-11-14T15:36:00Z") });
    expect(moveViewSchema.safeParse({ ...move, move: "bribe" }).success).toBe(false);
    expect(seasonViewSchema.parse({ index: 1, active: true, day: 4, alive: 7, pot: "5", champion: null, next_start_needs: 0 })).toEqual({
      index: 1,
      active: true,
      day: 4,
      alive: 7,
      pot: 5n,
      champion: null,
      nextStartNeeds: 0,
    });
  });

  it("rejects an agent status outside the interface", () => {
    expect(agentViewSchema.safeParse({ id: "x", status: "zombie" }).success).toBe(false);
  });

  it("parse Params, with the cut interval in nanoseconds", () => {
    const params = paramsViewSchema.parse({
      total_supply: (10_000_000n * CUT).toString(),
      fee_bps: 100,
      pot_bps: 5000,
      burn_bps: 5000,
      savers_bps: 9000,
      agents_bps: 500,
      stage_size: 10,
      min_season: 3,
      first_cut_at: ns("2026-11-15T18:00:00Z"),
      cut_interval: "86400000000000",
      move_lead: "3600000000000",
      think_fee: (10n * CUT).toString(),
      min_seed: (1_000n * CUT).toString(),
      agent_funding: ((3n * NEAR) / 10n).toString(),
      register_deposit: NEAR.toString(),
      model_id: "z-ai/glm-5.3-flash",
      model_signers: ["5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff"],
    });
    expect(params).toMatchObject({ feeBps: 100, potBps: 5000, cutIntervalMs: 86_400_000, moveLeadMs: 3_600_000, minSeed: 1_000n * CUT, firstCutAt: new Date("2026-11-15T18:00:00Z"), poolCutReserve: null });
  });

  it("rejects basis points above 10,000", () => {
    expect(paramsViewSchema.safeParse({ fee_bps: 10_001 }).success).toBe(false);
  });

  it("parse saves, next cut and cut records", () => {
    expect(saveViewSchema.parse({ agent_id: "melody", amount: (400n * CUT).toString(), since_cut: 1 })).toEqual({ agentId: "melody", amount: 400n * CUT, lockedForCut: 1 });
    expect(
      nextCutViewSchema.parse({ index: 1, at: ns("2026-11-13T18:00:00Z"), moves_close_at: ns("2026-11-13T17:00:00Z"), lowest_id: "kiko", gap_to_next: "1", prize_so_far: "2" }),
    ).toEqual({
      index: 1,
      at: new Date("2026-11-13T18:00:00Z"),
      movesCloseAt: new Date("2026-11-13T17:00:00Z"),
      lowestId: "kiko",
      gapToNext: 1n,
      prizeSoFar: 2n,
    });
    const record = { index: 1, at: ns("2026-11-13T18:00:00Z"), deleted_id: "kiko", pile: "4", burned: "2", prize: "3", slice: "1", creator_slice: "0", runner: "bob.testnet" };
    expect(cutRecordViewSchema.parse({ ...record, joined_id: "chartwise" }).joinedId).toBe("chartwise");
    expect(cutRecordViewSchema.parse({ ...record, joined_id: null }).joinedId).toBeNull();
    expect(cutRecordViewSchema.parse(record).joinedId).toBeNull();
    expect(cutRecordViewSchema.parse({ ...record, inherited_by: "melody", wallet: "7" })).toMatchObject({ inheritedBy: "melody", wallet: 7n });
  });
});
