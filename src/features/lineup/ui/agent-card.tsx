import { cn } from "cn";
import { Gauge, Handshake, Hourglass, Plus, ThumbsDown, Wallet } from "lucide-react";
import Link from "next/link";

import { AgentPoses, AgentTile, agentPoses, PersonalityChip, ScoreBreakdown, type PersonalityId } from "@/entities/agent";
import { MoveCard } from "@/entities/move";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { formatUtcTime } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import type { StageEntry } from "../model/board";
import { cut, cutFine, shortName } from "./copy";

/** The art box's backdrop, by personality: a light wash of the chip's color. */
const BACKDROP: Record<PersonalityId, string> = {
  miser: "bg-sky/30",
  gambler: "bg-orange/30",
  traitor: "bg-pink/30",
  generous: "bg-lime/40",
};

/**
 * One agent on the stage: who it is, its personality and limit, its score and the parts of it, its wallet and
 * heir, today's move with the reason in its own voice, and the fan's two buttons. The agent on the cut line gets
 * a red outline and a red wash, never a side stripe.
 */
export function AgentCard({
  entry,
  names,
  sample,
  movesCloseAt,
  saved,
}: {
  entry: StageEntry;
  names: Record<string, string>;
  sample: boolean;
  movesCloseAt: Date;
  /** The viewer's save on this agent, if any. */
  saved: bigint | null;
}) {
  const { agent, rank, isLowest, move } = entry;
  const heir = agent.heir ? (names[agent.heir] ?? agent.heir) : null;

  return (
    <article
      aria-labelledby={`agent-${agent.id}`}
      data-lowest={isLowest || undefined}
      className={cn(
        "flex flex-col rounded-3xl border-2 bg-paper p-3 shadow-hard transition-transform pointer-fine:hover:-translate-y-0.5 lg:p-3.5",
        isLowest ? "border-danger bg-danger-soft shadow-[4px_4px_0_var(--color-danger)]" : "border-ink",
      )}
    >
      <div className="flex gap-3">
        <Link
          href={`/agents/${agent.id}`}
          aria-label={`${agent.name}: see its page`}
          className={cn(
            "relative flex size-[92px] shrink-0 items-end justify-center overflow-hidden rounded-2xl border-2 border-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            isLowest ? "bg-violet-deep bg-[radial-gradient(circle_at_50%_0%,var(--color-danger)_0%,transparent_75%)]" : BACKDROP[agent.personality],
          )}
        >
          {agentPoses(agent.id) ? <AgentPoses id={agent.id} imageClassName="h-[86px] w-auto" /> : <AgentTile id={agent.id} name={agent.name} className="mb-3 size-14" />}
          <span className="absolute top-1 left-1 rounded-full border-[1.5px] border-ink bg-paper px-1.5 text-[10.5px] leading-4 font-extrabold">#{rank}</span>
        </Link>
        <div className="min-w-0 grow">
          <h3 id={`agent-${agent.id}`} className="flex items-center gap-1.5 font-heading text-[19px] leading-6 font-extrabold">
            <Link href={`/agents/${agent.id}`} className="truncate rounded-xs outline-none hover:underline max-sm:-my-2.5 max-sm:py-2.5 focus-visible:ring-3 focus-visible:ring-ring/50">
              {agent.name}
            </Link>
            {saved !== null && (
              <Badge variant="lime" size="xs" className="uppercase">
                Your {cutFine(saved)}
              </Badge>
            )}
          </h3>
          <p className="truncate text-[12.5px] leading-4 font-medium text-ink-3">{agent.tagline}</p>
          <PersonalityChip personality={agent.personality} className="mt-1.5" />
          {agent.pacts.length > 0 && (
            <p className="mt-1 flex items-center gap-1 truncate text-[11.5px] font-bold text-ink-2">
              <Handshake aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.4} />
              Pact with {agent.pacts.map((id) => names[id] ?? id).join(", ")}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex items-end justify-between gap-2 border-t-[1.5px] border-ink/15 pt-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1 text-[10.5px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">
            <Gauge aria-hidden="true" className="size-3 shrink-0" strokeWidth={2.8} />
            Score
          </p>
          <p className={cn("font-heading text-[28px] leading-8 font-extrabold tracking-[-0.8px]", isLowest && "text-danger")}>{cut(agent.score)}</p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-1 text-[10.5px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">
            <Wallet aria-hidden="true" className="size-3 shrink-0" strokeWidth={2.8} />
            Wallet
          </p>
          <p className="font-heading text-[17px] leading-6 font-extrabold">{cut(agent.wallet)} $CUT</p>
        </div>
      </div>
      {/* On a phone the breakdown and the heir line stay on the agent's page, except for the agent on the cut line. */}
      <ScoreBreakdown agent={agent} className={cn(!isLowest && "max-sm:hidden")} />
      <p className={cn("mt-0.5 truncate text-[12px] leading-[17px] font-semibold text-ink-3", !isLowest && "max-sm:hidden")}>
        {heir ? `If cut, its wallet goes to ${heir}` : "No heir: if cut, its wallet burns"}
        {agent.bounty > 0n && ` · ${cut(agent.bounty)} $CUT rescue bounty`}
      </p>

      {move ? (
        <MoveCard move={move} names={names} sample={sample} className="mt-2.5" />
      ) : (
        <p
          title={`No move yet. ${shortName(agent.name)} can still act until ${formatUtcTime(movesCloseAt)} UTC; no move means it holds.`}
          className="mt-2.5 inline-flex h-7 w-fit max-w-full items-center gap-1.5 rounded-full border-[1.5px] border-dashed border-ink/40 px-2.5 text-[12px] font-bold text-ink-3"
        >
          <Hourglass aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.6} />
          <span className="truncate">Thinking · moves by {formatUtcTime(movesCloseAt)} UTC, or it holds</span>
        </p>
      )}

      <div className="mt-auto flex gap-2 pt-3">
        <Button asChild variant="lime" size="md" className="flex-1">
          <WalletGatedLink href={`/save/${agent.id}`}>
            <Plus aria-hidden="true" strokeWidth={3} />
            Save
          </WalletGatedLink>
        </Button>
        <Button asChild variant="outline" size="md" className="flex-1">
          <WalletGatedLink href={`/boo/${agent.id}`}>
            <ThumbsDown aria-hidden="true" strokeWidth={2.6} />
            Boo
          </WalletGatedLink>
        </Button>
      </div>
    </article>
  );
}
