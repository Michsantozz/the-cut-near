import { connection } from "next/server";

/** The current time for a request-time render. Waits for the request, so it never ends up in a prerendered shell. */
export async function requestTime(): Promise<number> {
  await connection();
  return Date.now();
}
