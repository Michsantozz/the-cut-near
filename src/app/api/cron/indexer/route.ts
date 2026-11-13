import { indexContractEvents } from "@/features/indexer/server";
import { runCron } from "@/shared/cron";

export const maxDuration = 120;

/** Ingests new contract events into the journal. */
export async function GET(request: Request) {
  return runCron(request, "indexer", () => indexContractEvents());
}
