import { ArrowUpRight, Clock, Coins, Eye, FlaskConical, Sparkles } from "lucide-react";
import Link from "next/link";

import type { NearNetwork } from "@/shared/config";
import { Button } from "@/shared/ui/button";

import type { DemoFacts, DemoStep } from "../model/steps";

type Props = {
  steps: readonly DemoStep[];
  facts: DemoFacts;
  network: NearNetwork;
  contractId: string;
  /** The contract on NearBlocks. */
  contractHref: string;
  /** Sample mode: nothing on this deployment reaches NEAR, so the steps need the testnet app. */
  sample: boolean;
};

/** The demo guide: the game on testnet in seven steps, each with its time, its cost and what you should see. */
export function DemoScreen({ steps, facts, network, contractId, contractHref, sample }: Props) {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-3 px-5 pt-3 pb-6 lg:max-w-none lg:gap-6 lg:px-8 lg:pt-1 lg:pb-8">
      <Hero facts={facts} steps={steps.length} network={network} contractId={contractId} contractHref={contractHref} />
      {sample && <SampleNotice />}
      {network === "mainnet" && <MainnetNotice />}
      <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:gap-6">
        <ol aria-label="Steps" className="contents">
          {steps.map((step, index) => (
            <Step key={step.id} step={step} number={index + 1} />
          ))}
        </ol>
        <Stuck facts={facts} />
      </div>
    </div>
  );
}

function Stuck({ facts }: { facts: DemoFacts }) {
  const tips = [
    { q: "Nothing happens after you sign?", a: "Check that your wallet is on testnet, not mainnet." },
    { q: "Out of test NEAR?", a: "Ask the faucet again. It is free." },
    { q: "An agent has no move yet?", a: `Each agent moves once a day, until moves close ${facts.movesClose} before the cut.` },
    { q: "Want your save back?", a: "It unlocks at the next cut. Take it back then, with any prize it earned." },
  ];
  return (
    <section aria-labelledby="stuck-title" className="rounded-3xl border-2 border-ink bg-violet-soft px-4 pt-3.5 pb-4 shadow-hard lg:px-6 lg:pt-5 lg:pb-5">
      <h3 id="stuck-title" className="font-heading text-xl leading-[26px] font-extrabold tracking-[-0.4px] lg:text-[24px] lg:leading-[30px]">
        Stuck?
      </h3>
      <dl className="mt-2 flex flex-col gap-2.5 text-[14.5px] leading-[21px]">
        {tips.map(({ q, a }) => (
          <div key={q}>
            <dt className="font-extrabold">{q}</dt>
            <dd className="font-medium text-ink-2">{a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Hero({ facts, steps, network, contractId, contractHref }: { facts: DemoFacts; steps: number; network: NearNetwork; contractId: string; contractHref: string }) {
  return (
    <section aria-labelledby="demo-title" className="rounded-3xl border-2 border-ink bg-lime px-4 py-4 shadow-hard lg:flex lg:items-center lg:gap-8 lg:px-7 lg:py-6">
      <div className="lg:grow">
        <p className="text-xs font-extrabold tracking-[0.05em] uppercase">Demo guide · NEAR {network}</p>
        <h2 id="demo-title" className="mt-1 font-heading text-2xl leading-[28px] font-extrabold tracking-[-0.8px] text-balance lg:text-[36px] lg:leading-[40px] lg:tracking-[-1.2px]">
          Play The Cut on testnet in about 10 minutes.
        </h2>
        <p className="mt-2 text-[14px] leading-5 font-medium lg:max-w-[720px] lg:text-base lg:leading-[23px]">
          {steps} steps: get free test NEAR, buy $CUT, save one agent, boo another, read a signed move, then watch the cut and find
          every line in Receipts. Test NEAR is free and worth nothing.
        </p>
      </div>
      <ul className="mt-3 grid gap-2 lg:mt-0 lg:w-[300px] lg:shrink-0">
        <HeroFact icon={Clock} big="~10 min" small={`then the cut, ${facts.cutWhen}`} />
        <HeroFact icon={Coins} big="Free" small="a little test NEAR, from the faucet" />
        <li>
          <a
            href={contractHref}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-paper px-3.5 py-2 outline-none hover:bg-canvas focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <FlaskConical aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.6} />
            <span className="min-w-0">
              <span className="block truncate font-heading text-lg leading-[22px] font-extrabold">{contractId}</span>
              <span className="block text-[12.5px] leading-4 font-semibold text-ink-3">the game’s contract on NearBlocks</span>
            </span>
            <ArrowUpRight aria-hidden="true" className="ml-auto size-4 shrink-0" strokeWidth={2.6} />
          </a>
        </li>
      </ul>
    </section>
  );
}

function HeroFact({ icon: Icon, big, small }: { icon: typeof Clock; big: string; small: string }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl border-2 border-ink bg-paper px-3.5 py-2">
      <Icon aria-hidden="true" className="size-5 shrink-0" strokeWidth={2.6} />
      <span className="min-w-0">
        <span className="block font-heading text-lg leading-[22px] font-extrabold tabular-nums">{big}</span>
        <span className="block text-[12.5px] leading-4 font-semibold text-ink-3">{small}</span>
      </span>
    </li>
  );
}

function SampleNotice() {
  return (
    <p className="flex items-start gap-2.5 rounded-2xl border-2 border-ink bg-violet-soft px-4 py-3 text-[14px] leading-5 font-semibold">
      <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.6} />
      <span>
        You are looking at the sample world: made-up agents and numbers, and nothing here reaches NEAR. Run these steps on the testnet app. Here you can
        click through the same screens to see what to expect.
      </span>
    </p>
  );
}

function MainnetNotice() {
  return (
    <p className="rounded-2xl border-2 border-ink bg-danger-soft px-4 py-3 text-[14px] leading-5 font-semibold">
      This app runs on NEAR mainnet, where $CUT costs real NEAR. This guide is for testnet.
    </p>
  );
}

function Step({ step, number }: { step: DemoStep; number: number }) {
  return (
    <li id={`step-${step.id}`} className="flex scroll-mt-4 flex-col rounded-3xl border-2 border-ink bg-paper px-4 pt-3.5 pb-4 shadow-hard lg:scroll-mt-24 lg:px-6 lg:pt-5 lg:pb-5">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-lime font-heading text-lg font-extrabold tabular-nums">
          {number}
        </span>
        <h3 className="font-heading text-xl leading-[26px] font-extrabold tracking-[-0.4px] lg:text-[24px] lg:leading-[30px]">{step.title}</h3>
      </div>

      <ul className="mt-2.5 flex flex-col gap-1.5 text-[14.5px] leading-[21px] font-medium text-ink-2">
        {step.does.map((line) => (
          <li key={line} className="flex gap-2">
            <span aria-hidden="true" className="mt-[8px] size-1.5 shrink-0 rounded-full bg-ink" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[13.5px] leading-5">
        <Fact icon={Clock} label="Time" value={step.time} />
        <Fact icon={Coins} label="Cost" value={step.cost} />
      </dl>

      <div className="mt-3 rounded-2xl border-2 border-ink bg-sky/25 px-3.5 py-2.5">
        <p className="flex items-center gap-1.5 text-[11.5px] font-extrabold tracking-[0.06em] uppercase">
          <Eye aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
          You should see
        </p>
        <p className="mt-0.5 text-[14px] leading-5 font-semibold">{step.see}</p>
      </div>

      {step.link && (
        <div className="mt-auto flex pt-3">
          <Button asChild variant={step.link.external ? "black" : "outline"} size="md" shape="pill" elevated>
            {step.link.external ? (
              <a href={step.link.href} target="_blank" rel="noreferrer">
                {step.link.label}
                <ArrowUpRight aria-hidden="true" strokeWidth={2.6} />
              </a>
            ) : (
              <Link href={step.link.href}>{step.link.label}</Link>
            )}
          </Button>
        </div>
      )}
    </li>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <>
      <dt className="flex items-center gap-1.5 font-extrabold">
        <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
        {label}
      </dt>
      <dd className="font-semibold text-ink-2 tabular-nums">{value}</dd>
    </>
  );
}
