import "server-only";
import { isLive } from "@/shared/config/data-source";
import { serverEnv } from "@/shared/config/server";
import { safeEqual } from "@/shared/lib/safe-equal";

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`, which is how Vercel Cron
 * authenticates its calls. Constant-time, and closed when no secret is configured.
 */
export function isAuthorizedCron(request: Request, secret: string | undefined = serverEnv().CRON_SECRET): boolean {
  if (!secret) return false;
  return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`);
}

export type CronReport = { job: string; ok: boolean; ms: number; result?: unknown; error?: string };

/**
 * Runs a scheduled job behind the cron secret and reports it as JSON. Vercel may deliver a cron
 * twice and never retries a failed one, so every job must be idempotent and pick up whatever is
 * still outstanding. With sample data there is no chain to act on, so jobs are skipped.
 */
export async function runCron(request: Request, job: string, run: () => Promise<unknown>): Promise<Response> {
  if (!isAuthorizedCron(request)) return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
  if (!isLive()) return json({ job, ok: true, ms: 0, result: { skipped: "DATA_SOURCE is not live" } }, 200);
  const startedAt = Date.now();
  try {
    const result = await run();
    return json({ job, ok: true, ms: Date.now() - startedAt, result }, 200);
  } catch (error) {
    console.error(`[cron:${job}]`, error);
    return json({ job, ok: false, ms: Date.now() - startedAt, error: error instanceof Error ? `${error.name}: ${error.message}` : String(error) }, 500);
  }
}

// Reports carry onchain amounts and times: bigints go out as decimal strings.
function json(report: CronReport, status: number): Response {
  const body = JSON.stringify(report, (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value));
  return new Response(body, { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
