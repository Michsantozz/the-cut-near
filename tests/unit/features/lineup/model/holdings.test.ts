import { describe, expect, it } from "vitest";

import { getPool } from "@/entities/market/server";
import type { Agent } from "@/entities/agent";
import { getStage } from "@/entities/agent/server";
import { cutPriceInYoctoNear, splitByLock, summarizeSaves, valueInUsdCents } from "@/features/lineup/model/holdings";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";
import { formatAmount, formatUsd } from "@/shared/ui/format";

describe("holdings", () => {
  it("prices $CUT from the pool reserves", async () => {
    // 736,000 NEAR against 1,000,000 $CUT: 0.736 NEAR per $CUT
    expect(formatAmount(cutPriceInYoctoNear(await getPool()), { decimals: NEAR_DECIMALS, maxFractionDigits: 3 })).toBe("0.736");
  });

  it("values the sample member's 674.2 $CUT at $1,240.53", async () => {
    expect(formatUsd(valueInUsdCents(units(6_742) / 10n, await getPool(), 250n))).toBe("$1,240.53");
  });

  it("is zero for an empty pool", () => {
    expect(cutPriceInYoctoNear({ nearReserve: 1n, cutReserve: 0n })).toBe(0n);
    expect(valueInUsdCents(units(1), { nearReserve: 1n, cutReserve: 0n }, 250n)).toBe(0n);
  });

  it("names each save, biggest first, and totals them", async () => {
    const stage = await getStage();
    const summary = summarizeSaves(
      [
        { accountId: "mika.near", agentId: "yuna", amount: units(50), lockedForCut: 1 },
        { accountId: "mika.near", agentId: "melody", amount: units(400), lockedForCut: 1 },
        { accountId: "mika.near", agentId: "gone", amount: units(1), lockedForCut: 1 },
        { accountId: "mika.near", agentId: "pixie", amount: 0n, lockedForCut: 1 },
      ],
      stage,
    );
    expect(summary.items.map((item) => item.agentName)).toEqual(["Melody-9", "Yuna Star", "gone"]);
    expect(summary.total).toBe(units(451));
    expect(summary.items[0].lockedForCut).toBe(1);
  });

  it("splits saves into locked for the next cut and unlocked by a past one", () => {
    // fan-a on testnet: nine saves from cut 1, one added to after cut 1 ran (locked for cut 2).
    const saves = [
      { amount: units(800), lockedForCut: 1 },
      { amount: units(801), lockedForCut: 2 },
    ];
    expect(splitByLock(saves, 2)).toEqual({ locked: units(801), unlocked: units(800) });
    expect(splitByLock(saves, 3)).toEqual({ locked: 0n, unlocked: units(1_601) });
    expect(splitByLock(saves, 1)).toEqual({ locked: units(1_601), unlocked: 0n });
  });

  it("is empty without saves", () => {
    expect(summarizeSaves([], [] as Agent[])).toEqual({ items: [], total: 0n });
  });
});
