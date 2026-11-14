import { describe, expect, it } from "vitest";

import { finalHourStart, parseAlertsOff, parseCurrency, serializeAlertsOff } from "@/features/account/model/prefs";

describe("parseCurrency", () => {
  it("shows USD unless the cookie says BRL", () => {
    expect(parseCurrency(undefined)).toBe("usd");
    expect(parseCurrency("eur")).toBe("usd");
    expect(parseCurrency("brl")).toBe("brl");
  });
});

describe("alerts off", () => {
  it("keeps every alert on without a cookie", () => {
    expect(parseAlertsOff(undefined)).toEqual([]);
    expect(parseAlertsOff("")).toEqual([]);
  });

  it("reads known alerts and ignores the rest", () => {
    expect(parseAlertsOff("prize,bogus,danger")).toEqual(["danger", "prize"]);
  });

  it("writes them in a stable order, without repeats", () => {
    expect(serializeAlertsOff(["prize", "final", "prize"])).toBe("final,prize");
    expect(parseAlertsOff(serializeAlertsOff(["final"]))).toEqual(["final"]);
  });
});

describe("finalHourStart", () => {
  it("starts an hour before the cut", () => {
    expect(finalHourStart(new Date("2026-11-14T18:00:00Z")).toISOString()).toBe("2026-11-14T17:00:00.000Z");
  });
});
