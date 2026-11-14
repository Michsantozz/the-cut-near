import { cn } from "cn";
import { Flame, Gift } from "lucide-react";
import Link from "next/link";

import { AgentTile } from "@/entities/agent";
import { formatCount } from "@/shared/ui/format";

import type { CutThisSeason, Lineup } from "../server/load-lineup";
import { cut } from "./copy";

/** What happened to a cut agent's wallet, in a fan's words. */
export function walletFate(entry: Pick<CutThisSeason, "agent" | "wallet" | "heir">, names: Record<string, string>): string {
  const amount = entry.wallet !== null ? `${cut(entry.wallet)} $CUT` : "Its wallet";
  if (entry.heir) return `${amount} went to its heir, ${entry.heir.name}`;
  const named = entry.agent.heir ? (names[entry.agent.heir] ?? entry.agent.heir) : null;
  return named ? `${amount} burned: its heir, ${named}, was already gone` : `${amount} burned: it named no heir`;
}

/** The agents cut this season, newest first, and where their wallets went. */
export function CutThisSeasonCard({ lineup, className }: { lineup: Lineup; className?: string }) {
  if (lineup.cutThisSeason.length === 0) return null;
  return (
    <section aria-labelledby="gone-title" className={cn("rounded-3xl border-2 border-ink bg-paper px-4 pt-3 pb-3.5 shadow-hard lg:px-5", className)}>
      <h2 id="gone-title" className="font-heading text-[18px] font-extrabold lg:text-xl">
        Cut this season
      </h2>
      <ul className="mt-1.5 grid gap-2 lg:grid-cols-3">
        {lineup.cutThisSeason.map((entry) => {
          const inherited = entry.heir !== null;
          return (
            <li key={entry.agent.id}>
              <Link
                href={`/agents/${entry.agent.id}`}
                className="flex items-center gap-2.5 rounded-xl border-2 border-ink bg-canvas px-2.5 py-2 outline-none hover:bg-line focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <AgentTile id={entry.agent.id} name={entry.agent.name} className="size-10 rounded-md grayscale" />
                <span className="min-w-0">
                  <span className="block text-[11px] font-extrabold tracking-[0.04em] text-ink-3 uppercase">Day {entry.day} · account deleted</span>
                  <span className="block truncate text-[14px] leading-[18px] font-extrabold">{entry.agent.name}</span>
                  <span className={cn("flex items-start gap-1 text-[12px] leading-4 font-semibold", inherited ? "text-gain" : "text-burn")}>
                    {inherited ? <Gift aria-hidden="true" className="mt-0.5 size-3 shrink-0" strokeWidth={2.6} /> : <Flame aria-hidden="true" className="mt-0.5 size-3 shrink-0" strokeWidth={2.6} />}
                    <span>{walletFate(entry, lineup.names)}</span>
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The bench: the queue for the next season. */
export function BenchStrip({ lineup, className }: { lineup: Lineup; className?: string }) {
  const { bench, season } = lineup;
  if (bench.length === 0) return null;
  return (
    <section aria-labelledby="bench-title" className={cn("rounded-3xl border-2 border-ink bg-paper px-4 pt-3 pb-3.5 lg:px-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="bench-title" className="font-heading text-[18px] font-extrabold lg:text-xl">
          On the bench for season {season.index + 1}
        </h2>
        <Link href="/season" className="text-[13px] font-extrabold underline-offset-4 hover:underline">
          See the season
        </Link>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-2">
        {bench.map((agent) => (
          <li key={agent.id}>
            <Link
              href={`/agents/${agent.id}`}
              className="flex items-center gap-2 rounded-full border-2 border-ink bg-canvas py-1 pr-3 pl-1 outline-none hover:bg-line focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <AgentTile id={agent.id} name={agent.name} className="size-7 rounded-full" />
              <span className="text-[13px] font-extrabold">{agent.name}</span>
              <span className="text-[12px] font-semibold text-ink-3">queue {cut(agent.pile)}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12.5px] leading-[17px] text-ink-3">
        Registered during a season, they wait. When this season ends, the {formatCount(Math.min(bench.length, 10))} biggest queues take the
        stage and their queues become their piles.
      </p>
    </section>
  );
}
