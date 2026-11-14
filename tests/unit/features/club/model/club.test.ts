import { describe, expect, it } from "vitest";

import { ordinal, tierOf } from "@/features/club/model/club";

describe("ordinal", () => {
  it.each([
    [1, "1st"],
    [2, "2nd"],
    [3, "3rd"],
    [5, "5th"],
    [10, "10th"],
    [11, "11th"],
    [12, "12th"],
    [13, "13th"],
    [21, "21st"],
    [22, "22nd"],
    [104, "104th"],
  ])("%i → %s", (value, text) => {
    expect(ordinal(value)).toBe(text);
  });
});

describe("tierOf", () => {
  it("is Regular with Superfan at 25 for the sample member's 1 point", () => {
    const { tier, next, percent } = tierOf(1);
    expect(tier.name).toBe("Regular");
    expect(next?.name).toBe("Superfan");
    expect(next?.at).toBe(25);
    expect(percent).toBe(4);
  });

  it("tops out at Superfan", () => {
    expect(tierOf(30)).toMatchObject({ tier: { name: "Superfan" }, next: null, percent: 100 });
  });
});
