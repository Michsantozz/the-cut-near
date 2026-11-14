import { describe, expect, it } from "vitest";

import { cutSchedule, demoSteps, spanText } from "@/features/demo";

describe("the demo guide", () => {
  it("names a daily cut by its time of day and a fast cut by its interval", () => {
    expect(cutSchedule(86_400_000, "18:00")).toEqual({ cutWhen: "every day at 18:00 UTC", cutWait: "at 18:00 UTC" });
    expect(cutSchedule(180_000, "14:03")).toEqual({ cutWhen: "every 3 minutes", cutWait: "within 3 minutes" });
    expect(spanText(3_600_000)).toBe("1 hour");
    expect(spanText(30_000)).toBe("30 seconds");
  });

  it("walks through the seven steps, each with a time, a cost and what you should see", () => {
    const steps = demoSteps({ ...cutSchedule(86_400_000, "18:00"), movesClose: "1 hour", thinkFee: "10", fee: "1%" });
    expect(steps.map((step) => step.id)).toEqual(["near", "buy", "save", "boo", "move", "cut", "receipts"]);
    for (const step of steps) {
      expect(step.time).not.toBe("");
      expect(step.cost).not.toBe("");
      expect(step.see).not.toBe("");
    }
    expect(steps.find((step) => step.id === "boo")!.cost).toContain("burns for good");
    expect(steps.find((step) => step.id === "cut")!.does.join(" ")).toContain("every day at 18:00 UTC");
  });
});
