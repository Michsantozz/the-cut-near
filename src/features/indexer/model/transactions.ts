import { z } from "zod";
import { eventItems, eventRefs, isTrackedEvent, parseEventLog } from "@/shared/near/events";

// Shapes of the FastNEAR Transactions API (https://tx.main.fastnear.com, source github.com/fastnear/explorer-api),
// limited to the fields the indexer reads.

export const headSchema = z.object({ blocks: z.array(z.object({ block_height: z.number().int().nonnegative() })).min(1) });

export const accountTxsSchema = z.object({
  account_txs: z.array(z.object({ transaction_hash: z.string().min(1), tx_block_height: z.number().int().nonnegative() })),
  resume_token: z.string().min(1).nullish(),
});

const outcomeSchema = z.object({
  id: z.string().min(1),
  block_height: z.number().int().nonnegative(),
  /** Nanoseconds as a JSON number: JSON.parse rounds it by up to 128 ns, so it is used at millisecond precision. */
  block_timestamp: z.number().nonnegative(),
  outcome: z.object({ logs: z.array(z.string()), executor_id: z.string().min(1), status: z.unknown() }),
});

export const transactionSchema = z.object({
  transaction: z.object({ hash: z.string().min(1) }),
  execution_outcome: outcomeSchema,
  receipts: z.array(z.object({ execution_outcome: outcomeSchema })),
});

export const transactionsSchema = z.object({ transactions: z.array(transactionSchema.nullable()) });

export type TxApiTransaction = z.output<typeof transactionSchema>;

/** The row the journal stores for one event item (see shared/near/db/schema). */
export type JournalEvent = {
  receiptId: string;
  logIndex: number;
  itemIndex: number;
  txHash: string;
  blockHeight: number;
  blockTimestamp: Date;
  emitter: string;
  standard: string;
  version: string;
  event: string;
  accountId: string | null;
  robotId: string | null;
  cutIndex: number | null;
  amount: bigint | null;
  data: Record<string, unknown>;
};

/** A receipt's logs count only when it succeeded: a failed receipt's state changes were rolled back. */
function succeeded(status: unknown): boolean {
  return typeof status === "object" && status !== null && ("SuccessValue" in status || "SuccessReceiptId" in status);
}

/** The main contract and its robot sub-accounts (`<id>.<contract>`) are the only trusted emitters. */
export function isContractAccount(contractId: string, accountId: string): boolean {
  return accountId === contractId || accountId.endsWith(`.${contractId}`);
}

/** Every tracked NEP-297 event item the contract emitted in a transaction's successful receipts. */
export function extractEvents(tx: TxApiTransaction, contractId: string): JournalEvent[] {
  const events: JournalEvent[] = [];
  for (const { execution_outcome: execution } of tx.receipts) {
    const { executor_id: emitter, logs, status } = execution.outcome;
    if (!isContractAccount(contractId, emitter) || !succeeded(status)) continue;
    logs.forEach((log, logIndex) => {
      const event = parseEventLog(log);
      if (!event || !isTrackedEvent(event)) return;
      eventItems(event).forEach((data, itemIndex) => {
        events.push({
          receiptId: execution.id,
          logIndex,
          itemIndex,
          txHash: tx.transaction.hash,
          blockHeight: execution.block_height,
          blockTimestamp: new Date(Math.floor(execution.block_timestamp / 1e6)),
          emitter,
          standard: event.standard,
          version: event.version,
          event: event.event,
          ...eventRefs(data, event.event),
          data,
        });
      });
    });
  }
  return events;
}
