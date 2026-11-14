import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { catchUpJournal } from "@/features/indexer/server/catch-up";
import { withIndexerLock } from "@/features/indexer/server/lock";
import type { Database } from "@/shared/db/client";
import { createTestDb, DB_SETUP_TIMEOUT_MS } from "../../helpers/db";
import { MemoryTxSource } from "../../helpers/tx-source";

// Mutual exclusion needs two Postgres sessions, which PGlite (one session) cannot give: these tests
// use the local Postgres (`pnpm db:up`, migrated) and skip when it is not running.
const url = process.env.DATABASE_URL ?? "";

async function reachable(): Promise<boolean> {
  if (!url) return false;
  const probe = postgres(url, { max: 1, connect_timeout: 2, onnotice: () => {} });
  try {
    await probe`select 1 from indexer_cursor limit 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 });
  }
}

const live = await reachable();
const NAME = `journal:lock-test-${process.pid}.testnet`;

describe.skipIf(!live)("withIndexerLock on Postgres", () => {
  let a: ReturnType<typeof postgres>;
  let b: ReturnType<typeof postgres>;
  let dbA: Database;
  let dbB: Database;

  beforeAll(() => {
    a = postgres(url, { max: 2, prepare: false, onnotice: () => {} });
    b = postgres(url, { max: 2, prepare: false, onnotice: () => {} });
    dbA = drizzle(a);
    dbB = drizzle(b);
  });
  afterAll(async () => {
    await Promise.all([a?.end({ timeout: 1 }), b?.end({ timeout: 1 })]);
  });

  /** Holds the lock on `db` until the returned release function is called. */
  async function hold(db: Database) {
    let release!: () => void;
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));
    const done = withIndexerLock(db, NAME, async () => {
      entered();
      await new Promise<void>((resolve) => (release = resolve));
      return "first";
    });
    await inside;
    return { release: () => release(), done };
  }

  it("never lets a second run start while one holds the lock, and frees it when the first ends", async () => {
    const first = await hold(dbA);
    let ran = false;
    expect(
      await withIndexerLock(dbB, NAME, async () => {
        ran = true;
      }),
    ).toEqual({ acquired: false });
    expect(ran).toBe(false);

    first.release();
    expect(await first.done).toEqual({ acquired: true, value: "first" });
    expect(await withIndexerLock(dbB, NAME, async () => "second")).toEqual({ acquired: true, value: "second" });
  });

  it("lets the cron wait for an on-demand run instead of skipping", async () => {
    const first = await hold(dbA);
    const waiting = withIndexerLock(dbB, NAME, async () => "cron", { waitMs: 5_000, retryMs: 50 });
    setTimeout(() => first.release(), 200);
    expect(await waiting).toEqual({ acquired: true, value: "cron" });
  });

  it("gives up after waitMs", async () => {
    const first = await hold(dbA);
    await expect(withIndexerLock(dbB, NAME, async () => "cron", { waitMs: 150, retryMs: 50 })).rejects.toThrow(/still running/);
    first.release();
    await first.done;
  });

  it("releases the lock when the run throws", async () => {
    await expect(withIndexerLock(dbA, NAME, async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    expect(await withIndexerLock(dbB, NAME, async () => "after")).toEqual({ acquired: true, value: "after" });
  });

  it("makes an on-demand catch-up report busy, without calling the source", async () => {
    const first = await hold(dbA);
    const source = new MemoryTxSource();
    const contractId = NAME.slice("journal:".length);
    expect(await catchUpJournal({ db: dbB, source, contractId })).toEqual({ status: "busy" });
    expect(source.requests).toHaveLength(0);
    first.release();
    await first.done;
  });
});

describe("withIndexerLock on PGlite", () => {
  it("runs the work inside the lock's transaction", async () => {
    const t = await createTestDb();
    try {
      expect(await withIndexerLock(t.db, NAME, async () => 42)).toEqual({ acquired: true, value: 42 });
      await expect(withIndexerLock(t.db, NAME, async () => Promise.reject(new Error("rolled back")))).rejects.toThrow("rolled back");
    } finally {
      await t.close();
    }
  }, DB_SETUP_TIMEOUT_MS);
});
