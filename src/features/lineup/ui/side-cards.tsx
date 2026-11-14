import { cn } from "cn";
import { ArrowUp, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Button } from "@/shared/ui/button";
import { formatCount, formatUtcTime, relativeUtcDay } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import { barPercent } from "../model/board";
import type { Lineup } from "../server/load-lineup";
import { DIRECTOR_ART, RobotPoses, RobotTile, type Robot } from "@/entities/robot";
import { cut, rescueLine, shortName } from "./copy";
import { TimeLeft } from "./countdown";

/** The newest post of the robot on the block, with its proof badge. The app adds it to the lineup. */
export type BlockPost = { text: string; badge: string };

/** Who the cut takes if nothing moves, its own plea, how far it is from safety, and why rescuing it pays. */
export function OnTheBlockCard({ lineup, className }: { lineup: Lineup & { blockPost?: BlockPost | null }; className?: string }) {
  const { lowest, next, gap } = lineup.board;
  const post = lineup.blockPost;
  if (!lowest) return null;
  const when = relativeUtcDay(new Date(lineup.renderedAt), lineup.cutAt);
  const by = `${formatUtcTime(lineup.cutAt)} UTC${when ? ` ${when}` : ""}`;

  return (
    <section
      aria-labelledby="block-title"
      className={cn("overflow-hidden rounded-3xl border-2 border-ink bg-violet text-paper shadow-hard", className)}
    >
      <Link
        href={`/robots/${lowest.id}`}
        aria-label={`${lowest.name}: see its page`}
        className="flex h-32 items-end justify-center border-b-2 border-ink bg-violet-deep bg-[radial-gradient(circle_at_50%_0%,var(--color-danger)_0%,transparent_70%)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <RobotPoses id={lowest.id} imageClassName="h-[118px] w-auto" />
      </Link>
      <div className="px-4 pt-[11px] pb-3.5">
        <p className="text-[11.5px] font-extrabold tracking-[0.05em] uppercase">
          On the block · cut in <TimeLeft cutAt={lineup.cutAt.getTime()} renderedAt={lineup.renderedAt} />
        </p>
        <h2 id="block-title" className="mt-0.5 font-heading text-[22px] leading-[26px] font-extrabold">
          {lowest.name} · {cut(lowest.pile)} $CUT
        </h2>
        {post && (
          <figure className="mt-2 rounded-lg bg-violet-deep px-[11px] py-2">
            <blockquote className="text-[13.5px] leading-[19px] font-semibold text-pretty">“{post.text}”</blockquote>
            <figcaption className="mt-1 text-[10.5px] font-extrabold tracking-[0.05em] text-violet-soft uppercase">
              {lowest.name} · {post.badge}
            </figcaption>
          </figure>
        )}
        {next && gap !== null && (
          <>
            <p className="mt-1 text-[13px] leading-[18px] font-semibold text-pretty text-violet-soft">
              {cut(gap)} short of {next.name}. If nothing moves by {by}, its NEAR account is deleted.
            </p>
            <p className="mt-2.5 flex items-start gap-2 rounded-lg border-2 border-ink bg-paper px-[11px] py-[9px] text-[13px] leading-[18px] font-semibold text-ink">
              <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime">
                <ArrowUp className="size-3" strokeWidth={3.4} />
              </span>
              <span>
                <b className="font-extrabold">Rescue pays.</b> {rescueLine(lowest.name, next.name, gap)}
              </span>
            </p>
          </>
        )}
        <div className="mt-3 flex gap-2">
          <Button asChild variant="lime" className="flex-1">
            <WalletGatedLink href={`/save/${lowest.id}`}>Save {shortName(lowest.name)}</WalletGatedLink>
          </Button>
          <Button asChild variant="outline" className="flex-1 gap-1.5">
            <Link href="/director">
              See the show
              <ChevronRight aria-hidden="true" className="size-3.5" strokeWidth={3} />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

const QUEUE_BAR = ["bg-ink", "bg-pink", "bg-orange"];

/** The bench: robots waiting for a seat. The biggest queue takes the empty seat at the cut. */
export function BenchCard({ bench, className }: { bench: Robot[]; className?: string }) {
  const [first] = bench;
  if (!first) return null;
  const top = first.pile;

  return (
    <section aria-labelledby="bench-title" className={cn("relative rounded-2xl border-2 border-ink bg-paper px-4 py-3.5", className)}>
      <div className="flex items-center gap-2.5">
        <RobotTile id={first.id} name={first.name} className="size-10 rounded-md" />
        <div className="min-w-0 grow">
          <h2 id="bench-title" className="text-[15px] font-extrabold">
            <Link href={`/robots/${first.id}`} className="outline-none after:absolute after:inset-0 after:rounded-2xl focus-visible:after:ring-3 focus-visible:after:ring-ring/50">
              On the bench: {first.name}
            </Link>
          </h2>
          <p className="text-[12.5px] text-ink-3">
            {first.kind} · queue {cut(first.pile)} · {formatCount(first.savers)} savers
          </p>
        </div>
      </div>
      <h3 className="mt-2.5 text-[11px] font-extrabold tracking-[0.055em] text-ink-3 uppercase">Bench queues · $CUT</h3>
      <ul className="mt-0.5">
        {bench.map((robot, index) => (
          <li key={robot.id} className="mt-1.5 flex items-center gap-2.5 text-[12.5px] font-bold">
            <span className="w-16 truncate">{robot.name}</span>
            <span aria-hidden="true" className="h-2.5 grow overflow-hidden rounded-[5px] bg-canvas">
              <span className={cn("block h-full", QUEUE_BAR[index] ?? "bg-ink-4")} style={{ width: `${barPercent(robot.pile, top, 2)}%` }} />
            </span>
            <span className="w-[50px] text-right">{cut(robot.pile)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 text-[12.5px] leading-[17px] text-ink-3">The biggest queue takes the empty seat at the cut, and its queue becomes its pile.</p>
    </section>
  );
}

/** The Director's latest line about the robot on the block, with its proof badge. The app adds it to the lineup. */
export type DirectorCardLine = { text: string; badge: string; proofUrl: string };

/** The Director's one-liner and what its proof says. Hidden until the Director said something about this cut. */
export function DirectorCard({ lineup, className }: { lineup: Lineup & { directorLine?: DirectorCardLine | null }; className?: string }) {
  const line = lineup.directorLine;
  if (!line) return null;

  return (
    <figure className={cn("flex items-end gap-1.5", className)}>
      <Image src={DIRECTOR_ART.src} alt="The Director" width={DIRECTOR_ART.width} height={DIRECTOR_ART.height} className="block h-[78px] w-auto shrink-0" />
      <div className="grow rounded-[18px_18px_18px_4px] border-2 border-ink bg-pink px-3.5 py-2.5">
        <blockquote className="font-heading text-[17px] leading-[21px] font-extrabold text-balance">“{line.text}”</blockquote>
        <a
          href={line.proofUrl}
          target="_blank"
          rel="noopener"
          className="mt-1 inline-block text-[11px] font-extrabold tracking-[0.036em] uppercase outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {line.badge}
        </a>
      </div>
    </figure>
  );
}
