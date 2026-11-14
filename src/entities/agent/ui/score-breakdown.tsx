import { cn } from "cn";

import { formatCutTenths } from "@/shared/ui/format";

import { scoreParts } from "../model/score";
import type { Agent } from "../model/types";

/**
 * "41,200 saved − 0.5 boos − 1,400 damage": the parts of the score, the ones that hurt in red. The numbers are the ones
 * `scoreParts` picks, so they add up to the score shown next to them.
 */
export function ScoreBreakdown({ agent, className }: { agent: Pick<Agent, "pile" | "boos" | "damage" | "score">; className?: string }) {
  const parts = scoreParts(agent);
  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-1 text-[12px] leading-[17px] font-semibold text-ink-3", className)}>
      <span>
        <b className="font-extrabold text-ink">{formatCutTenths(parts.pile)}</b> saved
      </span>
      <span aria-hidden="true">−</span>
      <span className={parts.boos > 0n ? "text-burn" : undefined}>
        <span className="sr-only">minus </span>
        <b className="font-extrabold">{formatCutTenths(parts.boos)}</b> boos
      </span>
      <span aria-hidden="true">−</span>
      <span className={parts.damage > 0n ? "text-burn" : undefined}>
        <span className="sr-only">minus </span>
        <b className="font-extrabold">{formatCutTenths(parts.damage)}</b> damage
      </span>
    </p>
  );
}
