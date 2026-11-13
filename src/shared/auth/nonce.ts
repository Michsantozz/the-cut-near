import "server-only";
import { randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import type { Database } from "@/shared/db/client";
import { bytesToBase64Url } from "@/shared/lib/base64";
import { NONCE_BYTES } from "./constants";
import { authNonce } from "./db/schema";

/** A challenge must be signed and verified within this window. */
export const NONCE_TTL_SECONDS = 5 * 60;

export type IssuedNonce = { nonce: string; expiresAt: Date };

/** A fresh 32-byte nonce from a CSPRNG, base64url. */
export function generateNonce(): string {
  return bytesToBase64Url(randomBytes(NONCE_BYTES));
}

/** Stores a new single-use nonce and drops expired ones, so the table stays small. */
export async function issueNonce(db: Database, now: Date = new Date()): Promise<IssuedNonce> {
  const nonce = generateNonce();
  const expiresAt = new Date(now.getTime() + NONCE_TTL_SECONDS * 1000);
  await db.delete(authNonce).where(lt(authNonce.expiresAt, now));
  await db.insert(authNonce).values({ nonce, createdAt: now, expiresAt });
  return { nonce, expiresAt };
}

/**
 * Deletes the nonce and reports whether it was still valid. One atomic statement, so two
 * concurrent verifies of the same nonce cannot both succeed.
 */
export async function consumeNonce(db: Database, nonce: string, now: Date = new Date()): Promise<boolean> {
  const deleted = await db.delete(authNonce).where(eq(authNonce.nonce, nonce)).returning({ expiresAt: authNonce.expiresAt });
  return deleted.some((row) => row.expiresAt > now);
}

