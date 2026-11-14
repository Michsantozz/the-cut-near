import { describe, expect, it } from "vitest";

import { getJournal } from "@/entities/journal/server";
import { getParams } from "@/entities/market/server";
import type { Robot } from "@/entities/robot";
import { getBench, getRobot, getStage } from "@/entities/robot/server";
import { historyLine } from "@/features/robot-profile/model/history";
import { bannerFor, gapToPass, ladder, paysFor, standingOf } from "@/features/robot-profile/model/profile";
import { units } from "@/shared/lib/amount";

const robot = (id: string, pile: number, joined: string, status: Robot["status"] = "stage") =>
  ({ id, name: id, pile: units(pile), joinedAt: new Date(joined), status }) as Robot;

describe("gapToPass", () => {
  it("needs one more $CUT unless it wins the tie as the older robot", () => {
    const old = robot("old", 100, "2026-11-12T15:00:00Z");
    const young = robot("young", 100, "2026-11-13T15:00:00Z");
    expect(gapToPass(old, young)).toBe(0n);
    expect(gapToPass(young, old)).toBe(units(1));
    expect(gapToPass(robot("low", 40, "2026-11-12T15:00:00Z"), young)).toBe(units(60));
    expect(gapToPass(robot("low", 40, "2026-11-14T15:00:00Z"), young)).toBe(units(61));
  });
});

describe("profile of the sample day", () => {
  it("ranks Kiko Bun lowest, on the block, with no payout", async () => {
    const [stage, bench, params] = await Promise.all([getStage(), getBench(), getParams()]);
    const kiko = (await getRobot("kiko"))!;
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
    const melody = (await getRobot("melody"))!;
    const pays = paysFor(melody, stage, units(4_100), params, units(400));
    expect(pays?.per100).toBeGreaterThan(0n);
    expect(pays?.note).toMatch(/^Your 400 would get [\d.]+ \$CUT\.$/);
    const chartwise = (await getRobot("chartwise"))!;
    expect(standingOf(chartwise, stage, bench)).toMatchObject({ place: "bench", rank: 1 });
    expect(standingOf({ ...chartwise, status: "deleted" }, stage, bench)).toEqual({ place: "deleted" });
  });

  it("writes its history from the journal", async () => {
    const { entries } = await getJournal({ robotId: "kiko", limit: 50, sampleMoment: "after-cut" });
    const lines = entries.map((e) => historyLine(e, "Kiko Bun")).filter((l) => l !== null);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((l) => l.text.includes("deleted"))).toBe(true);
  });
});
