import { Account, JsonRpcProvider, KeyPair, KeyPairSigner } from "near-api-js";
import { signMessage } from "near-api-js/nep413";
import { describe, expect, it } from "vitest";
import { isValidNep413Signature, nep413Digest, type Nep413Payload } from "@/shared/auth/nep413";

const keyPair = KeyPair.fromRandom("ed25519");
// Signing is local: the provider is never called.
const account = new Account("mika.testnet", new JsonRpcProvider({ url: "http://127.0.0.1:1" }), new KeyPairSigner(keyPair));
const payload: Nep413Payload = { message: "Sign in to The Cut.", recipient: "thecut.testnet", nonce: new Uint8Array(32).fill(9) };

describe("NEP-413", () => {
  it("accepts a signature made by near-api-js signMessage (same digest as verifyMessage)", async () => {
    const signed = await signMessage({ signerAccount: account, payload });
    expect(isValidNep413Signature(payload, signed.publicKey.toString(), signed.signature)).toBe(true);
  });

  it("covers callbackUrl as Option<string>", async () => {
    const withCallback = { ...payload, callbackUrl: "https://thecut.app/cb" };
    const signed = await signMessage({ signerAccount: account, payload: withCallback });
    expect(isValidNep413Signature(withCallback, signed.publicKey.toString(), signed.signature)).toBe(true);
    expect(isValidNep413Signature(payload, signed.publicKey.toString(), signed.signature)).toBe(false);
  });

  it.each([
    ["another recipient", { recipient: "evil.testnet" }],
    ["another message", { message: "Send all my NEAR" }],
    ["another nonce", { nonce: new Uint8Array(32).fill(8) }],
  ])("rejects the signature for %s", async (_, change) => {
    const signed = await signMessage({ signerAccount: account, payload });
    expect(isValidNep413Signature({ ...payload, ...change }, signed.publicKey.toString(), signed.signature)).toBe(false);
  });

  it("rejects another key, a truncated signature and a malformed key", async () => {
    const signed = await signMessage({ signerAccount: account, payload });
    const other = KeyPair.fromRandom("ed25519").getPublicKey().toString();
    expect(isValidNep413Signature(payload, other, signed.signature)).toBe(false);
    expect(isValidNep413Signature(payload, signed.publicKey.toString(), signed.signature.slice(0, 63))).toBe(false);
    expect(isValidNep413Signature(payload, "ed25519:notakey", signed.signature)).toBe(false);
  });

  it("refuses a nonce that is not 32 bytes", () => {
    expect(() => nep413Digest({ ...payload, nonce: new Uint8Array(31) })).toThrow(RangeError);
  });
});
