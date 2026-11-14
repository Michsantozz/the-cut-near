import { ArrowRight, Ban, Gavel, ShieldCheck, Swords } from "lucide-react";
import { cn } from "cn";
import Link from "next/link";
import type { ReactNode } from "react";

import { explorerAccountUrl } from "@/shared/near/network";

import { ATTACKS, MECHANICS, TRACK_ROWS, type Attack } from "../model/desk";
import type { JudgeDesk } from "../server/load-judges";

import { LiveClaims } from "./live-claims";
import { LinkChip, SourceChip } from "./source-link";

const SECTIONS = [
  { href: "#claims", label: "Live claims" },
  { href: "#track", label: "The track, line by line" },
  { href: "#mechanics", label: "One button per mechanic" },
  { href: "#break", label: "Try to break it" },
];

/** The judge desk: every claim checked live, the track's prompt line by line, each mechanic, and the attacks the contract refuses. */
export function JudgeDeskScreen({ desk, repoUrl }: { desk: JudgeDesk; repoUrl: string | null }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:gap-6 lg:px-8 lg:pt-1 lg:pb-8">
      <Hero desk={desk} />
      <LiveClaims {...desk} repoUrl={repoUrl} />
      <Track repoUrl={repoUrl} />
      <Mechanics repoUrl={repoUrl} />
      <BreakIt repoUrl={repoUrl} />
    </div>
  );
}

function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="font-heading text-xl leading-[26px] font-extrabold tracking-[-0.4px] lg:text-[28px] lg:leading-8 lg:tracking-[-0.8px]">
      {children}
    </h2>
  );
}

function Card({ id, labelledBy, className, children }: { id: string; labelledBy: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={labelledBy} className={cn("scroll-mt-4 rounded-3xl border-2 border-ink bg-paper px-4 pt-3.5 pb-4 shadow-hard lg:scroll-mt-24 lg:px-6 lg:pt-5 lg:pb-6", className)}>
      {children}
    </section>
  );
}

/* ---------------------------------------------------------------- Hero */

function Hero({ desk }: { desk: JudgeDesk }) {
  return (
    <section aria-labelledby="desk-title" className="rounded-3xl border-2 border-ink bg-lime px-4 py-4 shadow-hard lg:flex lg:items-center lg:gap-8 lg:px-7 lg:py-6">
      <div className="lg:grow">
        <p className="flex items-center gap-1.5 text-xs font-extrabold tracking-[0.05em] uppercase">
          <Gavel aria-hidden="true" className="size-4" strokeWidth={2.6} />
          For the judges of NEAR HACKATHON
        </p>
        <h2 id="desk-title" className="mt-1 font-heading text-2xl leading-[28px] font-extrabold tracking-[-0.8px] text-balance lg:text-[36px] lg:leading-[40px] lg:tracking-[-1.2px]">
          Don’t take our word for it. Every claim is checked here, live.
        </h2>
        <p className="mt-2 text-[14px] leading-5 font-medium lg:max-w-[780px] lg:text-base lg:leading-[23px]">
          The checks run in your browser against NEAR {desk.network}: the contract’s keys, its code, its books, the AI agents’ signed moves and the
          season. Below them: the track’s prompt mapped line by line, every mechanic one click away, and the attacks the contract refuses.
        </p>
      </div>
      <nav aria-label="On this page" className="mt-3 lg:mt-0 lg:w-[300px] lg:shrink-0">
        <ul className="grid gap-2">
          {SECTIONS.map(({ href, label }) => (
            <li key={href}>
              <a
                href={href}
                className="flex items-center justify-between gap-3 rounded-2xl border-2 border-ink bg-paper px-3.5 py-2 text-[14.5px] font-extrabold outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {label}
                <ArrowRight aria-hidden="true" className="size-4 shrink-0" strokeWidth={2.6} />
              </a>
            </li>
          ))}
          {desk.live && (
            <li>
              <LinkChip href={explorerAccountUrl(desk.network, desk.contractId)} external className="h-9 w-full justify-center rounded-2xl border-2">
                {desk.contractId}
              </LinkChip>
            </li>
          )}
        </ul>
      </nav>
    </section>
  );
}

/* ---------------------------------------------------------------- The track */

function Track({ repoUrl }: { repoUrl: string | null }) {
  return (
    <Card id="track" labelledBy="track-title">
      <Heading id="track-title">The track’s prompt, line by line</Heading>
      <p className="mt-1 text-[14px] leading-5 text-ink-3 lg:text-[15px]">Memecoins With Mechanics: each requirement, our one-line answer, and where to see it.</p>
      <div role="table" aria-label="The track's requirements" className="mt-3">
        <div role="row" className="hidden border-b-2 border-ink pb-1.5 text-[11px] font-extrabold tracking-[0.04em] text-ink-3 uppercase lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)] lg:gap-6">
          <span role="columnheader">The track asks for</span>
          <span role="columnheader">The Cut</span>
          <span role="columnheader">Where</span>
        </div>
        {TRACK_ROWS.map((row, index) => (
          <div
            role="row"
            key={row.requirement}
            className="border-t-[1.5px] border-line py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,0.9fr)] lg:gap-6 [&:nth-child(2)]:border-t-0"
          >
            <p role="rowheader" className="flex gap-2 text-[15px] leading-5 font-extrabold">
              <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime text-[11px] tabular-nums">
                {index + 1}
              </span>
              {row.requirement}
            </p>
            <p role="cell" className="mt-1.5 text-[14px] leading-5 text-ink-2 lg:mt-0">
              {row.answer}
            </p>
            <div role="cell" className="mt-2 flex flex-wrap content-start gap-1.5 lg:mt-0">
              {row.where.map((place) =>
                place.ref ? (
                  <SourceChip key={place.label} refTo={place.ref} repoUrl={repoUrl} />
                ) : (
                  <LinkChip key={place.label} href={place.href ?? "/"}>
                    {place.label}
                  </LinkChip>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------- Mechanics */

function Mechanics({ repoUrl }: { repoUrl: string | null }) {
  return (
    <Card id="mechanics" labelledBy="mechanics-title">
      <Heading id="mechanics-title">One button per mechanic</Heading>
      <p className="mt-1 text-[14px] leading-5 text-ink-3 lg:text-[15px]">Each thing the contract lets you do, and where to do it. On testnet every one costs test NEAR only.</p>
      <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {MECHANICS.map((mechanic) => (
          <li key={mechanic.id} className="flex flex-col rounded-2xl border-2 border-ink bg-paper px-3.5 py-3">
            <h3 className="text-[16px] font-extrabold">{mechanic.label}</h3>
            <p className="mt-0.5 grow text-[13px] leading-[18px] text-ink-3">{mechanic.what}</p>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {/* llms.txt is a static file, not a page. */}
              {mechanic.href.endsWith(".txt") ? (
                <a href={mechanic.href} className={button}>
                  Open <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
                </a>
              ) : (
                <Link href={mechanic.href} className={button}>
                  Open <ArrowRight aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
                </Link>
              )}
              <LinkChip href={mechanic.doc.href}>{mechanic.doc.label}</LinkChip>
              {mechanic.ref && <SourceChip refTo={mechanic.ref} repoUrl={repoUrl} />}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const button =
  "inline-flex h-7 items-center gap-1 rounded-full border-2 border-ink bg-ink px-3 text-[12.5px] font-extrabold text-paper outline-none hover:bg-ink-2 focus-visible:ring-3 focus-visible:ring-ring/50";

/* ---------------------------------------------------------------- Try to break it */

const RESULT: Record<Attack["result"], { label: string; icon: typeof Ban; tone: string }> = {
  refused: { label: "Refused", icon: Ban, tone: "bg-danger text-paper" },
  downgraded: { label: "Becomes hold", icon: ShieldCheck, tone: "bg-violet text-paper" },
  clamped: { label: "Clamped", icon: ShieldCheck, tone: "bg-orange text-ink" },
  capped: { label: "Capped", icon: ShieldCheck, tone: "bg-sky text-ink" },
};

function BreakIt({ repoUrl }: { repoUrl: string | null }) {
  return (
    <Card id="break" labelledBy="break-title">
      <h2 id="break-title" className="flex items-center gap-3 font-heading text-xl font-extrabold lg:text-[28px]">
        <span className="flex size-9 items-center justify-center rounded-xl border-2 border-ink bg-danger text-paper lg:size-[38px]">
          <Swords aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />
        </span>
        Try to break it
      </h2>
      <p className="mt-1 text-[14px] leading-5 text-ink-3 lg:text-[15px]">
        What the contract does when someone cheats, in its own words, and the unit test that proves it. Refused calls fail with that message and
        change nothing; the others go through as the rules allow.
      </p>
      <ul className="mt-3 flex flex-col">
        {ATTACKS.map((attack) => {
          const { label, icon: Icon, tone } = RESULT[attack.result];
          return (
            <li key={attack.test.label} className="border-t-[1.5px] border-line py-3 first:border-t-0 lg:grid lg:grid-cols-[minmax(0,0.9fr)_130px_minmax(0,1.3fr)_minmax(0,1fr)] lg:items-start lg:gap-5">
              <p className="text-[15px] leading-5 font-extrabold">{attack.attack}</p>
              <span className={cn("mt-1.5 inline-flex w-fit items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-[12px] font-extrabold lg:mt-0", tone)}>
                <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
                {label}
              </span>
              <q className="mt-1.5 block rounded-xl bg-canvas px-3 py-2 text-[13px] leading-[18px] font-semibold text-ink-2 [quotes:none] lg:mt-0">{attack.message}</q>
              <div className="mt-1.5 min-w-0 lg:mt-0">
                <SourceChip refTo={attack.test} repoUrl={repoUrl} kind="test" />
                <p className="mt-1 text-[12px] font-bold break-words text-ink-3">{attack.test.label}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
