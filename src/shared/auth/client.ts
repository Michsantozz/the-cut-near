import { base64ToBytes } from "@/shared/lib/base64";
import { AUTH_ROUTES, type SignInFailure } from "./constants";

// Browser side of NEP-413 sign-in. Wallet-agnostic: pass the wallet's signMessage, e.g. with
// NEAR Connect `(params) => wallet.signMessage(params)`.

export type SignMessageParams = { message: string; recipient: string; nonce: Uint8Array };
export type SignedMessage = { accountId: string; publicKey: string; signature: string };
export type SignMessage = (params: SignMessageParams) => Promise<SignedMessage>;

export class SignInError extends Error {
  override readonly name = "SignInError";
  constructor(readonly reason: SignInFailure | "challenge_failed") {
    super(reason === "unavailable" ? "NEAR is busy. Try again in a moment." : "Sign-in could not be verified.");
  }
}

type Challenge = { nonce: string; message: string; recipient: string; expiresAt: string };

/** Asks for a challenge, has the wallet sign it and starts the session cookie. */
export async function signInWithNear(signMessage: SignMessage): Promise<{ accountId: string }> {
  const challengeResponse = await fetch(AUTH_ROUTES.challenge, { method: "POST", credentials: "same-origin", cache: "no-store" });
  if (!challengeResponse.ok) throw new SignInError(challengeResponse.status === 503 ? "unavailable" : "challenge_failed");
  const challenge = (await challengeResponse.json()) as Challenge;
  const nonce = base64ToBytes(challenge.nonce);
  if (!nonce) throw new SignInError("challenge_failed");

  const signed = await signMessage({ message: challenge.message, recipient: challenge.recipient, nonce });

  const verifyResponse = await fetch(AUTH_ROUTES.verify, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature, nonce: challenge.nonce }),
  });
  const result = (await verifyResponse.json().catch(() => null)) as { ok: true; accountId: string } | { ok: false; reason: SignInFailure } | null;
  if (!result) throw new SignInError(verifyResponse.status === 503 ? "unavailable" : "malformed");
  if (!result.ok) throw new SignInError(result.reason);
  return { accountId: result.accountId };
}

export async function signOut(): Promise<void> {
  await fetch(AUTH_ROUTES.logout, { method: "POST", credentials: "same-origin" });
}

export async function fetchSession(): Promise<{ accountId: string | null; isSample: boolean }> {
  const response = await fetch(AUTH_ROUTES.session, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) return { accountId: null, isSample: false };
  return (await response.json()) as { accountId: string | null; isSample: boolean };
}
