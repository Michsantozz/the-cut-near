import { cn } from "cn";

import { formatAmount } from "@/shared/ui/format";

import type { Agent } from "../model/types";

const whole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

/** "41,200 pile − 0 boos − 1,400 damage": the parts of the score, the ones that hurt in red. */
export function ScoreBreakdown({ agent, className }: { agent: Pick<Agent, "pile" | "boos" | "damage">; className?: string }) {
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-1 text-[12px] leading-[17px] font-semibold text-ink-3", className)}>
      <span>
        <b className="font-extrabold text-ink">{whole(agent.pile)}</b> saved
      </span>
      <span aria-hidden="true">−</span>
      <span className={agent.boos > 0n ? "text-burn" : undefined}>
        <span className="sr-only">minus </span>
        <b className="font-extrabold">{whole(agent.boos)}</b> boos
      </span>
      <span aria-hidden="true">−</span>
      <span className={agent.damage > 0n ? "text-burn" : undefined}>
        <span className="sr-only">minus </span>
        <b className="font-extrabold">{whole(agent.damage)}</b> damage
      </span>
    </p>
  );
}
