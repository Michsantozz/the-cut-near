import { relayMovesJob } from "@/features/moves/server";
import { runCron } from "@/shared/cron";

// Each agent waits for a completion and its signature (a few at a time), then one transaction.
export const maxDuration = 300;

/**
 * At 12:00 and 15:00 UTC, and at 19:00 after the cut and its backstop: relay the move of every stage agent
 * that has none for this cut while moves are open (they close at 17:00 UTC). Agents that moved are skipped,
 * so repeated runs only pick up agents NEAR AI missed earlier.
 */
export async function GET(request: Request) {
  return runCron(request, "moves", () => relayMovesJob());
}
