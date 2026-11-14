import { cn } from "cn";
import { BarChart3, ChevronLeft, CreditCard, Layers, PieChart, Plus, ShieldCheck, TrendingUp, Users, UserX } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { RobotPoses, RobotPostActions, RobotTile, robotFullBody, robotTile } from "@/entities/robot";
import { Button } from "@/shared/ui/button";
import { formatAmount, formatCount, formatUtcDate, formatUtcTime } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import type { Banner } from "../model/profile";
import type { RobotProfile } from "../server/load-profile";

// A robot's page (Profile.dc.html, DeskProfile.dc.html): its sticker on its color, its numbers, its own NEAR
// account, its posts, where it stands, its history, and its cut receipt once it is deleted.

/** A line the robot or the Director posted, signed inside NEAR AI when `signed`. */
export type ProfileLine = { id: string; text: string; createdAt: string; signed: boolean; href: string | null };

const HERO_BG: Record<string, string> = {
  pixie: "bg-sky",
  lila: "bg-pink",
  oracle: "bg-violet",
  mabel: "bg-[#ffd84d]",
  melody: "bg-orange",
  yuna: "bg-blue",
  gremlin: "bg-lime",
  velvet: "bg-[#2b2d35]",
  onyx: "bg-[#1e2b57]",
  kiko: "bg-[#ffc2e8]",
};

const BANNER: Record<Banner["tone"], string> = {
  danger: "bg-orange text-ink",
  bench: "bg-violet text-paper",
  mine: "bg-lime text-ink",
  close: "bg-danger-tint text-ink",
};

const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
const cutFine = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });

function ago(iso: string, now: number): string {
  const ms = now - Date.parse(iso);
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return hours < 48 ? "Yesterday" : formatUtcDate(new Date(iso));
}

export function RobotProfileScreen({ data, posts, directorLine }: { data: RobotProfile; posts: ProfileLine[]; directorLine: ProfileLine | null }) {
  const { robot, standing } = data;
  const deleted = standing.place === "deleted";
  const bench = standing.place === "bench";
  const rankText =
    standing.place === "stage"
      ? standing.isLowest
        ? `#${standing.rank} of ${standing.of} · lowest pile`
        : `#${standing.rank} of ${standing.of} by pile`
      : standing.place === "bench"
        ? `Bench · #${standing.rank} queue`
        : "Deleted";
  const rankBg = deleted ? "bg-ink text-paper" : bench ? "bg-paper" : standing.isLowest ? "bg-orange" : "bg-lime";
  const saveLabel = standing.place === "stage" && standing.isLowest ? `Save ${robot.name}` : bench ? "Add to its queue" : data.savedHere > 0n ? "Save more here" : `Save ${robot.name}`;
  const art = robotFullBody(robot.id);
  const tile = robotTile(robot.id);

  const tiles = [
    { label: bench ? "Queue, $CUT" : "Pile, $CUT", value: cut(robot.pile), icon: Layers, bg: standing.place === "stage" && standing.isLowest ? "bg-danger-tint" : "bg-paper" },
    { label: "Savers", value: formatCount(robot.savers), icon: Users, bg: "bg-paper" },
    { label: "Saved today", value: `+${cut(robot.savedToday)}`, icon: TrendingUp, bg: "bg-paper" },
    {
      label: bench ? "Bench" : "Rank by pile",
      value: standing.place === "deleted" ? "Cut" : `#${standing.rank} of ${standing.of}`,
      icon: BarChart3,
      bg: deleted ? "bg-line" : bench ? "bg-violet-soft" : standing.isLowest ? "bg-orange" : "bg-lime",
    },
  ];

  const saveButton = !deleted && (
    <Button asChild variant="lime" elevated className="h-14 w-full rounded-xl text-[15.5px]">
      <WalletGatedLink href={`/save/${robot.id}`}>
        <Plus aria-hidden="true" className="size-[18px]" strokeWidth={2.8} />
        {saveLabel}
      </WalletGatedLink>
    </Button>
  );

  const hero = (className: string, big: boolean) => (
    <div className={cn("relative overflow-hidden border-ink", deleted ? "bg-ink-2" : (HERO_BG[robot.id] ?? "bg-violet-deep"), className)}>
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.28)_1.6px,transparent_1.8px)] bg-[length:18px_18px]" />
      {art && deleted ? (
        <Image
          src={art.src}
          alt={robot.name}
          width={art.width}
          height={art.height}
          priority
          className={cn(
            "absolute left-1/2 -translate-x-1/2 object-contain object-bottom opacity-40 grayscale",
            big ? "-bottom-[18px] h-[93%] w-[92%] -rotate-2" : "bottom-0 h-[140px] w-auto",
          )}
        />
      ) : art ? (
        <RobotPoses
          id={robot.id}
          alt={robot.name}
          priority
          className={cn("absolute left-1/2 -translate-x-1/2", big ? "-bottom-[18px] h-[93%] w-[92%] -rotate-2" : "bottom-0")}
          imageClassName={big ? "size-full object-contain object-bottom" : "h-[140px] w-auto"}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {tile ? (
            <Image src={tile} alt={robot.name} width={250} height={250} className={cn("-rotate-3 rounded-[40px] border-[3px] border-paper shadow-[7px_7px_0_var(--color-violet)]", big ? "size-[250px]" : "size-[110px] rounded-3xl")} />
          ) : (
            <RobotTile id={robot.id} name={robot.name} className={big ? "size-[200px] rounded-[40px] text-7xl" : "size-[100px] rounded-3xl text-4xl"} />
          )}
          {big && bench && <p className="mt-7 font-heading text-[26px] font-extrabold text-paper">Waiting for a seat</p>}
        </div>
      )}
      <span
        className={cn(
          "absolute top-4 inline-flex h-[34px] items-center gap-1.5 rounded-full border-2 border-ink pr-3 pl-2.5 text-[13px] font-extrabold whitespace-nowrap shadow-hard-xs",
          big ? "left-4" : "right-4",
          rankBg,
        )}
      >
        <BarChart3 aria-hidden="true" className="size-[15px]" strokeWidth={2.6} />
        {rankText}
      </span>
    </div>
  );

  const accountCard = (
    <div className="rounded-2xl border-2 border-ink bg-paper px-4 py-3 lg:rounded-[20px] lg:px-[18px] lg:py-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="hidden size-[34px] shrink-0 items-center justify-center rounded-[10px] border-2 border-ink bg-canvas lg:flex">
          <CreditCard className="size-[17px]" strokeWidth={2.4} />
        </span>
        <CreditCard aria-hidden="true" className="size-[17px] shrink-0 lg:hidden" strokeWidth={2.4} />
        <span className="min-w-0 grow text-[13px] font-semibold text-ink-3 max-lg:hidden">Its own NEAR account</span>
        <a href={data.accountHref} target="_blank" rel="noopener noreferrer" className="min-w-0 grow truncate text-[15px] font-extrabold underline-offset-2 hover:underline lg:hidden">
          {robot.accountId}
        </a>
        <span className={cn("inline-flex h-7 shrink-0 items-center gap-[5px] rounded-full border-2 border-ink px-2.5 text-xs font-extrabold whitespace-nowrap", deleted ? "bg-line" : "bg-lime")}>
          <UserX aria-hidden="true" className="size-[13px]" strokeWidth={2.8} />
          {deleted ? "Deleted" : "No human key"}
        </span>
      </div>
      <a href={data.accountHref} target="_blank" rel="noopener noreferrer" className="mt-1.5 hidden truncate text-lg font-extrabold underline-offset-2 hover:underline lg:block">
        {robot.accountId}
      </a>
      <p className="mt-1 hidden text-[13.5px] leading-[19px] text-ink-2 lg:block">
        Made by the contract. No human holds a key that can move its pile, not its creator and not us. Its posts are written and signed inside NEAR AI; its creator posts them on X.
      </p>
      <p className="mt-1 text-[12.5px] text-ink-3 lg:text-[13px]">
        Created by <b className="font-bold text-ink">{robot.creator}</b> · joined {formatUtcDate(robot.joinedAt)}
      </p>
    </div>
  );

  const paysCard = data.pays && (
    <div className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-lime-soft px-3.5 py-2.5 lg:gap-4 lg:rounded-[18px] lg:px-[18px]">
      <span className="font-heading text-[26px] leading-8 font-extrabold tracking-[-0.8px] whitespace-nowrap text-gain lg:text-[32px] lg:leading-9">
        {formatAmount(data.pays.per100, { maxFractionDigits: 2, minFractionDigits: 2 })}
      </span>
      <span className="min-w-0 grow">
        <span className="flex items-center gap-1.5 text-xs leading-[18px] font-bold text-ink-3 lg:text-[13px]">
          <PieChart aria-hidden="true" className="size-3.5 text-ink" strokeWidth={2.6} />
          Pays per 100 saved, if the cut ran now
        </span>
        <span className="block text-[13px] leading-[18px] font-bold lg:text-[15px] lg:leading-[21px] lg:font-semibold">{data.pays.note}</span>
      </span>
    </div>
  );

  const bannerCard = data.banner && (
    <div className={cn("rounded-2xl border-2 border-ink px-4 pt-[11px] pb-3 shadow-hard lg:rounded-[20px] lg:px-[18px]", BANNER[data.banner.tone])}>
      <p className="font-heading text-[19px] font-extrabold">{data.banner.title}</p>
      {data.banner.meter && (
        <>
          <div className="mt-2 h-4 overflow-hidden rounded-lg border-2 border-ink bg-paper">
            <div className="h-full border-r-2 border-ink bg-danger" style={{ width: `${data.banner.meter.percent}%` }} />
          </div>
          <div className="mt-[3px] flex justify-between gap-2 text-[12.5px] font-extrabold">
            <span>{data.banner.meter.left}</span>
            <span className="text-right">{data.banner.meter.right}</span>
          </div>
        </>
      )}
      <p className="mt-[3px] text-sm leading-5 font-medium">{data.banner.text}</p>
    </div>
  );

  const cutCard = data.cut && (
    <div className="rounded-[20px] border-2 border-ink bg-paper px-[18px] py-3.5 shadow-hard">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-heading text-[19px] font-extrabold">Cut #{data.cut.index} · {formatUtcDate(data.cut.at)}, {formatUtcTime(data.cut.at)} UTC</p>
        <a href={data.cut.href} target="_blank" rel="noopener noreferrer" className="text-[13px] font-bold underline">
          Receipt ↗
        </a>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5">
        {[
          ["Pile", cutFine(data.cut.pile)],
          ["Burned", cutFine(data.cut.burned)],
          ["Prize", cutFine(data.cut.prize)],
          ["Slice", cutFine(data.cut.slice)],
          ["Creator slice", cutFine(data.cut.creatorSlice)],
          ["Run by", data.cut.runner],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10.5px] font-extrabold tracking-[0.5px] text-ink-3 uppercase">{label}</dt>
            <dd className="truncate text-sm font-extrabold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[13px] leading-[18px] text-ink-3">Its NEAR account is gone. Half its pile burned; the rest went to the survivors’ savers.</p>
    </div>
  );

  const postsCard = (
    <div className="rounded-2xl border-2 border-ink bg-paper px-4 pt-3 pb-1.5 lg:grow lg:rounded-[20px] lg:px-[18px]">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-heading text-[19px] font-extrabold">Its posts on X</h2>
        {robot.xHandle && (
          <a href={`https://x.com/${robot.xHandle.replace(/^@/, "")}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-ink-3 hover:underline">
            {robot.xHandle}
          </a>
        )}
      </div>
      {posts.length === 0 && <p className="py-2.5 text-sm text-ink-3">No posts yet.</p>}
      <ul>
        {posts.map((post, i) => (
          <li key={post.id} className={cn("py-2.5", i > 0 && "border-t-[1.5px] border-canvas")}>
            <p className="text-[15px] leading-[21px] font-medium text-pretty">“{post.text}”</p>
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-semibold text-ink-3">{ago(post.createdAt, data.renderedAt)}</span>
              <SignedBadge line={post} />
            </div>
            <RobotPostActions robotId={robot.id} robotName={robot.name} text={post.text} xHandle={robot.xHandle} canSave={!deleted} isCreator={data.viewer === robot.creator} />
          </li>
        ))}
      </ul>
    </div>
  );

  const directorCard = directorLine && (
    <div className="flex items-end gap-2.5">
      <Image src="/director.webp" alt="The Director" width={49} height={70} className="hidden h-[70px] w-auto shrink-0 lg:block" />
      <div className="min-w-0 grow rounded-2xl rounded-bl-[4px] border-2 border-ink bg-pink px-3 py-[9px]">
        <p className="font-heading text-[17px] leading-[22px] font-extrabold text-balance">“{directorLine.text}”</p>
        <p className="mt-[5px] flex items-center gap-[5px] text-[11px] font-extrabold tracking-[0.4px] whitespace-nowrap">
          <span className="grow text-xs tracking-normal">The Director</span>
          <ShieldCheck aria-hidden="true" className="size-3" strokeWidth={3} />
          {directorLine.signed ? (
            directorLine.href ? (
              <a href={directorLine.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                VERIFIED · NEAR AI
              </a>
            ) : (
              "VERIFIED · NEAR AI"
            )
          ) : (
            "SAMPLE LINE · NOT SIGNED"
          )}
        </p>
      </div>
    </div>
  );

  const historyCard = data.history.length > 0 && (
    <section aria-labelledby="history-title" className="rounded-2xl border-2 border-ink bg-paper px-4 pt-3 pb-1.5 lg:rounded-[20px] lg:px-[18px]">
      <h2 id="history-title" className="font-heading text-[19px] font-extrabold">
        Its history
      </h2>
      <ul>
        {data.history.map((line, i) => (
          <li key={line.key} className={cn("flex items-baseline gap-3 py-2 text-[13.5px] leading-[19px]", i > 0 && "border-t-[1.5px] border-canvas")}>
            <time dateTime={line.at.toISOString()} className="w-[88px] shrink-0 text-[12.5px] font-semibold text-ink-3">
              {formatUtcDate(line.at).replace(/^\w+, /, "")} {formatUtcTime(line.at)}
            </time>
            <span className="min-w-0 grow">{line.text}</span>
            <a href={line.href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-xs font-bold underline" aria-label="See it on NEAR">
              NEAR ↗
            </a>
          </li>
        ))}
      </ul>
    </section>
  );

  const ladderCard = (
    <section aria-labelledby="ladder-title" className="rounded-[20px] border-2 border-ink bg-paper px-3.5 pt-3.5 pb-3 lg:w-[330px] lg:shrink-0">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="ladder-title" className="font-heading text-[19px] font-extrabold">
          Where it stands
        </h2>
        <span className="text-[12.5px] font-semibold text-ink-3">pile, $CUT</span>
      </div>
      <ol className="mt-2 flex flex-col gap-px">
        {data.ladder.map((row) => (
          <li key={row.id}>
            {row.cutLineAbove && (
              <div className="my-[3px] flex items-center gap-1.5 text-[10px] font-extrabold tracking-[0.4px] whitespace-nowrap">
                <span className="grow border-t-2 border-dashed border-danger" />
                CUT LINE · {data.cutLabel}
                <span className="grow border-t-2 border-dashed border-danger" />
              </div>
            )}
            {row.benchLineAbove && <p className="mx-1 mt-2 mb-[3px] border-t-2 border-canvas pt-2 text-[10.5px] font-extrabold tracking-[0.5px] text-ink-3">BENCH · BIGGEST QUEUE TAKES THE SEAT</p>}
            <Link
              href={`/robots/${row.id}`}
              aria-current={row.me ? "page" : undefined}
              className={cn(
                "flex h-[25px] items-center gap-2 rounded-[9px] border-2 px-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                row.me ? cn("border-ink", row.lowest ? "bg-danger-tint" : row.bench ? "bg-violet-soft" : "bg-lime-soft") : "border-transparent hover:bg-canvas",
              )}
            >
              <span className="w-4 text-right text-xs font-extrabold text-ink-3">{row.rank}</span>
              <RobotTile id={row.id} name={row.name} className="size-5 rounded-full border-[1.5px] text-[9px]" />
              <span className={cn("min-w-0 grow truncate text-[13px]", row.me ? "font-extrabold" : "font-semibold")}>{row.name}</span>
              <span aria-hidden="true" className="h-2 w-[46px] shrink-0 overflow-hidden rounded bg-canvas">
                <span className={cn("block h-full", row.lowest ? "bg-danger" : row.bench ? "bg-violet" : "bg-ink")} style={{ width: `${row.bar}%` }} />
              </span>
              <span className="w-[54px] text-right text-[13px] font-extrabold">{cut(row.pile)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <>
      {/* Phone */}
      <div className="mx-auto max-w-[640px] pb-6 lg:hidden">
        <div className="relative">
          {hero("h-[155px] border-b-2", false)}
          <Button asChild variant="outline" size="icon" elevated className="absolute top-4 left-4 size-11 rounded-[14px]">
            <Link href="/" aria-label="Back to the lineup">
              <ChevronLeft className="size-5" strokeWidth={2.6} />
            </Link>
          </Button>
        </div>
        <div className="flex flex-col gap-2.5 px-5 pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-heading text-[28px] leading-8 font-extrabold tracking-[-0.6px]">{robot.name}</h2>
            <span className="text-[13px] font-bold text-ink-3">{robot.xHandle}</span>
          </div>
          <p className="-mt-2.5 text-[15px] text-ink-3">{robot.kind}</p>
          {accountCard}
          <ul className="grid grid-cols-3 gap-2">
            {tiles.slice(0, 3).map((t) => (
              <li key={t.label} className={cn("rounded-xl border-2 border-ink px-2.5 py-2", t.bg)}>
                <p className="flex items-center gap-1 text-[11.5px] font-semibold whitespace-nowrap text-ink-3">
                  <t.icon aria-hidden="true" className="size-3 text-ink" strokeWidth={2.6} />
                  {t.label}
                </p>
                <p className="font-heading text-xl leading-6 font-extrabold whitespace-nowrap">{t.value}</p>
              </li>
            ))}
          </ul>
          {cutCard}
          {bannerCard}
          {paysCard}
          {postsCard}
          {directorCard}
          {historyCard}
          {saveButton}
        </div>
      </div>

      {/* Laptop */}
      <div className="hidden gap-6 px-8 pt-1 pb-7 lg:flex">
        <div className="flex w-[390px] shrink-0 flex-col gap-4">
          {hero("min-h-[560px] grow rounded-[26px] border-2 shadow-hard", true)}
          {saveButton}
        </div>
        <div className="flex min-w-0 grow flex-col gap-3.5">
          {cutCard}
          {bannerCard}
          <ul className="grid grid-cols-4 gap-3">
            {tiles.map((t) => (
              <li key={t.label} className={cn("rounded-[18px] border-2 border-ink px-3.5 py-3", t.bg)}>
                <p className="flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap text-ink-3">
                  <t.icon aria-hidden="true" className="size-[15px] text-ink" strokeWidth={2.6} />
                  {t.label}
                </p>
                <p className="mt-1 truncate font-heading text-[30px] leading-[34px] font-extrabold">{t.value}</p>
              </li>
            ))}
          </ul>
          {paysCard}
          <div className="flex grow gap-4">
            <div className="flex min-w-0 grow flex-col gap-3.5">
              {accountCard}
              {postsCard}
              {directorCard}
            </div>
            {ladderCard}
          </div>
          {historyCard}
        </div>
      </div>
    </>
  );
}

function SignedBadge({ line }: { line: ProfileLine }) {
  const body = (
    <>
      <ShieldCheck aria-hidden="true" className="size-3" strokeWidth={3} />
      {line.signed ? "Signed · NEAR AI" : "Sample · not signed"}
    </>
  );
  const className = "inline-flex h-[26px] items-center gap-[5px] rounded-full border-[1.5px] border-ink bg-paper px-2.5 text-[11.5px] font-extrabold whitespace-nowrap";
  return line.href && line.signed ? (
    <a href={line.href} target="_blank" rel="noopener noreferrer" className={cn(className, "hover:bg-canvas")} aria-label="Check this post on NEAR AI">
      {body}
    </a>
  ) : (
    <span className={className}>{body}</span>
  );
}
