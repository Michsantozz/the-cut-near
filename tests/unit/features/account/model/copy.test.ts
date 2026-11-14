import { describe, expect, it } from "vitest";

import { cutEvery, risks, TOUR } from "@/features/account/model/copy";

describe("cutEvery", () => {
  it("says every 2 minutes for the testnet interval", () => {
    expect(cutEvery(120_000)).toBe("every 2 minutes");
  });

  it("says every minute for 60 s", () => {
    expect(cutEvery(60_000)).toBe("every minute");
  });

  it("says every day for 24 h and counts whole days", () => {
    expect(cutEvery(86_400_000)).toBe("every day");
    expect(cutEvery(2 * 86_400_000)).toBe("every 2 days");
  });
});

describe("account copy", () => {
  it("names the cut time in the first risk", () => {
    expect(risks("18:00")[0]?.text).toContain("18:00 UTC");
    expect(risks("18:00")).toHaveLength(4);
  });

  it("has a five-step tour, each step linking somewhere", () => {
    expect(TOUR).toHaveLength(5);
    for (const step of TOUR) expect(step.href.startsWith("/")).toBe(true);
  });
});
