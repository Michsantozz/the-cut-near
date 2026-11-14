import { cn } from "cn";
import Image from "next/image";

import { agentTile } from "./art";

/** An agent's square head tile with an ink border. Decorative: the agent's name is always next to it. */
export function AgentTile({ id, name, className }: { id: string; name: string; className?: string }) {
  const src = agentTile(id);
  const frame = cn("size-[30px] shrink-0 overflow-hidden rounded-sm border-2 border-ink bg-paper", className);
  if (!src) {
    return (
      <span aria-hidden="true" className={cn(frame, "flex items-center justify-center bg-lime font-heading text-sm font-extrabold")}>
        {name.charAt(0)}
      </span>
    );
  }
  return <Image src={src} alt="" width={64} height={64} className={cn(frame, "object-cover")} />;
}
