import { describe, expect, it } from "vitest";

import { getJournal } from "@/entities/journal/server";
import { activityRow, filterRows, groupByDay, mergeNewestFirst, nearToUsdCents, parseActivityFilter, type ActivityContext, type ActivityRow } from "@/features/activity/model/rows";
import { dayStrip } from "@/features/activity/model/days";

const NOW = new Date("2026-11-13T19:00:00Z");
const LAUNCH = new Date("2026-11-12T15:01:00Z");
const ONE_NEAR = 10n ** 24n;

const ctx = (usd: bigint | null): ActivityContext => ({
  names: new Map([["melody", "Melody-9"], ["kiko", "Kiko Bun"]]),
  priceYoctoNear: (736n * ONE_NEAR) / 1000n,
  usdCentsPerNear: usd,
  firstCutAt: new Date("2026-11-13T18:00:00Z"),
  cutAt: (index) => (index >= 1 ? new Date(Date.UTC(2026, 10, 12 + index, 18)) : null),
});

async function mikaRows(usd: bigint | null = 250n): Promise<ActivityRow[]> {
  const own = (await getJournal({ accountId: "mika.near", limit: 200 })).entries;
  const shared = (await getJournal({ events: ["ft_mint", "cut"], limit: 200 })).entries;
  return mergeNewestFirst(own, shared, own)
    .map((entry) => activityRow(entry, ctx(usd)))
    .filter((row): row is ActivityRow => row !== null);
}

describe("nearToUsdCents", () => {
  it("rounds half up", () => {
    expect(nearToUsdCents(ONE_NEAR, 250n)).toBe(250n);
    expect(nearToUsdCents(ONE_NEAR / 500n, 250n)).toBe(1n);
    expect(nearToUsdCents(ONE_NEAR / 1000n, 250n)).toBe(0n);
  });
});

describe("activity rows", () => {
  it("lists the viewer's trades and saves with the contract's own events", async () => {
    const rows = await mikaRows();
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length);
    const save = rows.find((r) => r.kind === "save")!;
    expect(save.title).toBe("Saved 400 $CUT on Melody-9");
    expect(save.sub).toMatch(/locked till 18:00 UTC$/);
    expect(rows.find((r) => r.kind === "buy")!.amount).toMatch(/^\$/);
    expect(rows.find((r) => r.title === "Kiko Bun was cut")!.amount).toBe("Auto");
    expect(rows.at(-1)!.title).toBe("The show opened");
  });

  it("stays in $CUT and NEAR without a USD rate", async () => {
    const rows = await mikaRows(null);
    expect(rows.find((r) => r.kind === "buy")!.amount).toMatch(/ NEAR$/);
    expect(rows.find((r) => r.kind === "save")!.amount).toBe("400 $CUT");
  });

  it("filters and groups by day", async () => {
    const rows = await mikaRows();
    expect(parseActivityFilter("trades")).toBe("trades");
    expect(parseActivityFilter("x")).toBe("all");
    expect(filterRows(rows, "saves").every((r) => r.kind === "save")).toBe(true);
    expect(filterRows(rows, "trades").every((r) => r.kind === "buy" || r.kind === "sell")).toBe(true);
    const groups = groupByDay(rows, NOW, LAUNCH);
    expect(groups[0].label).toBe("TODAY · FRI, NOV 13");
    expect(groups.at(-1)!.label).toBe("THU, NOV 12 · LAUNCH DAY");
  });
});

describe("dayStrip", () => {
  it("starts at launch, marks today and the cut", async () => {
    const rows = await mikaRows();
    const cells = dayStrip(rows, NOW, LAUNCH, new Date("2026-11-14T18:00:00Z"));
    expect(cells).toHaveLength(8);
    expect(cells[0]).toMatchObject({ key: "2026-11-12", tag: "LAUNCH", state: "past" });
    expect(cells[1]).toMatchObject({ key: "2026-11-13", tag: "TODAY", state: "today" });
    expect(cells[0].chips.map((c) => c.label)).toContain("Show opened");
    expect(cells[1].chips.some((c) => c.label === "Cut 18:00")).toBe(true);
    expect(cells[2].chips).toEqual([{ kind: "cut", label: "Cut 18:00", ahead: false }]);
  });
});

