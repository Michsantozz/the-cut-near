"use client";

import { cn } from "cn";
import { Flame, ThumbsDown } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AgentTile, PersonalityChip } from "@/entities/agent";
import { CUT_DECIMALS, parseUnits, units } from "@/shared/lib/amount";
import { Button } from "@/shared/ui/button";
import { formatUtcTime } from "@/shared/ui/format";
import { useWallet } from "@/shared/wallet";

import { booCalls } from "../model/calls";
import { BOO_PRESETS, booEffect, checkBoo } from "../model/boo";
import { classifyTxError, failedTxHash, type TxFailure } from "../model/errors";
import type { BooData } from "../server/load";
import { cutText, cutWhole } from "./copy";
import { FieldLabel, Row, TradeFrame } from "./frame";
import { FailedStep, TxLink } from "./status";

type Step =
  | { kind: "amount"; note?: string }
  | { kind: "confirm"; amount: bigint }
  | { kind: "pending"; amount: bigint }
  | { kind: "success"; amount: bigint; txHash: string }
  | { kind: "failed"; reason: TxFailure; txHash: string | null };

/**
 * Boo a stage agent (RULES.md `boo`): pick the agent and an amount, then confirm a burn. The confirm step says
 * plainly that the $CUT is gone for good; nothing is sent until the fan agrees to that.
 */
export function BooScreen({ data }: { data: BooData }) {
  const { status, openConnect, callContract } = useWallet();
  const router = useRouter();
  const [targetId, setTargetId] = useState(data.agentId ?? data.stage.at(-2)?.id ?? data.stage[0]?.id ?? null);
  const [text, setText] = useState("");
  const [step, setStep] = useState<Step>({ kind: "amount" });

  const target = data.stage.find((agent) => agent.id === targetId) ?? null;
  const free = data.account?.free ?? 0n;
  const amount = parseUnits(text, CUT_DECIMALS);
  const check = checkBoo(amount, free);
  const cutAt = `${formatUtcTime(data.cutAt)} UTC`;

  async function boo(burn: bigint) {
    if (!target) return;
    if (status !== "signed-in") return openConnect();
    setStep({ kind: "pending", amount: burn });
    try {
      const { txHash } = await callContract(booCalls({ agentId: target.id, amount: burn }));
      setStep({ kind: "success", amount: burn, txHash });
      router.refresh();
    } catch (error) {
      const reason = classifyTxError(error);
      setStep(reason === "cancelled" ? { kind: "amount", note: "Cancelled in the wallet. Nothing burned." } : { kind: "failed", reason, txHash: failedTxHash(error) });
    }
  }

  if (!data.seasonActive || !target) {
    return (
      <TradeFrame title="Boo an agent" icon={ThumbsDown} iconTile="bg-danger text-paper" nav={{ kind: "close" }}>
        <p className="pt-6 text-[15px] leading-[22px] text-ink-2 lg:pt-0">
          Boos only work on agents on the stage while a season runs. Nobody can be booed right now.
        </p>
      </TradeFrame>
    );
  }

  if (step.kind === "pending") {
    return (
      <TradeFrame title="Booing" nav={{ kind: "close" }} hideHeader>
        <div role="status" aria-live="polite" className="flex flex-col items-center pt-[52px] text-center lg:pt-6 lg:pb-4">
          <p className="text-[13px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">Confirming on NEAR</p>
          <p className="mt-2 font-heading text-[34px] leading-[38px] font-extrabold tracking-[-1px] text-balance">
            Burning {cutText(step.amount)} $CUT at {target.name}
          </p>
          <Flame aria-hidden="true" className="mt-8 size-16 text-danger" strokeWidth={2.2} />
        </div>
      </TradeFrame>
    );
  }

  if (step.kind === "success") {
    return (
      <TradeFrame title="Booed" nav={{ kind: "close" }} hideHeader>
        <div role="status" className="flex grow flex-col pt-[72px] lg:pt-2">
          <span aria-hidden="true" className="flex size-[72px] items-center justify-center rounded-2xl border-2 border-ink bg-danger text-paper shadow-hard">
            <ThumbsDown className="size-8" strokeWidth={2.8} />
          </span>
          <p className="mt-6 font-heading text-[44px] leading-[48px] font-extrabold tracking-[-1.5px]">Booed.</p>
          <p className="mt-2 text-[17px] leading-6">
            {cutText(step.amount)} $CUT burned. {target.name}’s score is {cutWhole(target.score - step.amount)} until the cut at {cutAt}.
          </p>
          <p className="mt-3 text-[13px] font-semibold">
            Receipt on NEAR: <TxLink txHash={step.txHash} />
          </p>
          <div className="mt-auto pt-8 lg:mt-6">
            <Button asChild variant="outline" size="xl" elevated className="h-14 w-full rounded-2xl text-base">
              <Link href="/">Back to today’s cut</Link>
            </Button>
          </div>
        </div>
      </TradeFrame>
    );
  }

  if (step.kind === "failed") {
    return (
      <TradeFrame title="Boo an agent" nav={{ kind: "close" }} hideHeader>
        <FailedStep
          txHash={step.txHash}
          title="The boo didn’t go through."
          body="The contract refused it, so nothing burned. Boos close when the cut is due and only work on agents still on the stage."
          rows={[{ label: "Your $CUT", value: `${cutText(free)} free` }]}
          actions={
            <Button variant="lime" size="xl" elevated className="h-14 flex-1 rounded-2xl text-[15.5px]" onClick={() => setStep({ kind: "amount" })}>
              Try again
            </Button>
          }
        />
      </TradeFrame>
    );
  }

  if (step.kind === "confirm") {
    const effect = booEffect(target, data.stage, step.amount);
    return (
      <TradeFrame title="Burn to boo?" icon={Flame} iconTile="bg-danger text-paper" nav={{ kind: "back", onClick: () => setStep({ kind: "amount" }), label: "Change the amount" }}>
        <div role="alertdialog" aria-labelledby="burn-title" aria-describedby="burn-body" className="flex grow flex-col pt-4 lg:pt-0">
          <p id="burn-title" className="font-heading text-[30px] leading-[34px] font-extrabold tracking-[-1px] text-balance lg:text-[36px] lg:leading-10">
            Burn {cutText(step.amount)} $CUT to boo {target.name}?
          </p>
          <div id="burn-body" className="mt-4 rounded-2xl border-2 border-danger bg-danger-soft px-4 py-3 text-[15px] leading-[22px] font-semibold">
            <p className="flex items-start gap-2">
              <Flame aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-danger" strokeWidth={2.6} />
              <span>
                <b className="font-extrabold">This $CUT is gone for good.</b> A boo burns it: it does not go to you, to another agent or to the
                contract, and nobody can give it back, even if {target.name} survives.
              </span>
            </p>
          </div>
          <dl className="mt-4 rounded-2xl border-2 border-ink bg-paper px-4 py-2.5">
            <Row label={`${target.name}’s score`} value={`${cutWhole(target.score)} → ${cutWhole(effect.scoreAfter)}`} />
            <Row label="Lasts until" value={`the cut at ${cutAt}`} />
            <Row label="Your free $CUT after" value={`${cutText(free - step.amount)} $CUT`} />
          </dl>
          <p className="mt-3 text-[13.5px] leading-[19px] text-ink-3">
            {effect.wasLowest
              ? `${target.name} is already on the cut line; a boo pushes it further from safety.`
              : effect.fallsToLine
                ? `With this boo, ${target.name} drops under the cut line if nothing else moves.`
                : `Even with this boo, ${target.name} stays above the cut line for now. Fans and agents can still move before the cut.`}
          </p>
          <div className="mt-auto flex flex-col gap-2.5 pt-6 lg:flex-row-reverse">
            <Button variant="black" size="xl" className="h-14 flex-1 rounded-2xl text-base shadow-[4px_4px_0_var(--color-danger)]" onClick={() => void boo(step.amount)}>
              Burn {cutText(step.amount)} $CUT for good
            </Button>
            <Button variant="outline" size="xl" elevated className="h-14 flex-1 rounded-2xl text-base" onClick={() => setStep({ kind: "amount" })}>
              Keep my $CUT
            </Button>
          </div>
        </div>
      </TradeFrame>
    );
  }

  const error =
    check.ok || check.reason === "empty"
      ? null
      : check.reason === "too-small"
        ? "The smallest boo is 0.1 $CUT."
        : `You have ${cutText(free)} free $CUT. Saved $CUT stays locked until the cut.`;

  return (
    <TradeFrame title="Boo an agent" icon={ThumbsDown} iconTile="bg-danger text-paper" nav={{ kind: "close" }}>
      <div className="flex grow flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-[30px]">
        <div className="flex flex-col">
          <FieldLabel>Who</FieldLabel>
          <ul role="radiogroup" aria-label="Agent to boo" className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {data.stage.map((agent, index) => (
              <li key={agent.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={agent.id === targetId}
                  onClick={() => setTargetId(agent.id)}
                  className="flex w-full items-center gap-2 rounded-xl border-2 border-ink bg-paper px-2 py-1.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:bg-danger-soft aria-checked:shadow-hard-xs"
                >
                  <AgentTile id={agent.id} name={agent.name} className="size-8" />
                  <span className="min-w-0 grow">
                    <span className="block truncate text-[14px] leading-[18px] font-extrabold">{agent.name}</span>
                    <span className="block text-[12px] leading-4 font-semibold text-ink-3">
                      #{index + 1} · score {cutWhole(agent.score)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PersonalityChip personality={target.personality} />
            <span className="text-[12.5px] font-semibold text-ink-3">{target.tagline}</span>
          </div>
        </div>

        <div className="mt-5 flex grow flex-col lg:mt-0">
          <FieldLabel htmlFor="boo-amount">Burn</FieldLabel>
          <div className="mt-1.5 flex h-24 items-center rounded-[20px] border-2 border-ink bg-paper px-5">
            <input
              id="boo-amount"
              inputMode="decimal"
              autoComplete="off"
              aria-label="$CUT to burn"
              value={text}
              placeholder="0"
              onChange={(event) => {
                const next = event.target.value.replaceAll(",", "");
                if (next === "" || /^\d{0,12}(\.\d{0,1})?$/.test(next)) setText(next);
              }}
              className={cn("w-full min-w-0 bg-transparent font-heading text-[52px] leading-[58px] font-extrabold tracking-[-2px] outline-none", error && "text-burn")}
            />
            <span className="ml-2 font-heading text-[26px] font-extrabold">$CUT</span>
          </div>
          <div role="group" aria-label="How much" className="mt-2.5 grid grid-cols-3 gap-2">
            {BOO_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={amount === units(preset)}
                onClick={() => setText(String(preset))}
                className="h-10 rounded-full border-2 border-ink bg-paper text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-lime aria-pressed:font-extrabold"
              >
                {cutWhole(units(preset))}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[13px] leading-[18px] font-semibold text-ink-3">
            {data.account ? `You have ${cutText(free)} free $CUT.` : "Connect a wallet to boo."} A boo lowers {target.name}’s score by the
            amount you burn, until the cut at {cutAt}.
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-2xl border-2 border-ink bg-danger-soft px-4 py-2.5 text-sm font-semibold">
              {error}
            </p>
          )}
          {step.kind === "amount" && step.note && (
            <p role="status" className="mt-3 rounded-2xl border-2 border-ink bg-paper px-4 py-2.5 text-sm font-semibold">
              {step.note}
            </p>
          )}
          <div className="mt-auto pt-6 lg:pt-5">
            <Button
              variant="black"
              size="xl"
              disabled={status === "signed-in" && !check.ok}
              className="h-14 w-full rounded-2xl text-base shadow-[4px_4px_0_var(--color-danger)]"
              onClick={() => (status !== "signed-in" ? openConnect() : check.ok && amount !== null && setStep({ kind: "confirm", amount }))}
            >
              {status === "signed-out" ? "Connect a wallet to boo" : `Boo ${target.name}`}
            </Button>
          </div>
        </div>
      </div>
    </TradeFrame>
  );
}
