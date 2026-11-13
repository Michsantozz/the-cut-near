import { afterEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCron, runCron } from "@/shared/cron";

const SECRET = "s".repeat(24);
const request = (authorization?: string) => new Request("https://thecut.app/api/cron/cut", { headers: authorization ? { authorization } : {} });

afterEach(() => vi.unstubAllEnvs());

describe("isAuthorizedCron", () => {
  it("accepts exactly the bearer secret", () => {
    expect(isAuthorizedCron(request(`Bearer ${SECRET}`), SECRET)).toBe(true);
    expect(isAuthorizedCron(request(`Bearer ${SECRET}x`), SECRET)).toBe(false);
    expect(isAuthorizedCron(request(SECRET), SECRET)).toBe(false);
    expect(isAuthorizedCron(request(), SECRET)).toBe(false);
  });

  it("fails closed without a configured secret", () => {
    expect(isAuthorizedCron(request("Bearer "), undefined)).toBe(false);
    expect(isAuthorizedCron(request("Bearer undefined"), undefined)).toBe(false);
  });
});

describe("runCron", () => {
  it("refuses unauthenticated calls without running the job", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const job = vi.fn();
    const response = await runCron(request("Bearer nope"), "cut", job);
    expect(response.status).toBe(401);
    expect(job).not.toHaveBeenCalled();
  });

  it("skips jobs with sample data", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATA_SOURCE", "sample");
    const job = vi.fn();
    const response = await runCron(request(`Bearer ${SECRET}`), "cut", job);
    expect(await response.json()).toMatchObject({ job: "cut", ok: true, result: { skipped: "DATA_SOURCE is not live" } });
    expect(job).not.toHaveBeenCalled();
  });

  it("reports results with bigints as strings, and failures as 500", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("DATA_SOURCE", "live");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db");
    vi.stubEnv("SESSION_SECRET", "k".repeat(32));
    const ok = await runCron(request(`Bearer ${SECRET}`), "cut", async () => ({ burned: 10n ** 30n }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, result: { burned: "1000000000000000000000000000000" } });

    vi.spyOn(console, "error").mockImplementation(() => {});
    const failed = await runCron(request(`Bearer ${SECRET}`), "cut", async () => {
      throw new RangeError("boom");
    });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ ok: false, error: "RangeError: boom" });
  });
});
