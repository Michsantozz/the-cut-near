import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";
import { sha256Hex, toHex } from "@/shared/ai/verify/bytes";
import { expectedSignedText, normalizeAddress, recoverEip191Signer, sameSigner, verifySignatureBySigner } from "@/shared/ai/verify/signature";
import { newSigner, signEip191 } from "../../../../msw/near-ai";

describe("expectedSignedText", () => {
  it("is model:request_hash:response_hash for a model TEE and request_hash:response_hash for the gateway", () => {
    const request = '{"model":"z-ai/glm-5.3-flash","messages":[]}';
    const response = '{"id":"chatcmpl-1"}\n';
    expect(expectedSignedText(request, response, "z-ai/glm-5.3-flash")).toBe(`z-ai/glm-5.3-flash:${sha256Hex(request)}:${sha256Hex(response)}`);
    expect(expectedSignedText(request, response)).toBe(`${sha256Hex(request)}:${sha256Hex(response)}`);
  });

  it("changes with a single byte of whitespace", () => {
    expect(expectedSignedText("{}", "{}\n")).not.toBe(expectedSignedText("{}", "{}"));
  });
});

describe("recoverEip191Signer", () => {
  // web3.js docs vector: accounts.sign('Some data', 0x4c08…2318) by 0x2c7536E3605D9C16a7a3D7b1898e529396a65c23.
  it("recovers a known Ethereum personal_sign signature", () => {
    const signature = "0xb91467e570a6466aa9e9876cbcd013baba02900b8979d43fe208a4a4f339f5fd6007e74cd82e037b800186422fc2da167c747ef045e5d18a5f5d4300f8e1a0291c";
    expect(recoverEip191Signer("Some data", signature)).toBe("0x2c7536e3605d9c16a7a3d7b1898e529396a65c23");
  });

  it("accepts v as 0/1 or 27/28 and rejects malformed signatures", () => {
    const { secretKey, address } = newSigner();
    const signature = signEip191("hello", secretKey);
    expect(recoverEip191Signer("hello", signature)).toBe(address);
    const v = Number.parseInt(signature.slice(-2), 16) - 27;
    expect(recoverEip191Signer("hello", `${signature.slice(0, -2)}0${v}`)).toBe(address);
    expect(recoverEip191Signer("hello", signature.slice(0, -2))).toBeNull();
    expect(recoverEip191Signer("hello", `${signature.slice(0, -2)}05`)).toBeNull();
    expect(recoverEip191Signer("hello", "0xzz")).toBeNull();
  });
});

describe("verifySignatureBySigner", () => {
  it("passes an ECDSA signature by the stated address, case-insensitively", () => {
    const { secretKey, address } = newSigner();
    const text = "z-ai/glm-5.3-flash:aa:bb";
    const verdict = verifySignatureBySigner({ text, signature: signEip191(text, secretKey), signing_address: address.toUpperCase().replace("0X", "0x"), signing_algo: "ecdsa" });
    expect(verdict).toEqual({ ok: true, signer: { algo: "ecdsa", address } });
  });

  it("fails when the text was changed or another key signed", () => {
    const a = newSigner();
    const b = newSigner();
    const text = "model:aa:bb";
    expect(verifySignatureBySigner({ text: "model:aa:bc", signature: signEip191(text, a.secretKey), signing_address: a.address, signing_algo: "ecdsa" }).ok).toBe(false);
    expect(verifySignatureBySigner({ text, signature: signEip191(text, b.secretKey), signing_address: a.address, signing_algo: "ecdsa" }).ok).toBe(false);
  });

  it("verifies Ed25519 signatures over the UTF-8 text with the public key as signing_address", () => {
    const secretKey = ed25519.utils.randomSecretKey();
    const publicKey = toHex(ed25519.getPublicKey(secretKey));
    const text = "aa:bb";
    const signature = toHex(ed25519.sign(new TextEncoder().encode(text), secretKey));
    expect(verifySignatureBySigner({ text, signature, signing_address: publicKey, signing_algo: "ed25519" }).ok).toBe(true);
    expect(verifySignatureBySigner({ text: "aa:bc", signature, signing_address: publicKey, signing_algo: "ed25519" }).ok).toBe(false);
  });
});

describe("sameSigner", () => {
  it("compares address bytes and algorithm", () => {
    const address = "0x3b753b4406613c5e70ae640508632b600424fa0c";
    expect(sameSigner({ algo: "ecdsa", address }, { algo: "ecdsa", address: address.toUpperCase().replace("0X", "") })).toBe(true);
    expect(sameSigner({ algo: "ecdsa", address }, { algo: "ed25519", address })).toBe(false);
    expect(normalizeAddress("ABC")).toBe("0xabc");
  });
});
