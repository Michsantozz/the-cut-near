import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Sign-in challenges. A row lives from the challenge until the first verify attempt (which deletes
 * it, valid or not) or its expiry, so every nonce signs in at most once.
 */
export const authNonce = pgTable(
  "auth_nonce",
  {
    /** The 32-byte nonce, base64url. */
    nonce: text("nonce").primaryKey(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (t) => [index("auth_nonce_expires_idx").on(t.expiresAt)],
);
