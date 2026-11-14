import { describe, expect, it } from "vitest";

import { units } from "@/shared/lib/amount";
import {
  formatAmount,
  formatCount,
  formatCountdown,
  formatDuration,
  formatSignificant,
  formatUsd,
  formatUtcDate,
  formatUtcTime,
  isSameUtcDay,
  relativeUtcDay,
} from "@/shared/ui/format";

describe("formatAmount", () => {
  it("groups thousands and drops trailing zeros", () => {
    expect(formatAmount(units(182_400))).toBe("182,400");
    expect(formatAmount(units(1_052_400))).toBe("1,052,400");
    expect(formatAmount(units(6_742) / 10n)).toBe("674.2");
    expect(formatAmount(0n)).toBe("0");
  });

  it("keeps a minimum of fraction digits", () => {
    expect(formatAmount(units(18) / 10n, { maxFractionDigits: 2, minFractionDigits: 2 })).toBe("1.80");
    expect(formatAmount(units(3), { minFractionDigits: 1 })).toBe("3.0");
  });

  it("rounds half up at the last kept digit", () => {
    const value = 1_235n * 10n ** 15n; // 1.235
    expect(formatAmount(value, { maxFractionDigits: 2 })).toBe("1.24");
    expect(formatAmount(1_234n * 10n ** 15n, { maxFractionDigits: 2 })).toBe("1.23");
    expect(formatAmount(units(1) - 1n, { maxFractionDigits: 2 })).toBe("1");
    expect(formatAmount(units(999_999) + units(1) / 2n, { maxFractionDigits: 0 })).toBe("1,000,000");
  });

  it("formats other decimals, like NEAR's 24", () => {
    expect(formatAmount(5n * 10n ** 23n, { decimals: 24 })).toBe("0.5");
  });

  it("keeps the sign, but never prints -0", () => {
    expect(formatAmount(-units(1_500))).toBe("-1,500");
    expect(formatAmount(-1n)).toBe("0");
  });

  it("rejects a minimum above the maximum", () => {
    expect(() => formatAmount(1n, { maxFractionDigits: 1, minFractionDigits: 2 })).toThrow(RangeError);
  });
});

describe("formatSignificant", () => {
  it("keeps three significant digits under 1 instead of printing 0", () => {
    expect(formatSignificant(10_712n * 10n ** 15n, { decimals: 24, maxFractionDigits: 3 })).toBe("0.0000107");
    expect(formatSignificant(5n * 10n ** 22n, { decimals: 24, maxFractionDigits: 1 })).toBe("0.05");
    expect(formatSignificant(-units(1) / 4_000n)).toBe("-0.00025");
  });

  it("formats 0 and amounts from 1 up like formatAmount", () => {
    expect(formatSignificant(0n)).toBe("0");
    expect(formatSignificant(12_345n * 10n ** 15n, { maxFractionDigits: 2 })).toBe("12.35");
    expect(formatSignificant(units(1_052_400))).toBe("1,052,400");
  });
});

describe("formatUsd and formatCount", () => {
  it("prints cents as dollars", () => {
    expect(formatUsd(124_053n)).toBe("$1,240.53");
    expect(formatUsd(5n)).toBe("$0.05");
    expect(formatUsd(-1_000n)).toBe("-$10.00");
  });

  it("groups whole counts", () => {
    expect(formatCount(2_140)).toBe("2,140");
    expect(formatCount(96)).toBe("96");
  });
});

describe("time", () => {
  const H = 3_600_000;
  const M = 60_000;

  it("prints a countdown clock and stops at zero", () => {
    expect(formatCountdown(4 * H + 12 * M)).toBe("4:12:00");
    expect(formatCountdown(42 * M + 10_000)).toBe("0:42:10");
    expect(formatCountdown(999)).toBe("0:00:00");
    expect(formatCountdown(-5_000)).toBe("0:00:00");
  });

  it("prints time left in words", () => {
    expect(formatDuration(4 * H + 12 * M + 59_000)).toBe("4h 12m");
    expect(formatDuration(42 * M)).toBe("42m");
    expect(formatDuration(30_000)).toBe("under 1m");
    expect(formatDuration(-1)).toBe("under 1m");
  });

  it("prints UTC times and dates", () => {
    const cut = new Date("2026-11-13T18:00:00Z");
    expect(formatUtcTime(cut)).toBe("18:00");
    expect(formatUtcTime(new Date("2026-11-13T00:05:00Z"))).toBe("00:05");
    expect(formatUtcDate(cut)).toBe("Fri, Nov 13");
  });

  it("names today and tomorrow by UTC day", () => {
    const now = new Date("2026-11-13T21:32:00Z");
    expect(relativeUtcDay(now, new Date("2026-11-13T18:00:00Z"))).toBe("today");
    expect(relativeUtcDay(now, new Date("2026-11-14T18:00:00Z"))).toBe("tomorrow");
    expect(relativeUtcDay(now, new Date("2026-11-15T18:00:00Z"))).toBeNull();
  });

  it("compares UTC calendar days", () => {
    expect(isSameUtcDay(new Date("2026-11-13T00:00:00Z"), new Date("2026-11-13T23:59:59Z"))).toBe(true);
    expect(isSameUtcDay(new Date("2026-11-13T23:59:59Z"), new Date("2026-11-14T00:00:00Z"))).toBe(false);
  });
});
