import { expect, it } from "vitest";
import { startOfUtcDay } from "@/shared/lib/time";

it("startOfUtcDay is midnight UTC of the same UTC day", () => {
  expect(startOfUtcDay(new Date("2026-11-13T13:48:00Z")).toISOString()).toBe("2026-11-13T00:00:00.000Z");
  expect(startOfUtcDay(new Date("2026-11-13T23:59:59.999-03:00")).toISOString()).toBe("2026-11-14T00:00:00.000Z");
});
