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
  it("explains mika.near's 6.32 $CUT from cut #1", async () => {
    const [cuts, prizes, saves, claimable] = await Promise.all([
      getJournal({ events: ["cut"], limit: 10 }),
      getJournal({ events: ["prize"], limit: 50 }),
      getSaves("mika.near"),
      getClaimable("mika.near"),
    ]);
    const b = latestBreakdown(cuts.entries, prizes.entries, saves, 9_500)!;
    expect(b).toMatchObject({ cutIndex: 1, cutRobotId: "kiko", robotId: "melody", pile: units(23_600), burned: units(11_800), prize: units(16_820), survivors: 9 });
    expect(b.fees).toBe(units(5_020));
    expect(b.share).toBe(claimable);
    expect(latestBreakdown(cuts.entries, prizes.entries, [], 9_500)).toBeNull();
    // A save locked for a later cut was not in the pile when cut #1 ran.
    expect(latestBreakdown(cuts.entries, prizes.entries, saves.map((s) => ({ ...s, lockedForCut: 2 })), 9_500)).toBeNull();
  });
});

describe("collectCalls", () => {
  it("claims, pays storage once and unsaves only when asked", () => {
    expect(collectCalls({ registered: true, unsaveRobotId: null })).toEqual([{ method: "claim", args: {}, deposit: "0", gas: "100000000000000" }]);
    const calls = collectCalls({ registered: false, unsaveRobotId: "melody" });
    expect(calls.map((c) => c.method)).toEqual(["claim", "unsave"]);
    expect(calls[0].deposit).toBe(STORAGE_MIN_YOCTO);
    expect(calls[1]).toMatchObject({ args: { robot_id: "melody" }, deposit: "0" });
  });
});
