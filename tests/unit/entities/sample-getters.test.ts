import { afterEach, describe, expect, it, vi } from "vitest";
import { getCut, getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { getParams, getPool } from "@/entities/market/server";
import { getBench, getRobot, getStage } from "@/entities/robot/server";
import { getSaves } from "@/entities/save/server";

afterEach(() => vi.unstubAllEnvs());

describe("entity getters with sample data (the default)", () => {
  it("serve the design's sample day without a chain or database", async () => {
    vi.stubEnv("DATA_SOURCE", "");
    expect((await getStage()).map((r) => r.id)).toHaveLength(10);
    expect((await getBench())[0].id).toBe("chartwise");
    expect((await getRobot("kiko"))?.name).toBe("Kiko Bun");
    expect(await getRobot("nobody")).toBeNull();
    expect((await getNextCut()).lowestId).toBe("kiko");
    expect((await getCut(1))?.deletedId).toBe("kiko");
    expect(await getCut(2)).toBeNull();
    expect((await getParams()).feeBps).toBe(100);
    expect((await getPool()).feeBps).toBe(100);
    expect(await getSaves("mika.near")).toHaveLength(1);
  });

  it("filter the sample journal", async () => {
    const all = await getJournal();
    expect(all.entries.map((e) => e.event).slice(0, 4)).toEqual(["delete", "join", "prize", "prize"]);
    expect(all.entries.at(-1)?.event).toBe("ft_mint");
    expect((await getJournal({ accountId: "mika.near", events: ["buy"] })).entries).toHaveLength(2);
    expect((await getJournal({ robotId: "melody", events: ["save"] })).entries[0].amount).toBe(400n * 10n ** 18n);
  });
});
