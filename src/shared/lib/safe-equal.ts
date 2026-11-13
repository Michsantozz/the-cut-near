import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time string comparison. Both sides are hashed first so the comparison takes the same
 * time whatever their lengths, and a mismatch reveals neither the length nor a common prefix.
 */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}
