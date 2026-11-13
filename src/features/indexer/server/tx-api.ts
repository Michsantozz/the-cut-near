import "server-only";
import type { z } from "zod";
import { accountTxsSchema, headSchema, transactionsSchema, type TxApiTransaction } from "../model/transactions";

/** The event source failed or answered outside its documented shape. */
export class TxApiError extends Error {
  override readonly name = "TxApiError";
}

export type AccountTxsPage = { txs: { hash: string; blockHeight: number }[]; resumeToken: string | null };

/** The indexer's view of a transaction history source. */
export type TxSource = {
  /** Highest block height the source has indexed. */
  head(): Promise<number>;
  /** Transactions involving `accountId` with tx_block_height in [from, to], oldest first. */
  accountTxs(params: { accountId: string; from: number | null; to: number; resumeToken?: string; limit?: number }): Promise<AccountTxsPage>;
  /** Full transactions with receipts and execution outcomes (logs). Up to 20 hashes. */
  transactions(hashes: readonly string[]): Promise<TxApiTransaction[]>;
};

export const MAX_HASHES_PER_REQUEST = 20;

/**
 * FastNEAR Transactions API (free, no key; docs at the base URL, source github.com/fastnear/explorer-api).
 * Chosen over the alternatives in docs.near.org/data-infrastructure: Pikespeak needs an API key and
 * the docs use NearBlocks with one too, NEAR Lake needs AWS requester-pays S3 and a long-running
 * process, and scanning every block through RPC is thousands of requests per run. This API lists an
 * account's transactions by block range (cursor-friendly) and returns full receipt outcomes with logs.
 */
export function fastNearTxSource(baseUrl: string, { timeoutMs = 15_000 }: { timeoutMs?: number } = {}): TxSource {
  const post = async <T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> => {
    let lastError: unknown;
    // One retry for the transient cases (network, 429, 5xx); anything else fails the run.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(`${baseUrl}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status === 429 || response.status >= 500) throw new TxApiError(`${path} answered HTTP ${response.status}`);
        if (!response.ok) throw new TxApiError(`${path} answered HTTP ${response.status}: ${(await response.text()).slice(0, 200)}`);
        const parsed = schema.safeParse(await response.json());
        if (!parsed.success) throw new TxApiError(`${path} answered an unexpected shape: ${parsed.error.issues[0]?.message ?? "invalid"}`);
        return parsed.data;
      } catch (error) {
        lastError = error;
        const retryable = !(error instanceof TxApiError) || /HTTP (429|5\d\d)/.test(error.message);
        if (!retryable || attempt === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
    throw lastError instanceof TxApiError ? lastError : new TxApiError(`${path} failed: ${String(lastError)}`, { cause: lastError });
  };

  return {
    async head() {
      const { blocks } = await post("/v0/blocks", { limit: 1, desc: true }, headSchema);
      return blocks[0].block_height;
    },
    async accountTxs({ accountId, from, to, resumeToken, limit = 200 }) {
      const body = {
        account_id: accountId,
        desc: false,
        limit,
        to_tx_block_height: to,
        ...(from !== null ? { from_tx_block_height: from } : {}),
        ...(resumeToken ? { resume_token: resumeToken } : {}),
      };
      const page = await post("/v0/account", body, accountTxsSchema);
      return {
        txs: page.account_txs.map((tx) => ({ hash: tx.transaction_hash, blockHeight: tx.tx_block_height })),
        resumeToken: page.resume_token ?? null,
      };
    },
    async transactions(hashes) {
      if (hashes.length === 0) return [];
      if (hashes.length > MAX_HASHES_PER_REQUEST) throw new TxApiError(`At most ${MAX_HASHES_PER_REQUEST} hashes per request.`);
      const { transactions } = await post("/v0/transactions", { tx_hashes: hashes }, transactionsSchema);
      return transactions.filter((tx): tx is TxApiTransaction => tx !== null);
    },
  };
}
