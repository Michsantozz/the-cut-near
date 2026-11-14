import { describe, expect, it } from "vitest";

import { NEAR_DECIMALS, parseUnits, toDecimalText, units } from "@/shared/lib/amount";

describe("parseUnits", () => {
  it("reads typed decimals into the smallest unit without floats", () => {
    expect(parseUnits("134.5")).toBe(units(1345) / 10n);
    expect(parseUnits("0.000000000000000001")).toBe(1n);
    expect(parseUnits("1,000")).toBe(units(1000));
    expect(parseUnits(".5")).toBe(units(5) / 10n);
    expect(parseUnits("7.")).toBe(units(7));
    expect(parseUnits(" 100 ", NEAR_DECIMALS)).toBe(units(100, NEAR_DECIMALS));
    expect(parseUnits("0.1", NEAR_DECIMALS)).toBe(10n ** 23n);
  });

  it("refuses anything that is not a plain amount", () => {
    for (const bad of ["", ".", "-1", "1e3", "abc", "1.2.3", "0x10"]) expect(parseUnits(bad)).toBeNull();
    expect(parseUnits("0.0000000000000000001")).toBeNull();
    expect(parseUnits("1.234", 2)).toBeNull();
  });
});

describe("toDecimalText", () => {
  it("writes the smallest unit back as editable text, rounding down", () => {
    expect(toDecimalText(units(1371) / 10n)).toBe("137.1");
    expect(toDecimalText(units(5))).toBe("5");
    expect(toDecimalText(units(2) / 3n, 18, 2)).toBe("0.66");
    expect(toDecimalText(parseUnits("0.0105", NEAR_DECIMALS)!, NEAR_DECIMALS, 2)).toBe("0.01");
  });
});
