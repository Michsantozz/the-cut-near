import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ConfigError } from "@/shared/config/errors";
import { requireSessionKey } from "@/shared/config/server";
import { getDb, type Database } from "@/shared/db/client";
import { accountIdSchema } from "@/shared/lib/account-id";
import { base64ToBytes } from "@/shared/lib/base64";
import { safeEqual } from "@/shared/lib/safe-equal";
import { getRpc, type NearRpc } from "@/shared/near/rpc";
import { NONCE_BYTES, SIGN_IN_MESSAGE, SIGN_IN_RECIPIENT, type SignInFailure } from "./constants";
import { consumeNonce, issueNonce, NONCE_TTL_SECONDS } from "./nonce";
import { CHALLENGE_COOKIE, clearSessionCookie, cookieOptions, getRequestSession, setSessionCookie } from "./session";
import { verifySignIn } from "./verify";

// Route Handler bodies for /api/auth/*. Request in, Response out: no next/headers, so they run in tests as-is.

export type AuthDeps = { db: () => Database; rpc: () => NearRpc; now: () => Date };

const defaultDeps: AuthDeps = { db: getDb, rpc: getRpc, now: () => new Date() };

/** The challenge cookie is only sent back to the auth routes. */
const CHALLENGE_PATH = "/api/auth";
const NO_STORE = { "Cache-Control": "no-store" } as const;

const verifyBody = z.object({
  accountId: accountIdSchema,
  publicKey: z.string().regex(/^(ed25519|secp256k1):[1-9A-HJ-NP-Za-km-z]{32,100}$/),
  /** Base64, as wallets return it (NEP-413). */
  signature: z.string().min(1).max(8192),
  /** The challenge nonce, base64url, as issued. */
  nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

export type ChallengeResponse = { nonce: string; message: string; recipient: string; expiresAt: string };
export type VerifyResponse = { ok: true; accountId: string } | { ok: false; reason: SignInFailure };

function failure(reason: SignInFailure, status: number): NextResponse<VerifyResponse> {
  const headers = status === 503 ? { ...NO_STORE, "Retry-After": "5" } : NO_STORE;
  return NextResponse.json({ ok: false, reason }, { status, headers });
}

/**
 * Browsers always send Origin on POST; a mismatch is a cross-site request. Clients without
 * Origin are not browsers, and still need the challenge cookie and a signature.
 */
function isSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  return [request.headers.get("x-forwarded-host"), request.headers.get("host"), request.nextUrl.host].includes(host);
}

/** POST /api/auth/challenge: a single-use 32-byte nonce for the wallet to sign. */
export async function handleChallenge(request: NextRequest, deps: AuthDeps = defaultDeps): Promise<NextResponse> {
  if (!isSameOrigin(request)) return failure("forbidden_origin", 403);
  let issued: Awaited<ReturnType<typeof issueNonce>>;
  try {
    issued = await issueNonce(deps.db(), deps.now());
  } catch (error) {
    if (!(error instanceof ConfigError)) console.error("[auth] could not issue a nonce", error);
    return failure("unavailable", 503);
  }
  const body: ChallengeResponse = { nonce: issued.nonce, message: SIGN_IN_MESSAGE, recipient: SIGN_IN_RECIPIENT, expiresAt: issued.expiresAt.toISOString() };
  const response = NextResponse.json(body, { headers: NO_STORE });
  response.cookies.set(CHALLENGE_COOKIE, issued.nonce, cookieOptions(NONCE_TTL_SECONDS, CHALLENGE_PATH));
  return response;
}

/** POST /api/auth/verify: checks the signed challenge and starts the session. */
export async function handleVerify(request: NextRequest, deps: AuthDeps = defaultDeps): Promise<NextResponse<VerifyResponse>> {
  if (!isSameOrigin(request)) return failure("forbidden_origin", 403);
  const parsed = verifyBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("malformed", 400);
  const signature = base64ToBytes(parsed.data.signature);
  const nonceBytes = base64ToBytes(parsed.data.nonce);
  if (!signature || !nonceBytes || nonceBytes.length !== NONCE_BYTES) return failure("malformed", 400);

  // From here on the challenge is spent: every answer clears its cookie.
  const answer = (response: NextResponse<VerifyResponse>) => {
    response.cookies.set(CHALLENGE_COOKIE, "", cookieOptions(0, CHALLENGE_PATH));
    return response;
  };

  // The nonce must be the one issued to this browser: a signature relayed from elsewhere fails here.
  const issuedHere = request.cookies.get(CHALLENGE_COOKIE)?.value;
  if (!issuedHere || !safeEqual(issuedHere, parsed.data.nonce)) return answer(failure("nonce_invalid", 401));

  let key: Uint8Array;
  try {
    key = requireSessionKey();
  } catch {
    return answer(failure("unavailable", 503));
  }

  let result: Awaited<ReturnType<typeof verifySignIn>>;
  try {
    const db = deps.db();
    const now = deps.now();
    result = await verifySignIn(
      { accountId: parsed.data.accountId, publicKey: parsed.data.publicKey, signature, nonce: { text: parsed.data.nonce, bytes: nonceBytes } },
      { rpc: deps.rpc(), consumeNonce: (nonce) => consumeNonce(db, nonce, now) },
    );
  } catch (error) {
    console.error("[auth] sign-in check failed", error);
    return answer(failure("unavailable", 503));
  }
  if (!result.ok) return answer(failure(result.reason, result.reason === "unavailable" ? 503 : 401));

  const response = answer(NextResponse.json({ ok: true, accountId: result.accountId }, { headers: NO_STORE }));
  await setSessionCookie(response, result, key);
  return response;
}

/** POST /api/auth/logout */
export async function handleLogout(request: NextRequest): Promise<NextResponse> {
  if (!isSameOrigin(request)) return failure("forbidden_origin", 403);
  const response = new NextResponse(null, { status: 204, headers: NO_STORE });
  clearSessionCookie(response);
  return response;
}

export type SessionResponse = { accountId: string | null; isSample: boolean };

/** GET /api/auth/session: who is signed in, for client components. */
export async function handleSession(request: NextRequest): Promise<NextResponse<SessionResponse>> {
  const session = await getRequestSession(request);
  return NextResponse.json({ accountId: session?.accountId ?? null, isSample: session?.isSample ?? false }, { headers: NO_STORE });
}
