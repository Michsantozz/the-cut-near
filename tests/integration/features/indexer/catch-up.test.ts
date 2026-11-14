import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { indexerCursor } from "@/features/indexer/db/schema";
import { CATCH_UP_INTERVAL_MS, catchUpJournal } from "@/features/indexer/server/catch-up";
import { cursorName } from "@/features/indexer/server/run";
import { TxApiError } from "@/features/indexer/server/tx-api";
import { journal } from "@/shared/near/db/schema";
import { createTestDb, DB_SETUP_TIMEOUT_MS, type TestDb } from "../../helpers/db";
import { contractTx, event, MemoryTxSource } from "../../helpers/tx-source";

const CONTRACT = "thecut.testnet";
const T0 = Date.UTC(2026, 10, 14, 20, 0, 0);
let t: TestDb;
let source: MemoryTxSource;
let clock: number;

beforeAll(async () => {
  t = await createTestDb();
}, DB_SETUP_TIMEOUT_MS);
afterAll(() => t.close());
beforeEach(async () => {
  await t.reset();
  source = new MemoryTxSource();
  clock = T0;
});

const catchUp = () => catchUpJournal({ db: t.db, source, contractId: CONTRACT, now: () => clock });
const buy = (hash: string, block: number) => contractTx(hash, block, [event("buy", [{ account_id: "judge.testnet", amount: "1" }])]);
const stampedAt = async () => (await t.db.select().from(indexerCursor))[0]?.updatedAt.getTime() ?? null;
const headCalls = () => {
  let calls = 0;
  const head = source.head.bind(source);
  source.head = async () => {
    calls += 1;
    return head();
  };
  return () => calls;
};

describe("catchUpJournal", () => {
  it("reads up to a few blocks behind the head, one page, and stamps the run", async () => {
    source.add(9_970, buy("JUDGE", 9_970));
    const result = await catchUp();
    expect(result).toMatchObject({ status: "ran", report: { status: "caught_up", to: 9_980, inserted: 1 } });
    expect(await t.db.select().from(journal)).toHaveLength(1);
    expect(await stampedAt()).toBe(T0);
  });

  it("runs at most once per interval, without touching the source in between", async () => {
    source.add(1_000, buy("A", 1_000));
    await catchUp();
    const calls = headCalls();
    source.headHeight = 10_500;
    source.add(10_400, buy("B", 10_400));

    clock = T0 + CATCH_UP_INTERVAL_MS - 1;
    expect(await catchUp()).toEqual({ status: "throttled" });
    expect(calls()).toBe(0);
    expect(await t.db.select().from(journal)).toHaveLength(1);

    clock = T0 + CATCH_UP_INTERVAL_MS;
    expect(await catchUp()).toMatchObject({ status: "ran", report: { inserted: 1 } });
    expect(calls()).toBe(1);
  });

  it("counts any indexer run that moved the cursor, the hourly cron included", async () => {
    await t.db.insert(indexerCursor).values({ name: cursorName(CONTRACT), nextBlockHeight: 9_000, updatedAt: new Date(T0 - 5_000) });
    const calls = headCalls();
    expect(await catchUp()).toEqual({ status: "throttled" });
    expect(calls()).toBe(0);
  });

  it("stamps an up-to-date run too, so a quiet chain is read once per interval", async () => {
    await t.db.insert(indexerCursor).values({ name: cursorName(CONTRACT), nextBlockHeight: 9_990, updatedAt: new Date(T0 - 60_000) });
    expect(await catchUp()).toMatchObject({ status: "ran", report: { status: "up_to_date" } });
    expect(await stampedAt()).toBe(T0);
    clock += 1_000;
    expect(await catchUp()).toEqual({ status: "throttled" });
  });

  it("reports a source failure without throwing, and waits an interval before trying again", async () => {
    await t.db.insert(indexerCursor).values({ name: cursorName(CONTRACT), nextBlockHeight: 5_000, updatedAt: new Date(T0 - 60_000) });
    source.head = async () => {
      throw new TxApiError("/v0/blocks answered HTTP 503");
    };
    expect(await catchUp()).toEqual({ status: "failed", error: "TxApiError: /v0/blocks answered HTTP 503" });
    expect(await stampedAt()).toBe(T0);
    clock += 10_000;
    expect(await catchUp()).toEqual({ status: "throttled" });
  });
});
