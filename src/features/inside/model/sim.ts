// The 60-day supply model of `scripts/sim.py` (SPEC-v19 §3): one cut a day, Nov 13 to Jan 11.
// Each day a share of supply is saved, the lowest pile is a share of what is saved, and half of it burns.
// The other half plus the day's fees is the prize. A model of crowds, not a forecast: plain floats are fine here.

export const SIM_DAYS = 60;
export const SIM_SUPPLY = 10_000_000;

export type ScenarioKey = "steady" | "top" | "whale" | "sybil" | "ghost";

export type Scenario = {
  key: ScenarioKey;
  name: string;
  what: string;
  /** Share of the supply saved in piles. */
  savedShare: number;
  /** The lowest pile as a share of what is saved. */
  lowestShare: number;
  /** Fees that reach the prize every day, in $CUT. */
  dailyFees: number;
};

const SAVED = 0.10524;

/** The five crowds of the SPEC, with the parameters of `scripts/sim.py`. */
export const SCENARIOS: readonly Scenario[] = [
  { key: "steady", name: "Steady", what: "Equal slices pull savers to the bottom; the lowest pile is about 6% of what is saved.", savedShare: SAVED, lowestShare: 0.06, dailyFees: 5_020 },
  { key: "top", name: "Top-heavy", what: "Fans ignore the slices and stack the leaders, like today.", savedShare: SAVED, lowestShare: 23_600 / 1_052_400, dailyFees: 5_020 },
  { key: "whale", name: "Whale sniper", what: "A whale saves the bottom robot at 17:59; another one falls instead.", savedShare: SAVED, lowestShare: 0.045, dailyFees: 5_020 },
  { key: "sybil", name: "Sybil swarm", what: "5,000 fake accounts with 1 $CUT each.", savedShare: SAVED, lowestShare: 0.06, dailyFees: 5_020 },
  { key: "ghost", name: "Ghost town", what: "Almost nobody saves: 2% of supply.", savedShare: 0.02, lowestShare: 0.05, dailyFees: 400 },
];

export type SimResult = {
  scenario: Scenario;
  /** Supply after each day, day 0 (launch) to the last day. */
  supply: number[];
  burned: number;
  prizes: number;
  /** Burned as a percent of the starting supply. */
  burnedPercent: number;
};

export function simulate(scenario: Scenario, days = SIM_DAYS, start = SIM_SUPPLY): SimResult {
  let supply = start;
  let burned = 0;
  let prizes = 0;
  const series = [supply];
  for (let day = 0; day < days; day++) {
    const burn = (supply * scenario.savedShare * scenario.lowestShare) / 2;
    supply -= burn;
    burned += burn;
    prizes += burn + scenario.dailyFees;
    series.push(supply);
  }
  return { scenario, supply: series, burned, prizes, burnedPercent: (burned / start) * 100 };
}

/** Supply every `step` days, day 0 included: the chart's points. */
export function everyNthDay(series: readonly number[], step = 10): number[] {
  return series.filter((_, day) => day % step === 0);
}

/** Chart geometry of the design (Landing.dc.html): x from 70 to 616 over the days, y from 24 (10.0M) to 344 (8.0M). */
export const CHART = { left: 70, right: 616, top: 24, bottom: 344, max: 10_000_000, min: 8_000_000 } as const;

const round1 = (value: number) => Math.round(value * 10) / 10;

export function chartX(index: number, points: number): number {
  return round1(CHART.left + (index * (CHART.right - CHART.left)) / (points - 1));
}

export function chartY(supply: number): number {
  return round1(CHART.top + ((CHART.max - supply) / (CHART.max - CHART.min)) * (CHART.bottom - CHART.top));
}

/** An SVG path through the points: "M70 24 L161 73.8 …". */
export function chartPath(points: readonly number[]): string {
  return points.map((value, index) => `${index ? "L" : "M"}${chartX(index, points.length)} ${chartY(value)}`).join(" ");
}
