import { http, HttpResponse } from "msw";
import { KeyPair } from "near-api-js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as cutRoute } from "@/app/api/cron/cut/route";
import { GET as indexerRoute } from "@/app/api/cron/indexer/route";
import { journal } from "@/shared/near/db/schema";
import { createTestDb, DB_SETUP_TIMEOUT_MS, type TestDb } from "../../../helpers/db";
import { contractTx, event } from "../../../helpers/tx-source";
import { FakeChain } from "../../../../msw/near-rpc";
import { server } from "../../../../msw/server";

const db = vi.hoisted(() => ({ current: null as TestDb | null }));
vi.mock("@/shared/db/client", () => ({
  getDb: () => {
    if (!db.current) throw new Error("test database not ready");
    return db.current.db;
  },
}));

const RPC = "https://rpc.cron.test";
const TX_API = "https://tx.cron.test";
const CONTRACT = "thecut.testnet";
const KEEPER = "keeper.testnet";
const SECRET = "cron-secret-0123456789";
const keeperKey = KeyPair.fromRandom("ed25519");
const CUT_AT = Date.UTC(2026, 10, 13, 18, 0, 0);
const ns = (ms: number) => (BigInt(ms) * 1_000_000n).toString();

let chain: FakeChain;
let cutIndex: number;

beforeAll(async () => {
  db.current = await createTestDb();
}, DB_SETUP_TIMEOUT_MS);
afterAll(() => db.current?.close());

beforeEach(async () => {
  await db.current?.reset();
  for (const [key, value] of Object.entries({
    DATA_SOURCE: "live",
    DATABASE_URL: "postgres://unused:unused@localhost:5432/unused",
    SESSION_SECRET: "s".repeat(32),
    CRON_SECRET: SECRET,
    NEAR_RPC_URL: RPC,
    NEAR_TX_API_URL: TX_API,
    KEEPER_ACCOUNT_ID: KEEPER,
    KEEPER_PRIVATE_KEY: keeperKey.toString(),
  })) vi.stubEnv(key, value);

  cutIndex = 1;
  chain = new FakeChain(CONTRACT);
  chain.block.timestampMs = CUT_AT + 5_000;
  chain.addKey(KEEPER, keeperKey.getPublicKey().toString(), { FunctionCall: { allowance: "250000000000000000000000", receiver_id: CONTRACT, method_names: ["run_cut"] } });
  chain.view("get_next_cut", () => ({
    value: { index: cutIndex, at: ns(CUT_AT + (cutIndex - 1) * 86_400_000), lowest_id: "kiko", gap_to_next: "0", prize_so_far: "0" },
  }));
  chain.onSend = (call) => {
    if (call.methodName !== "run_cut") return { status: "failure", panic: "unexpected method" };
    if (chain.block.timestampMs < CUT_AT + (cutIndex - 1) * 86_400_000) return { status: "failure", panic: "Too early" };
    cutIndex += 1;
    return { status: "success" };
  };
  server.use(
    chain.handler(RPC),
    http.post(`${TX_API}/v0/blocks`, () => HttpResponse.json({ blocks: [{ block_height: 5_000 }] })),
    http.post(`${TX_API}/v0/account`, () => HttpResponse.json({ account_txs: [{ transaction_hash: "TX1", tx_block_height: 1_000 }] })),
    http.post(`${TX_API}/v0/transactions`, () => HttpResponse.json({ transactions: [contractTx("TX1", 1_000, [event("buy", [{ account_id: "mika.testnet", amount: "5" }])])] })),
  );
});
afterEach(() => vi.unstubAllEnvs());

const call = (route: (r: Request) => Promise<Response>, path: string, authorization: string | null = `Bearer ${SECRET}`) =>
  route(new Request(`https://thecut.app${path}`, { headers: authorization ? { authorization } : {} }));

describe("cron endpoints", () => {
  it("refuse calls without the exact bearer secret", async () => {
    for (const authorization of [null, `Bearer ${SECRET}-x`, SECRET, `bearer ${SECRET}`]) {
      expect((await call(cutRoute, "/api/cron/cut", authorization)).status).toBe(401);
      expect((await call(indexerRoute, "/api/cron/indexer", authorization)).status).toBe(401);
    }
    expect(chain.sent).toHaveLength(0);
  });

  it("refuse everything when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call(cutRoute, "/api/cron/cut", "Bearer ")).status).toBe(401);
  });

  it("skip with sample data", async () => {
    vi.stubEnv("DATA_SOURCE", "sample");
    expect(await (await call(cutRoute, "/api/cron/cut")).json()).toMatchObject({ ok: true, result: { skipped: "DATA_SOURCE is not live" } });
  });

  it("run the cut once when due, then are no-ops for the rest of the day", async () => {
    const first = await call(cutRoute, "/api/cron/cut");
    expect(first.status).toBe(200);
    const report = (await first.json()) as { ok: boolean; result: { cut: { status: string; index: number }; journal: { status: string } } };
    expect(report.result.cut).toMatchObject({ status: "ran", index: 1 });
    expect(report.result.journal.status).toBe("caught_up");
    expect(chain.sent).toEqual([expect.objectContaining({ signerId: KEEPER, receiverId: CONTRACT, methodName: "run_cut", deposit: 0n })]);

    const second = await call(cutRoute, "/api/cron/cut");
    expect(((await second.json()) as typeof report).result.cut).toMatchObject({ status: "too_early", index: 2 });
    expect(chain.sent).toHaveLength(1);
  });

  it("do not send before the cut", async () => {
    chain.block.timestampMs = CUT_AT - 3_600_000;
    const report = await (await call(cutRoute, "/api/cron/cut")).json();
    expect(report).toMatchObject({ ok: true, result: { cut: { status: "too_early", index: 1 } } });
    expect(chain.sent).toHaveLength(0);
  });

  it("report already_ran when another runner wins the race", async () => {
    chain.onSend = () => {
      cutIndex += 1;
      return { status: "failure", panic: "Too early" };
    };
    const report = await (await call(cutRoute, "/api/cron/cut")).json();
    expect(report).toMatchObject({ ok: true, result: { cut: { status: "already_ran", index: 1 } } });
  });

  it("fail loudly with a full-access keeper key, before sending anything", async () => {
    chain.addKey(KEEPER, keeperKey.getPublicKey().toString(), "FullAccess");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(cutRoute, "/api/cron/cut");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ ok: false, error: expect.stringContaining("SignerKeyError: Refusing the full-access key") });
    expect(chain.sent).toHaveLength(0);
  });

  it("ingest new events into the journal", async () => {
    const response = await call(indexerRoute, "/api/cron/indexer");
    expect(await response.json()).toMatchObject({ ok: true, result: { status: "caught_up", inserted: 1 } });
    expect(await db.current!.db.select().from(journal)).toHaveLength(1);
  });
});

describe("keeper on mainnet", () => {
  it("refuses to sign unless a human allowed it", async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_NEAR_NETWORK", "mainnet");
    vi.stubEnv("NEXT_PUBLIC_CUT_CONTRACT", "thecut.near");
    const { runCutJob } = await import("@/features/keeper/server");
    await expect(runCutJob()).rejects.toThrow(/KEEPER_ALLOW_MAINNET/);
    expect(chain.calls).toHaveLength(0);
  });
});
