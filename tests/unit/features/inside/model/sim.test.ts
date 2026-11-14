import { describe, expect, it } from "vitest";

import { chartPath, chartY, everyNthDay, SCENARIOS, simulate, type ScenarioKey } from "@/features/inside/model/sim";

const run = (key: ScenarioKey) => simulate(SCENARIOS.find((scenario) => scenario.key === key)!);
const whole = (value: number) => Math.round(value).toLocaleString("en-US");

// The SPEC-v19 §3 table, as printed by `scripts/sim.py`.
const SPEC: Record<ScenarioKey, { percent: string; burned: string; supply: string; prizes: string; every10: number[] }> = {
  steady: { percent: "17.28", burned: "1,728,189", supply: "8,271,811", prizes: "2,029,389", every10: [10_000_000, 9_688_728, 9_387_145, 9_094_949, 8_811_849, 8_537_561, 8_271_811] },
  top: { percent: "6.84", burned: "683,907", supply: "9,316,093", prizes: "985,107", every10: [10_000_000, 9_882_625, 9_766_627, 9_651_991, 9_538_700, 9_426_739, 9_316_093] },
  whale: { percent: "13.26", burned: "1,325,891", supply: "8,674,109", prizes: "1,627,091", every10: [10_000_000, 9_765_717, 9_536_923, 9_313_490, 9_095_291, 8_882_204, 8_674_109] },
  sybil: { percent: "17.28", burned: "1,728,189", supply: "8,271,811", prizes: "2,029,389", every10: [10_000_000, 9_688_728, 9_387_145, 9_094_949, 8_811_849, 8_537_561, 8_271_811] },
  ghost: { percent: "2.96", burned: "295,617", supply: "9,704,383", prizes: "319,617", every10: [10_000_000, 9_950_112, 9_900_474, 9_851_082, 9_801_938, 9_753_038, 9_704_383] },
};

describe("simulate (scripts/sim.py)", () => {
  it.each(Object.keys(SPEC) as ScenarioKey[])("reproduces the SPEC numbers for %s", (key) => {
    const result = run(key);
    const spec = SPEC[key];
    expect(result.burnedPercent.toFixed(2)).toBe(spec.percent);
    expect(whole(result.burned)).toBe(spec.burned);
    expect(whole(result.supply.at(-1)!)).toBe(spec.supply);
    expect(whole(result.prizes)).toBe(spec.prizes);
    expect(everyNthDay(result.supply).map(Math.round)).toEqual(spec.every10);
  });

  it("runs 60 daily cuts and only ever lowers supply", () => {
    const { supply } = run("steady");
    expect(supply).toHaveLength(61);
    expect(supply.every((value, day) => day === 0 || value < supply[day - 1]!)).toBe(true);
  });

  it("weighs a Sybil swarm exactly like Steady, because saves count by $CUT", () => {
    expect(run("sybil").supply).toEqual(run("steady").supply);
  });
});

describe("chart geometry", () => {
  it("maps 10.0M to the top line and 8.0M to the axis", () => {
    expect(chartY(10_000_000)).toBe(24);
    expect(chartY(8_000_000)).toBe(344);
  });

  it("draws one point every 10 days from day 0 to day 60", () => {
    const path = chartPath(everyNthDay(run("steady").supply));
    expect(path.startsWith("M70 24 L161 ")).toBe(true);
    expect(path.split(" L")).toHaveLength(7);
  });
});
