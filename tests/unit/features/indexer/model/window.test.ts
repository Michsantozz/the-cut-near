import { describe, expect, it } from "vitest";
import { scanWindow } from "@/features/indexer/model/window";

describe("scanWindow", () => {
  it("scans from the cursor to head minus the lag", () => {
    expect(scanWindow(1_000, 2_000, 200)).toEqual({ from: 1_000, to: 1_800 });
  });

  it("starts at the account's first transaction without a cursor", () => {
    expect(scanWindow(null, 2_000, 200)).toEqual({ from: null, to: 1_800 });
  });

  it("has nothing to do when the cursor is past the safe height", () => {
    expect(scanWindow(1_801, 2_000, 200)).toBeNull();
    expect(scanWindow(1_800, 2_000, 200)).toEqual({ from: 1_800, to: 1_800 });
    expect(scanWindow(null, 100, 200)).toBeNull();
  });
});
