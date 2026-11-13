import "server-only";
import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { accountIdSchema } from "@/shared/lib/account-id";

const ISSUER = "the-cut-near";
const AUDIENCE = "the-cut-near:session";
const ALGORITHM = "HS256";

/** Sessions are short: a stolen cookie is useful for hours, not days. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/** A verified session token's claims. */
export type SessionClaims = { accountId: string; publicKey: string; expiresAt: Date };

const claimsSchema = z.object({
  sub: accountIdSchema,
  pk: z.string().min(1),
  exp: z.number().int(),
});

/** Signs an HS256 session JWT for an account that just proved a full-access key. */
export async function signSessionToken(
  { accountId, publicKey }: { accountId: string; publicKey: string },
  key: Uint8Array,
  now: Date = new Date(),
  ttlSeconds: number = SESSION_TTL_SECONDS,
): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ pk: publicKey })
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setSubject(accountId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setNotBefore(iat)
    .setExpirationTime(iat + ttlSeconds)
    .setJti(randomUUID())
    .sign(key);
}

/** The token's claims, or null when it is forged, expired, not yet valid or not a session token. */
export async function readSessionToken(token: string, key: Uint8Array, now: Date = new Date()): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: [ALGORITHM], currentDate: now });
    const claims = claimsSchema.safeParse(payload);
    if (!claims.success) return null;
    return { accountId: claims.data.sub, publicKey: claims.data.pk, expiresAt: new Date(claims.data.exp * 1000) };
  } catch {
    return null;
  }
}
