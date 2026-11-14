import { cn } from "cn";
import Image from "next/image";

import { robotTile } from "./art";

/** A robot's square head tile with an ink border. Decorative: the robot's name is always next to it. */
export function RobotTile({ id, name, className }: { id: string; name: string; className?: string }) {
  const src = robotTile(id);
  const frame = cn("size-[30px] shrink-0 overflow-hidden rounded-sm border-2 border-ink bg-paper", className);
  if (!src) {
    return (
      <span aria-hidden="true" className={cn(frame, "flex items-center justify-center bg-lime font-heading text-sm font-extrabold")}>
        {name.charAt(0)}
      </span>
    );
  }
  return <Image src={src} alt="" width={40} height={40} className={cn(frame, "object-cover")} />;
}
