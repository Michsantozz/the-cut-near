"use client";

import { cn } from "cn";
import { Check, Flame, Gift, Lock, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CUT_DECIMALS, parseUnits } from "@/shared/lib/amount";
import { Button } from "@/shared/ui/button";
import { formatAmount, formatUsd, formatUtcTime } from "@/shared/ui/format";
import { useNow } from "@/shared/ui/use-now";
import { useWallet } from "@/shared/wallet";

import { saveCalls, storageTopUp, unsaveCalls } from "../model/calls";
import { classifyTxError, failedTxHash } from "../model/errors";
import { cutToUsdCents, spotPrice } from "../model/money";
import { defaultSave, ordinal, SAVE_STORAGE, saveProblem, shareIfCutNow, type SaveChoice } from "../model/save";
import { cutToInput } from "../model/sell";
import type { SaveData } from "../server/load";
import { agentFullBody as agentSticker, agentTile } from "@/entities/agent";
import { cutText, cutWhole, dayWord, nearText } from "./copy";
import { TradeFrame } from "./frame";
import { FailedStep, PendingStep, TxLink } from "./status";

type Step =
  | { kind: "pick"; note?: string }
  | { kind: "pending"; action: "save" | "unsave"; agent: SaveChoice; amount: bigint }
  | { kind: "success"; action: "save" | "unsave"; agent: SaveChoice; amount: bigint; txHash: string }
  | { kind: "failed"; action: "save" | "unsave"; txHash: string | null };

// The design's color behind each agent (Lineup.dc.html).
const AGENT_BG: Record<string, string> = {
  pixie: "bg-sky",
  lila: "bg-pink",
  oracle: "bg-violet",
  mabel: "bg-[#ffd84d]",
  melody: "bg-orange",
  yuna: "bg-blue",
  gremlin: "bg-lime",
  velvet: "bg-ink-2",
  onyx: "bg-[#1e2b57]",
  kiko: "bg-[#ffc2e8]",
};

const pays = (value: bigint | null) => (value === null ? "—" : formatAmount(value, { maxFractionDigits: 2, minFractionDigits: 2 }));

/** Save an agent (Club.dc.html / DeskClub.dc.html "vote"): pick an agent and an amount, locked until the next cut. */
export function SaveScreen({ data }: { data: SaveData }) {
  const { status, openConnect, callContract } = useWallet();
  const router = useRouter();
  const now = new Date(useNow(data.renderedAt));
  const { choices, slice, stageSize } = data.picker;
  const account = data.account;
  const free = account?.free ?? 0n;
  const [pickedId, setPickedId] = useState(data.agentId ?? choices.at(-2)?.agent.id ?? choices[0]?.agent.id ?? null);
  const [text, setText] = useState(cutToInput(account ? defaultSave(free) : 100n * 10n ** 18n));
  const [step, setStep] = useState<Step>({ kind: "pick" });

  const picked = choices.find((choice) => choice.agent.id === pickedId) ?? null;
  const amount = parseUnits(text, CUT_DECIMALS);
  const held = account?.saves.find((save) => save.agentId === pickedId) ?? null;
  const problem = account ? saveProblem(amount, free, held !== null) : null;
  const rate = data.usdCentsPerNear;
  const spot = spotPrice(data.pool);
  const at = `${formatUtcTime(data.cutAt)} UTC`;
  const when = dayWord(now, data.cutAt);
  const lowest = choices.at(-1) ?? null;
  const above = choices.at(-2) ?? null;
  const share = picked && amount ? shareIfCutNow(picked, slice, amount) : null;
  const topUp = storageTopUp(account?.storageAvailable ?? null, SAVE_STORAGE);

  async function send(action: "save" | "unsave") {
    if (status !== "signed-in") return openConnect();
    if (!picked) return;
    const value = action === "save" ? amount : (held?.amount ?? 0n);
    if (!value || (action === "save" && problem)) return;
    setStep({ kind: "pending", action, agent: picked, amount: value });
    try {
      const calls = action === "save" ? saveCalls({ agentId: picked.agent.id, amount: value, storageTopUp: topUp }) : unsaveCalls(picked.agent.id);
      const { txHash } = await callContract(calls);
      setStep({ kind: "success", action, agent: picked, amount: value, txHash });
      router.refresh();
    } catch (error) {
      setStep(classifyTxError(error) === "cancelled" ? { kind: "pick", note: "Cancelled in the wallet. Nothing moved." } : { kind: "failed", action, txHash: failedTxHash(error) });
    }
  }

  if (step.kind === "pending") {
    const name = step.agent.agent.name;
    return (
      <TradeFrame title="Saving" nav={{ kind: "close" }} hideHeader>
        <PendingStep
          title={step.action === "save" ? `Saving ${name}` : `Taking back your save on ${name}`}
          from={step.action === "save" ? { label: "$CUT", sub: cutText(step.amount) } : { label: name.split(" ")[0], sub: cutText(step.amount) }}
          to={step.action === "save" ? { label: name.split(" ")[0], sub: "pile" } : { label: "$CUT", sub: "yours" }}
          caption={step.action === "save" ? `Locked till ${at}${when}` : "Back with the prize it earned"}
          note={step.action === "save" ? "Saves count by $CUT, not by people" : "Your save rode through the cut"}
        />
      </TradeFrame>
    );
  }

  if (step.kind === "success") {
    const { agent } = step.agent;
    return (
      <TradeFrame title="Saved" nav={{ kind: "close" }} hideHeader>
        <div role="status" className="flex grow flex-col pt-[72px] lg:pt-2">
          <span aria-hidden="true" className="flex size-[72px] items-center justify-center rounded-2xl border-2 border-ink bg-lime shadow-hard">
            <Check className="size-8" strokeWidth={3} />
          </span>
          <p className="mt-6 font-heading text-[44px] leading-[48px] font-extrabold tracking-[-1.5px]">{step.action === "save" ? "Saved." : "Taken back."}</p>
          <p className="mt-2 text-[17px] leading-6">
            {step.action === "save"
              ? `${cutText(step.amount)} $CUT is in ${agent.name}’s pile, locked till ${at}${when}.`
              : `Your ${cutText(step.amount)} $CUT and the prize it earned are back in your wallet.`}
          </p>
          <p className="mt-3 text-[13px] font-semibold">
            Receipt on NEAR: <TxLink txHash={step.txHash} />
          </p>
          <div className="mt-auto flex gap-2.5 pt-8 lg:mt-6">
            <Button asChild variant="outline" size="xl" elevated className="h-14 flex-1 rounded-2xl text-[15.5px]">
              <Link href="/">See the lineup</Link>
            </Button>
            <Button asChild variant="lime" size="xl" elevated className="h-14 flex-1 rounded-2xl text-[15.5px]">
              <Link href={`/agents/${agent.id}`}>{agent.name.split(" ")[0]}’s page</Link>
            </Button>
          </div>
        </div>
      </TradeFrame>
    );
  }

  if (step.kind === "failed") {
    return (
      <TradeFrame title="Save an agent" nav={{ kind: "close" }} hideHeader>
        <FailedStep
          txHash={step.txHash}
          title={step.action === "save" ? "The save didn't go through." : "Your save is still locked in."}
          body={
            step.action === "save"
              ? "The contract refused it, so nothing moved. Your $CUT is untouched and only the network fee was spent."
              : "The contract refused it, so nothing moved. Only the network fee was spent."
          }
          rows={[{ label: "Your $CUT", value: `${cutText(free)} free` }]}
          actions={
            <>
              <Button asChild variant="outline" size="xl" elevated className="h-14 flex-1 rounded-2xl text-[15.5px]">
                <Link href="/">Back to the lineup</Link>
              </Button>
              <Button variant="lime" size="xl" elevated className="h-14 flex-1 rounded-2xl text-[15.5px]" onClick={() => setStep({ kind: "pick" })}>
                Try again
              </Button>
            </>
          }
        />
      </TradeFrame>
    );
  }

  const name = picked?.agent.name ?? "an agent";
  const cta = amount && amount > 0n ? `Save ${cutText(amount)} on ${name}` : `Save ${name}`;
  const survivors = Math.max(stageSize - 1, 0);

  return (
    <TradeFrame title="Save an agent" nav={{ kind: "back", label: "Back to the lineup", onClick: () => router.push("/") }} deskWidth="lg:w-[1000px]" bareOnDesk>
      <div className="flex grow flex-col lg:-mx-[30px] lg:-mt-[26px] lg:-mb-[30px] lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="lg:py-6 lg:pr-6 lg:pl-7">
          <p className="hidden text-xs font-extrabold tracking-[0.05em] text-ink-3 uppercase lg:block">Save an agent</p>
          <p className="hidden font-heading text-[30px] leading-[34px] font-extrabold tracking-[-0.8px] lg:mt-0.5 lg:block">Who do you keep alive?</p>
          <p className="mt-3 px-1 text-[13.5px] leading-[19px] text-ink-2 lg:mt-1 lg:px-0 lg:text-sm lg:leading-5">
            Your $CUT goes into the agent’s pile, locked until {when.trim() === "today" ? "today’s cut" : "the next cut"} at {at}. The lowest pile is cut; saves count by $CUT, not by people.
          </p>

          {/* Phone: a grid of tiles. Laptop: the ranked list with the cut line. */}
          <section aria-label="Pick an agent" className="mt-3 rounded-[20px] border-2 border-ink bg-paper px-3 pt-2.5 pb-3 lg:hidden">
            <p className="flex justify-between text-[11.5px] font-extrabold tracking-[0.04em] text-ink-3 uppercase">
              <span>Pick an agent</span>
              <span>Pays per 100 saved</span>
            </p>
            <div role="radiogroup" aria-label="Agents" className="mt-1.5 grid grid-cols-5 gap-1">
              {choices.map((choice) => (
                <button
                  key={choice.agent.id}
                  type="button"
                  role="radio"
                  aria-checked={choice.agent.id === pickedId}
                  aria-label={`${choice.agent.name}, ${choice.isLowest ? "cut if the cut ran now" : `pays ${pays(choice.paysPer100)} per 100 saved`}`}
                  onClick={() => setPickedId(choice.agent.id)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl border-2 border-transparent pt-1 pb-[3px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-ink aria-checked:bg-lime-soft",
                    choice.isLowest && "bg-danger-tint",
                  )}
                >
                  <Tile id={choice.agent.id} name={choice.agent.name} className="size-7 rounded-full" />
                  <span className={cn("text-[13px] leading-[15px] font-extrabold", choice.isLowest && "text-burn")}>{choice.isLowest ? "Cut" : pays(choice.paysPer100)}</span>
                </button>
              ))}
            </div>
            <p className="mt-[5px] text-xs leading-4 text-ink-3">If the cut ran now. Small piles pay more per $CUT, but they sit closer to the cut line.</p>
            {picked && (
              <div className="mt-2 flex items-center gap-2.5 rounded-[14px] border-2 border-ink bg-lime-soft px-2.5 py-[7px]">
                <Tile id={picked.agent.id} name={picked.agent.name} className="size-10 rounded-xl" />
                <div className="min-w-0 grow">
                  <p className="text-[15px] leading-[18px] font-extrabold">{picked.agent.name}</p>
                  <p className="truncate text-xs leading-[15px] text-ink-3">
                    Pile {cutWhole(picked.agent.pile)} · {ordinal(picked.rank)} of {stageSize}
                  </p>
                </div>
                <p className="shrink-0 text-right leading-4 whitespace-nowrap">
                  <span className={cn("block font-heading text-base font-extrabold", picked.isLowest && "text-burn")}>{picked.isLowest ? "Cut" : pays(picked.paysPer100)}</span>
                  <span className="text-[11px] font-bold text-ink-3">{picked.isLowest ? "if it ran now" : "per 100"}</span>
                </p>
              </div>
            )}
          </section>

          <section aria-label="Pick an agent" className="hidden lg:mt-4 lg:block">
            <div className="flex h-[26px] items-center gap-3 px-3 text-[11px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">
              <span className="grow">Agent</span>
              <span className="w-[72px] text-right">Pile</span>
              <span className="w-[92px] text-right whitespace-nowrap">Pays per 100</span>
              <span className="w-5" />
            </div>
            <div role="radiogroup" aria-label="Agents" className="flex flex-col gap-[3px]">
              {choices.map((choice) => (
                <div key={choice.agent.id}>
                  {choice.isLowest && (
                    <div aria-hidden="true" className="mt-0 mb-[3px] flex items-center gap-2 px-3 text-[11px] font-extrabold tracking-[0.05em] whitespace-nowrap text-burn">
                      CUT LINE · lowest pile at {at}
                      {when}
                      <span className="grow border-t-2 border-dashed border-danger" />
                    </div>
                  )}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={choice.agent.id === pickedId}
                    onClick={() => setPickedId(choice.agent.id)}
                    className="flex h-[38px] w-full items-center gap-3 rounded-[13px] border-2 border-transparent px-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-ink aria-checked:bg-lime-soft"
                  >
                    <Tile id={choice.agent.id} name={choice.agent.name} className="size-[26px] rounded-full" />
                    <span className="w-32 shrink-0 text-sm font-semibold whitespace-nowrap in-aria-checked:font-extrabold">{choice.agent.name}</span>
                    <span aria-hidden="true" className="h-2.5 grow overflow-hidden rounded-[5px] bg-canvas">
                      <span
                        className={cn("block h-full rounded-[5px]", choice.isLowest ? "bg-orange" : choice.agent.id === pickedId ? "bg-ink" : "bg-violet")}
                        style={{ width: `${barWidth(choice.agent.pile, choices[0]?.agent.pile ?? 0n)}%` }}
                      />
                    </span>
                    <span className={cn("w-[72px] text-right text-sm font-bold", choice.isLowest && "text-burn")}>{cutWhole(choice.agent.pile)}</span>
                    <span className={cn("w-[92px] text-right text-sm font-extrabold", choice.isLowest && "text-burn")}>{choice.isLowest ? "Cut" : pays(choice.paysPer100)}</span>
                    <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-paper in-aria-checked:bg-lime">
                      {choice.agent.id === pickedId && <span className="size-2 rounded-full bg-ink" />}
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2.5 flex items-start gap-2.5 rounded-[14px] border-2 border-ink bg-lime-soft px-3 py-2.5 text-[13.5px] leading-[19px] font-semibold">
              <Gift aria-hidden="true" className="mt-px size-[18px] shrink-0" strokeWidth={2.6} />
              Pays per 100 $CUT saved, if the cut ran now. Every survivor gets the same slice of the prize, so small piles pay more per $CUT, but they sit closer to the cut line.
            </p>
          </section>
        </div>

        <div className="flex grow flex-col lg:border-l-2 lg:border-ink lg:bg-canvas">
          {picked && <PickHeader choice={picked} stageSize={stageSize} />}
          <div className="flex grow flex-col lg:px-5 lg:pt-3.5 lg:pb-5">
            {picked && (
              <div className="hidden items-start justify-between gap-3 lg:flex">
                <div>
                  <p className="font-heading text-2xl leading-7 font-extrabold">{picked.agent.name}</p>
                  <p className="text-[13px] font-semibold text-ink-3">
                    {picked.agent.kind} · pile {cutWhole(picked.agent.pile)}
                  </p>
                </div>
                <p className="pt-1.5 text-right text-[13px] font-bold">
                  {picked.isLowest ? "Cut" : `${pays(picked.paysPer100)} per 100 saved`}
                  <span className="block font-semibold text-ink-3">if the cut ran now</span>
                </p>
              </div>
            )}

            <section aria-label="Amount" className="mt-3 rounded-[20px] border-2 border-ink bg-paper px-3 pt-2.5 pb-3 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
              <p className="flex items-baseline justify-between gap-2">
                <label htmlFor="save-amount" className="text-[13px] font-extrabold">
                  Amount
                </label>
                {account && (
                  <span className="text-[12.5px] font-semibold whitespace-nowrap text-ink-3">
                    {/* Phone: the locked save line is hidden, so the header names it. */}
                    {held && !held.unlocked ? (
                      <>
                        <span className="lg:hidden">
                          {cutText(free)} free · {cutText(held.amount)} saved here
                        </span>
                        <span className="hidden lg:inline">You have {cutText(free)} free $CUT</span>
                      </>
                    ) : (
                      `You have ${cutText(free)} free $CUT`
                    )}
                  </span>
                )}
              </p>
              <div className="mt-1.5 flex h-[52px] items-center gap-2 rounded-2xl border-2 border-ink bg-paper px-3.5 ring-[3px] ring-lime lg:h-[50px]">
                <input
                  id="save-amount"
                  inputMode="decimal"
                  autoComplete="off"
                  value={text}
                  placeholder="0"
                  onChange={(event) => {
                    const next = event.target.value.replaceAll(",", "");
                    if (next === "" || /^\d{0,12}(\.\d{0,2})?$/.test(next)) setText(next);
                  }}
                  className={cn("min-w-[1ch] bg-transparent font-heading text-[28px] font-extrabold outline-none [field-sizing:content] lg:text-[26px]", problem === "too-much" && "text-burn")}
                />
                <span className="text-sm font-extrabold">$CUT</span>
                {amount && rate !== null && <span className="ml-auto text-[13px] font-semibold text-ink-3">≈ {formatUsd(cutToUsdCents(amount, spot, rate))}</span>}
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-bold whitespace-nowrap">
                <Lock aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2.6} />
                Locked until {at}
                {when}
                {account && amount !== null && amount <= free && <span className="ml-auto font-semibold text-ink-3">{cutText(free - amount)} stays free</span>}
              </p>
              {problem === "too-much" && (
                <p role="alert" className="mt-1.5 text-[13px] font-semibold text-burn">
                  You have {cutText(free)} free $CUT. <Link href="/buy" className="underline underline-offset-2">Buy more</Link>
                </p>
              )}
              {problem === "too-small" && (
                <p role="alert" className="mt-1.5 text-[13px] font-semibold text-burn">
                  A new save is at least 0.1 $CUT.
                </p>
              )}
              {held && (
                <div className={cn("mt-2 items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-1.5 text-[12.5px] font-semibold lg:flex lg:bg-paper", held.unlocked ? "flex" : "hidden")}>
                  <span>
                    Your save: <b className="font-extrabold">{cutText(held.amount)} $CUT</b>
                    {held.unlocked ? " · unlocked" : ` · locked till ${at}`}
                  </span>
                  {held.unlocked && (
                    <Button size="sm" variant="outline" onClick={() => void send("unsave")}>
                      Take it back
                    </Button>
                  )}
                </div>
              )}
            </section>

            {picked && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Outcome
                  tone="survives"
                  title={picked.isLowest ? "You lift it" : "You share its slice"}
                  body={
                    picked.isLowest
                      ? above && lowest
                        ? `Lift ${picked.agent.name.split(" ")[0]} past ${above.agent.name} (${cutWhole(data.gapToNext)} $CUT) and it survives with the smallest pile: it pays the most per $CUT.`
                        : "Its savers share its slice of the prize."
                      : share !== null && amount
                        ? `Its savers share its slice: about ${formatAmount(share, { maxFractionDigits: 2, minFractionDigits: 2 })} for your ${cutText(amount)}, if the cut ran now.`
                        : "Its savers share its slice of the prize."
                  }
                />
                <Outcome tone="cut" title="Half your save burns" body={`The other half pays the savers of the ${survivors} survivors.`} />
              </div>
            )}

            {step.kind === "pick" && step.note && (
              <p role="status" className="mt-3 rounded-2xl border-2 border-ink bg-paper px-4 py-2.5 text-sm font-semibold">
                {step.note}
              </p>
            )}

            <div className="mt-auto pt-4 lg:pt-3.5">
              <Button
                variant="primary"
                size="xl"
                elevated
                disabled={!picked || (status === "signed-in" && problem !== null)}
                className="h-[54px] w-full rounded-2xl text-base lg:text-[15.5px]"
                onClick={() => void send("save")}
              >
                <Lock aria-hidden="true" strokeWidth={2.6} />
                {status === "signed-out" ? "Connect a wallet to save" : cta}
              </Button>
              {account && topUp > 0n && (
                <p className="mt-1.5 text-center text-[11.5px] leading-4 font-semibold text-ink-3">Adds {nearText(topUp)} NEAR of storage to keep the save’s record.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </TradeFrame>
  );
}

const barWidth = (pile: bigint, top: bigint) => (top > 0n ? Math.max(4, Math.min(100, Number((pile * 100n) / top))) : 4);

function Tile({ id, name, className }: { id: string; name: string; className?: string }) {
  const src = agentTile(id);
  const frame = cn("shrink-0 overflow-hidden rounded-lg border-2 border-ink bg-paper", className);
  if (!src) {
    return (
      <span aria-hidden="true" className={cn(frame, "flex items-center justify-center bg-lime font-heading text-sm font-extrabold")}>
        {name.charAt(0)}
      </span>
    );
  }
  return <Image src={src} alt="" width={40} height={40} className={cn(frame, "object-cover")} />;
}

/** Laptop: the picked agent on its color, with "Your pick · 5th of 10" and the close button. */
function PickHeader({ choice, stageSize }: { choice: SaveChoice; stageSize: number }) {
  const art = agentSticker(choice.agent.id);
  return (
    <div
      className={cn(
        "relative hidden h-[168px] shrink-0 overflow-hidden border-b-2 border-ink bg-[radial-gradient(rgb(255_255_255/0.3)_1.6px,transparent_1.8px)] [background-size:18px_18px] lg:block lg:rounded-tr-[26px]",
        AGENT_BG[choice.agent.id] ?? "bg-lime",
      )}
    >
      {art && <Image src={art.src} alt="" width={art.width} height={art.height} className="absolute top-3.5 left-1/2 h-[300px] w-auto max-w-none -translate-x-1/2 -rotate-2" />}
      <span className="absolute top-4 left-4 flex h-7 items-center rounded-full border-2 border-ink bg-paper px-[11px] text-xs font-extrabold whitespace-nowrap">
        Your pick · {ordinal(choice.rank)} of {stageSize}
      </span>
      <Link
        href="/"
        aria-label="Close"
        className="absolute top-4 right-4 flex size-[38px] items-center justify-center rounded-[12px] border-2 border-ink bg-paper outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X aria-hidden="true" className="size-4" strokeWidth={2.8} />
      </Link>
    </div>
  );
}

function Outcome({ tone, title, body }: { tone: "survives" | "cut"; title: string; body: string }) {
  const Icon = tone === "survives" ? Gift : Flame;
  return (
    <div className={cn("rounded-2xl border-2 border-ink px-[11px] pt-2.5 pb-[11px] lg:rounded-[14px] lg:px-2.5 lg:pt-[9px] lg:pb-2.5", tone === "survives" ? "bg-lime-soft" : "bg-danger-tint")}>
      <p className="flex items-center gap-1.5 text-[11px] font-extrabold tracking-[0.04em] whitespace-nowrap uppercase lg:text-[10.5px]">
        <span aria-hidden="true" className="flex size-[22px] shrink-0 items-center justify-center rounded-[7px] border-2 border-ink bg-paper lg:size-5">
          <Icon className="size-3 lg:size-[11px]" strokeWidth={2.8} />
        </span>
        {tone === "survives" ? "If it survives" : "If it is cut"}
      </p>
      <p className="mt-1.5 font-heading text-base leading-[19px] font-extrabold lg:mt-[5px] lg:text-[15px] lg:leading-[18px]">{title}</p>
      <p className="mt-[3px] text-xs leading-4 font-medium">{body}</p>
    </div>
  );
}
