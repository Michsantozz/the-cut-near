import { describe, expect, it } from "vitest";

import { getJournal } from "@/entities/journal/server";
import { getParams } from "@/entities/market/server";
import type { Agent } from "@/entities/agent";
import { getBench, getAgent, getStage } from "@/entities/agent/server";
import { historyLine } from "@/features/agent-profile/model/history";
import { bannerFor, gapToPass, ladder, paysFor, standingOf } from "@/features/agent-profile/model/profile";
import { units } from "@/shared/lib/amount";

const agent = (id: string, pile: number, joined: string, status: Agent["status"] = "stage") =>
  ({ id, name: id, pile: units(pile), joinedAt: new Date(joined), status }) as Agent;

describe("gapToPass", () => {
  it("needs one more $CUT unless it wins the tie as the older agent", () => {
    const old = agent("old", 100, "2026-11-12T15:00:00Z");
    const young = agent("young", 100, "2026-11-13T15:00:00Z");
    expect(gapToPass(old, young)).toBe(0n);
    expect(gapToPass(young, old)).toBe(units(1));
    expect(gapToPass(agent("low", 40, "2026-11-12T15:00:00Z"), young)).toBe(units(60));
    expect(gapToPass(agent("low", 40, "2026-11-14T15:00:00Z"), young)).toBe(units(61));
  });
});

describe("profile of the sample day", () => {
  it("ranks Kiko Bun lowest, on the block, with no payout", async () => {
    const [stage, bench, params] = await Promise.all([getStage(), getBench(), getParams()]);
    const kiko = (await getAgent("kiko"))!;
    const standing = standingOf(kiko, stage, bench);
    expect(standing).toMatchObject({ place: "stage", rank: 10, of: 10, isLowest: true });
    expect(paysFor(kiko, stage, units(4_100), params, 0n)).toBeNull();
    expect(bannerFor(kiko, standing, stage, bench, 0n, "18:00 UTC")?.tone).toBe("danger");
    const rows = ladder(kiko, stage, bench);
    expect(rows.filter((r) => r.me)).toHaveLength(1);
    expect(rows.find((r) => r.lowest)?.id).toBe("kiko");
  });

  it("pays a saver on a survivor and ranks the bench apart", async () => {
    const [stage, bench, params] = await Promise.all([getStage(), getBench(), getParams()]);
    const melody = (await getAgent("melody"))!;
    const pays = paysFor(melody, stage, units(4_100), params, units(400));
    expect(pays?.per100).toBeGreaterThan(0n);
    expect(pays?.note).toMatch(/^Your 400 would get [\d.]+ \$CUT\.$/);
    const chartwise = (await getAgent("chartwise"))!;
    expect(standingOf(chartwise, stage, bench)).toMatchObject({ place: "bench", rank: 1 });
    expect(standingOf({ ...chartwise, status: "deleted" }, stage, bench)).toEqual({ place: "deleted" });
  });

  it("writes its history from the journal", async () => {
    const { entries } = await getJournal({ agentId: "kiko", limit: 50, sampleMoment: "after-cut" });
    const lines = entries.map((e) => historyLine(e, "Kiko Bun")).filter((l) => l !== null);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.text.includes("deleted"))).toBe(true);
  });
});
