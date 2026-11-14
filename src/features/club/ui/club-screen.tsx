import { cn } from "cn";
import { ChevronRight, Lock, Plus, Star, Target, Trophy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { RobotTile, robotFullBody } from "@/entities/robot";
import { Button } from "@/shared/ui/button";
import { formatAmount, formatCount, formatUtcTime } from "@/shared/ui/format";
import { WalletGatedLink } from "@/shared/wallet";

import { ordinal, tierOf, type Perk, type TopSaver } from "../model/club";
import type { Club, ClubMember, ClubSave } from "../server/load-club";

const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
const pays = (value: bigint) => formatAmount(value, { maxFractionDigits: 2, minFractionDigits: 2 });

const PERK_TONE: Record<string, string> = { pixie: "bg-sky", melody: "bg-orange", lila: "bg-pink" };
const PERK_CTA: Record<Perk["cta"], "primary" | "outline" | "lime"> = { Get: "primary", Listen: "outline", Confirm: "lime" };
const AVATAR_TONE = ["bg-[#ffd84d]", "bg-sky", "bg-orange", "bg-lime"];

/** The Cut club: a member's card, this week's perks, their save and the top savers. Visitors see the locked card. */
export function ClubScreen({ club }: { club: Club }) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:gap-5 lg:px-8 lg:pt-1 lg:pb-8">
      <div className="flex items-center justify-between lg:hidden">
        <p aria-hidden="true" className="font-heading text-[30px] leading-[34px] font-extrabold tracking-[-1px]">
          Club
        </p>
        {club.members !== null && (
          <span className="rounded-full border-2 border-ink bg-paper px-3 text-[13px] leading-7 font-extrabold">{formatCount(club.members)} members</span>
        )}
      </div>
      {club.member ? <MemberClub club={club} member={club.member} /> : <LockedClub club={club} />}
    </div>
  );
}

/* ---------------------------------------------------------------- Member */

function MemberClub({ club, member }: { club: Club; member: ClubMember }) {
  return (
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_344px] lg:items-start lg:gap-6">
      <div className="flex flex-col gap-3 lg:gap-5">
        <MemberCard club={club} member={member} />
        {club.perks.length > 0 && <Perks perks={club.perks} />}
      </div>
      <div className="flex flex-col gap-3 lg:gap-4">
        {member.save ? <SaveCard save={member.save} cutAt={club.cutAt} /> : <NoSaveCard />}
        {member.points && (
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 lg:gap-4">
            <GuessCard />
            <TopSavers savers={member.topSavers} member={member} />
          </div>
        )}
      </div>
    </div>
  );
}

function MemberCard({ club, member }: { club: Club; member: ClubMember }) {
  const points = member.points;
  const tier = points ? tierOf(points.points) : null;

  return (
    <section aria-labelledby="card-title" className="relative overflow-hidden rounded-3xl border-2 border-ink bg-pink px-4 pt-3.5 pb-3 shadow-hard-lg lg:px-6 lg:pt-5 lg:pb-5">
      <span aria-hidden="true" className="absolute -top-16 -right-10 size-48 rounded-full bg-[#ffb3ea] lg:top-[-120px] lg:right-[180px] lg:size-[300px]" />
      <div className="relative lg:flex lg:gap-6">
        <div className="min-w-0 grow">
          <div className="flex items-center justify-between gap-2 lg:justify-start lg:gap-3">
            <p className="text-[13px] font-extrabold tracking-[0.12em] uppercase">The Cut club</p>
            {tier && <span className="rounded-full border-2 border-ink bg-lime px-2.5 text-xs leading-5 font-extrabold tracking-[0.06em] uppercase">{tier.tier.name}</span>}
          </div>
          <h2 id="card-title" className="mt-1.5 truncate font-heading text-[30px] leading-[34px] font-extrabold tracking-[-1px] lg:mt-3 lg:text-5xl lg:leading-[52px] lg:tracking-[-2px]">
            {member.accountId}
          </h2>
          {member.since && <p className="text-[13.5px] font-bold lg:text-[15px]">Member since {member.since}</p>}
          <ul aria-label="The robots on the stage" className="mt-2.5 flex lg:mt-6">
            {club.stage.map((robot) => (
              <li key={robot.id} className="-ml-1.5 first:ml-0">
                <RobotTile id={robot.id} name={robot.name} className="size-[30px] rounded-full bg-paper lg:size-9" />
              </li>
            ))}
          </ul>
          <Star aria-hidden="true" className="absolute top-8 right-1 size-12 fill-[#ffd84d] lg:top-3 lg:right-[300px] lg:size-[60px]" strokeWidth={2.4} />
        </div>
        {points && tier && (
          <div className="mt-3 lg:mt-0 lg:w-[280px] lg:shrink-0 lg:rounded-[20px] lg:border-2 lg:border-ink lg:bg-paper lg:px-[18px] lg:py-4">
            <p className="hidden text-xs font-extrabold tracking-[0.06em] text-ink-3 uppercase lg:block">Club points</p>
            <div className="flex items-baseline justify-between gap-2 text-[13px] font-extrabold lg:mt-0.5">
              <span>
                <span className="lg:hidden">{formatCount(points.points)} club point{points.points === 1 ? "" : "s"}</span>
                <span className="hidden font-heading text-5xl leading-[52px] lg:inline">{formatCount(points.points)}</span>
              </span>
              {tier.next && (
                <span className="lg:text-[15px]">
                  {tier.next.name} at {tier.next.at}
                </span>
              )}
            </div>
            <div aria-hidden="true" className="mt-1 h-3 overflow-hidden rounded-md border-2 border-ink bg-paper lg:mt-2">
              <div className="h-full bg-ink" style={{ width: `${tier.percent}%` }} />
            </div>
            <Link
              href="#top-savers"
              className="mt-3 hidden h-10 items-center gap-2 rounded-xl border-2 border-ink px-4 text-sm font-extrabold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:flex"
            >
              <Trophy aria-hidden="true" className="size-4" strokeWidth={2.6} />
              Top savers · #{formatCount(points.rank)}
              <ChevronRight aria-hidden="true" className="ml-auto size-4" strokeWidth={3} />
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}

function Perks({ perks }: { perks: Perk[] }) {
  return (
    <section aria-labelledby="perks-title" className="mt-1 lg:mt-0">
      <div className="flex items-baseline justify-between gap-3 lg:justify-start">
        <h2 id="perks-title" className="font-heading text-[19px] font-extrabold lg:text-[26px]">
          This week’s perks
        </h2>
        <p className="text-[12.5px] font-semibold text-ink-3 lg:text-[15px]">from creators</p>
      </div>
      <ul className="mt-2 flex flex-col gap-2 lg:mt-3 lg:grid lg:grid-cols-3 lg:gap-5">
        {perks.map((perk) => {
          const art = robotFullBody(perk.robotId);
          return (
            <li key={perk.title} className="flex items-center gap-2.5 rounded-[18px] border-2 border-ink bg-paper px-2.5 py-[9px] lg:block lg:overflow-hidden lg:rounded-3xl lg:p-0 lg:shadow-hard">
              <div className={cn("relative hidden h-[200px] border-b-2 border-ink lg:block", PERK_TONE[perk.robotId] ?? "bg-sky")}>
                <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.45)_1.5px,transparent_1.5px)] [background-size:18px_18px]" />
                {art && <Image src={art.src} alt="" width={art.width} height={art.height} className="absolute bottom-0 left-1/2 h-[180px] w-auto -translate-x-1/2" />}
                <span className="absolute top-3 left-3 rounded-full border-2 border-ink bg-paper px-2.5 text-[11.5px] leading-5 font-extrabold">{perk.audience}</span>
              </div>
              <RobotTile id={perk.robotId} name={perk.title} className="size-10 rounded-xl lg:hidden" />
              <div className="min-w-0 grow lg:px-4 lg:pt-3.5">
                <p className="truncate text-sm leading-[17px] font-bold lg:overflow-visible lg:text-base lg:leading-5 lg:font-extrabold lg:whitespace-normal">{perk.title}</p>
                <p className="truncate text-xs leading-[15px] text-ink-3 lg:overflow-visible lg:text-[13px] lg:leading-5 lg:whitespace-normal">
                  {perk.sub}
                  {perk.audience === "ALL MEMBERS" ? <span className="lg:hidden"> · All members</span> : null}
                </p>
              </div>
              <div className="shrink-0 lg:px-4 lg:pt-8 lg:pb-4">
                <Button asChild variant={PERK_CTA[perk.cta]} size="default" className="h-[34px] rounded-[11px] px-3 text-[13px] font-bold lg:h-10 lg:w-full lg:rounded-md lg:px-4 lg:text-sm lg:font-extrabold">
                  <Link href={perk.href}>{perk.cta}</Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SaveCard({ save, cutAt }: { save: ClubSave; cutAt: Date }) {
  const time = `${formatUtcTime(cutAt)} UTC`;
  const rows: [string, string][] = [
    [`${save.robot.name} ${save.robot.status === "bench" ? "queue" : "pile"}`, `${cut(save.robot.pile)}${save.rank ? ` · ${ordinal(save.rank)} of ${save.stageSize}` : ""}`],
    ...(save.lowest ? ([["Lowest pile now", `${save.lowest.name} · ${cut(save.lowest.pile)}`]] as [string, string][]) : []),
    ["If the cut ran now", save.paysPer100 === null ? (save.robot === save.lowest ? "Cut" : "–") : `${pays(save.paysPer100)} per 100 saved`],
  ];

  return (
    <section aria-labelledby="save-title" className="rounded-[20px] border-2 border-ink bg-[#ffd84d] py-[11px] pr-3 pl-3.5 shadow-hard lg:rounded-3xl lg:px-[18px] lg:pt-4 lg:pb-[18px]">
      <div className="flex items-center gap-3">
        <RobotTile id={save.robot.id} name={save.robot.name} className="size-[46px] rounded-[14px] lg:hidden" />
        <div className="min-w-0 grow">
          <p className="flex items-center gap-[5px] text-[11px] font-extrabold tracking-[0.04em] whitespace-nowrap uppercase lg:gap-1.5 lg:text-[11.5px] lg:tracking-[0.05em]">
            <Lock aria-hidden="true" className="size-3" strokeWidth={3} />
            Your save<span className="hidden lg:inline"> · locked till {time}</span>
          </p>
          <div className="mt-1 hidden items-center gap-3 lg:flex">
            <RobotTile id={save.robot.id} name={save.robot.name} className="size-[52px] rounded-xl" />
            <div className="min-w-0">
              <h2 id="save-title" className="font-heading text-xl leading-6 font-extrabold whitespace-nowrap">
                {cut(save.amount)} $CUT on {save.robot.name}
              </h2>
              <p className="text-[13px] font-bold">
                {save.robot.kind} · {formatCount(save.robot.savers)} savers
              </p>
            </div>
          </div>
          <p className="mt-px truncate font-heading text-lg leading-[22px] font-extrabold lg:hidden">
            {cut(save.amount)} $CUT on {save.robot.name}
          </p>
          <p className="truncate text-[12.5px] font-semibold lg:hidden">
            Locked till {time}
            {save.rank ? ` · ${ordinal(save.rank)} of ${save.stageSize}` : ""}
          </p>
        </div>
        <Button asChild variant="black" size="icon-sm" className="size-[34px] rounded-[11px] lg:hidden">
          <WalletGatedLink href={`/save/${save.robot.id}`} aria-label={`Save more on ${save.robot.name}`}>
            <Plus aria-hidden="true" className="size-4" strokeWidth={3} />
          </WalletGatedLink>
        </Button>
      </div>
      <dl className="mt-3 hidden rounded-2xl border-2 border-ink bg-paper px-3.5 py-1 lg:block">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-t-[1.5px] border-canvas py-2 text-[13px] first:border-t-0">
            <dt className="font-semibold text-ink-3">{label}</dt>
            <dd className="font-extrabold">{value}</dd>
          </div>
        ))}
      </dl>
      <Button asChild variant="black" size="lg" className="mt-3 hidden w-full lg:flex">
        <WalletGatedLink href={`/save/${save.robot.id}`}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={3} />
          Save more
        </WalletGatedLink>
      </Button>
    </section>
  );
}

function NoSaveCard() {
  return (
    <section className="rounded-3xl border-2 border-ink bg-[#ffd84d] px-4 py-3.5 shadow-hard">
      <p className="text-[11.5px] font-extrabold tracking-[0.05em] uppercase">Your save</p>
      <p className="mt-1 text-[15px] leading-5 font-bold">Every survivor gets the same slice of the prize. Small piles share it among fewer $CUT, so they pay more.</p>
      <Button asChild variant="black" size="lg" className="mt-3 w-full">
        <Link href="/">Save a robot</Link>
      </Button>
    </section>
  );
}

function GuessCard() {
  return (
    <Link
      href="/director"
      className="flex h-[50px] items-center gap-2 rounded-2xl border-2 border-ink bg-pink px-2.5 shadow-hard-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-[72px] lg:gap-3.5 lg:rounded-[20px] lg:px-4 lg:shadow-hard"
    >
      <span className="flex size-[18px] shrink-0 items-center justify-center lg:size-10 lg:rounded-xl lg:border-2 lg:border-ink lg:bg-paper">
        <Target aria-hidden="true" className="size-[18px] lg:size-5" strokeWidth={2.6} />
      </span>
      <span className="min-w-0 grow">
        <span className="block text-sm leading-4 font-bold lg:font-heading lg:text-xl lg:leading-6 lg:font-extrabold">Guess the cut</span>
        <span className="block text-xs leading-4 font-semibold lg:text-[13px] lg:font-bold">
          +2<span className="hidden lg:inline"> club points</span> if right
        </span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0" strokeWidth={3} />
    </Link>
  );
}

function TopSavers({ savers, member }: { savers: TopSaver[]; member: ClubMember }) {
  const rank = member.points?.rank;
  return (
    <section id="top-savers" aria-labelledby="top-title" className="rounded-2xl border-2 border-ink bg-paper px-2.5 lg:rounded-3xl lg:px-[18px] lg:pt-4 lg:pb-[18px] lg:shadow-hard">
      <div className="flex h-[46px] items-center gap-2 lg:h-auto lg:justify-between">
        <Trophy aria-hidden="true" className="size-[18px] shrink-0 lg:hidden" strokeWidth={2.6} />
        <div className="min-w-0 grow lg:grow-0">
          <h2 id="top-title" className="flex items-center gap-2 text-sm leading-4 font-bold lg:font-heading lg:text-xl lg:leading-7 lg:font-extrabold">
            <Trophy aria-hidden="true" className="hidden size-[18px] lg:block" strokeWidth={2.6} />
            Top savers
          </h2>
          {rank && <p className="truncate text-xs leading-4 text-ink-3 lg:hidden">you’re #{formatCount(rank)}</p>}
        </div>
        <span className="hidden text-xs font-bold text-ink-3 lg:inline">club points</span>
        <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-ink-3 lg:hidden" strokeWidth={2.6} />
      </div>
      <ol className="mt-1.5 hidden lg:block">
        {savers.map((saver, index) => (
          <li key={saver.accountId} className="flex items-center gap-3 border-t-[1.5px] border-canvas py-2 text-[15px] first:border-t-0">
            <span className="w-4 text-[13px] font-extrabold text-ink-3">{saver.rank}</span>
            <span className={cn("flex size-7 items-center justify-center rounded-full border-2 border-ink text-xs font-extrabold", AVATAR_TONE[index % AVATAR_TONE.length])}>
              {saver.accountId.charAt(0).toUpperCase()}
            </span>
            <span className="grow font-bold">{saver.accountId}</span>
            <span className="font-extrabold">{saver.points}</span>
          </li>
        ))}
        {rank && member.points && (
          <li className="mt-2 flex items-center gap-3 rounded-xl border-2 border-ink bg-pink px-3 py-2 text-[15px]">
            <span className="text-[13px] font-extrabold">#{formatCount(rank)}</span>
            <span className="flex size-7 items-center justify-center rounded-full border-2 border-ink bg-paper text-xs font-extrabold">{member.accountId.charAt(0).toUpperCase()}</span>
            <span className="grow font-extrabold">You · {member.accountId}</span>
            <span className="font-extrabold">{member.points.points}</span>
          </li>
        )}
      </ol>
    </section>
  );
}

/* ---------------------------------------------------------------- Visitor */

function LockedClub({ club }: { club: Club }) {
  const benefits = [
    { title: "Perks from creators", sub: "Shout-outs, early drops, stickers", tone: "bg-pink", icon: Star },
    { title: "Save a robot, share the prize", sub: "If it survives the cut, you share its slice", tone: "bg-[#ffd84d]", icon: Lock },
    { title: "Club points and a rank", sub: "For showing up, not for size", tone: "bg-lime", icon: Trophy },
  ];
  const locked = club.perks.filter((perk) => perk.audience === "ALL MEMBERS");

  return (
    <>
      <section aria-labelledby="locked-title" className="rounded-3xl border-2 border-dashed border-ink bg-paper px-4 py-4 lg:px-8 lg:py-6">
        <span className="flex size-12 items-center justify-center rounded-xl border-2 border-ink bg-pink shadow-hard-sm lg:size-[52px]">
          <Lock aria-hidden="true" className="size-5" strokeWidth={2.6} />
        </span>
        <h2 id="locked-title" className="mt-3 font-heading text-[30px] leading-[34px] font-extrabold tracking-[-1px] lg:mt-4 lg:text-[42px] lg:leading-[46px] lg:tracking-[-1.6px]">
          Your card is waiting
        </h2>
        <p className="mt-1 text-[15px] font-medium text-ink-3 lg:text-[17px]">Hold any amount of $CUT and you’re in.</p>
        <Button asChild variant="primary" size="xl" elevated className="mt-4 h-[50px] w-full rounded-2xl text-base lg:w-auto">
          <WalletGatedLink href="/buy">Buy $CUT to join · from $10</WalletGatedLink>
        </Button>
      </section>
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_344px] lg:items-start lg:gap-6">
        {locked.length > 0 && (
          <section aria-labelledby="members-get-title">
            <h2 id="members-get-title" className="text-[13px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">
              Members get this week
            </h2>
            <ul className="mt-2 grid grid-cols-2 gap-3 lg:mt-2.5 lg:gap-5">
              {locked.map((perk) => (
                <li key={perk.title} className="overflow-hidden rounded-3xl border-2 border-ink bg-paper">
                  <div className={cn("relative flex h-[110px] items-center justify-center border-b-2 border-ink opacity-50 lg:h-[186px]", PERK_TONE[perk.robotId] ?? "bg-sky")}>
                    <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(rgb(255_255_255/0.45)_1.5px,transparent_1.5px)] [background-size:18px_18px]" />
                  </div>
                  <span aria-hidden="true" className="relative mx-auto -mt-[78px] mb-[30px] flex size-11 items-center justify-center rounded-xl border-2 border-ink bg-paper shadow-hard-sm lg:-mt-[120px] lg:mb-[70px] lg:size-[52px]">
                    <Lock className="size-5" strokeWidth={2.6} />
                  </span>
                  <div className="px-3 pt-1 pb-3 lg:px-4 lg:pb-4">
                    <p className="text-[13.5px] leading-[18px] font-extrabold text-ink-2 lg:text-base">{perk.title}</p>
                    <p className="mt-2 text-xs font-bold text-ink-3 lg:mt-8 lg:text-[13px]">Members only</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section aria-labelledby="benefits-title" className="rounded-3xl border-2 border-ink bg-paper px-4 pt-3.5 pb-2 shadow-hard lg:px-5 lg:pt-5">
          <h2 id="benefits-title" className="font-heading text-xl font-extrabold lg:text-[22px]">
            What members get
          </h2>
          <ul className="mt-1.5">
            {benefits.map((benefit) => (
              <li key={benefit.title} className="flex items-center gap-3.5 border-t-[1.5px] border-canvas py-3 first:border-t-0">
                <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl border-2 border-ink", benefit.tone)}>
                  <benefit.icon aria-hidden="true" className="size-5" strokeWidth={2.6} />
                </span>
                <span>
                  <span className="block text-base font-extrabold">{benefit.title}</span>
                  <span className="block text-[13px] text-ink-3">{benefit.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
