import { describe, expect, it, vi } from "vitest";

import { loadClub } from "@/features/club/server";

vi.mock("next/server", () => ({ connection: async () => {} }));

describe("the club's off-chain extras", () => {
  it("exist on the sample day: perks, points and the savers' ranking", async () => {
    const club = await loadClub("mika.near");
    expect(club.extras).toBe(true);
    expect(club.perks.length).toBeGreaterThan(0);
    expect(club.member?.points).not.toBeNull();
  });
});
