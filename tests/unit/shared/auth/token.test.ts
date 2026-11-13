import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { readSessionToken, SESSION_TTL_SECONDS, signSessionToken } from "@/shared/auth/token";

const key = new TextEncoder().encode("k".repeat(32));
const proof = { accountId: "mika.testnet", publicKey: "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp" };
const now = new Date("2026-11-13T13:48:00Z");

describe("session tokens", () => {
  it("round-trips the account and key, expiring after the TTL", async () => {
    const token = await signSessionToken(proof, key, now);
    expect(await readSessionToken(token, key, now)).toEqual({ ...proof, expiresAt: new Date(now.getTime() + SESSION_TTL_SECONDS * 1000) });
    expect(SESSION_TTL_SECONDS).toBeLessThanOrEqual(12 * 3600);
  });

  it("rejects an expired token", async () => {
    const token = await signSessionToken(proof, key, now);
    expect(await readSessionToken(token, key, new Date(now.getTime() + SESSION_TTL_SECONDS * 1000 + 1000))).toBeNull();
  });

  it("rejects a token signed with another key or tampered with", async () => {
    const token = await signSessionToken(proof, key, now);
    expect(await readSessionToken(token, new TextEncoder().encode("x".repeat(32)), now)).toBeNull();
    const [header, payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), sub: "bob.testnet" })).toString("base64url");
    expect(await readSessionToken(`${header}.${forged}.${signature}`, key, now)).toBeNull();
  });

  it("rejects a token for another audience or with alg none", async () => {
    const iat = Math.floor(now.getTime() / 1000);
    const other = await new SignJWT({ pk: proof.publicKey }).setProtectedHeader({ alg: "HS256" }).setSubject(proof.accountId).setIssuer("the-cut-near").setAudience("elsewhere").setIssuedAt(iat).setExpirationTime(iat + 60).sign(key);
    expect(await readSessionToken(other, key, now)).toBeNull();
    const none = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "bob.testnet" })).toString("base64url")}.`;
    expect(await readSessionToken(none, key, now)).toBeNull();
  });

  it("rejects a subject that is not an account id", async () => {
    const token = await signSessionToken({ ...proof, accountId: "Not An Account" }, key, now);
    expect(await readSessionToken(token, key, now)).toBeNull();
  });
});
