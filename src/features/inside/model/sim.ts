import { z } from "zod";

import raw from "../data/sim-v20.json";

// The v20 supply model: `python3 sim/thecut_sim.py --write` runs every scenario over 20 seeds and 60 daily cuts and
// writes ../data/sim-v20.json (full report: sim/RESULTS.md). The file is copied as is and checked here at import, so a
// broken copy fails the build instead of drawing a wrong chart.

export const SCENARIO_KEYS = ["steady", "whale", "sniper", "boo_war", "quiet", "ai_down"] as const;
export type ScenarioKey = (typeof SCENARIO_KEYS)[number];

export const BURN_SOURCES = ["boos", "attacks", "think_fees", "cut_piles", "prize_cap_excess", "heirless_wallets", "champion_wallets"] as const;
export type BurnSource = (typeof BURN_SOURCES)[number];

export const FAN_STRATEGIES = ["loyal", "hunter", "rescue", "top_safe", "trader"] as const;
export type FanStrategy = (typeof FAN_STRATEGIES)[number];

const whole = z.number().int().nonnegative();
const amount = z.number().nonnegative();

export function simSchema(days: number) {
  const series = z.array(whole).length(days + 1);
  const scenario = z.object({
    key: z.enum(SCENARIO_KEYS),
    what: z.string().min(1),
    /** Whole $CUT left on each day 0..days, across the seeds. */
    supply: z.object({ median: series, min: series, max: series }),
    /** Median per seed. */
    burned: whole,
    burned_pct: amount,
    /** Medians per seed, so they do not add up exactly to `burned`. */
    burn_by_source: z.object(Object.fromEntries(BURN_SOURCES.map((source) => [source, whole])) as Record<BurnSource, typeof whole>),
    /** Pooled over all seeds. */
    seasons_completed: whole,
    champions: z.object({ miser: whole, gambler: whole, traitor: whole, generous: whole }),
    pot_carried: whole,
  });
  return z.object({
    generated_by: z.string(),
    seeds: z.number().int().positive(),
    days: z.literal(days),
    supply0: whole,
    scenarios: z
      .array(scenario)
      .length(SCENARIO_KEYS.length)
      .refine((list) => SCENARIO_KEYS.every((key) => list.some((item) => item.key === key)), "every scenario once"),
    /** $CUT paid to the snipers, summed over all seeds. */
    sniper: z.object({ paid_with_cap: amount, paid_without_cap: amount, thin_crowd_with_cap: amount, thin_crowd_without_cap: amount }),
    /** Game return on the $CUT each fan strategy bought in `steady`, in percent with one decimal. */
    fan_returns_steady_pct: z.object(Object.fromEntries(FAN_STRATEGIES.map((key) => [key, z.number()])) as Record<FanStrategy, z.ZodNumber>),
  });
}

export type Sim = z.output<ReturnType<typeof simSchema>>;
export type SimScenario = Sim["scenarios"][number];

export const SIM_DAYS = 60;

/** The checked model, parsed once at import. */
export const SIM: Sim = simSchema(SIM_DAYS).parse(raw);

export const SIM_REPORT = "sim/RESULTS.md";

/** A pooled count as a per-run value: 120 seasons over 20 seeds → 6. */
export function perRun(pooled: number, seeds: number): number {
  return pooled / seeds;
}

/** The chart's vertical range: from the lowest min of any scenario, rounded down to `step`, up to the launch supply. */
export function supplyDomain(sim: Pick<Sim, "scenarios" | "supply0">, step = 500_000): [number, number] {
  const low = Math.min(...sim.scenarios.flatMap((scenario) => scenario.supply.min));
  return [Math.floor(low / step) * step, sim.supply0];
}
