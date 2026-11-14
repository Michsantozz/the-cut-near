import { describe, expect, it } from "vitest";

import raw from "@/features/inside/data/sim-v20.json";
import { perRun, SCENARIO_KEYS, SIM, SIM_DAYS, simSchema, supplyDomain } from "@/features/inside/model/sim";

const scenario = (key: string) => SIM.scenarios.find((item) => item.key === key)!;
const clone = () => JSON.parse(JSON.stringify(raw)) as typeof raw;

describe("the v20 supply model (sim/thecut_sim.py --write)", () => {
  it("parses the copied file: 20 seeds, 60 days, every scenario once with 61 points per series", () => {
    expect(SIM.seeds).toBe(20);
    expect(SIM.days).toBe(60);
    expect(SIM.supply0).toBe(10_000_000);
    expect(SIM.scenarios.map((item) => item.key).sort()).toEqual([...SCENARIO_KEYS].sort());
    for (const item of SIM.scenarios) {
      expect(item.supply.median).toHaveLength(61);
      expect(item.supply.median[0]).toBe(SIM.supply0);
      expect(item.supply.min.every((value, day) => value <= item.supply.median[day]! && item.supply.median[day]! <= item.supply.max[day]!)).toBe(true);
    }
  });

  it("keeps the numbers the rules page quotes", () => {
    expect(scenario("steady").supply.median.at(-1)).toBe(9_516_946);
    expect(scenario("steady").burned_pct).toBe(4.83);
    expect(scenario("whale").supply.median.at(-1)).toBe(8_289_386);
    expect(scenario("whale").burn_by_source.boos).toBeGreaterThan(scenario("whale").burned / 2);
    expect(scenario("quiet").supply.median.at(-1)).toBe(9_945_256);
    expect(SIM.sniper.paid_with_cap).toBe(49.57);
    expect(SIM.sniper.paid_without_cap).toBe(1_785.28);
    expect(SIM.fan_returns_steady_pct).toEqual({ loyal: -75.5, hunter: 12.3, rescue: 13.2, top_safe: 14.8, trader: -1.9 });
  });

  it("refuses a broken copy instead of drawing a wrong chart", () => {
    const short = clone();
    short.scenarios[0]!.supply.median.pop();
    expect(simSchema(SIM_DAYS).safeParse(short).success).toBe(false);

    const unknown = clone();
    unknown.scenarios[0]!.key = "moon";
    expect(simSchema(SIM_DAYS).safeParse(unknown).success).toBe(false);

    const missing = clone();
    missing.scenarios.pop();
    expect(simSchema(SIM_DAYS).safeParse(missing).success).toBe(false);

    const fractional = clone();
    fractional.scenarios[0]!.burned = 1.5;
    expect(simSchema(SIM_DAYS).safeParse(fractional).success).toBe(false);
  });

  it("turns pooled counts into per-run values and frames the chart", () => {
    expect(perRun(scenario("steady").seasons_completed, SIM.seeds)).toBe(6);
    const [low, high] = supplyDomain(SIM);
    expect(high).toBe(10_000_000);
    expect(low % 500_000).toBe(0);
    expect(low).toBeLessThanOrEqual(Math.min(...SIM.scenarios.flatMap((item) => item.supply.min)));
  });
});
