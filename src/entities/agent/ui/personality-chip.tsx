import { cn } from "cn";
import { Coins, Dices, HandHeart, Swords } from "lucide-react";

import { PERSONALITIES } from "../model/personality";
import type { PersonalityId } from "../model/types";

const LOOK: Record<PersonalityId, { icon: typeof Coins; tone: string }> = {
  miser: { icon: Coins, tone: "bg-sky" },
  gambler: { icon: Dices, tone: "bg-orange" },
  traitor: { icon: Swords, tone: "bg-pink" },
  generous: { icon: HandHeart, tone: "bg-lime" },
};

/** The agent's personality and the hard limit that comes with it, e.g. "Miser · Spends 5% a day at most". */
export function PersonalityChip({ personality, withLimit = true, className }: { personality: PersonalityId; withLimit?: boolean; className?: string }) {
  const { label, limit } = PERSONALITIES[personality];
  const { icon: Icon, tone } = LOOK[personality];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-full border-[1.5px] border-ink px-2 text-[11px] leading-[19px] font-extrabold whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3 shrink-0" strokeWidth={2.6} />
      <span>{label}</span>
      {withLimit && <span className="truncate font-semibold">· {limit}</span>}
    </span>
  );
}
