import { describe, expect, it, vi } from "vitest";

import { loadPrizesPreview } from "@/features/prizes/server";
import { units } from "@/shared/lib/amount";

vi.mock("next/server", () => ({ connection: async () => {} }));

describe("the visitor's prizes page on the sample world", () => {
  it("shows the game's day prize so far and the season pot, the numbers the lineup shows", async () => {
    const data = await loadPrizesPreview();
    expect(data.nextCut.prizeSoFar).toBe(units(2_180));
    expect(data.seasonPot).toBe(units(21_460));
  });

  it("names the lowest score as the next cut, not the smallest pile", async () => {
    const data = await loadPrizesPreview();
    expect(data.nextCut.lowestId).toBe("yuna");
    expect(data.nextCut.lowestName).toBe(data.piles.find((pile) => pile.id === "yuna")?.name);
  });
});
