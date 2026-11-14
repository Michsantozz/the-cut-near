import "server-only";

import { cookies } from "next/headers";

import { isNearAccountId, VIEWER_COOKIE } from "./viewer";

/**
 * The account whose public data the page shows, or null for a visitor. Reads the request cookies,
 * so callers render at request time inside a Suspense boundary.
 */
export async function getViewerAccountId(): Promise<string | null> {
  const value = (await cookies()).get(VIEWER_COOKIE)?.value;
  return isNearAccountId(value) ? value : null;
}
