import { indexContractEvents } from "@/features/indexer/server";
import { runCutJob } from "@/features/keeper/server";
import { runCron } from "@/shared/cron";

// The keeper may wait up to a minute for a cut that is seconds away.
export const maxDuration = 120;

/** Daily at 18:00 UTC (and a backstop run): run the cut when due, then catch the journal up. */
export async function GET(request: Request) {
  return runCron(request, "cut", async () => {
    const cut = await runCutJob();
    const journal = await indexContractEvents().catch((error: unknown) => ({ error: error instanceof Error ? error.message : String(error) }));
    return { cut, journal };
  });
}
