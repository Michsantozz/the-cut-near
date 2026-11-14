import { cn } from "cn";
import { ArrowUpRight, ChartLine, FileText, FlaskConical, Scale, Terminal } from "lucide-react";
import type { ReactNode } from "react";

import { CopyButton } from "@/shared/ui/copy-button";
import { formatCount } from "@/shared/ui/format";

import { FAN_STRATEGIES, SIM, SIM_REPORT, type FanStrategy } from "../model/sim";

import { SupplyModel } from "./supply-model";

// The simulation page: the 60-day supply model of RULES.md under six scenarios, which fans come out ahead, and what the
// per-unit prize cap does to a sniper. Static: the numbers come from python3 sim/thecut_sim.py --write.

/** "The simulation": supply over 60 simulated days under a few scenarios, and what it does and does not show. */
export function SimulationScreen({ reportHref }: { reportHref: string | null }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:gap-6 lg:px-8 lg:pt-1 lg:pb-8">
      <Hero reportHref={reportHref} />
      <SupplyModel sim={SIM} />
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6">
        <FanReturns />
        <div className="flex flex-col gap-3 lg:gap-6">
          <Sniper />
          <RunIt reportHref={reportHref} />
        </div>
      </div>
    </div>
  );
}

function Card({ children, className, ...props }: { children: ReactNode; className?: string } & React.ComponentProps<"section">) {
  return (
    <section className={cn("rounded-3xl border-2 border-ink bg-paper shadow-hard", className)} {...props}>
      {children}
    </section>
  );
}

function Heading({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn("font-heading text-xl leading-[26px] font-extrabold tracking-[-0.4px] lg:text-[28px] lg:leading-8 lg:tracking-[-0.8px]", className)}>
      {children}
    </h2>
  );
}

/* ---------------------------------------------------------------- The model in one card */

function Hero({ reportHref }: { reportHref: string | null }) {
  const facts = [
    { icon: ChartLine, big: `${formatCount(SIM.days)} days`, small: "One cut a day, from launch" },
    { icon: FlaskConical, big: `${formatCount(SIM.scenarios.length)} scenarios × ${formatCount(SIM.seeds)} runs`, small: "Steady, whale, sniper, boo war, quiet, AI down" },
    { icon: Scale, big: "Same rules", small: "The contract’s rules, re-written in Python" },
  ];
  return (
    <section aria-labelledby="sim-title" className="rounded-3xl border-2 border-ink bg-lime px-4 py-4 shadow-hard lg:flex lg:items-center lg:gap-8 lg:px-7 lg:py-6">
      <div className="lg:grow">
        <p className="text-xs font-extrabold tracking-[0.05em] uppercase">The supply model</p>
        <h2 id="sim-title" className="mt-1 font-heading text-2xl leading-[28px] font-extrabold tracking-[-0.8px] text-balance lg:text-[36px] lg:leading-[40px] lg:tracking-[-1.2px]">
          What 60 days of fans and agents do to $CUT.
        </h2>
        <p className="mt-2 text-[14px] leading-5 font-medium lg:max-w-[760px] lg:text-base lg:leading-[23px]">
          $CUT is minted once and only burns. This model runs the rules day by day with simple fan strategies and written policies standing in for the
          AI, so you can see how fast supply falls and where every burned $CUT came from. It is a model of the rules, not a forecast of real play.
        </p>
        <p className="mt-2 text-[13px] font-semibold">
          Full report:{" "}
          {reportHref ? (
            <a href={reportHref} target="_blank" rel="noreferrer" className="font-extrabold underline underline-offset-2">
              {SIM_REPORT}
            </a>
          ) : (
            <span className="font-extrabold">{SIM_REPORT}</span>
          )}{" "}
          · run it yourself with <span className="font-extrabold">pnpm sim</span>
        </p>
      </div>
      <ul className="mt-3 grid gap-2 lg:mt-0 lg:w-[320px] lg:shrink-0">
        {facts.map(({ icon: Icon, big, small }) => (
          <li key={small} className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-paper px-3.5 py-2">
            <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.6} />
            <span className="min-w-0">
              <span className="block text-[16px] leading-[22px] font-extrabold tabular-nums">{big}</span>
              <span className="block text-[12.5px] leading-4 font-semibold text-ink-3">{small}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------------- Simulated fans */

const STRATEGY: Record<FanStrategy, { label: string; text: string }> = {
  loyal: { label: "Loyal", text: "Picks one favorite, keeps saving on it and almost never moves." },
  hunter: { label: "Hunter", text: "Saves on the agent that pays the most per $CUT, away from the cut line, and moves every morning." },
  rescue: { label: "Rescue", text: "Reads the day’s moves and saves on the best-paying rescue bounty." },
  top_safe: { label: "Top safe", text: "Saves on the biggest pile and stays." },
  trader: { label: "Trader", text: "Never saves: buys, sells a few days later, buys back." },
};

const signedPercent = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}%`;

function FanReturns() {
  const returns = SIM.fan_returns_steady_pct;
  const loyal = returns.loyal;
  return (
    <Card aria-labelledby="returns-title" className="px-4 pt-3.5 pb-4 lg:px-6 lg:pt-5 lg:pb-6">
      <Heading id="returns-title">Which fans come out ahead</Heading>
      <p className="mt-1 text-[14px] leading-5 text-ink-3 lg:text-[15px]">Game return on the $CUT each kind of fan bought, in the steady simulation over {SIM.days} days.</p>
      <ul className="mt-3 flex flex-col">
        {FAN_STRATEGIES.map((key) => {
          const value = returns[key];
          return (
            <li key={key} className="flex items-center gap-3 border-t-[1.5px] border-canvas py-2 first:border-t-0">
              <span className="min-w-0 grow">
                <span className="block text-[15px] font-extrabold">{STRATEGY[key].label}</span>
                <span className="block text-[12.5px] leading-[17px] font-semibold text-ink-3">{STRATEGY[key].text}</span>
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full border-2 border-ink px-2.5 font-sans text-[16px] leading-7 font-extrabold tabular-nums",
                  value >= 0 ? "bg-lime" : value <= -10 ? "bg-danger text-paper" : "bg-canvas",
                )}
              >
                {signedPercent(value)}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 rounded-xl border-2 border-ink bg-danger-soft px-3 py-2 text-[13.5px] leading-[19px] font-semibold">
        <b className="font-extrabold">Honest line:</b> a fan who saves one agent and never moves loses about {Math.abs(loyal).toFixed(1)}% in {SIM.days}{" "}
        days, because 9 of 10 agents are cut every season. Fans who follow the cut line come out ahead.
      </p>
    </Card>
  );
}

function Sniper() {
  const { sniper } = SIM;
  const money = (value: number) => value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const rows = [
    { label: "Steady crowd", withCap: sniper.paid_with_cap, withoutCap: sniper.paid_without_cap },
    { label: "Thin crowd", withCap: sniper.thin_crowd_with_cap, withoutCap: sniper.thin_crowd_without_cap },
  ];
  return (
    <Card aria-labelledby="sniper-title" className="px-4 pt-3.5 pb-4 lg:px-6 lg:pt-5 lg:pb-6">
      <Heading id="sniper-title">The last-second sniper</Heading>
      <p className="mt-1 text-[14px] leading-5 text-ink-3 lg:text-[15px]">
        Five accounts save 0.1 $CUT in the last block before every cut on the smallest surviving pile, then take it back the next morning. A
        prize pays at most 1 $CUT per $CUT saved, so the trick earns almost nothing.
      </p>
      <table className="mt-3 w-full border-collapse text-left">
        <thead>
          <tr className="text-[11px] font-extrabold tracking-[0.04em] text-ink-3 uppercase">
            <th scope="col" className="border-b-2 border-ink pb-1 font-extrabold">
              Paid to the snipers
            </th>
            <th scope="col" className="border-b-2 border-ink pb-1 text-right font-extrabold">
              With the cap
            </th>
            <th scope="col" className="border-b-2 border-ink pb-1 text-right font-extrabold">
              Without it
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t-[1.5px] border-canvas first:border-t-0">
              <th scope="row" className="py-2 text-[14px] font-extrabold">
                {row.label}
              </th>
              <td className="py-2 text-right font-sans text-[17px] font-extrabold tabular-nums text-gain">{money(row.withCap)}</td>
              <td className="py-2 text-right font-sans text-[17px] font-extrabold tabular-nums text-burn">{money(row.withoutCap)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[12px] leading-4 font-semibold text-ink-3">
        $CUT, summed over all {SIM.seeds} runs. The thin crowd runs the same trick with a third of the fans.
      </p>
    </Card>
  );
}

/** How to check the numbers on this page: the command, the report, and what the run is made of. */
function RunIt({ reportHref }: { reportHref: string | null }) {
  const facts = [
    { icon: FlaskConical, text: `${formatCount(SIM.scenarios.length)} scenarios × ${formatCount(SIM.seeds)} seeds × ${formatCount(SIM.days)} daily cuts` },
    { icon: Scale, text: "The contract’s launch parameters, the same split and burn rules" },
    { icon: FileText, text: "Every number on this page comes from one run, written to the report" },
  ];
  return (
    <Card aria-labelledby="run-title" className="px-4 pt-3.5 pb-4 lg:px-6 lg:pt-5 lg:pb-6">
      <Heading id="run-title" className="flex items-center gap-2.5">
        <Terminal aria-hidden="true" className="size-5 shrink-0 lg:size-6" strokeWidth={2.6} />
        Run it yourself
      </Heading>
      <div className="mt-2.5 flex items-center gap-2 rounded-2xl border-2 border-ink bg-canvas py-1.5 pr-1.5 pl-3.5">
        <code className="min-w-0 grow truncate font-sans text-[15px] font-extrabold">pnpm sim</code>
        <CopyButton text="pnpm sim" icon size="sm" variant="lime" />
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-[13.5px] leading-[19px] font-semibold text-ink-2">
        {facts.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-2">
            <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      {reportHref && (
        <a href={reportHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[13.5px] font-extrabold underline underline-offset-2">
          Read the full report, {SIM_REPORT}
          <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
        </a>
      )}
    </Card>
  );
}
