import { describe, expect, it } from "vitest";

import { getJournal } from "@/entities/journal/server";
import { buildInbox, isNew, noticeAge, type InboxInput } from "@/features/notifications/model/inbox";
import { units } from "@/shared/lib/amount";

const NOW = new Date("2026-11-14T01:00:00Z");
const CUT_AT = new Date("2026-11-14T18:00:00Z");

const base: InboxInput = {
  now: NOW,
  cutAt: CUT_AT,
  ranked: [
    { id: "velvet", name: "Velvet Vee", pile: units(74_200) },
    { id: "onyx", name: "Onyx Moon", pile: units(61_800) },
  ],
  savedOn: new Set(),
  claimable: 0n,
  cuts: [],
  claims: [],
  lowestPost: null,
  names: new Map([["kiko", "Kiko Bun"]]),
};

describe("buildInbox", () => {
  it("warns about the lowest robot and says no cut has run", () => {
    const notices = buildInbox(base);
    expect(notices[0]).toMatchObject({ kind: "danger", title: "Onyx Moon is on the block", at: NOW });
    expect(notices[0].text).toBe("Lowest pile: 61,800 $CUT, 12,401 short of Velvet Vee. The cut runs at 18:00 UTC.");
    expect(notices.some((n) => n.key === "no-cut")).toBe(true);
    expect(buildInbox({ ...base, savedOn: new Set(["onyx"]) })[0].title).toBe("Your robot Onyx Moon is on the block");
  });

  it("reports the cut and the prize waiting, newest first", async () => {
    const cuts = (await getJournal({ events: ["cut"], limit: 3, sampleMoment: "after-cut" })).entries;
    const notices = buildInbox({ ...base, cuts, claimable: units(632) / 100n, lowestPost: { text: "Save me", at: new Date("2026-11-13T14:00:00Z") } });
    expect(notices.map((n) => n.kind)).toEqual(["danger", "prize", "cut", "post"]);
    expect(notices[1].text).toBe("Kiko Bun was deleted. +6.32 $CUT waiting.");
    expect(notices[2].title).toBe("Kiko Bun was cut");
  });
});

describe("noticeAge and isNew", () => {
  it("dates notices like the design", () => {
    expect(noticeAge(NOW, NOW)).toBe("now");
    expect(noticeAge(new Date(NOW.getTime() - 12 * 60_000), NOW)).toBe("12m");
    expect(noticeAge(new Date(NOW.getTime() - 3 * 3_600_000), NOW)).toBe("3h");
    expect(noticeAge(new Date("2026-11-12T15:00:00Z"), NOW)).toBe("Thu");
    const notice = { key: "k", kind: "cut" as const, title: "", text: "", href: null };
    expect(isNew({ ...notice, at: new Date(NOW.getTime() - 3_600_000) }, NOW)).toBe(true);
    expect(isNew({ ...notice, at: new Date(NOW.getTime() - 25 * 3_600_000) }, NOW)).toBe(false);
  });
});
