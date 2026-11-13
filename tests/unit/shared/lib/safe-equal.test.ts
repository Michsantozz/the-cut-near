import { describe, expect, it } from "vitest";
import { safeEqual } from "@/shared/lib/safe-equal";

describe("safeEqual", () => {
  it("compares strings of any length", () => {
    expect(safeEqual("Bearer abc", "Bearer abc")).toBe(true);
    expect(safeEqual("Bearer abc", "Bearer abd")).toBe(false);
    expect(safeEqual("Bearer", "Bearer abc")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });
});
