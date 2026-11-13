import type { TxApiTransaction } from "@/features/indexer/model/transactions";
import type { TxSource } from "@/features/indexer/server/tx-api";

export const event = (name: string, data: unknown, standard = "thecut") => `EVENT_JSON:${JSON.stringify({ standard, version: "1.0.0", event: name, data })}`;

/** A transaction whose single receipt ran on `executor` with `logs`. */
export function contractTx(hash: string, blockHeight: number, logs: string[], { executor = "thecut.testnet", timestampMs = Date.UTC(2026, 10, 13, 12) } = {}): TxApiTransaction {
  const outcome = (id: string, executor_id: string, entries: string[], status: object) => ({
    id,
    block_height: blockHeight + 1,
    block_timestamp: timestampMs * 1e6,
    outcome: { logs: entries, executor_id, status },
  });
  return {
    transaction: { hash },
    execution_outcome: outcome(hash, "mika.testnet", [], { SuccessReceiptId: `${hash}-r` }),
    receipts: [{ execution_outcome: outcome(`${hash}-r`, executor, logs, { SuccessValue: "" }) }],
  };
}

/** An in-memory transaction history with the same paging contract as the FastNEAR API. */
export class MemoryTxSource implements TxSource {
  txs: { blockHeight: number; tx: TxApiTransaction }[] = [];
  headHeight = 10_000;
  pageSize = 200;
  /** Hashes the source lists but cannot return yet. */
  unavailable = new Set<string>();
  readonly requests: { from: number | null; to: number; resumeToken?: string }[] = [];

  add(blockHeight: number, tx: TxApiTransaction): this {
    this.txs.push({ blockHeight, tx });
    this.txs.sort((a, b) => a.blockHeight - b.blockHeight);
    return this;
  }

  async head() {
    return this.headHeight;
  }

  async accountTxs({ from, to, resumeToken, limit }: { from: number | null; to: number; resumeToken?: string; limit?: number }) {
    this.requests.push({ from, to, resumeToken });
    const size = Math.min(limit ?? this.pageSize, this.pageSize);
    const inRange = this.txs.filter((t) => (from === null || t.blockHeight >= from) && t.blockHeight <= to);
    const start = resumeToken ? Number(resumeToken) : 0;
    const page = inRange.slice(start, start + size);
    return {
      txs: page.map((t) => ({ hash: t.tx.transaction.hash, blockHeight: t.blockHeight })),
      resumeToken: start + size < inRange.length ? String(start + size) : null,
    };
  }

  async transactions(hashes: readonly string[]) {
    return this.txs.filter((t) => hashes.includes(t.tx.transaction.hash) && !this.unavailable.has(t.tx.transaction.hash)).map((t) => t.tx);
  }
}
