import { bigint, bigserial, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * The journal: one row per NEP-297 event item emitted by the main contract (and its agent
 * sub-accounts), written by features/indexer and read for Receipts and history.
 * `(receipt_id, log_index, item_index)` identifies an event on chain, so re-ingesting is a no-op.
 */
export const journal = pgTable(
  "journal",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    receiptId: text("receipt_id").notNull(),
    /** Position of the log line in the receipt's outcome. */
    logIndex: integer("log_index").notNull(),
    /** Position of the item in the event's `data` array. */
    itemIndex: integer("item_index").notNull(),
    txHash: text("tx_hash").notNull(),
    blockHeight: bigint("block_height", { mode: "number" }).notNull(),
    blockTimestamp: timestamp("block_timestamp", { withTimezone: true, mode: "date" }).notNull(),
    /** The account that emitted the event. */
    emitter: text("emitter").notNull(),
    standard: text("standard").notNull(),
    version: text("version").notNull(),
    event: text("event").notNull(),
    accountId: text("account_id"),
    agentId: text("agent_id"),
    cutIndex: integer("cut_index"),
    /** The item's `amount` in the smallest unit, when it has one. */
    amount: numeric("amount", { precision: 78, scale: 0, mode: "bigint" }),
    /** The item exactly as emitted. */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    indexedAt: timestamp("indexed_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("journal_event_key").on(t.receiptId, t.logIndex, t.itemIndex),
    index("journal_block_idx").on(t.blockHeight),
    index("journal_account_idx").on(t.accountId, t.blockHeight),
    index("journal_agent_idx").on(t.agentId, t.blockHeight),
    index("journal_event_idx").on(t.event, t.blockHeight),
    index("journal_cut_idx").on(t.cutIndex),
  ],
);

export type JournalRow = typeof journal.$inferSelect;
export type NewJournalRow = typeof journal.$inferInsert;
