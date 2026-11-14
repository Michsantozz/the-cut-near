import { describe, expect, it, vi } from "vitest";

import { potPayout } from "@/features/season/model/season";
import { loadSeason } from "@/features/season/server";
import { units } from "@/shared/lib/amount";

vi.mock("next/server", () => ({ connection: async () => {} }));

describe("the season page (sample world)", () => {
  it("shows season 1 on day 4: seven alive, three seats crossed out, Pixie leading, three on the bench", async () => {
    const page = await loadSeason();
    expect(page.season).toMatchObject({ index: 1, day: 4, alive: 7, active: true, champion: null });
    expect(page.seats.filter((seat) => seat.state === "cut").map((seat) => seat.agent.id)).toEqual(["velvet", "onyx", "kiko"]);
    expect(page.leader?.id).toBe("pixie");
    expect(page.crowned).toBeNull();
    expect(page.bench.map((agent) => agent.id)).toEqual(["chartwise", "bloop", "pixelkit"]);
    expect(page.preview).toBe(false);
  });

  it("previews the crown in sample mode: the leader is crowned at the cut that closes day 9", async () => {
    const page = await loadSeason({ preview: true });
    expect(page.preview).toBe(true);
    expect(page.season).toMatchObject({ active: false, alive: 1, day: 9, champion: "pixie" });
    expect(page.crowned?.potPaid).toBe(units(21_460));
    expect(page.seats.filter((seat) => seat.state === "cut")).toHaveLength(9);
  });
});

describe("pot payout", () => {
  it("pays the champion's savers at most 1 $CUT per $CUT saved and carries the rest", () => {
    expect(potPayout(units(100), units(40))).toEqual({ paid: units(40), carried: units(60) });
    expect(potPayout(units(100), units(400))).toEqual({ paid: units(100), carried: 0n });
    expect(potPayout(units(100), 0n)).toEqual({ paid: 0n, carried: units(100) });
  });
});
