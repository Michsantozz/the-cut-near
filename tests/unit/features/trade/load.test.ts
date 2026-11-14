import { afterEach, describe, expect, it, vi } from "vitest";

import { loadBuy, loadSave, loadSell, loadValue } from "@/features/trade/server";
import { valueSubtitle } from "@/features/trade/ui/value-screen";
import { units } from "@/shared/lib/amount";

vi.mock("next/server", () => ({ connection: async () => {} }));
afterEach(() => vi.unstubAllEnvs());

describe("trade loaders on the sample day", () => {
  it("quote the design's $250 buy: 134.5 $CUT", async () => {
    const data = await loadBuy("mika.near");
    expect(data.initial?.amount).toBe(units(100, 24));
    expect(data.initial?.quote.amountOut).toBeGreaterThan(units(1344) / 10n);
    expect(data.initial?.quote.amountOut).toBeLessThan(units(1346) / 10n);
    expect(data.account?.registered).toBe(true);
    expect(data.saveTargetId).toBe("onyx");
  });

  it("open the sale at half of mika's 274.2 free $CUT", async () => {
    const data = await loadSell("mika.near");
    expect(data.account?.free).toBe(units(2742) / 10n);
    expect(data.initial?.amount).toBe(units(1371) / 10n);
    expect(data.account?.saves).toEqual([{ robotId: "melody", robotName: "Melody-9", amount: units(400), unlocked: false }]);
  });

  it("show where the supply is and when trading began", async () => {
    const data = await loadValue("mika.near", "week");
    expect(data.supply).toEqual({ launch: units(10_000_000), saved: units(1_052_400), free: units(8_947_600), burned: 0n });
    expect(valueSubtitle(data)).toBe("Day 2 · trading since Thu, Nov 12, 15:01 UTC");
    expect(data.prices).toHaveLength(13);
  });

  it("open the save page on a stage robot only", async () => {
    expect((await loadSave("mika.near", "melody")).robotId).toBe("melody");
    expect((await loadSave(null, "chartwise")).robotId).toBeNull();
  });
});
