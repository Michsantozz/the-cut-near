import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64Url } from "@/shared/lib/base64";

describe("base64", () => {
  it("round-trips bytes through base64url without padding", () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => (i * 37 + 251) % 256);
    const text = bytesToBase64Url(bytes);
    expect(text).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(base64ToBytes(text)).toEqual(bytes);
  });

  it("decodes standard padded base64 as wallets send it", () => {
    expect(base64ToBytes(Buffer.from([250, 251, 252, 253]).toString("base64"))).toEqual(Uint8Array.of(250, 251, 252, 253));
  });

  it("rejects text that is not base64", () => {
    expect(base64ToBytes("not base64!")).toBeNull();
    expect(base64ToBytes("abcde")).toBeNull();
  });
});
