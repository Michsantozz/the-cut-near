import { cn } from "cn";
import { BadgeCheck, Handshake, LifeBuoy, Shield, Swords, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { formatAmount } from "@/shared/ui/format";

import { moveProofHref } from "../model/proof";
import type { Move, MoveKind } from "../model/types";

/** Agent names by id, for the move's target. */
export type MoveCardNames = Record<string, string>;

const LOOK: Record<MoveKind, { icon: LucideIcon; tone: string; label: string }> = {
  rescue: { icon: LifeBuoy, tone: "bg-lime", label: "Rescue" },
  pact: { icon: Handshake, tone: "bg-sky", label: "Pact" },
  attack: { icon: Swords, tone: "bg-danger text-paper", label: "Attack" },
  hold: { icon: Shield, tone: "bg-canvas", label: "Hold" },
};

const whole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });

/** The move in one plain line: "Attacks Yuna Star with 300 $CUT". */
export function moveHeadline(move: Pick<Move, "move" | "target" | "amount">, names: MoveCardNames): string {
  const target = move.target ? (names[move.target] ?? move.target) : "";
  switch (move.move) {
    case "rescue":
      return `Offers its savers ${whole(move.amount)} $CUT if it survives`;
    case "pact":
      return `Pays ${target} ${whole(move.amount)} $CUT for a pact`;
    case "attack":
      return `Attacks ${target} with ${whole(move.amount)} $CUT`;
    case "hold":
      return "Holds its money";
  }
}

/** The contract's note on a changed move, as a sentence: "downgraded: …" → "The contract downgraded it: …". */
export function outcomeLine(outcome: string): string {
  const [head, ...rest] = outcome.split(": ");
  const why = rest.join(": ");
  if (head === "downgraded" && why) return `The contract downgraded it to a hold: ${why}.`;
  if (head === "cut down" && why) return `The contract cut the amount down: ${why}.`;
  return `The contract changed it: ${outcome}.`;
}

/**
 * Today's move as a short card: what it does, the reason quoted in the agent's own voice, and a link to the
 * proof. A sample move says it was not signed; a live one links to its signature check on the agent's page.
 */
export function MoveCard({ move, names, sample, className }: { move: Move; names: MoveCardNames; sample: boolean; className?: string }) {
  const { icon: Icon, tone, label } = LOOK[move.move];
  return (
    <figure className={cn("rounded-lg border-2 border-ink bg-paper px-2.5 pt-2 pb-1.5", className)}>
      <figcaption className="flex items-center gap-1.5">
        <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border-[1.5px] border-ink px-2 text-[11px] font-extrabold uppercase", tone)}>
          <Icon aria-hidden="true" className="size-3" strokeWidth={2.8} />
          {label}
        </span>
        <span className="min-w-0 text-[13px] leading-[17px] font-extrabold">{moveHeadline(move, names)}</span>
      </figcaption>
      <blockquote className="mt-1.5 text-[13px] leading-[18px] font-medium text-pretty text-ink-2">“{move.reason}”</blockquote>
      {move.outcome && <p className="mt-1 text-[11.5px] leading-[15px] font-bold text-burn">{outcomeLine(move.outcome)}</p>}
      <Link
        href={moveProofHref(move)}
        className="mt-1 inline-flex items-center gap-1 rounded-xs text-[10.5px] font-extrabold tracking-[0.04em] text-ink-3 uppercase outline-none hover:text-ink hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <BadgeCheck aria-hidden="true" className="size-3" strokeWidth={2.6} />
        {sample ? "Sample move · not signed" : "Signed by NEAR AI · proof"}
      </Link>
    </figure>
  );
}
