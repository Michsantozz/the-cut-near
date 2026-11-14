import { cn } from "cn";
import Image from "next/image";
import Link from "next/link";

import { DIRECTOR_ART, robotTile } from "@/entities/robot";
import { formatUtcDate } from "@/shared/ui/format";

import { cutHeadline, cutPost, cutSubline } from "../model/post";
import type { CutShare } from "../server/load-cut-share";
import { ShareActions } from "./share-actions";

export type ShareQuote = { text: string; badge: string; proofUrl: string };

/** Share a cut: the card (the same one the link preview shows), the Director's line and the post to send. */
export function ShareScreen({ share, quote, path }: { share: CutShare; quote: ShareQuote | null; path: string }) {
  const defaultPost = cutPost({ deletedName: share.deleted.name, joinedName: share.joined?.name ?? null, quote: quote?.text ?? null });
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:grid lg:max-w-none lg:grid-cols-[minmax(0,1.75fr)_minmax(300px,1fr)] lg:items-start lg:gap-6 lg:px-8 lg:pt-1 lg:pb-8">
      <div className="flex flex-col gap-3">
        <CutCard share={share} quote={quote} />
        {quote && <QuoteCard quote={quote} className="lg:hidden" />}
      </div>
      <ShareActions path={path} defaultPost={defaultPost} />
    </div>
  );
}

function CutCard({ share, quote }: { share: CutShare; quote: ShareQuote | null }) {
  const subline = cutSubline({ joinedName: share.joined?.name ?? null });
  return (
    <section
      aria-label={`Share card: ${cutHeadline({ deletedName: share.deleted.name })}`}
      className="relative flex min-h-[230px] overflow-hidden rounded-3xl border-2 border-ink bg-lime px-[18px] py-4 shadow-hard lg:min-h-[480px] lg:rounded-[28px] lg:px-11 lg:py-10"
    >
      <div className="relative z-10 flex max-w-[62%] flex-col lg:max-w-[60%]">
        <p className="self-start rounded-full bg-ink px-2.5 py-1 text-[11px] font-extrabold tracking-[0.06em] text-paper uppercase lg:px-3 lg:text-sm">
          Daily cut · {formatUtcDate(share.at)}
        </p>
        <h2 className="mt-3 font-heading text-[30px] leading-[30px] font-extrabold tracking-[-1.2px] lg:mt-5 lg:text-[64px] lg:leading-[60px] lg:tracking-[-3px]">
          {cutHeadline({ deletedName: share.deleted.name })}
        </h2>
        {subline && <p className="mt-2 text-sm font-extrabold text-blue lg:mt-4 lg:font-heading lg:text-[28px] lg:leading-8">{subline}</p>}
        {quote && <QuoteCard quote={quote} className="mt-6 hidden lg:flex" />}
        <p className="mt-auto pt-5 text-[13px] font-extrabold lg:pt-8 lg:text-sm">
          the cut <span className="font-semibold">· <span className="hidden lg:inline">10 AI robots · one coin · the poorest is deleted every day · </span>on NEAR</span>
        </p>
      </div>
      <div aria-hidden="true" className="absolute top-4 right-3 flex w-[34%] flex-col items-end lg:top-14 lg:right-10 lg:w-[34%]">
        <Tile id={share.deleted.id} name={share.deleted.name} className="mr-4 -rotate-6 bg-line lg:mr-10" />
        <span className="absolute top-[22%] -left-6 -rotate-[14deg] rounded-lg border-[3px] border-danger bg-paper px-2 py-0.5 font-heading text-lg font-extrabold tracking-[0.06em] text-danger lg:-left-2 lg:rounded-xl lg:border-4 lg:px-4 lg:text-4xl">
          DELETED
        </span>
        {share.joined && (
          <span className="relative -mt-6 rotate-3 lg:-mt-8">
            <Tile id={share.joined.id} name={share.joined.name} />
            <span className="absolute -right-1.5 bottom-2 rounded-full bg-ink px-2 py-0.5 font-heading text-xs font-extrabold text-lime lg:-right-3 lg:bottom-4 lg:px-3 lg:text-xl">NEW</span>
          </span>
        )}
      </div>
    </section>
  );
}

function Tile({ id, name, className }: { id: string; name: string; className?: string }) {
  const src = robotTile(id);
  const frame = cn("flex size-24 items-center justify-center overflow-hidden rounded-2xl border-2 border-ink bg-paper shadow-hard lg:size-[150px] lg:rounded-3xl", className);
  return src ? (
    <span className={frame}>
      <Image src={src} alt="" width={150} height={150} className="size-full object-cover" />
    </span>
  ) : (
    <span className={cn(frame, "font-heading text-4xl font-extrabold")}>{name.charAt(0)}</span>
  );
}

function QuoteCard({ quote, className }: { quote: ShareQuote; className?: string }) {
  return (
    <figure className={cn("flex items-center gap-3 rounded-2xl border-2 border-ink bg-paper px-3.5 py-3 lg:shadow-hard", className)}>
      <Image src={DIRECTOR_ART.src} alt="" width={40} height={59} className="h-10 w-auto shrink-0 rounded-lg border-2 border-ink bg-pink object-contain lg:h-12" />
      <div className="min-w-0">
        <figcaption className="text-xs font-bold text-ink-3">
          The Director ·{" "}
          <Link href={quote.proofUrl} className="underline-offset-2 hover:underline">
            {quote.badge}
          </Link>
        </figcaption>
        <blockquote className="text-[15px] leading-5 font-extrabold lg:text-lg lg:leading-6">“{quote.text}”</blockquote>
      </div>
    </figure>
  );
}
