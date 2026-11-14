import { afterEach, describe, expect, it, vi } from "vitest";
import { getCut, getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { getParams, getPool } from "@/entities/market/server";
import { getBench, getAgent, getStage } from "@/entities/agent/server";
import { getSaves } from "@/entities/save/server";

afterEach(() => vi.unstubAllEnvs());

describe("entity getters with sample data (the default)", () => {
  it("serve the sample world without a chain or database", async () => {
    vi.stubEnv("DATA_SOURCE", "");
    expect(await getStage()).toHaveLength(7);
    expect((await getBench())[0].id).toBe("chartwise");
    expect((await getAgent("kiko"))?.name).toBe("Kiko Bun");
    expect(await getAgent("nobody")).toBeNull();
    expect((await getNextCut()).lowestId).toBe("yuna");
    expect((await getCut(1))?.deletedId).toBeNull();
    expect((await getCut(2))?.deletedId).toBe("kiko");
    expect(await getCut(9)).toBeNull();
    expect((await getParams()).feeBps).toBe(100);
    expect((await getPool()).feeBps).toBe(100);
    expect(await getSaves("mika.near")).toHaveLength(1);
  });

  it("filter the sample journal", async () => {
    const all = await getJournal();
    // Newest first: today's boos, then today's moves.
    expect(all.entries[0].event).toBe("boo");
    expect(all.entries.slice(0, 12).map((e) => e.event)).toContain("move");
    expect((await getJournal({ limit: 200 })).next).not.toBeNull();
    expect((await getJournal({ events: ["ft_mint", "register"], limit: 200 })).entries.at(-1)?.event).toBe("ft_mint");
    expect((await getJournal({ events: ["ft_mint"] })).entries).toHaveLength(1);
    expect((await getJournal({ accountId: "mika.near", events: ["buy"] })).entries).toHaveLength(2);
    expect((await getJournal({ accountId: "mika.near", events: ["save"] })).entries[0]).toMatchObject({ agentId: "melody", amount: 400n * 10n ** 18n });
    expect((await getJournal({ agentId: "lila", events: ["boo"] })).entries.map((e) => e.amount)).toEqual([300n, 600n, 1_200n].map((n) => n * 10n ** 18n));
  });
});
