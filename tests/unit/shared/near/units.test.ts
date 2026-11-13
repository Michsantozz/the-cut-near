import { describe, expect, it } from "vitest";
import { durationNs, timestampNs, u128, u64Index } from "@/shared/near/units";

describe("u128", () => {
  it("parses decimal strings to bigint", () => {
    expect(u128.parse("0")).toBe(0n);
    expect(u128.parse("182400000000000000000000")).toBe(182_400n * 10n ** 18n);
    expect(u128.parse((2n ** 128n - 1n).toString())).toBe(2n ** 128n - 1n);
  });

  it.each([["-1"], ["1.5"], ["01"], [""], ["1e18"], [(2n ** 128n).toString()]])("rejects %j", (value) => {
    expect(u128.safeParse(value).success).toBe(false);
  });

  it("rejects JSON numbers, which have already lost precision", () => {
    expect(u128.safeParse(1000).success).toBe(false);
  });
});

describe("timestampNs", () => {
  it("turns nanoseconds since the epoch into a Date", () => {
    expect(timestampNs.parse("1794592800000000000").toISOString()).toBe("2026-11-13T18:00:00.000Z");
    expect(timestampNs.parse("1794592800123999999").toISOString()).toBe("2026-11-13T18:00:00.123Z");
  });

  it("accepts a rounded JSON number and keeps millisecond precision", () => {
    expect(timestampNs.parse(1794592800123500000).getTime()).toBe(Date.parse("2026-11-13T18:00:00.123Z"));
  });

  it("rejects values beyond u64", () => {
    expect(timestampNs.safeParse((2n ** 64n).toString()).success).toBe(false);
  });
});

describe("u64Index and durationNs", () => {
  it("parses indexes from numbers or strings", () => {
    expect(u64Index.parse(7)).toBe(7);
    expect(u64Index.parse("7")).toBe(7);
    expect(u64Index.safeParse(-1).success).toBe(false);
    expect(u64Index.safeParse((2n ** 60n).toString()).success).toBe(false);
  });

  it("converts nanosecond durations to milliseconds", () => {
    expect(durationNs.parse("86400000000000")).toBe(86_400_000);
    expect(durationNs.parse("120000000000")).toBe(120_000);
  });
});
