import "server-only";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { dataSource } from "@/shared/config/data-source";
import { SAMPLE_ACCOUNT_ID } from "@/shared/config/sample";
import { serverEnv } from "@/shared/config/server";
import { readSessionToken, SESSION_TTL_SECONDS, signSessionToken } from "./token";

export const SESSION_COOKIE = "cut_session";
/** Binds a challenge to the browser that asked for it (see ./handlers). */
export const CHALLENGE_COOKIE = "cut_challenge";

/** The signed-in account. `isSample` marks the design's member, served when no one signed in with sample data. */
export type Session = { accountId: string; isSample: boolean };

export class UnauthenticatedError extends Error {
  override readonly name = "UnauthenticatedError";
  constructor() {
    super("Sign in with a NEAR wallet first.");
  }
}

/** HTTP-only, first-party cookie settings; Secure in production. */
export function cookieOptions(maxAge: number, path = "/") {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path, maxAge } as const;
}

function sessionKey(): Uint8Array | null {
  const secret = serverEnv().SESSION_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

async function sessionFromToken(token: string | undefined): Promise<Session | null> {
  const key = sessionKey();
  if (token && key) {
    const claims = await readSessionToken(token, key);
    if (claims) return { accountId: claims.accountId, isSample: false };
  }
  return dataSource() === "sample" ? { accountId: SAMPLE_ACCOUNT_ID, isSample: true } : null;
}

/**
 * The signed-in account for Server Components and Server Actions, or null.
 * Reads cookies (request-time data): with Cache Components, render the caller inside <Suspense>,
 * or wrap it in a "use cache: private" function. Sample mode falls back to the design's member.
 */
export async function getSession(): Promise<Session | null> {
  return sessionFromToken((await cookies()).get(SESSION_COOKIE)?.value);
}

/** Like getSession, but throws UnauthenticatedError when no one is signed in (Server Actions). */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new UnauthenticatedError();
  return session;
}

/** The session of a Route Handler request. */
export function getRequestSession(request: NextRequest): Promise<Session | null> {
  return sessionFromToken(request.cookies.get(SESSION_COOKIE)?.value);
}

/** Issues the session cookie on a Route Handler response. */
export async function setSessionCookie(response: NextResponse, proof: { accountId: string; publicKey: string }, key: Uint8Array): Promise<void> {
  response.cookies.set(SESSION_COOKIE, await signSessionToken(proof, key), cookieOptions(SESSION_TTL_SECONDS));
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
}
