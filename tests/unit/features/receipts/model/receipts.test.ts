import { describe, expect, it } from "vitest";

import { getParams } from "@/entities/market/server";
import { getJournal, getJournalStats } from "@/entities/journal/server";
import { getBench, getStage } from "@/entities/agent/server";
import { runAudit, LAUNCH_PARAMS } from "@/features/receipts/model/audit";
import { describeGroup, groupEntries, whenText, type DescribeContext } from "@/features/receipts/model/describe";
import { cursorParam, filterEvents, parseCursor, parseFilter, receiptsHref } from "@/features/receipts/model/filters";
import { percentText, supplyOf } from "@/features/receipts/model/supply";
import { units } from "@/shared/lib/amount";

const NOW = new Date("2026-11-13T19:00:00Z");

async function context(): Promise<DescribeContext> {
  const params = await getParams();
  const names = new Map([...(await getStage()), ...(await getBench())].map((r) => [r.id, r.name] as const));
  names.set("kiko", "Kiko Bun");
  const all = (await getJournal({ limit: 200, sampleMoment: "after-cut" })).entries;
  return {
    names,
    now: NOW,
    cutAt: (index) => (index >= 1 ? new Date(params.firstCutAt.getTime() + (index - 1) * params.cutIntervalMs) : null),
    siblings: (txHash) => all.filter((e) => e.txHash === txHash),
  };
}

describe("groupEntries", () => {
  it("reads one event of one transaction as one line, oldest entry first", async () => {
    const { entries } = await getJournal({ limit: 200, sampleMoment: "after-cut" });
    const groups = groupEntries(entries);
    const prize = groups.find((g) => g.event === "prize")!;
    expect(prize.entries).toHaveLength(9);
    const join = groups.find((g) => g.event === "join" && g.entries.length > 1)!;
    expect(join.entries).toHaveLength(10);
    expect(join.entries[0].blockHeight).toBeLessThanOrEqual(join.entries.at(-1)!.blockHeight);
    expect(groups.reduce((sum, g) => sum + g.entries.length, 0)).toBe(entries.length);
  });
});

describe("describeGroup", () => {
  it("writes the cut receipt of cut #1", async () => {
    const ctx = await context();
    const groups = groupEntries((await getJournal({ limit: 200, sampleMoment: "after-cut" })).entries);
    const line = describeGroup(groups.find((g) => g.event === "cut")!, ctx);
    expect(line.tag).toBe("cut");
    expect(line.what).toBe("Cut #1: Kiko Bun is cut");
    expect(line.cut).toMatchObject({ index: 1, agentId: "kiko", pile: units(23_600), burned: units(11_800), prize: units(16_820), survivors: 9 });
    expect(line.cut!.slice).toBe(units(17_754) / 10n);
  });

  it("names the trade a fee came from and the launch mint", async () => {
    const ctx = await context();
    const lines = groupEntries((await getJournal({ limit: 200, sampleMoment: "after-cut" })).entries).map((g) => describeGroup(g, ctx));
    const fee = lines.find((l) => l.tag === "fee")!;
    expect(fee.what).toMatch(/\$CUT fee from a .+ \$CUT (buy|sell)$/);
    const launch = lines.find((l) => l.tag === "launch")!;
    expect(launch.what).toBe("10,000,000 $CUT minted, once");
    expect(lines.find((l) => l.tag === "burn")!.what).toBe("11,800 $CUT burned");
  });

  it("dates lines like the journal column", () => {
    expect(whenText(new Date("2026-11-13T13:41:00Z"), NOW)).toBe("Today 13:41");
    expect(whenText(new Date("2026-11-12T15:01:00Z"), NOW)).toMatch(/Nov 12, 15:01$/);
  });
});

describe("filters", () => {
  it("parses filters and cursors from the URL", () => {
    expect(parseFilter("cuts")).toBe("cuts");
    expect(parseFilter("nope")).toBe("all");
    expect(parseFilter(undefined)).toBe("all");
    expect(filterEvents("burns")).toContain("ft_burn");
    expect(filterEvents("all")).toContain("ft_mint");
    expect(filterEvents("all")).not.toContain("ft_transfer");
    const cursor = { blockHeight: 186_920_000, id: 42 };
    expect(parseCursor(cursorParam(cursor))).toEqual(cursor);
    expect(parseCursor("x.1")).toBeUndefined();
    expect(receiptsHref("all")).toBe("/receipts");
    expect(receiptsHref("cuts", cursor)).toContain("before=186920000.42");
  });
});

describe("supplyOf", () => {
  it("splits the minted supply into burned, saved and free", () => {
    const s = supplyOf(units(10_000_000), units(11_800), units(1_184_600));
    expect(s.free).toBe(units(8_803_600));
    expect(percentText(s.savedPermille)).toBe("11.8%");
    expect(percentText(s.freePermille)).toBe("88.0%");
    expect(supplyOf(0n, 0n, 0n).savedPermille).toBe(0);
    expect(supplyOf(units(10), 0n, units(20)).free).toBe(0n);
  });
});

describe("runAudit", () => {
  it("passes on the sample day and fails on a wrong supply", async () => {
    const [stats, params, stage, bench] = await Promise.all([getJournalStats(), getParams(), getStage(), getBench()]);
    const agents = [...stage, ...bench];
    const saved = agents.reduce((sum, r) => sum + r.pile, 0n);
    const input = {
      contractId: "thecut.near",
      fullAccessKeys: 0,
      stats,
      totalSupply: LAUNCH_PARAMS.totalSupply - stats.burned,
      agents,
      params,
      launchIntervalMs: 86_400_000,
    };
    expect(runAudit(input).every((c) => c.pass)).toBe(true);
    expect(stats.saved).toBe(saved);
    expect(runAudit({ ...input, totalSupply: LAUNCH_PARAMS.totalSupply - units(11_800) }).some((c) => !c.pass)).toBe(true);
    expect(runAudit({ ...input, fullAccessKeys: 1 }).some((c) => !c.pass)).toBe(true);
  });
});
