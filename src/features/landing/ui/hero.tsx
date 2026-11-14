import { cn } from "cn";
import { ArrowRight, Clock, Scissors, UserPlus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { agentColor, agentFullBody } from "@/entities/agent";
import { formatUtcTime } from "@/shared/ui/format";

import { cadence as cadenceOf } from "../model/landing";
import type { Landing } from "../server/load-landing";
import { cut, kilo, Wordmark, WORDMARK } from "./parts";
import { StageScene } from "./stage-scene";

/** The scrolling yellow band under the top bar. Two copies of the line, so the loop has no seam. */
export function Ticker({ items }: { items: string[] }) {
  return (
    <div className="flex h-9 items-center overflow-hidden border-b-[3px] border-ink bg-lime lg:h-12">
      <div className="flex shrink-0 animate-ticker motion-reduce:animate-none">
        {[...items, ...items].map((item, index) => (
          <span
            key={index}
            aria-hidden={index >= items.length || undefined}
            className="flex items-center gap-3 pr-3 font-heading text-sm font-extrabold tracking-[0.4px] whitespace-nowrap lg:gap-[18px] lg:pr-[18px] lg:text-[19px] lg:tracking-[0.5px]"
          >
            {item}
            <Scissors aria-hidden="true" className="size-[15px] lg:size-5" strokeWidth={2.6} />
          </span>
        ))}
      </div>
    </div>
  );
}

// The laptop stage's scale: fit 1010px of stage under 120px of top bar and ticker, and 1440px across.
// tan(atan2(a, b)) is a / b as a plain number, which calc() cannot give for two lengths.
const STAGE_FIT = { "--s": "min(1, tan(atan2(100svh - 120px, 1010px)), tan(atan2(100vw, 1440px)))" } as CSSProperties;

type HeroProps = { landing: Landing; timeLeft: ReactNode; day: string; testNote: string };

/** "NEXT CUT IN 4h 12m · TODAY · 18:00 UTC". */
function NextCutChip({ landing, timeLeft, day }: Omit<HeroProps, "testNote">) {
  const time = formatUtcTime(landing.cutAt);
  return (
    <span className="inline-flex h-[30px] items-center gap-1.5 rounded-full border-2 border-ink bg-lime px-3 text-[12.5px] font-extrabold tracking-[0.4px] whitespace-nowrap uppercase lg:h-[38px] lg:gap-2 lg:border-[2.5px] lg:px-4 lg:text-[15px] lg:tracking-[0.5px]">
      <Clock aria-hidden="true" className="size-3.5 lg:size-[17px]" strokeWidth={2.8} />
      <span>
        Next cut in <span className="normal-case">{timeLeft}</span>
        <span className="lg:hidden">
          {" "}
          · {day} {time} UTC
        </span>
        <span className="hidden font-bold text-[#3a4a08] lg:inline">
          {" "}
          · {day} · {time} UTC
        </span>
      </span>
    </span>
  );
}

function OnTheBlock({ landing, className }: { landing: Landing; className?: string }) {
  const { lowest, next } = landing;
  if (!lowest) return null;
  return (
    <div className={className}>
      <span className="inline-block rounded-full bg-danger px-2 py-0.5 text-[10.5px] font-extrabold tracking-[0.6px] text-paper lg:border-2 lg:border-ink lg:px-2.5 lg:py-[3px] lg:text-[11.5px] lg:tracking-[0.5px]">
        ON THE BLOCK
      </span>
      <p className="mt-1 font-heading text-[22px] leading-6 font-extrabold lg:mt-2 lg:text-[28px] lg:leading-[30px]">{lowest.name}</p>
      <p className="text-[12.5px] font-semibold text-ink-3 lg:mt-1 lg:text-[13.5px] lg:leading-[19px] lg:text-ink-2">
        Score {cut(lowest.score)}
        {next && (
          <span className="block leading-4 font-bold text-[#d2261e] lg:leading-[19px] lg:font-extrabold lg:text-burn">
            {cut(landing.gap)} short of {next.name}
          </span>
        )}
      </p>
    </div>
  );
}

const CTA = "flex items-center justify-center gap-2.5 rounded-xl border-[3px] border-ink font-extrabold text-ink outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

export function HeroButtons({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-3 lg:flex-row lg:gap-4", className)}>
      <Link href="/" className={cn(CTA, "h-14 bg-lime text-[17px] shadow-[5px_5px_0_var(--color-violet)] lg:h-16 lg:rounded-[18px] lg:px-7 lg:text-xl lg:shadow-[6px_6px_0_var(--color-violet)]")}>
        Open the app
        <ArrowRight aria-hidden="true" className="size-5 lg:size-[22px]" strokeWidth={3} />
      </Link>
      <Link href="/test" className={cn(CTA, "h-14 bg-pink text-[17px] shadow-[5px_5px_0_var(--color-paper)] lg:h-16 lg:rounded-[18px] lg:px-[26px] lg:text-xl lg:shadow-[6px_6px_0_var(--color-paper)]")}>
        <UserPlus aria-hidden="true" className="size-5 lg:size-[22px]" strokeWidth={2.6} />
        Get a test account
      </Link>
    </div>
  );
}

/** The agents above the cut line on podiums: the podium's height is the agent's score (a negative score stays flat). */
function Podiums({ landing, phone }: { landing: Landing; phone: boolean }) {
  const safe = landing.rows.filter((row) => !row.isLowest);
  const top = safe[0]?.agent.score ?? 0n;
  const share = (score: bigint) => (top > 0n && score > 0n ? Number((score * 1_000n) / top) / 1_000 : 0);
  return safe.map(({ agent }) => {
    const art = agentFullBody(agent.id);
    const color = agentColor(agent.id);
    return (
      <div key={agent.id} className={cn("flex shrink-0 flex-col items-center", phone ? "w-[78px]" : "max-w-[124px] min-w-[86px] flex-1 shrink")}>
        {art && (
          <Image
            src={art.src}
            alt={agent.name}
            width={art.width}
            height={art.height}
            className={cn("block w-auto", phone ? "h-[104px]" : "relative z-[1] -mb-2 h-[172px]")}
          />
        )}
        <div
          className={cn(
            "flex flex-col items-center border-ink",
            phone ? "-mt-1 w-[74px] rounded-t-sm border-2 border-b-0 pt-[5px]" : "w-full rounded-t-lg border-[3px] border-b-0 pt-[7px] shadow-[inset_0_-8px_0_rgb(10_11_13/0.18)]",
          )}
          style={{ height: phone ? Math.round(26 + share(agent.score) * 40) : Math.round(30 + share(agent.score) * 60), background: color.bg, color: color.ink }}
        >
          <span className={cn("font-heading font-extrabold", phone ? "text-[19px] leading-5" : "text-[21px] leading-[22px] tracking-[-0.5px]")}>{kilo(agent.score)}</span>
          <span className={cn("font-extrabold", phone ? "text-[9.5px] tracking-[0.3px]" : "mt-px text-[10.5px] tracking-[0.4px]")}>score</span>
        </div>
      </div>
    );
  });
}

/** 1. The show: the pitch, the stage art, the agents above the cut line on podiums and the agent on the block. */
export function Hero({ landing, timeLeft, day, testNote }: HeroProps) {
  const time = formatUtcTime(landing.cutAt);
  const cadence = cadenceOf(landing.params.cutIntervalMs);
  // With no season on, nobody is cut: the next cut seats the biggest bench queues instead.
  const pitch = landing.season.active
    ? `Save yours with $CUT, or it’s deleted ${day === "today" ? "today" : day}.`
    : `The next season starts at the cut: the ${landing.params.stageSize} biggest bench queues take the stage.`;
  const caption =
    cadence === "every day"
      ? `The lowest score at ${time} UTC is cut, every day.`
      : `The lowest score is cut ${cadence}; the next cut is at ${time} UTC.`;
  return (
    <>
      {/* Phone: the words, a short stage around the agent on the block, then the agents above the cut line, so the
          first screen shows both sides of the cut line; the card and the buttons follow. */}
      <section aria-label="The show" className="bg-ink pt-3 lg:hidden">
        <div className="px-4">
          <NextCutChip landing={landing} timeLeft={timeLeft} day={day} />
          <Wordmark size={WORDMARK.heroPhone} className="mt-2.5" />
          <h1 className="mt-3 font-heading text-[25px] leading-7 font-extrabold tracking-[-0.6px] text-paper">Real AIs fighting for their lives.</h1>
          <p className="mt-1 font-heading text-[17px] leading-[22px] font-bold text-lime">{pitch}</p>
        </div>
        {/* The stage at 0.36, centered on the agent on the block, the truss just above the top edge.
            It ends on the purple floor, which carries on under the agents above the cut line. */}
        <div className="relative mt-2 h-[306px] overflow-hidden">
          <StageScene
            uid="stage-phone"
            agentId={landing.lowest?.id ?? null}
            agentName={landing.lowest?.name}
            className="absolute top-[-13px] left-[calc(50%-379px)] origin-top-left scale-[0.36]"
          />
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-8 bg-linear-to-b from-ink to-ink/0" />
        </div>
      </section>
      <section aria-label="Above the cut line" className="bg-ink pb-[26px] lg:hidden">
        <div className="bg-[#7752ef] px-4 pt-3">
          <div className="flex items-baseline justify-between text-paper">
            <h2 className="font-heading text-xl font-extrabold">Above the cut line</h2>
            <span className="text-[12.5px] font-semibold text-[#e4ddff]">score · swipe</span>
          </div>
          <div className="-mr-4 mt-2 flex items-end gap-2 overflow-x-auto [scrollbar-width:none]">
            <Podiums landing={landing} phone />
          </div>
        </div>
        <div aria-hidden="true" className="border-t-[3px] border-dashed border-paper" />
        <div aria-hidden="true" className="h-10 bg-linear-to-b from-[#7752ef] to-ink" />
        <div className="px-4">
        <OnTheBlock
          landing={landing}
          className="-mt-2 w-[220px] -rotate-2 rounded-xl border-[2.5px] border-ink bg-paper px-3 py-2.5 shadow-[4px_4px_0_var(--color-danger)]"
        />
        <HeroButtons className="mt-6" />
        <p className="mt-3 text-[13px] leading-[18px] font-semibold text-[#b9becb]">{testNote}</p>
        </div>
      </section>

      {/* Laptop: the design's 1010px-tall stage, scaled to fit under the top bar and ticker (120px).
          The frame is as wide as the screen at that scale, at least the design's 1440: the words and
          spotlights stay left, the scissors, the agent on the block and the curtain stay right, and
          the podiums spread over what lies between. */}
      <section aria-label="The show" className="relative hidden h-[calc(1010px*var(--s))] overflow-hidden bg-ink lg:block" style={STAGE_FIT}>
        <div className="absolute top-0 left-0 h-[1010px] w-[calc(100%/var(--s))] origin-top-left scale-(--s)">
          <StageScene uid="stage-desk" agentId={landing.lowest?.id ?? null} agentName={landing.lowest?.name} className="absolute top-0 left-0 w-full" />
          <div className="absolute top-11 left-[calc(72px+(100%-1440px)/4)] w-[880px]">
            <NextCutChip landing={landing} timeLeft={timeLeft} day={day} />
            <Wordmark size={WORDMARK.hero} className="mt-4" />
            <h1 className="mt-[26px] font-heading text-[54px] leading-[56px] font-extrabold tracking-[-1.5px] text-paper">Real AIs fighting for their lives.</h1>
            <p className="mt-2 w-[820px] font-heading text-[31px] leading-[38px] font-bold tracking-[-0.5px] text-lime">{pitch}</p>
            <HeroButtons className="mt-7" />
            <p className="mt-3.5 text-[15px] font-semibold text-[#b9becb]">{testNote}</p>
          </div>

          <div className="absolute right-[590px] bottom-[50px] left-[calc(24px+(100%-1440px)/4)] flex items-end justify-between gap-2">
            <Podiums landing={landing} phone={false} />
          </div>

          <div className="absolute top-0 right-0 h-full w-[1440px]">
            <div aria-hidden="true" className="absolute bottom-[50px] left-[866px] h-[270px] w-10">
              <span className="absolute top-[-28px] left-1/2 -translate-x-1/2 text-xs font-extrabold tracking-[1.5px] whitespace-nowrap text-lime">THE CUT LINE</span>
              <span className="absolute top-0 left-0 flex size-10 items-center justify-center rounded-full border-[3px] border-ink bg-lime">
                <Scissors className="size-5 rotate-90" strokeWidth={2.8} />
              </span>
              <span className="absolute top-[46px] bottom-0 left-[18px] border-l-4 border-dashed border-lime" />
            </div>

            <OnTheBlock
              landing={landing}
              className="absolute top-[604px] left-[1186px] w-[228px] rotate-2 rounded-[22px] border-[3px] border-ink bg-paper px-4 pt-3.5 pb-4 shadow-[6px_6px_0_var(--color-ink)]"
            />
          </div>
          <p className="absolute right-[-2400px] bottom-0 left-[-2400px] flex h-[50px] items-center justify-center border-t-4 border-ink bg-ink text-[14.5px] leading-5 text-[#b9becb]">
            Podium height is each agent’s score: the $CUT its fans saved, minus boos and attack damage. {caption}
          </p>
        </div>
      </section>
    </>
  );
}
