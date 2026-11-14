import { cn } from "cn";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

import { DIRECTOR_ART, robotFullBody, robotTile } from "@/entities/robot";
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
  const label = `Share card: ${cutHeadline({ deletedName: share.deleted.name })}`;
  return (
    <>
      <PhoneCutCard share={share} label={label} />
      <DeskCutCard share={share} quote={quote} label={label} />
    </>
  );
}

const tag = (share: CutShare) => `Daily cut · ${formatUtcDate(share.at)}`;

// Phone card (Share.dc.html): 233px tall, the words in a narrow column on the left, the art in a 150px box on the right.
function PhoneCutCard({ share, label }: { share: CutShare; label: string }) {
  const subline = cutSubline({ joinedName: share.joined?.name ?? null });
  return (
    <section aria-label={label} className="relative h-[233px] overflow-hidden rounded-[22px] border-2 border-ink bg-lime shadow-[5px_5px_0_var(--color-ink)] lg:hidden">
      <p className="absolute top-4 left-4 rounded-full bg-ink px-[9px] py-[3px] text-[10px] font-extrabold tracking-[0.5px] text-paper uppercase">{tag(share)}</p>
      <h2 className="absolute top-[46px] left-4 w-[170px] font-heading text-[30px] leading-[29px] font-extrabold tracking-[-1px]">
        {share.deleted.name} was deleted.
      </h2>
      {subline && <p className="absolute top-[140px] left-4 w-[190px] font-heading text-[15px] leading-[18px] font-extrabold text-blue">{subline}</p>}
      <p className="absolute bottom-3.5 left-4 font-heading text-[13px] font-extrabold">
        the cut <span className="font-sans font-semibold">· on NEAR</span>
      </p>
      <div aria-hidden="true" className="absolute inset-y-0 right-0 w-[150px]">
        <DeletedTile share={share} style={{ left: 14, top: 18, width: 120, height: 120, rotate: "-7deg" }} className="rounded-[18px] border-2 shadow-[4px_4px_0_var(--color-ink)]" />
        {share.joined && (
          <JoinedTile joined={share.joined} style={{ left: 48, top: 112, width: 104, height: 104, rotate: "5deg" }} className="rounded-[18px] border-2 shadow-[4px_4px_0_var(--color-ink)]" />
        )}
        <span className="absolute top-16 left-1 -rotate-[16deg] rounded-[9px] border-[3px] border-danger bg-paper/85 px-[9px] py-0.5 font-heading text-xl font-extrabold tracking-[0.5px] text-danger">
          DELETED
        </span>
        {share.joined && <span className="absolute top-[196px] left-[100px] rotate-6 rounded-full bg-ink px-[9px] py-0.5 text-xs font-extrabold text-lime">NEW</span>}
      </div>
    </section>
  );
}

/** A length on the 1200×800 laptop card, scaled to the card's width (it is a size container). */
const u = (px: number) => `calc(${px} * 100cqw / 1200)`;

// Laptop card (DeskShare.dc.html): the 1200×800 share card, drawn to the column's width.
function DeskCutCard({ share, quote, label }: { share: CutShare; quote: ShareQuote | null; label: string }) {
  const subline = cutSubline({ joinedName: share.joined?.name ?? null });
  return (
    <section aria-label={label} className="relative hidden aspect-[3/2] overflow-hidden rounded-[20px] border-[3px] border-ink bg-lime shadow-[6px_6px_0_var(--color-ink)] @container lg:block">
      <p
        className="absolute rounded-full bg-ink font-extrabold whitespace-nowrap text-paper uppercase"
        style={{ left: u(72), top: u(64), padding: `${u(8)} ${u(16)}`, fontSize: u(22), letterSpacing: u(1) }}
      >
        {tag(share)}
      </p>
      <div className="absolute" style={{ left: u(72), top: u(140), width: u(600) }}>
        <h2 className="font-heading font-extrabold" style={{ fontSize: u(100), lineHeight: u(96), letterSpacing: u(-5) }}>
          {share.deleted.name}
          <br />
          was deleted.
        </h2>
        {subline && (
          <p className="font-heading font-extrabold text-blue" style={{ marginTop: u(22), fontSize: u(46), lineHeight: u(50), letterSpacing: u(-1) }}>
            {subline}
          </p>
        )}
        {quote && (
          <figure
            className="flex border-ink bg-paper"
            style={{ gap: u(14), marginTop: u(30), padding: `${u(18)} ${u(22)}`, borderRadius: u(26), borderWidth: u(3), boxShadow: `${u(6)} ${u(6)} 0 var(--color-ink)` }}
          >
            <span className="flex shrink-0 justify-center overflow-hidden border-ink bg-pink" style={{ width: u(64), height: u(64), borderRadius: u(18), borderWidth: u(3) }}>
              <Image src={DIRECTOR_ART.src} alt="" width={DIRECTOR_ART.width} height={DIRECTOR_ART.height} className="block w-auto max-w-none" style={{ height: u(128), marginTop: u(2) }} />
            </span>
            <div className="min-w-0">
              <figcaption className="font-bold text-ink-3" style={{ fontSize: u(20) }}>
                The Director ·{" "}
                <Link href={quote.proofUrl} className="underline-offset-2 hover:underline">
                  {quote.badge}
                </Link>
              </figcaption>
              <blockquote className="font-bold" style={{ fontSize: u(27), lineHeight: u(34) }}>
                “{quote.text}”
              </blockquote>
            </div>
          </figure>
        )}
      </div>
      <div aria-hidden="true">
        <DeletedTile share={share} style={{ left: u(730), top: u(110), width: u(260), height: u(260), rotate: "-7deg", borderRadius: u(36), borderWidth: u(4), boxShadow: `${u(8)} ${u(8)} 0 var(--color-ink)` }} />
        {share.joined && (
          <JoinedTile
            joined={share.joined}
            style={{ left: u(860), top: u(390), width: u(280), height: u(280), rotate: "5deg", borderRadius: u(36), borderWidth: u(4), boxShadow: `${u(8)} ${u(8)} 0 var(--color-ink)` }}
          />
        )}
        <span
          className="absolute -rotate-[18deg] border-danger bg-paper/85 font-heading font-extrabold text-danger"
          style={{ left: u(750), top: u(210), padding: `${u(10)} ${u(22)}`, borderWidth: u(6), borderRadius: u(16), fontSize: u(56), letterSpacing: u(2) }}
        >
          DELETED
        </span>
        {share.joined && (
          <span className="absolute rotate-6 rounded-full bg-ink font-extrabold text-lime" style={{ left: u(1040), top: u(620), padding: `${u(8)} ${u(18)}`, fontSize: u(30) }}>
            NEW
          </span>
        )}
      </div>
      <div className="absolute flex items-center whitespace-nowrap" style={{ left: u(72), bottom: u(52), gap: u(12) }}>
        <span aria-hidden="true" className="flex items-center justify-center border-ink bg-blue text-paper" style={{ width: u(48), height: u(48), borderRadius: u(14), borderWidth: u(3) }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" style={{ width: u(26), height: u(26) }}>
            <path d="M18 7.5A7 7 0 1 0 18 16.5" />
          </svg>
        </span>
        <span className="font-heading font-extrabold" style={{ fontSize: u(30) }}>
          the cut
        </span>
        <span className="font-semibold" style={{ fontSize: u(21) }}>
          · 10 AI robots · one coin · the poorest is deleted every day · on NEAR
        </span>
      </div>
    </section>
  );
}

type TileProps = { style: CSSProperties; className?: string };

/** The deleted robot: its full-body sticker gone grey (its head tile without one). */
function DeletedTile({ share, style, className }: TileProps & { share: CutShare }) {
  const body = robotFullBody(share.deleted.id);
  const tile = robotTile(share.deleted.id);
  return (
    <span className={cn("absolute flex items-end justify-center overflow-hidden border-ink bg-line", className)} style={style}>
      {body ? (
        <Image src={body.src} alt="" width={body.width} height={body.height} className="block h-[94%] w-auto max-w-none opacity-75 grayscale" />
      ) : tile ? (
        <Image src={tile} alt="" width={150} height={150} className="size-full object-cover opacity-75 grayscale" />
      ) : (
        <span className="m-auto font-heading text-4xl font-extrabold">{share.deleted.name.charAt(0)}</span>
      )}
    </span>
  );
}

/** The robot that took the seat: its head tile. */
function JoinedTile({ joined, style, className }: TileProps & { joined: NonNullable<CutShare["joined"]> }) {
  const tile = robotTile(joined.id);
  return (
    <span className={cn("absolute flex items-center justify-center overflow-hidden border-ink bg-paper", className)} style={style}>
      {tile ? <Image src={tile} alt="" width={150} height={150} className="size-full object-cover" /> : <span className="font-heading text-4xl font-extrabold">{joined.name.charAt(0)}</span>}
    </span>
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
