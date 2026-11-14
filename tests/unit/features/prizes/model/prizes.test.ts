import { describe, expect, it } from "vitest";

import { getJournal } from "@/entities/journal/server";
import { getClaimable, getSaves } from "@/entities/save/server";
import { collectCalls, STORAGE_MIN_YOCTO } from "@/features/prizes/model/claim";
import { latestBreakdown, shareOf } from "@/features/prizes/model/breakdown";
import { units } from "@/shared/lib/amount";

describe("shareOf", () => {
  it("is the saver's pro-rata part of the slice, floored", () => {
    expect(shareOf(units(1_775.4 * 10) / 10n, units(400), units(112_300))).toBe((units(17_754) / 10n) * units(400) / units(112_300));
    expect(shareOf(units(100), units(1), 0n)).toBe(0n);
  });
});

describe("latestBreakdown", () => {
  it("explains mika.near's share of Melody-9's slice at cut #4", async () => {
    const [cuts, prizes, saves, claimable] = await Promise.all([
      getJournal({ events: ["cut"], limit: 10 }),
      getJournal({ events: ["prize"], limit: 50 }),
      getSaves("mika.near"),
      getClaimable("mika.near"),
    ]);
    const b = latestBreakdown(cuts.entries, prizes.entries, saves, 9_000)!;
    expect(b).toMatchObject({ cutIndex: 4, cutAgentId: "velvet", agentId: "melody", pile: units(11_400), burned: units(5_700), prize: units(7_630), survivors: 7 });
    expect(b.fees).toBe(units(1_930));
    expect(b.agentPile).toBe(units(20_700));
    expect(b.share).toBe(claimable);
    expect(latestBreakdown(cuts.entries, prizes.entries, [], 9_000)).toBeNull();
    // A save locked for a later cut was not in the pile when cut #4 ran.
    expect(latestBreakdown(cuts.entries, prizes.entries, saves.map((s) => ({ ...s, lockedForCut: 5 })), 9_000)).toBeNull();
  });
});

describe("collectCalls", () => {
  it("claims, pays storage once and unsaves only when asked", () => {
    expect(collectCalls({ registered: true, unsaveAgentId: null })).toEqual([{ method: "claim", args: {}, deposit: "0", gas: "100000000000000" }]);
    const calls = collectCalls({ registered: false, unsaveAgentId: "melody" });
    expect(calls.map((c) => c.method)).toEqual(["claim", "unsave"]);
    expect(calls[0].deposit).toBe(STORAGE_MIN_YOCTO);
    expect(calls[1]).toMatchObject({ args: { agent_id: "melody" }, deposit: "0" });
  });
});
