import { describe, expect, it } from "vitest";

import { cutTyped, feeSplitText, feeToPrize, nearText, priceText, savesLockText } from "@/features/trade/ui/copy";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";

describe("trade copy", () => {
  it("says the typed amount the wallet is asked to send", () => {
    // "Save 0.1 on Yuna Star" sent 0.05: the button keeps both decimals the field takes.
    expect(cutTyped(units(5) / 100n)).toBe("0.05");
    expect(cutTyped(units(125025) / 100n)).toBe("1,250.25");
    expect(cutTyped(units(800))).toBe("800");
  });

  it("never prints a small NEAR amount or price as 0 NEAR", () => {
    expect(nearText(units(215, NEAR_DECIMALS - 7))).toBe("0.0000215");
    expect(nearText(units(5, NEAR_DECIMALS - 2))).toBe("0.05");
    expect(priceText(units(434, NEAR_DECIMALS - 9), null)).toBe("0.000000434 NEAR");
  });

  it("splits the trade fee between the season pot and the day prize", () => {
    expect(feeSplitText(5_000, "tomorrow’s prize")).toBe("half to the season pot, half to tomorrow’s prize");
    expect(feeSplitText(2_500, "today’s prize")).toBe("25% to the season pot, 75% to today’s prize");
    expect(feeToPrize(units(1), 5_000)).toBe(units(1) / 2n);
    expect(feeToPrize(3n, 5_000)).toBe(2n);
  });

  it("calls an unlocked save unlocked, not locked till the cut", () => {
    const melody = { agentName: "Melody-9", amount: units(400) };
    expect(savesLockText([{ ...melody, unlocked: false }], "18:00 UTC")).toBe("400 saved on Melody-9, locked till 18:00 UTC");
    expect(savesLockText([{ ...melody, unlocked: true }], "18:00 UTC")).toBe("400 saved on Melody-9, unlocked: take it back to sell");
    expect(savesLockText([{ ...melody, unlocked: true }, { agentName: "Yuna Star", amount: units(1), unlocked: false }], "18:00 UTC")).toBe(
      "401 saved on 2 agents: 1 locked till 18:00 UTC, 400 unlocked",
    );
    expect(savesLockText([], "18:00 UTC")).toBeNull();
  });
});
