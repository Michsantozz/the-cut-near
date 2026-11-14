import { describe, expect, it } from "vitest";

import { getNextCut } from "@/entities/cut/server";
import { getParams, getPriceHistory } from "@/entities/market/server";
import { getStage } from "@/entities/agent/server";
import { chartGeometry, niceDomain, niceStep, tickTimes, toChartValues } from "@/features/trade/model/chart";
import { buildPicker, defaultSave, ordinal, saveProblem, shareIfCutNow } from "@/features/trade/model/save";
import { units } from "@/shared/lib/amount";
import { formatAmount } from "@/shared/ui/format";

const two = (v: bigint | null) => (v === null ? null : formatAmount(v, { maxFractionDigits: 2, minFractionDigits: 2 }));

describe("save picker", () => {
  it("ranks the stage by score and prices it with the fees so far, like the lineup", async () => {
    const picker = buildPicker(await getStage(), (await getNextCut()).prizeSoFar, await getParams());
    const byId = new Map(picker.choices.map((c) => [c.agent.id, c]));
    expect(picker.choices.at(-1)?.agent.id).toBe("yuna");
    expect(byId.get("yuna")?.isLowest).toBe(true);
    expect(byId.get("yuna")?.paysPer100).toBeNull();
    // Lila's pile (19,800) is bigger than Gremlin's (16,300), but boos put her score lower: she still pays less per $CUT.
    expect(byId.get("gremlin")!.paysPer100! > byId.get("lila")!.paysPer100!).toBe(true);
    expect(byId.get("melody")?.rank).toBe(4);
  });

  it("shares the slice once the save is in the pile", () => {
    const melody = { agent: { pile: units(112_300) }, isLowest: false } as Parameters<typeof shareIfCutNow>[0];
    // The design's 400 of 112,300 with a 1,775.4 slice is 6.32; adding 400 more makes the pile 112,700.
    expect(two(shareIfCutNow(melody, units(17_754) / 10n, units(400)))).toBe("6.30");
    expect(shareIfCutNow({ ...melody, isLowest: true }, units(1), units(1))).toBeNull();
    expect(shareIfCutNow(melody, units(1), 0n)).toBeNull();
  });

  it("checks the amount and names the rank", () => {
    expect(defaultSave(units(2742) / 10n)).toBe(units(100));
    expect(defaultSave(units(5))).toBe(units(5));
    expect(saveProblem(null, units(1), false)).toBe("empty");
    expect(saveProblem(units(2), units(1), false)).toBe("too-much");
    expect(saveProblem(units(1) / 100n, units(1), false)).toBe("too-small");
    expect(saveProblem(units(1) / 100n, units(1), true)).toBeNull();
    expect([1, 2, 3, 4, 5, 11, 12, 13, 21].map(ordinal)).toEqual(["1st", "2nd", "3rd", "4th", "5th", "11th", "12th", "13th", "21st"]);
  });
});

describe("price chart", () => {
  it("draws the design's week in dollars with gridlines at 1.75 / 1.80 / 1.85", async () => {
    const prices = await getPriceHistory("week");
    const values = toChartValues(prices, 250n);
    expect(values.at(-1)?.v).toBe(1.84);
    const domain = niceDomain(values.map((p) => p.v));
    expect(domain.ticks.map((t) => t.toFixed(2))).toEqual(["1.85", "1.80", "1.75"]);
    const geo = chartGeometry(values, domain);
    expect(geo.line.startsWith("M0 ")).toBe(true);
    expect(geo.last?.x).toBe(100);
    expect(tickTimes(prices).map((d) => d.toISOString().slice(11, 16))).toEqual(["15:01", "02:24", "13:48"]);
  });

  it("charts NEAR without a dollar price, and survives one point or none", () => {
    expect(toChartValues([{ at: new Date(0), yoctoNearPerCut: units(736, 21) }], null)[0].v).toBe(0.736);
    expect(chartGeometry([], { min: 0, max: 1 }).last).toBeNull();
    expect(chartGeometry([{ t: 1, v: 2 }], { min: 2, max: 2 }).line).toBe("M0 500 L1000 500");
    expect(niceStep(0.0357)).toBe(0.05);
    expect(niceDomain([]).ticks).toEqual([]);
  });
});
