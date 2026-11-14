import { cn } from "cn";
import Image from "next/image";

import { motionDelay, robotPoses } from "./art";

/**
 * A robot's full-body art switching between its two poses. Reduced motion keeps the first pose.
 * `className` places the frame; `imageClassName` sizes both poses (give the frame a size and the
 * poses `size-full`, or give the poses a height).
 */
export function RobotPoses({
  id,
  alt = "",
  priority,
  className,
  imageClassName,
}: {
  id: string;
  alt?: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  const poses = robotPoses(id);
  if (!poses) return null;
  const [first, second] = poses;
  const delay = motionDelay(id);
  return (
    <span className={cn("grid grid-cols-1 grid-rows-1", className)}>
      <Image
        src={first.src}
        alt={alt}
        width={first.width}
        height={first.height}
        priority={priority}
        style={delay}
        className={cn("block [grid-area:1/1] motion-safe:animate-pose-a", imageClassName)}
      />
      <Image
        src={second.src}
        alt=""
        width={second.width}
        height={second.height}
        priority={priority}
        style={delay}
        className={cn("block [grid-area:1/1] opacity-0 motion-safe:animate-pose-b", imageClassName)}
      />
    </span>
  );
}
