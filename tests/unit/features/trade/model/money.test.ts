import { describe, expect, it } from "vitest";

import { BUY_PRESETS, buyInputToNear, buyUnit, DEFAULT_BUY, editAmount, GAS_RESERVE, groupTyped, maxBuyNear, nearToBuyInput, openingBuyText } from "@/features/trade/model/buy";
import { cutToNear, cutToUsdCents, nearToUsdCents, shareBps, spotPrice, tradePrice, usdCentsToNear } from "@/features/trade/model/money";
import { defaultSell, sellShare } from "@/features/trade/model/sell";
import { splitSupply } from "@/features/trade/model/supply";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";
import { formatUsd } from "@/shared/ui/format";

const pool = { nearReserve: units(736_000, NEAR_DECIMALS), cutReserve: units(1_000_000) };
const spot = spotPrice(pool);

describe("money", () => {
  it("prices $CUT at $1.84 with NEAR at $2.50", () => {
    expect(spot).toBe(units(736, NEAR_DECIMALS - 3));
    expect(formatUsd(cutToUsdCents(units(1), spot, 250n))).toBe("$1.84");
    expect(formatUsd(cutToUsdCents(units(6742) / 10n, spot, 250n))).toBe("$1,240.53");
    expect(cutToNear(units(10), spot)).toBe(units(736, NEAR_DECIMALS - 2));
  });

  it("converts dollars and NEAR both ways", () => {
    expect(usdCentsToNear(25_000n, 250n)).toBe(units(100, NEAR_DECIMALS));
    expect(nearToUsdCents(units(1156, NEAR_DECIMALS), 250n)).toBe(289_000n);
    expect(usdCentsToNear(100n, 0n)).toBe(0n);
  });

  it("averages a trade's price and shares in basis points", () => {
    expect(tradePrice(units(1, NEAR_DECIMALS), units(2))).toBe(units(5, NEAR_DECIMALS - 1));
    expect(tradePrice(1n, 0n)).toBe(0n);
    expect(shareBps(units(1_052_400), units(10_000_000))).toBe(1052);
    expect(shareBps(1n, 0n)).toBe(0);
  });
});

describe("buy amount", () => {
  it("reads dollars at the NEAR price, or NEAR without one", () => {
    expect(buyUnit(250n)).toBe("usd");
    expect(buyUnit(null)).toBe("near");
    expect(buyInputToNear("250", "usd", 250n)).toBe(units(100, NEAR_DECIMALS));
    expect(buyInputToNear("1.5", "near", null)).toBe(units(15, NEAR_DECIMALS - 1));
    expect(buyInputToNear("", "usd", 250n)).toBeNull();
    expect(BUY_PRESETS.usd).toEqual(["50", "100", "250"]);
  });

  it("opens a NEAR buy small enough for a testnet wallet and pool", () => {
    // The testnet pool holds about 4 NEAR and a fan wallet under 1: 100 NEAR was an error before the first tap.
    expect(BUY_PRESETS.near).toEqual(["0.1", "0.5", "1"]);
    expect(DEFAULT_BUY.near).toBe("0.1");
    const wallet = maxBuyNear(units(814, NEAR_DECIMALS - 3), 0n);
    expect(openingBuyText("near", null, wallet)).toBe("0.1");
    expect(openingBuyText("near", null, null)).toBe("0.1");
    // A wallet that cannot cover the default opens at its Max; one with nothing to spend keeps the default.
    expect(openingBuyText("near", null, units(6, NEAR_DECIMALS - 2))).toBe("0.06");
    expect(openingBuyText("near", null, 0n)).toBe("0.1");
    expect(openingBuyText("usd", 250n, units(10, NEAR_DECIMALS))).toBe("25");
  });

  it("keeps gas and the registration out of Max", () => {
    expect(maxBuyNear(units(10, NEAR_DECIMALS), 0n)).toBe(units(10, NEAR_DECIMALS) - GAS_RESERVE);
    expect(maxBuyNear(GAS_RESERVE, 1n)).toBe(0n);
    expect(nearToBuyInput(units(1156, NEAR_DECIMALS) - GAS_RESERVE, "usd", 250n)).toBe("2889");
    expect(nearToBuyInput(units(15, NEAR_DECIMALS - 1), "near", null)).toBe("1.5");
  });

  it("edits the typed amount like a number pad", () => {
    expect(editAmount("25", "0", 2)).toBe("250");
    expect(editAmount("0", "7", 2)).toBe("7");
    expect(editAmount("", ".", 2)).toBe("0.");
    expect(editAmount("1.5", ".", 2)).toBe("1.5");
    expect(editAmount("1.55", "5", 2)).toBe("1.55");
    expect(editAmount("250", "backspace", 2)).toBe("25");
    expect(groupTyped("1250.5")).toBe("1,250.5");
    expect(groupTyped("")).toBe("0");
  });
});

describe("sell amount", () => {
  it("opens at half the free $CUT, rounded down to 0.1", () => {
    const free = units(2742) / 10n;
    expect(defaultSell(free)).toBe(units(1371) / 10n);
    expect(sellShare(free, 25)).toBe(units(685) / 10n);
    expect(sellShare(free, 100)).toBe(free);
  });
});

describe("supply", () => {
  it("adds up to the launch supply", () => {
    expect(splitSupply({ launch: 100n, current: 90n, saved: 30n })).toEqual({ launch: 100n, saved: 30n, free: 60n, burned: 10n });
    expect(splitSupply({ launch: 100n, current: 100n, saved: 200n })).toEqual({ launch: 100n, saved: 100n, free: 0n, burned: 0n });
  });
});
