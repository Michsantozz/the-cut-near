import { afterEach, describe, expect, it, vi } from "vitest";

import { loadBuy, loadSave, loadSell, loadValue } from "@/features/trade/server";
import { valueSubtitle } from "@/features/trade/ui/value-screen";
import { units } from "@/shared/lib/amount";

vi.mock("next/server", () => ({ connection: async () => {} }));
afterEach(() => vi.unstubAllEnvs());

describe("trade loaders on the sample world", () => {
  it("quote the design's $250 buy: 134.5 $CUT", async () => {
    const data = await loadBuy("mika.near");
    expect(data.initial?.amount).toBe(units(100, 24));
    expect(data.initial?.quote.amountOut).toBeGreaterThan(units(1344) / 10n);
    expect(data.initial?.quote.amountOut).toBeLessThan(units(1346) / 10n);
    expect(data.account?.registered).toBe(true);
    // The agent right above the cut line: Glitch Gremlin, over Yuna Star.
    expect(data.saveTargetId).toBe("gremlin");
  });

  it("open the sale at half of mika's 274.2 free $CUT", async () => {
    const data = await loadSell("mika.near");
    expect(data.account?.free).toBe(units(2742) / 10n);
    expect(data.initial?.amount).toBe(units(1371) / 10n);
    // Locked for cut #4, which ran: mika can take it back now.
    expect(data.account?.saves).toEqual([{ agentId: "melody", agentName: "Melody-9", amount: units(400), unlocked: true }]);
  });

  it("show where the supply is and when trading began", async () => {
    const data = await loadValue("mika.near", "week");
    expect(data.supply).toEqual({ launch: units(10_000_000), saved: units(191_660), free: units(9_785_430), burned: units(22_910) });
    expect(valueSubtitle(data)).toMatch(/^Day 4 · trading since \w{3}, \w{3} \d+, \d\d:\d\d UTC$/);
    expect(data.prices).toHaveLength(13);
  });

  it("open the save page on a stage agent only", async () => {
    expect((await loadSave("mika.near", "melody")).agentId).toBe("melody");
    expect((await loadSave(null, "chartwise")).agentId).toBeNull();
  });
});
