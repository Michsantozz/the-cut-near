// Who is looking: the NEAR account the browser last connected, kept in a cookie so server components can
// render that account's public on-chain data (its saves, its balance). It is a display hint, not a session:
// it proves nothing and authorizes nothing. Every action still goes through the wallet, and the signed
// NEP-413 session replaces this hint wherever identity matters.

export const VIEWER_COOKIE = "cut_viewer";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

// NEAR account ids: 2–64 chars of lowercase letters, digits and single `-`/`_` separators, parts joined by dots.
// Implicit accounts (64 hex chars) match too.
const ACCOUNT_ID = /^(?=.{2,64}$)(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*$/;

export function isNearAccountId(value: unknown): value is string {
  return typeof value === "string" && ACCOUNT_ID.test(value);
}

/** The viewer account from a `document.cookie` string, or null when absent or malformed. */
export function readViewer(cookieHeader: string): string | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== VIEWER_COOKIE) continue;
    const value = decodeURIComponent(rest.join("="));
    return isNearAccountId(value) ? value : null;
  }
  return null;
}

/** A `document.cookie` assignment that sets the viewer, or clears it for null. */
export function viewerCookie(accountId: string | null): string {
  const attributes = "Path=/; SameSite=Lax";
  return accountId && isNearAccountId(accountId)
    ? `${VIEWER_COOKIE}=${encodeURIComponent(accountId)}; ${attributes}; Max-Age=${MAX_AGE_SECONDS}`
    : `${VIEWER_COOKIE}=; ${attributes}; Max-Age=0`;
}
