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
import { robotSticker, robotTile } from "./art";
import { cutText, cutWhole, dayWord, nearText } from "./copy";
import { TradeFrame } from "./frame";
import { FailedStep, PendingStep, TxLink } from "./status";

type Step =
  | { kind: "pick"; note?: string }
  | { kind: "pending"; action: "save" | "unsave"; robot: SaveChoice; amount: bigint }
  | { kind: "success"; action: "save" | "unsave"; robot: SaveChoice; amount: bigint; txHash: string }
  | { kind: "failed"; action: "save" | "unsave"; txHash: string | null };

// The design's color behind each robot (Lineup.dc.html).
const ROBOT_BG: Record<string, string> = {
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

/** Save a robot (Club.dc.html / DeskClub.dc.html "vote"): pick a robot and an amount, locked until the next cut. */
export function SaveScreen({ data }: { data: SaveData }) {
  const { status, openConnect, callContract } = useWallet();
  const router = useRouter();
  const now = new Date(useNow(data.renderedAt));
  const { choices, slice, stageSize } = data.picker;
  const account = data.account;
  const free = account?.free ?? 0n;
  const [pickedId, setPickedId] = useState(data.robotId ?? choices.at(-2)?.robot.id ?? choices[0]?.robot.id ?? null);
  const [text, setText] = useState(cutToInput(account ? defaultSave(free) : 100n * 10n ** 18n));
  const [step, setStep] = useState<Step>({ kind: "pick" });

  const picked = choices.find((choice) => choice.robot.id === pickedId) ?? null;
  const amount = parseUnits(text, CUT_DECIMALS);
  const held = account?.saves.find((save) => save.robotId === pickedId) ?? null;
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
    setStep({ kind: "pending", action, robot: picked, amount: value });
    try {
      const calls = action === "save" ? saveCalls({ robotId: picked.robot.id, amount: value, storageTopUp: topUp }) : unsaveCalls(picked.robot.id);
      const { txHash } = await callContract(calls);
      setStep({ kind: "success", action, robot: picked, amount: value, txHash });
      router.refresh();
    } catch (error) {
      setStep(classifyTxError(error) === "cancelled" ? { kind: "pick", note: "Cancelled in the wallet. Nothing moved." } : { kind: "failed", action, txHash: failedTxHash(error) });
    }
  }

  if (step.kind === "pending") {
    const name = step.robot.robot.name;
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
    const { robot } = step.robot;
    return (
      <TradeFrame title="Saved" nav={{ kind: "close" }} hideHeader>
        <div role="status" className="flex grow flex-col pt-[72px] lg:pt-2">
          <span aria-hidden="true" className="flex size-[72px] items-center justify-center rounded-2xl border-2 border-ink bg-lime shadow-hard">
            <Check className="size-8" strokeWidth={3} />
          </span>
          <p className="mt-6 font-heading text-[44px] leading-[48px] font-extrabold tracking-[-1.5px]">{step.action === "save" ? "Saved." : "Taken back."}</p>
          <p className="mt-2 text-[17px] leading-6">
            {step.action === "save"
              ? `${cutText(step.amount)} $CUT is in ${robot.name}’s pile, locked till ${at}${when}.`
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
              <Link href={`/robots/${robot.id}`}>{robot.name.split(" ")[0]}’s page</Link>
            </Button>
          </div>
        </div>
      </TradeFrame>
    );
  }

  if (step.kind === "failed") {
    return (
      <TradeFrame title="Save a robot" nav={{ kind: "close" }} hideHeader>
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

  const name = picked?.robot.name ?? "a robot";
  const cta = amount && amount > 0n ? `Save ${cutText(amount)} on ${name}` : `Save ${name}`;
  const survivors = Math.max(stageSize - 1, 0);

  return (
    <TradeFrame title="Save a robot" nav={{ kind: "back", label: "Back to the lineup", onClick: () => router.push("/") }} wide bareOnDesk>
      <div className="flex grow flex-col lg:-mx-[30px] lg:-mt-[26px] lg:-mb-[30px] lg:grid lg:grid-cols-[1fr_382px]">
        <div className="lg:px-[30px] lg:pt-[26px] lg:pb-[26px]">
          <p className="hidden text-[12.5px] font-extrabold tracking-[0.05em] text-ink-3 uppercase lg:block">Save a robot</p>
          <p className="hidden font-heading text-[30px] leading-9 font-extrabold tracking-[-0.8px] lg:block">Who do you keep alive?</p>
          <p className="mt-2 text-[14.5px] leading-5 text-ink-2 lg:mt-1">
            Your $CUT goes into the robot’s pile, locked until {when.trim() === "today" ? "today’s cut" : "the next cut"} at {at}. The lowest pile is cut; saves count by $CUT, not by people.
          </p>

          {/* Phone: a grid of tiles. Laptop: the ranked list with the cut line. */}
          <section aria-label="Pick a robot" className="mt-3 rounded-3xl border-2 border-ink bg-paper px-3.5 pt-3 pb-3.5 lg:hidden">
            <p className="flex justify-between text-[11.5px] font-extrabold tracking-[0.04em] text-ink-3 uppercase">
              <span>Pick a robot</span>
              <span>Pays per 100 saved</span>
            </p>
            <div role="radiogroup" aria-label="Robots" className="mt-2 grid grid-cols-5 gap-1.5">
              {choices.map((choice) => (
                <button
                  key={choice.robot.id}
                  type="button"
                  role="radio"
                  aria-checked={choice.robot.id === pickedId}
                  aria-label={`${choice.robot.name}, ${choice.isLowest ? "cut if the cut ran now" : `pays ${pays(choice.paysPer100)} per 100 saved`}`}
                  onClick={() => setPickedId(choice.robot.id)}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-xl border-2 border-transparent py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-ink aria-checked:bg-lime-soft",
                    choice.isLowest && "bg-danger-tint",
                  )}
                >
                  <Tile id={choice.robot.id} name={choice.robot.name} className="size-8" />
                  <span className={cn("text-[13px] font-extrabold", choice.isLowest && "text-burn")}>{choice.isLowest ? "Cut" : pays(choice.paysPer100)}</span>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[12.5px] leading-[17px] text-ink-3">If the cut ran now. Small piles pay more per $CUT, but they sit closer to the cut line.</p>
            {picked && (
              <div className="mt-2.5 flex items-center gap-3 rounded-2xl border-2 border-ink bg-lime-soft px-3 py-2">
                <Tile id={picked.robot.id} name={picked.robot.name} className="size-10" />
                <div className="min-w-0 grow">
                  <p className="font-heading text-[17px] font-extrabold">{picked.robot.name}</p>
                  <p className="truncate text-[12.5px] text-ink-3">
                    Pile {cutWhole(picked.robot.pile)} · {ordinal(picked.rank)} of {stageSize}
                  </p>
                </div>
                <p className="shrink-0 text-right whitespace-nowrap">
                  <span className={cn("block font-heading text-lg leading-5 font-extrabold", picked.isLowest && "text-burn")}>{picked.isLowest ? "Cut" : pays(picked.paysPer100)}</span>
                  <span className="text-[11.5px] font-bold">{picked.isLowest ? "if it ran now" : "per 100"}</span>
                </p>
              </div>
            )}
          </section>

          <section aria-label="Pick a robot" className="hidden lg:mt-4 lg:block">
            <div className="flex px-3 text-[11.5px] font-extrabold tracking-[0.04em] text-ink-3 uppercase">
              <span className="grow">Robot</span>
              <span className="w-24 text-right">Pile</span>
              <span className="w-[136px] pr-8 text-right whitespace-nowrap">Pays per 100</span>
            </div>
            <div role="radiogroup" aria-label="Robots" className="mt-1 flex flex-col gap-1">
              {choices.map((choice) => (
                <div key={choice.robot.id}>
                  {choice.isLowest && (
                    <div aria-hidden="true" className="my-1 flex items-center gap-2 px-3 text-[11.5px] font-extrabold text-burn">
                      CUT LINE · lowest pile at {at}
                      {when}
                      <span className="grow border-t-2 border-dashed border-danger" />
                    </div>
                  )}
                  <button
                    type="button"
                    role="radio"
                    aria-checked={choice.robot.id === pickedId}
                    onClick={() => setPickedId(choice.robot.id)}
                    className="flex h-[39px] w-full items-center gap-3 rounded-xl border-2 border-transparent px-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-checked:border-ink aria-checked:bg-lime-soft"
                  >
                    <Tile id={choice.robot.id} name={choice.robot.name} className="size-[26px] rounded-full" />
                    <span className="w-[140px] shrink-0 text-[15px] font-semibold in-aria-checked:font-extrabold">{choice.robot.name}</span>
                    <span aria-hidden="true" className="mx-2 h-2.5 grow overflow-hidden rounded-[5px] bg-canvas">
                      <span
                        className={cn("block h-full rounded-[5px]", choice.isLowest ? "bg-orange" : choice.robot.id === pickedId ? "bg-ink" : "bg-violet")}
                        style={{ width: `${barWidth(choice.robot.pile, choices[0]?.robot.pile ?? 0n)}%` }}
                      />
                    </span>
                    <span className={cn("w-24 text-right text-[15px] font-bold", choice.isLowest && "text-burn")}>{cutWhole(choice.robot.pile)}</span>
                    <span className={cn("w-[84px] text-right text-[15px] font-extrabold", choice.isLowest && "text-burn")}>{choice.isLowest ? "Cut" : pays(choice.paysPer100)}</span>
                    <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-full border-2 border-ink bg-paper">
                      {choice.robot.id === pickedId && <span className="size-2.5 rounded-full border-2 border-ink bg-lime" />}
                    </span>
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-3 flex items-start gap-2.5 rounded-2xl border-2 border-ink bg-lime-soft px-3.5 py-2.5 text-sm leading-5 font-semibold">
              <Gift aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
              Pays per 100 $CUT saved, if the cut ran now. Every survivor gets the same slice of the prize, so small piles pay more per $CUT, but they sit closer to the cut line.
            </p>
          </section>
        </div>

        <div className="flex grow flex-col lg:border-l-2 lg:border-ink lg:bg-canvas">
          {picked && <PickHeader choice={picked} stageSize={stageSize} />}
          <div className="flex grow flex-col lg:px-[22px] lg:pt-3.5 lg:pb-[26px]">
            {picked && (
              <div className="hidden items-start justify-between gap-3 lg:flex">
                <div>
                  <p className="font-heading text-2xl leading-7 font-extrabold">{picked.robot.name}</p>
                  <p className="text-[13px] font-semibold text-ink-3">
                    {picked.robot.kind} · pile {cutWhole(picked.robot.pile)}
                  </p>
                </div>
                <p className="text-right text-[13px] font-bold">
                  {picked.isLowest ? "Cut" : `${pays(picked.paysPer100)} per 100 saved`}
                  <span className="block font-semibold text-ink-3">if the cut ran now</span>
                </p>
              </div>
            )}

            <section aria-label="Amount" className="mt-3 rounded-3xl border-2 border-ink bg-paper px-3.5 pt-3 pb-3 lg:mt-2.5 lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0">
              <p className="flex justify-between text-sm font-extrabold">
                <label htmlFor="save-amount">Amount</label>
                {account && <span className="font-semibold text-ink-3">You have {cutText(free)} free $CUT</span>}
              </p>
              <div className="mt-1.5 flex h-[60px] items-center gap-2 rounded-2xl border-2 border-ink bg-paper px-4 ring-4 ring-lime">
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
                  className={cn("min-w-[1ch] bg-transparent font-heading text-[28px] font-extrabold outline-none [field-sizing:content]", problem === "too-much" && "text-burn")}
                />
                <span className="font-heading text-base font-extrabold">$CUT</span>
                {amount && rate !== null && <span className="ml-auto text-sm font-semibold text-ink-3">≈ {formatUsd(cutToUsdCents(amount, spot, rate))}</span>}
              </div>
              <p className="mt-2 flex justify-between gap-2 text-[13px] font-bold">
                <span className="flex items-center gap-1.5">
                  <Lock aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
                  Locked until {at}
                  {when}
                </span>
                {account && amount !== null && amount <= free && <span className="font-semibold text-ink-3">{cutText(free - amount)} stays free</span>}
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
                <div className="mt-2.5 flex items-center justify-between gap-2 rounded-xl bg-canvas px-3 py-2 text-[13px] font-semibold lg:bg-paper">
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
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                <Outcome
                  tone="survives"
                  title={picked.isLowest ? "You lift it" : "You share its slice"}
                  body={
                    picked.isLowest
                      ? above && lowest
                        ? `Lift ${picked.robot.name.split(" ")[0]} past ${above.robot.name} (${cutWhole(data.gapToNext)} $CUT) and it survives with the smallest pile: it pays the most per $CUT.`
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

            <div className="mt-auto pt-6 lg:pt-4">
              <Button
                variant="primary"
                size="xl"
                elevated
                disabled={!picked || (status === "signed-in" && problem !== null)}
                className="h-14 w-full rounded-2xl text-base"
                onClick={() => void send("save")}
              >
                <Lock aria-hidden="true" strokeWidth={2.6} />
                {status === "signed-out" ? "Connect a wallet to save" : cta}
              </Button>
              {account && topUp > 0n && (
                <p className="mt-2 text-center text-xs font-semibold text-ink-3">Adds {nearText(topUp)} NEAR to your storage with $CUT, to keep the save’s record.</p>
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
  const src = robotTile(id);
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

/** Laptop: the picked robot on its color, with "Your pick · 5th of 10" and the close button. */
function PickHeader({ choice, stageSize }: { choice: SaveChoice; stageSize: number }) {
  const art = robotSticker(choice.robot.id);
  return (
    <div
      className={cn(
        "relative hidden h-[170px] items-end justify-center overflow-hidden border-b-2 border-ink bg-[radial-gradient(var(--color-paper)_1.2px,transparent_1.3px)] [background-size:18px_18px] lg:flex lg:rounded-tr-[26px]",
        ROBOT_BG[choice.robot.id] ?? "bg-lime",
      )}
    >
      {art && <Image src={art.src} alt="" width={art.width} height={art.height} className="h-[150px] w-auto" />}
      <span className="absolute top-4 left-4 rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 text-[12.5px] font-extrabold">
        Your pick · {ordinal(choice.rank)} of {stageSize}
      </span>
      <Link
        href="/"
        aria-label="Close"
        className="absolute top-3.5 right-3.5 flex size-[38px] items-center justify-center rounded-[12px] border-2 border-ink bg-paper shadow-hard-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X aria-hidden="true" className="size-[18px]" strokeWidth={2.8} />
      </Link>
    </div>
  );
}

function Outcome({ tone, title, body }: { tone: "survives" | "cut"; title: string; body: string }) {
  const Icon = tone === "survives" ? Gift : Flame;
  return (
    <div className={cn("rounded-2xl border-2 border-ink px-3 pt-2.5 pb-3", tone === "survives" ? "bg-lime-soft" : "bg-danger-tint")}>
      <p className="flex items-center gap-1.5 text-[11.5px] font-extrabold tracking-[0.03em] uppercase">
        <span aria-hidden="true" className="flex size-5 items-center justify-center rounded-md border-2 border-ink bg-paper">
          <Icon className="size-3" strokeWidth={2.6} />
        </span>
        {tone === "survives" ? "If it survives" : "If it is cut"}
      </p>
      <p className="mt-1.5 text-[15.5px] leading-5 font-extrabold">{title}</p>
      <p className="mt-1 text-[13px] leading-[17px]">{body}</p>
    </div>
  );
}
