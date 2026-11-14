"use client";

import { cn } from "cn";
import { useState } from "react";

import { ToggleGroup, ToggleGroupItem } from "@/shared/ui/toggle-group";

import { BURN_SOURCES, perRun, SCENARIO_KEYS, supplyDomain, type BurnSource, type ScenarioKey, type Sim } from "../model/sim";

const SCENARIO_LABEL: Record<ScenarioKey, string> = {
  steady: "Steady",
  whale: "Whale",
  sniper: "Sniper",
  boo_war: "Boo war",
  quiet: "Quiet",
  ai_down: "AI down",
};

const SOURCE_LABEL: Record<BurnSource, string> = {
  boos: "Boos",
  attacks: "Attacks",
  think_fees: "Think fees",
  cut_piles: "Half of cut piles",
  prize_cap_excess: "Prize above the cap",
  heirless_wallets: "Wallets with no heir",
  champion_wallets: "Champions’ wallets",
};

const PERSONALITY_LABEL = { miser: "Miser", gambler: "Gambler", traitor: "Traitor", generous: "Generous" } as const;

const isScenario = (value: string): value is ScenarioKey => (SCENARIO_KEYS as readonly string[]).includes(value);
const whole = (value: number) => Math.round(value).toLocaleString("en-US");
const millions = (value: number) => `${(value / 1_000_000).toFixed(1)}M`;
const oneDecimal = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Chart frame in SVG units. The SVG stretches to its box (strokes keep their width); the labels are HTML, so they
// stay readable at any width.
const W = 600;
const H = 240;
const PAD_Y = 8;
const DAY_TICKS = [0, 10, 20, 30, 40, 50, 60];

/** The 60-day supply model: one scenario at a time, its median line over the min-max band, and where its burns come from. */
export function SupplyModel({ sim }: { sim: Sim }) {
  const [key, setKey] = useState<ScenarioKey>("steady");
  const scenario = sim.scenarios.find((item) => item.key === key) ?? sim.scenarios[0]!;
  const [low, high] = supplyDomain(sim);
  const days = sim.days;
  const x = (day: number) => (day / days) * W;
  const y = (supply: number) => PAD_Y + ((high - supply) / (high - low)) * (H - 2 * PAD_Y);
  const top = (supply: number) => `${(y(supply) / H) * 100}%`;
  const line = (values: number[]) => values.map((value, day) => `${day === 0 ? "M" : "L"}${x(day).toFixed(1)},${y(value).toFixed(1)}`).join("");
  const band = `${line(scenario.supply.max)}${scenario.supply.min
    .map((value, day) => [day, value] as const)
    .reverse()
    .map(([day, value]) => `L${x(day).toFixed(1)},${y(value).toFixed(1)}`)
    .join("")}Z`;
  const gridSteps = Array.from({ length: Math.round((high - low) / 500_000) + 1 }, (_, i) => low + i * 500_000);
  const last = scenario.supply.median.at(-1) ?? sim.supply0;
  const sources = [...BURN_SOURCES].sort((a, b) => scenario.burn_by_source[b] - scenario.burn_by_source[a]);
  const topSource = Math.max(...sources.map((source) => scenario.burn_by_source[source]), 1);

  return (
    <section id="simulation" aria-labelledby="model-title" className="scroll-mt-4 rounded-3xl border-2 border-ink bg-paper px-4 pt-3.5 pb-4 shadow-hard lg:scroll-mt-24 lg:px-6 lg:pt-5 lg:pb-6">
      <h2 id="model-title" className="font-heading text-xl leading-[26px] font-extrabold tracking-[-0.4px] lg:text-[28px] lg:leading-8 lg:tracking-[-0.8px]">
        60 days of $CUT, simulated
      </h2>
      <p className="mt-1 text-[14px] leading-5 text-ink-3 lg:max-w-[900px] lg:text-[15px]">
        These rules, run {sim.seeds} times over {days} daily cuts. Fans follow simple strategies, and the agents follow short written policies that
        stand in for the AI, so real agents may play very differently. Line: the median run. Band: lowest to highest run.
      </p>
      <ToggleGroup
        type="single"
        variant="chip"
        size="sm"
        value={key}
        onValueChange={(value) => isScenario(value) && setKey(value)}
        aria-label="Scenario"
        className="mt-3 flex-wrap justify-start gap-1.5"
      >
        {SCENARIO_KEYS.map((item) => (
          <ToggleGroupItem key={item} value={item} className="lg:h-8 lg:px-3 lg:text-xs lg:font-extrabold">
            {SCENARIO_LABEL[item]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="mt-3 flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-6">
        <figure>
          <div className="flex gap-2">
            <div aria-hidden="true" className="relative h-[200px] w-9 shrink-0 lg:h-[260px]">
              {gridSteps.map((value) => (
                <span key={value} className="absolute right-0 -translate-y-1/2 text-[11px] font-bold text-ink-3" style={{ top: top(value) }}>
                  {millions(value)}
                </span>
              ))}
            </div>
            <div className="relative min-w-0 grow">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-labelledby="model-chart-title" className="block h-[200px] w-full overflow-visible lg:h-[260px]">
                <title id="model-chart-title">{`${SCENARIO_LABEL[key]}: $CUT supply from ${whole(sim.supply0)} on day 0 to ${whole(last)} on day ${days} (median run)`}</title>
                {gridSteps.map((value) => (
                  <line key={value} x1={0} x2={W} y1={y(value)} y2={y(value)} className="stroke-line" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                ))}
                {sim.scenarios
                  .filter((other) => other.key !== key)
                  .map((other) => (
                    <path key={other.key} d={line(other.supply.median)} fill="none" className="stroke-line-3" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  ))}
                <path d={band} className="fill-violet-soft" />
                <path
                  d={line(scenario.supply.median)}
                  fill="none"
                  className="stroke-violet"
                  strokeWidth={3.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span
                aria-hidden="true"
                className="absolute right-0 size-3 translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink bg-violet"
                style={{ top: top(last) }}
              />
              <div aria-hidden="true" className="relative mt-1 h-4">
                {DAY_TICKS.filter((day) => day <= days).map((day) => (
                  <span
                    key={day}
                    className={cn("absolute text-[11px] font-bold whitespace-nowrap text-ink-3 tabular-nums", day === 0 ? "" : day === days ? "-translate-x-full" : "-translate-x-1/2", days - day > 0 && days - day <= 10 && "max-sm:hidden")}
                    style={{ left: `${(day / days) * 100}%` }}
                  >
                    {day === days ? `Day ${day}` : day}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <figcaption className="mt-1.5 text-[12px] font-semibold text-ink-3">Gray lines: the median run of the other scenarios.</figcaption>
        </figure>

        <div className="flex flex-col gap-2.5">
          <p className="text-[14px] leading-5 text-ink-2">{scenario.what}</p>
          <dl className="grid grid-cols-2 gap-2">
            <Stat label={`Left after ${days} days`} value={whole(last)} note="$CUT, median run" tone="bg-lime-soft" />
            <Stat label="Burned" value={`${scenario.burned_pct.toFixed(2)}%`} note={`${whole(scenario.burned)} $CUT`} tone="bg-danger-soft" />
            <Stat label="Seasons per run" value={oneDecimal(perRun(scenario.seasons_completed, sim.seeds))} note="completed, with a champion" tone="bg-paper" />
            <Stat label="Pot carried per run" value={whole(perRun(scenario.pot_carried, sim.seeds))} note="$CUT to the next season" tone="bg-paper" />
          </dl>
          <div>
            <p className="text-[12px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">Champions per run, by personality</p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {(Object.keys(PERSONALITY_LABEL) as (keyof typeof PERSONALITY_LABEL)[]).map((id) => (
                <li key={id} className="rounded-full border-[1.5px] border-ink bg-paper px-2.5 text-[12.5px] leading-[22px] font-bold">
                  {PERSONALITY_LABEL[id]} {oneDecimal(perRun(scenario.champions[id], sim.seeds))}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t-2 border-dashed border-line-2 pt-3">
        <h3 className="text-[15px] font-extrabold lg:text-[17px]">What burned in {SCENARIO_LABEL[key].toLowerCase()}</h3>
        <ul className="mt-2 flex flex-col gap-1.5">
          {sources.map((source) => {
            const value = scenario.burn_by_source[source];
            return (
              <li key={source} className="flex items-center gap-2.5 text-[13px] font-bold">
                <span className="w-[132px] shrink-0 truncate lg:w-[170px]">{SOURCE_LABEL[source]}</span>
                <span aria-hidden="true" className="h-2.5 grow overflow-hidden rounded-[5px] bg-canvas">
                  <span className={cn("block h-full rounded-[inherit]", value > 0 ? "bg-burn" : "")} style={{ width: `${value > 0 ? Math.max((value / topSource) * 100, 1) : 0}%` }} />
                </span>
                <span className="w-[76px] shrink-0 text-right tabular-nums">{whole(value)}</span>
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-[12px] leading-4 font-semibold text-ink-3">
          $CUT, median run for each source, so the sources do not add up exactly to the total burned.
        </p>
      </div>
    </section>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return (
    <div className={cn("rounded-2xl border-2 border-ink px-3 py-2", tone)}>
      <dt className="text-[11px] font-extrabold tracking-[0.04em] text-ink-3 uppercase">{label}</dt>
      <dd className="text-[21px] leading-7 font-extrabold tabular-nums">{value}</dd>
      <dd className="text-[12px] leading-4 font-semibold text-ink-3">{note}</dd>
    </div>
  );
}
