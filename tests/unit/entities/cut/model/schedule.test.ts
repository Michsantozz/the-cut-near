import { describe, expect, it } from "vitest";

import { rollForward } from "@/entities/cut/model/schedule";

const DAY = 86_400_000;
const AT = new Date("2026-11-13T18:00:00Z");

describe("rollForward", () => {
  it("keeps a future time", () => {
    expect(rollForward(AT, new Date("2026-11-13T13:48:00Z"), DAY)).toEqual(AT);
  });

  it("moves a past time to the next interval after now", () => {
    expect(rollForward(AT, new Date("2026-11-14T00:19:00Z"), DAY)).toEqual(new Date("2026-11-14T18:00:00Z"));
    expect(rollForward(AT, new Date("2026-11-16T09:00:00Z"), DAY)).toEqual(new Date("2026-11-16T18:00:00Z"));
  });

  it("treats exactly now as past", () => {
    expect(rollForward(AT, AT, DAY)).toEqual(new Date("2026-11-14T18:00:00Z"));
  });
});
