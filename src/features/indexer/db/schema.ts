import { bigint, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Where each indexer resumes: the first block height it has not fully scanned yet. */
export const indexerCursor = pgTable("indexer_cursor", {
  name: text("name").primaryKey(),
  nextBlockHeight: bigint("next_block_height", { mode: "number" }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});
