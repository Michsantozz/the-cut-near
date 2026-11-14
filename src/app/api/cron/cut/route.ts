import { runDirectorMoment } from "@/features/director/server";
import { indexContractEvents } from "@/features/indexer/server";
import { runCutJob } from "@/features/keeper/server";
import { runCron } from "@/shared/cron";

// The keeper may wait up to a minute for a cut that is seconds away; then the Director signs two lines.
export const maxDuration = 180;

const report = (error: unknown) => ({ error: error instanceof Error ? error.message : String(error) });

/**
 * Daily at 18:00 UTC (and a backstop run): run the cut when due, catch the journal up, then the Director's
 * roast and receipt for that cut. The Director skips lines it already has, so the backstop run is free.
 */
export async function GET(request: Request) {
  return runCron(request, "cut", async () => {
    const cut = await runCutJob();
    const journal = await indexContractEvents().catch(report);
    const director = cut.status === "too_early" ? null : await runDirectorMoment("after-cut", { cutIndex: cut.index }).catch(report);
    return { cut, journal, director };
  });
}
