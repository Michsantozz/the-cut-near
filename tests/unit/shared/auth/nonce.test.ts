import { describe, expect, it } from "vitest";
import { generateNonce } from "@/shared/auth/nonce";
import { base64ToBytes } from "@/shared/lib/base64";

describe("generateNonce", () => {
  it("makes 32 random bytes, base64url", () => {
    const nonce = generateNonce();
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(base64ToBytes(nonce)).toHaveLength(32);
  });

  it("never repeats", () => {
    const nonces = new Set(Array.from({ length: 1000 }, generateNonce));
    expect(nonces.size).toBe(1000);
  });
});
