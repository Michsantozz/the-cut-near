import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { fastNearTxSource, TxApiError } from "@/features/indexer/server/tx-api";
import { server } from "../../../msw/server";
import { contractTx } from "../../helpers/tx-source";

const BASE = "https://tx.test.example";

describe("fastNearTxSource", () => {
  it("reads the indexed head", async () => {
    server.use(http.post(`${BASE}/v0/blocks`, async ({ request }) => {
      expect(await request.json()).toEqual({ limit: 1, desc: true });
      return HttpResponse.json({ blocks: [{ block_height: 277567046, block_hash: "x" }] });
    }));
    expect(await fastNearTxSource(BASE).head()).toBe(277567046);
  });

  it("lists an account's transactions oldest first, by block range, with the resume token", async () => {
    const bodies: unknown[] = [];
    server.use(http.post(`${BASE}/v0/account`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({ account_txs: [{ account_id: "thecut.testnet", transaction_hash: "H1", tx_block_height: 10, is_success: true }], resume_token: "1192128435690930178", txs_count: 20 });
    }));
    const source = fastNearTxSource(BASE);
    expect(await source.accountTxs({ accountId: "thecut.testnet", from: null, to: 100 })).toEqual({ txs: [{ hash: "H1", blockHeight: 10 }], resumeToken: "1192128435690930178" });
    await source.accountTxs({ accountId: "thecut.testnet", from: 5, to: 100, resumeToken: "abc" });
    expect(bodies).toEqual([
      { account_id: "thecut.testnet", desc: false, limit: 200, to_tx_block_height: 100 },
      { account_id: "thecut.testnet", desc: false, limit: 200, to_tx_block_height: 100, from_tx_block_height: 5, resume_token: "abc" },
    ]);
  });

  it("fetches full transactions and drops unknown hashes", async () => {
    server.use(http.post(`${BASE}/v0/transactions`, () => HttpResponse.json({ transactions: [contractTx("H1", 10, ["log"]), null] })));
    const txs = await fastNearTxSource(BASE).transactions(["H1", "H2"]);
    expect(txs.map((tx) => tx.transaction.hash)).toEqual(["H1"]);
    await expect(fastNearTxSource(BASE).transactions(Array.from({ length: 21 }, (_, i) => `H${i}`))).rejects.toBeInstanceOf(TxApiError);
  });

  it("retries once on 5xx, then fails with TxApiError", async () => {
    let calls = 0;
    server.use(http.post(`${BASE}/v0/blocks`, () => {
      calls++;
      return calls === 1 ? new HttpResponse(null, { status: 502 }) : HttpResponse.json({ blocks: [{ block_height: 5 }] });
    }));
    expect(await fastNearTxSource(BASE).head()).toBe(5);
    server.use(http.post(`${BASE}/v0/blocks`, () => new HttpResponse(null, { status: 503 })));
    await expect(fastNearTxSource(BASE).head()).rejects.toThrow(/HTTP 503/);
  });

  it("fails on an unexpected shape or a client error without retrying", async () => {
    let calls = 0;
    server.use(http.post(`${BASE}/v0/blocks`, () => {
      calls++;
      return HttpResponse.json({ blocks: [] });
    }));
    await expect(fastNearTxSource(BASE).head()).rejects.toBeInstanceOf(TxApiError);
    expect(calls).toBe(1);
    server.use(http.post(`${BASE}/v0/account`, () => new HttpResponse("bad request", { status: 400 })));
    await expect(fastNearTxSource(BASE).accountTxs({ accountId: "x", from: null, to: 1 })).rejects.toThrow(/HTTP 400/);
  });
});
