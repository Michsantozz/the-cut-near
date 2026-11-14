import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getCut, getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { getParams, getPool } from "@/entities/market/server";
import { getBench, getAgent, getStage } from "@/entities/agent/server";
import { getSaves } from "@/entities/save/server";
import { insertJournalRows } from "@/shared/near/journal";
import type { NewJournalRow } from "@/shared/near/db/schema";
import { createTestDb, DB_SETUP_TIMEOUT_MS, type TestDb } from "../helpers/db";
import { FakeChain } from "../../msw/near-rpc";
import { server } from "../../msw/server";

const db = vi.hoisted(() => ({ current: null as TestDb | null, broken: false }));
vi.mock("@/shared/db/client", () => ({
  getDb: () => {
    if (db.broken || !db.current) throw new Error("database down");
    return db.current.db;
  },
}));

const RPC = "https://rpc.entities.test";
const CUT = 10n ** 18n;
const ns = (iso: string) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();
const agent = (id: string, pile: bigint, status = "stage") => ({
  id,
  account_id: `${id}.thecut.testnet`,
  name: id,
  kind: "AI agent",
  x_handle: `@${id}`,
  creator: `${id}-studio.testnet`,
  status,
  pile: pile.toString(),
  savers: 2,
  joined_at: ns("2026-11-12T15:01:00Z"),
});

const save = (n: number, agentId: string, amount: bigint, at: Date): NewJournalRow => ({
  receiptId: `R${n}`,
  logIndex: 0,
  itemIndex: 0,
  txHash: `T${n}`,
  blockHeight: 1_000 + n,
  blockTimestamp: at,
  emitter: "thecut.testnet",
  standard: "thecut",
  version: "1.0.0",
  event: "save",
  accountId: "mika.testnet",
  agentId,
  cutIndex: 1,
  amount,
  data: { agent_id: agentId, amount: amount.toString() },
});

beforeAll(async () => {
  db.current = await createTestDb();
}, DB_SETUP_TIMEOUT_MS);
afterAll(() => db.current?.close());

beforeEach(async () => {
  await db.current?.reset();
  db.broken = false;
  vi.stubEnv("DATA_SOURCE", "live");
  vi.stubEnv("DATABASE_URL", "postgres://unused:unused@localhost:5432/unused");
  vi.stubEnv("SESSION_SECRET", "s".repeat(32));
  vi.stubEnv("NEAR_RPC_URL", RPC);
  const chain = new FakeChain("thecut.testnet")
    .view("get_stage", { value: [agent("pixie", 182_400n * CUT), agent("kiko", 23_600n * CUT)] })
    .view("get_bench", { value: [agent("chartwise", 88_400n * CUT, "bench")] })
    .view("get_agent", (args) => ({ value: args.id === "kiko" ? agent("kiko", 23_600n * CUT) : null }))
    .view("get_saves", { value: [{ agent_id: "melody", amount: (400n * CUT).toString(), since_cut: 1 }] })
    .view("get_next_cut", { value: { index: 1, at: ns("2026-11-13T18:00:00Z"), lowest_id: "kiko", gap_to_next: "1", prize_so_far: "2" } })
    .view("get_cut", { value: null })
    .view("get_pool", { value: { near_reserve: "1", cut_reserve: "2", fee_bps: 100 } })
    .view("get_params", { value: { total_supply: "10", fee_bps: 100, burn_bps: 5000, savers_bps: 9500, stage_size: 10, first_cut_at: ns("2026-11-13T18:00:00Z"), cut_interval: "120000000000", agent_funding: "5", register_deposit: "50", pool_cut_reserve: "1", pool_near_reserve: "1" } });
  server.use(chain.handler(RPC));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("entity getters with DATA_SOURCE=live", () => {
  it("read agents from the contract and 'saved today' from the journal", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-13T13:48:00Z"), toFake: ["Date"] });
    await insertJournalRows(db.current!.db, [
      save(1, "kiko", 100n * CUT, new Date("2026-11-13T09:00:00Z")),
      save(2, "kiko", 50n * CUT, new Date("2026-11-13T13:00:00Z")),
      save(3, "kiko", 999n * CUT, new Date("2026-11-12T23:59:59Z")),
    ]);
    const stage = await getStage();
    expect(stage.map((r) => [r.id, r.pile, r.savedToday])).toEqual([
      ["pixie", 182_400n * CUT, 0n],
      ["kiko", 23_600n * CUT, 150n * CUT],
    ]);
    expect(stage[1]).toMatchObject({ accountId: "kiko.thecut.testnet", status: "stage", joinedAt: new Date("2026-11-12T15:01:00Z") });
    expect((await getBench())[0]).toMatchObject({ id: "chartwise", status: "bench" });
    expect((await getAgent("kiko"))?.savedToday).toBe(150n * CUT);
    expect(await getAgent("ghost")).toBeNull();
  });

  it("still serve agents when the journal is down", async () => {
    db.broken = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await getStage()).every((r) => r.savedToday === 0n)).toBe(true);
  });

  it("read cuts, saves, params and pool from the contract", async () => {
    expect(await getNextCut()).toEqual({ index: 1, at: new Date("2026-11-13T18:00:00Z"), lowestId: "kiko", gapToNext: 1n, prizeSoFar: 2n });
    expect(await getCut(1)).toBeNull();
    expect(await getSaves("mika.testnet")).toEqual([{ accountId: "mika.testnet", agentId: "melody", amount: 400n * CUT, lockedForCut: 1 }]);
    const params = await getParams();
    expect(params).toMatchObject({ cutIntervalMs: 120_000, stageSize: 10 });
    expect(params).not.toHaveProperty("poolCutReserve");
    expect(await getPool()).toEqual({ nearReserve: 1n, cutReserve: 2n, feeBps: 100 });
  });

  it("page through the journal newest first", async () => {
    await insertJournalRows(db.current!.db, [1, 2, 3].map((n) => save(n, "kiko", BigInt(n), new Date(Date.UTC(2026, 10, 13, n)))));
    const first = await getJournal({ limit: 2 });
    expect(first.entries.map((e) => e.txHash)).toEqual(["T3", "T2"]);
    expect(first.entries[0]).toMatchObject({ id: "R3:0:0", event: "save", agentId: "kiko", amount: 3n, at: new Date(Date.UTC(2026, 10, 13, 3)) });
    const second = await getJournal({ limit: 2, before: first.next ?? undefined });
    expect(second.entries.map((e) => e.txHash)).toEqual(["T1"]);
    expect(second.next).toBeNull();
  });
});
