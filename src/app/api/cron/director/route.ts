import { runDirectorMoment } from "@/features/director/server";
import { runCron } from "@/shared/cron";

// One attestation plus a signed completion per line.
export const maxDuration = 120;

const MOMENTS = ["scheduled", "final-hour"] as const;

/**
 * `?moment=scheduled` at 12:00 UTC (the board lines and agent posts) and `?moment=final-hour` at 17:00 UTC.
 * The after-cut lines run from `/api/cron/cut`, right after the cut lands.
 */
export async function GET(request: Request) {
  const moment = new URL(request.url).searchParams.get("moment");
  const known = MOMENTS.find((name) => name === moment);
  if (!known) return new Response(`Unknown moment. Use one of: ${MOMENTS.join(", ")}.`, { status: 400 });
  return runCron(request, `director:${known}`, () => runDirectorMoment(known));
}
