import { describe, expect, it } from "vitest";

import { quoteBuy, quoteSell } from "@/entities/market";
import { getBalance, getNearBalance, getStorageBalance, getUsdCentsPerNear, quoteBuy as serverQuoteBuy } from "@/entities/market/server";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";

const pool = { nearReserve: units(736_000, NEAR_DECIMALS), cutReserve: units(1_000_000), feeBps: 100 };

describe("pool quotes (contracts/thecut/src/math.rs)", () => {
  it("buys with the fee taken in $CUT from the output", () => {
    // gross = 1,000,000 × 100 / 736,100 = 135.851...; fee = 1%
    const q = quoteBuy(pool, units(100, NEAR_DECIMALS));
    const gross = (pool.cutReserve * units(100, NEAR_DECIMALS)) / (pool.nearReserve + units(100, NEAR_DECIMALS));
    expect(q.fee).toBe(gross / 100n);
    expect(q.amountOut).toBe(gross - gross / 100n);
  });

  it("sells with the fee taken in $CUT from the input", () => {
    const q = quoteSell(pool, units(100));
    expect(q.fee).toBe(units(1));
    expect(q.amountOut).toBe((pool.nearReserve * units(99)) / (pool.cutReserve + units(99)));
  });

  it("quotes nothing for nothing", () => {
    expect(quoteBuy(pool, 0n)).toEqual({ amountOut: 0n, fee: 0n });
    expect(quoteSell(pool, 0n)).toEqual({ amountOut: 0n, fee: 0n });
    expect(quoteSell({ ...pool, nearReserve: 0n }, units(1)).amountOut).toBe(0n);
  });
});

describe("market getters on the sample day", () => {
  it("serve mika.near's wallet", async () => {
    expect(await getBalance("mika.near")).toBe(units(2742) / 10n);
    expect(await getBalance("nobody.near")).toBe(0n);
    expect(await getNearBalance("mika.near")).toBe(units(1156, NEAR_DECIMALS));
    expect(await getStorageBalance("nobody.near")).toBeNull();
    expect(await getUsdCentsPerNear()).toBe(250n);
    expect(await serverQuoteBuy(units(100, NEAR_DECIMALS))).toEqual(quoteBuy(pool, units(100, NEAR_DECIMALS)));
  });
});

describe("live price history", () => {
  it("prices a buy and a sell from their events, fee included", async () => {
    const { tradePrice } = await import("@/entities/market/api/live");
    const at = new Date("2026-11-13T09:14:00Z");
    const buy = tradePrice({ event: "buy", blockTimestamp: at, data: { near_in: units(859, NEAR_DECIMALS - 1).toString(), cut_out: units(120).toString() } });
    expect(buy?.yoctoNearPerCut).toBe((units(859, NEAR_DECIMALS - 1) * units(1)) / units(120));
    const sell = tradePrice({ event: "sell", blockTimestamp: at, data: { near_out: units(1, NEAR_DECIMALS).toString(), cut_in: units(2).toString() } });
    expect(sell?.yoctoNearPerCut).toBe(units(5, NEAR_DECIMALS - 1));
    expect(tradePrice({ event: "save", blockTimestamp: at, data: { amount: "1" } })).toBeNull();
    expect(tradePrice({ event: "buy", blockTimestamp: at, data: { near_in: "1", cut_out: "0" } })).toBeNull();
  });
});
