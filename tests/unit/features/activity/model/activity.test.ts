import { describe, expect, it } from "vitest";

import { getJournal } from "@/entities/journal/server";
import { activityRow, filterRows, groupByDay, mergeNewestFirst, nearToUsdCents, parseActivityFilter, type ActivityContext, type ActivityRow } from "@/features/activity/model/rows";
import { dayStrip } from "@/features/activity/model/days";
import { sampleCutAt, sampleHoursBeforeCut } from "@/shared/config/sample";
import { formatUtcDate } from "@/shared/ui/format";

// The sample world is laid out from the coming 18:00 UTC cut (#5): "now" is an hour before it.
const NOW = sampleHoursBeforeCut(1);
const CUT_AT = sampleCutAt(NOW);
const cutAt = (index: number) => sampleHoursBeforeCut((5 - index) * 24, NOW);
const LAUNCH = sampleHoursBeforeCut(4 * 24 + 50, NOW);
const ONE_NEAR = 10n ** 24n;
const DAY_MS = 86_400_000;
const label = (at: Date) => formatUtcDate(at).toUpperCase();

const ctx = (usd: bigint | null): ActivityContext => ({
  names: new Map([["melody", "Melody-9"], ["kiko", "Kiko Bun"], ["onyx", "Onyx Moon"], ["velvet", "Velvet Vee"]]),
  priceYoctoNear: (736n * ONE_NEAR) / 1000n,
  usdCentsPerNear: usd,
  firstCutAt: cutAt(1),
  cutAt: (index) => (index >= 1 ? cutAt(index) : null),
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
    // mika's newest row is yesterday's cut; nothing of mika's happened today yet.
    expect(groups[0].label).toBe(label(cutAt(4)));
    expect(groups.at(-1)!.label).toBe(`${label(LAUNCH)} · LAUNCH DAY`);
  });
});

describe("dayStrip", () => {
  it("starts at launch, marks today and the cut", async () => {
    const rows = await mikaRows();
    const cells = dayStrip(rows, NOW, LAUNCH, CUT_AT);
    const key = (at: Date) => at.toISOString().slice(0, 10);
    expect(cells).toHaveLength(8);
    // The strip starts yesterday: launch was days ago.
    expect(cells[0]).toMatchObject({ key: key(new Date(NOW.getTime() - DAY_MS)), state: "past" });
    expect(cells[1]).toMatchObject({ key: key(NOW), tag: "TODAY", state: "today" });
    expect(cells[0].chips.map((c) => c.label)).toEqual(expect.arrayContaining(["Saved 400", "Cut 18:00"]));
    expect(cells[1].chips).toEqual([{ kind: "cut", label: "Cut 18:00", ahead: true }]);
    expect(cells[2].chips).toEqual([{ kind: "cut", label: "Cut 18:00", ahead: false }]);
  });
});

