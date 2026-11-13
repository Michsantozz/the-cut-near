import { publicEnv } from "@/shared/config/public";

/** Route handlers behind NEP-413 sign-in. */
export const AUTH_ROUTES = {
  challenge: "/api/auth/challenge",
  verify: "/api/auth/verify",
  logout: "/api/auth/logout",
  session: "/api/auth/session",
} as const;

/** The NEP-413 `message` the wallet shows and signs. */
export const SIGN_IN_MESSAGE = "Sign in to The Cut.";

/**
 * The NEP-413 `recipient`: the main contract account, a fixed value. It is never derived from the
 * request's Host header, which a client can set to make a signature meant for another site pass.
 */
export const SIGN_IN_RECIPIENT = publicEnv.contractId;

/** NEP-413 nonces are exactly 32 bytes. */
export const NONCE_BYTES = 32;

/** Why a sign-in was refused, as returned by the verify endpoint. */
export type SignInFailure =
  | "malformed"
  | "forbidden_origin"
  | "nonce_invalid"
  | "bad_signature"
  | "key_not_found"
  | "not_full_access"
  | "unavailable";
