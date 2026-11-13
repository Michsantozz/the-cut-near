import { describe, expect, it } from "vitest";

import { getPool } from "@/entities/market/server";
import type { Robot } from "@/entities/robot";
import { getStage } from "@/entities/robot/server";
import { cutPriceInYoctoNear, summarizeSaves, valueInUsdCents } from "@/features/lineup/model/holdings";
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
        { accountId: "mika.near", robotId: "kiko", amount: units(50), lockedForCut: 1 },
        { accountId: "mika.near", robotId: "melody", amount: units(400), lockedForCut: 1 },
        { accountId: "mika.near", robotId: "gone", amount: units(1), lockedForCut: 1 },
        { accountId: "mika.near", robotId: "pixie", amount: 0n, lockedForCut: 1 },
      ],
      stage,
    );
    expect(summary.items.map((item) => item.robotName)).toEqual(["Melody-9", "Kiko Bun", "gone"]);
    expect(summary.total).toBe(units(451));
  });

  it("is empty without saves", () => {
    expect(summarizeSaves([], [] as Robot[])).toEqual({ items: [], total: 0n });
  });
});
