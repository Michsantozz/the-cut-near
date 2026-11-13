import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { indexerCursor } from "@/features/indexer/db/schema";
import { cursorName, runIndexer } from "@/features/indexer/server/run";
import { TxApiError } from "@/features/indexer/server/tx-api";
import { journal } from "@/shared/near/db/schema";
import { listJournal } from "@/shared/near/journal";
import { createTestDb, DB_SETUP_TIMEOUT_MS, type TestDb } from "../../helpers/db";
import { contractTx, event, MemoryTxSource } from "../../helpers/tx-source";

const CONTRACT = "thecut.testnet";
let t: TestDb;
let source: MemoryTxSource;

beforeAll(async () => {
  t = await createTestDb();
}, DB_SETUP_TIMEOUT_MS);
afterAll(() => t.close());
beforeEach(async () => {
  await t.reset();
  source = new MemoryTxSource();
});

const run = (options: { maxPages?: number } = {}) => runIndexer({ db: t.db, source, contractId: CONTRACT, lag: 100, ...options });
const rows = () => t.db.select().from(journal);
const cursor = async () => (await t.db.select().from(indexerCursor))[0]?.nextBlockHeight ?? null;

function seed() {
  source
    .add(1_000, contractTx("T1", 1_000, [event("buy", [{ account_id: "mika.testnet", amount: "554" }])]))
    .add(2_000, contractTx("T2", 2_000, [event("save", [{ account_id: "mika.testnet", robot_id: "melody", amount: "400", cut_index: 1 }])]))
    .add(3_000, contractTx("T3", 3_000, [event("cut", [{ cut_index: 1, robot_id: "kiko", runner: "bob.testnet" }]), event("ft_burn", [{ owner_id: CONTRACT, amount: "11800" }], "nep141")]));
}

describe("runIndexer", () => {
  it("ingests every event from the first transaction up to the safe height", async () => {
    seed();
    const report = await run();
    expect(report).toEqual({ status: "caught_up", from: null, to: 9_900, pages: 1, transactions: 3, events: 4, inserted: 4, nextBlockHeight: 9_901 });
    expect((await rows()).map((r) => r.event).sort()).toEqual(["buy", "cut", "ft_burn", "save"]);
    expect(await cursor()).toBe(9_901);
  });

  it("is idempotent: re-running the same range inserts nothing", async () => {
    seed();
    await run();
    await t.db.delete(indexerCursor);
    const again = await run();
    expect(again).toMatchObject({ status: "caught_up", events: 4, inserted: 0 });
    expect(await rows()).toHaveLength(4);
  });

  it("resumes at the cursor and only reads new blocks", async () => {
    seed();
    await run();
    source.headHeight = 20_000;
    source.add(12_000, contractTx("T4", 12_000, [event("unsave", [{ account_id: "mika.testnet", robot_id: "melody", amount: "400" }])]));
    const report = await run();
    expect(report).toMatchObject({ status: "caught_up", from: 9_901, to: 19_900, transactions: 1, inserted: 1 });
    expect(source.requests.at(-1)).toMatchObject({ from: 9_901, to: 19_900 });
  });

  it("does nothing when the head has not moved past the cursor", async () => {
    seed();
    await run();
    expect(await run()).toEqual({ status: "up_to_date", head: 10_000, nextBlockHeight: 9_901 });
  });

  it("stays behind the head so receipts have executed", async () => {
    source.add(9_950, contractTx("LATE", 9_950, [event("buy", [{ account_id: "x.testnet", amount: "1" }])]));
    await run();
    expect(await rows()).toHaveLength(0);
    source.headHeight = 10_100;
    await run();
    expect(await rows()).toHaveLength(1);
  });

  it("pages, saving progress after each page, and continues next run", async () => {
    source.pageSize = 2;
    for (let i = 1; i <= 5; i++) source.add(i * 100, contractTx(`P${i}`, i * 100, [event("buy", [{ account_id: "x.testnet", amount: String(i) }])]));
    const first = await run({ maxPages: 2 });
    expect(first).toMatchObject({ status: "partial", pages: 2, inserted: 4, nextBlockHeight: 400 });
    expect(await cursor()).toBe(400);
    const second = await run({ maxPages: 2 });
    expect(second).toMatchObject({ status: "caught_up", from: 400, inserted: 1, nextBlockHeight: 9_901 });
    expect(await rows()).toHaveLength(5);
  });

  it("stops without moving the cursor when a listed transaction is not available yet", async () => {
    seed();
    source.unavailable.add("T2");
    await expect(run()).rejects.toBeInstanceOf(TxApiError);
    expect(await cursor()).toBeNull();
    expect(await rows()).toHaveLength(0);
    source.unavailable.clear();
    expect(await run()).toMatchObject({ status: "caught_up", inserted: 4 });
    expect(await rows()).toHaveLength(4);
  });

  it("never moves the cursor backwards", async () => {
    await t.db.insert(indexerCursor).values({ name: cursorName(CONTRACT), nextBlockHeight: 5_000 });
    source.pageSize = 1;
    source.add(5_100, contractTx("A", 5_100, [])).add(5_200, contractTx("B", 5_200, []));
    await run({ maxPages: 1 });
    expect(await cursor()).toBe(5_100);
    await t.db.update(indexerCursor).set({ nextBlockHeight: 9_000 });
    await runIndexer({ db: t.db, source: Object.assign(new MemoryTxSource(), { headHeight: 10_000 }), contractId: CONTRACT, lag: 100 });
    expect(await cursor()).toBe(9_901);
  });

  it("stores what Receipts needs to query", async () => {
    seed();
    await run();
    const mika = await listJournal(t.db, { accountId: "mika.testnet" });
    expect(mika.map((r) => r.event)).toEqual(["save", "buy"]);
    expect(mika[0]).toMatchObject({ robotId: "melody", cutIndex: 1, amount: 400n, txHash: "T2", emitter: CONTRACT, standard: "thecut" });
    const cut = await listJournal(t.db, { cutIndex: 1, events: ["cut"] });
    expect(cut).toHaveLength(1);
    const page = await listJournal(t.db, { limit: 2 });
    const next = await listJournal(t.db, { limit: 2, before: { blockHeight: page[1].blockHeight, id: page[1].id } });
    expect([...page, ...next].map((r) => r.txHash)).toEqual(["T3", "T3", "T2", "T1"]);
  });
});
