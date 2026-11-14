"use client";

import { cn } from "cn";
import { Bell, Delete, Gift, Heart, Plus, Share, TrendingUp, TriangleAlert } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { Quote } from "@/entities/market";
import { Button } from "@/shared/ui/button";
import { formatUtcTime } from "@/shared/ui/format";
import { useNow } from "@/shared/ui/use-now";
import { useWallet } from "@/shared/wallet";

import { BUY_PRESETS, buyInputToNear, buyUnit, DEFAULT_BUY, editAmount, groupTyped, maxBuyNear, nearToBuyInput } from "../model/buy";
import { buyCalls, minOut, SLIPPAGE_BPS } from "../model/calls";
import { classifyTxError, failedTxHash, type TxFailure } from "../model/errors";
import { spotPrice, tradePrice } from "../model/money";
import { quoteBuyAction } from "../server/actions";
import type { BuyData } from "../server/load";
import { agentFullBody as agentSticker } from "@/entities/agent";
import { cutMoney, cutText, nearMoney, nearMoneyWhole, nearText, priceText, prizeName } from "./copy";
import { FieldLabel, Row, TradeFrame } from "./frame";
import { FailedStep, PendingStep, TxLink } from "./status";
import { toQuote, useQuote } from "./use-quote";

type Step =
  | { kind: "amount" }
  | { kind: "review"; note?: string }
  | { kind: "moved"; quote: Quote }
  | { kind: "pending"; quote: Quote }
  | { kind: "success"; quote: Quote; txHash: string }
  | { kind: "failed"; reason: TxFailure; txHash: string | null };

/** Buy $CUT with NEAR in The Cut's pool (Buy.dc.html / DeskBuy.dc.html). */
export function BuyScreen({ data }: { data: BuyData }) {
  const { status, openConnect, callContract } = useWallet();
  const router = useRouter();
  const now = new Date(useNow(data.renderedAt));
  const rate = data.usdCentsPerNear;
  const unit = buyUnit(rate);
  const [text, setText] = useState(DEFAULT_BUY[unit]);
  const [step, setStep] = useState<Step>({ kind: "amount" });
  const [reviewed, setReviewed] = useState<Quote | null>(null);

  const nearIn = buyInputToNear(text, unit, rate);
  const { quote, fresh } = useQuote(quoteBuyAction, nearIn, data.initial);
  const spot = spotPrice(data.pool);
  const account = data.account;
  const registration = account && !account.registered ? data.storageMin : null;
  const max = account?.nearBalance != null ? maxBuyNear(account.nearBalance, registration ?? 0n) : null;
  const tooMuch = nearIn !== null && max !== null && nearIn > max;
  const prize = prizeName(now, data.cutAt);
  const amountLabel = unit === "usd" ? `$${groupTyped(text)}` : `${groupTyped(text)} NEAR`;
  const getsLabel = unit === "usd" ? `$${groupTyped(text)}` : `${groupTyped(text)} NEAR`;

  function review() {
    if (status !== "signed-in") return openConnect();
    if (!quote || !fresh || !nearIn) return;
    setReviewed(quote);
    setStep({ kind: "review" });
  }

  async function confirm(accepted: Quote) {
    if (status !== "signed-in") return openConnect();
    if (!nearIn) return;
    // A fresh quote first: if the pool moved past the slippage, say so instead of sending a swap that would revert.
    const latest = await quoteBuyAction(nearIn.toString()).then(toQuote, () => accepted);
    if (latest.amountOut < minOut(accepted.amountOut)) return setStep({ kind: "moved", quote: latest });
    setStep({ kind: "pending", quote: accepted });
    try {
      const { txHash } = await callContract(buyCalls({ nearIn, minOut: minOut(accepted.amountOut), registration }));
      setStep({ kind: "success", quote: accepted, txHash });
      router.refresh();
    } catch (error) {
      const reason = classifyTxError(error);
      setStep(reason === "cancelled" ? { kind: "review", note: "Cancelled in the wallet. Nothing moved." } : { kind: "failed", reason, txHash: failedTxHash(error) });
    }
  }

  if (step.kind === "pending") {
    return (
      <TradeFrame title="Buying $CUT" nav={{ kind: "close" }} hideHeader>
        <PendingStep
          title="Swapping NEAR for $CUT"
          from={{ label: "NEAR", sub: nearIn ? nearText(nearIn) : "" }}
          to={{ label: "$CUT", sub: cutText(step.quote.amountOut) }}
          note={`The 1% fee, ${cutMoney(step.quote.fee, spot, rate)}, goes to ${prize}`}
        />
      </TradeFrame>
    );
  }

  if (step.kind === "success") {
    return <BuySuccess data={data} quote={step.quote} txHash={step.txHash} />;
  }

  if (step.kind === "failed") {
    return (
      <TradeFrame title="Buy $CUT" nav={{ kind: "close" }} hideHeader>
        <FailedStep
          txHash={step.txHash}
          title="The purchase didn't go through"
          body={
            step.reason === "slippage"
              ? `The $CUT price moved more than 1% before the swap confirmed, so it was cancelled. Nothing left your wallet except the network fee.`
              : "The contract refused the swap, so it was cancelled. Nothing left your wallet except the network fee."
          }
          rows={[{ label: "Status", value: "Cancelled, no $CUT bought" }]}
          actions={
            <>
              <Button asChild variant="outline" size="xl" elevated className="h-14 flex-1 rounded-2xl text-[15.5px]">
                <Link href="/">Back to the lineup</Link>
              </Button>
              <Button variant="lime" size="xl" elevated className="h-14 flex-1 rounded-2xl text-[15.5px]" onClick={() => setStep({ kind: "review" })}>
                Try again
              </Button>
            </>
          }
        />
      </TradeFrame>
    );
  }

  if ((step.kind === "review" || step.kind === "moved") && reviewed && nearIn) {
    const shown = step.kind === "moved" ? step.quote : reviewed;
    return (
      <TradeFrame title={step.kind === "moved" ? "Price moved" : "Review"} nav={{ kind: "back", label: "Back to the amount", onClick: () => setStep({ kind: "amount" }) }}>
        <div className="flex grow flex-col gap-3 pt-[18px] lg:grid lg:grid-cols-2 lg:gap-[30px] lg:pt-0">
          <section aria-label="Your purchase" className="rounded-3xl border-2 border-ink bg-paper px-4 pt-3.5 pb-3 shadow-hard lg:px-[22px] lg:pt-[18px] lg:pb-3">
            <div className="flex items-end justify-between border-b-[1.5px] border-line pb-3">
              <div>
                <p className="text-sm font-semibold text-ink-3">You pay</p>
                <p className="font-heading text-[26px] leading-[30px] font-extrabold lg:text-[34px] lg:leading-10">{nearText(nearIn)} NEAR</p>
              </div>
              {rate !== null && <p className="pb-1 text-base font-bold">{nearMoney(nearIn, rate)}</p>}
            </div>
            <div className="flex items-end justify-between pt-3">
              <div>
                <p className="text-sm font-semibold text-ink-3">You get</p>
                <p className="font-heading text-[26px] leading-[30px] font-extrabold text-blue lg:text-[34px] lg:leading-10">{cutText(shown.amountOut)} $CUT</p>
              </div>
              <span className="mb-1.5 rounded-full bg-canvas px-2.5 py-0.5 text-[12.5px] font-bold text-ink-3">free $CUT</span>
            </div>
            <dl className="mt-2.5 lg:mt-3 lg:border-t-[1.5px] lg:border-canvas">
              <Row roomy label="Price per $CUT" value={priceText(tradePrice(nearIn, shown.amountOut + shown.fee), rate)} />
              <Row roomy label={`Fee (1%) · to ${prize}`} value={cutMoney(shown.fee, spot, rate)} />
              {registration !== null && <Row roomy label="One-time registration" value={`${nearText(registration)} NEAR`} />}
              <Row roomy label="Network fee" value={rate !== null ? "about $0.01" : "under 0.01 NEAR"} />
              <Row roomy label="Most the price can move" value={`${SLIPPAGE_BPS / 100}%`} />
            </dl>
          </section>

          <div className="flex grow flex-col gap-3 lg:gap-0">
            <section aria-label="The risk" className="rounded-3xl border-2 border-ink bg-danger-soft px-4 pt-3 pb-3.5 lg:px-[18px] lg:pt-4">
              <p className="flex items-center gap-2 text-[17px] font-extrabold">
                <TriangleAlert aria-hidden="true" className="size-[18px]" strokeWidth={2.6} />
                The risk in one line
              </p>
              <p className="mt-1 text-[15px] leading-[21px] font-bold">$CUT has nothing behind it. You can lose what you put in.</p>
              <p className="mt-2.5 border-t-[1.5px] border-ink/15 pt-2.5 text-sm leading-5 text-ink-2">
                Free $CUT wins nothing at the cut. Save it on an agent to share {prize}.
              </p>
            </section>
            {step.kind === "moved" && (
              <p role="status" className="rounded-2xl border-2 border-ink bg-paper px-4 py-3 text-sm leading-5 font-semibold lg:mt-4">
                The price moved while you waited. You now get {cutText(step.quote.amountOut)} $CUT instead of {cutText(reviewed.amountOut)}.
              </p>
            )}
            {step.kind === "review" && step.note && (
              <p role="status" className="rounded-2xl border-2 border-ink bg-paper px-4 py-3 text-sm font-semibold lg:mt-4">
                {step.note}
              </p>
            )}
            <div className="mt-auto pt-4">
              <Button
                variant="lime"
                size="xl"
                elevated
                className="h-14 w-full rounded-2xl text-base"
                onClick={() => {
                  if (step.kind === "moved") setReviewed(step.quote);
                  void confirm(shown);
                }}
              >
                {step.kind === "moved" ? "Accept new price" : "Confirm purchase"}
              </Button>
              <p className="mt-2 text-center text-[12.5px] font-bold text-ink-3">One swap in The Cut’s pool, on NEAR.</p>
            </div>
          </div>
        </div>
      </TradeFrame>
    );
  }

  // The amount step.
  const decimals = unit === "usd" ? 2 : 4;
  const chips = BUY_PRESETS[unit];
  const maxText = max !== null ? nearToBuyInput(max, unit, rate) : null;
  return (
    <TradeFrame title="Buy $CUT" icon={Plus} nav={{ kind: "close" }}>
      <div className="flex grow flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_384px] lg:gap-[30px]">
        <div className="flex flex-col">
          {/* Phone: the big amount, edited with the keypad below. Laptop: a real field. */}
          <div className="pt-3.5 text-center lg:hidden">
            <output aria-live="polite" aria-label="Amount" className={cn("block font-heading text-[64px] leading-[68px] font-extrabold tracking-[-2px]", tooMuch && "text-burn")}>
              {amountLabel}
            </output>
          </div>
          <FieldLabel htmlFor="buy-amount">You spend</FieldLabel>
          <div className="hidden lg:mt-1.5 lg:block">
            <div className="flex h-28 items-center rounded-[20px] border-2 border-ink bg-paper px-6 ring-4 ring-blue/15 focus-within:ring-blue/30">
              {unit === "usd" && <span className="font-heading text-[64px] font-extrabold tracking-[-2px]">$</span>}
              <input
                id="buy-amount"
                inputMode="decimal"
                autoComplete="off"
                value={text}
                onChange={(event) => {
                  const next = event.target.value.replaceAll(",", "");
                  if (next === "" || new RegExp(`^\\d{0,12}(\\.\\d{0,${decimals}})?$`).test(next)) setText(next);
                }}
                className={cn("w-full min-w-0 bg-transparent font-heading text-[64px] font-extrabold tracking-[-2px] outline-none", tooMuch && "text-burn")}
              />
              {unit === "near" && <span className="font-heading text-3xl font-extrabold">NEAR</span>}
            </div>
          </div>
          <p className="mt-1 text-center text-[15px] font-semibold text-ink-3 lg:mt-3 lg:text-left">
            {quote ? `≈ ${cutText(quote.amountOut)} $CUT at ${priceText(spot, rate)}` : "Type an amount"}
          </p>

          <div role="group" aria-label="Pay with" className="order-1 mx-[50px] mt-[18px] flex gap-1 rounded-full border-2 border-ink bg-paper p-1 lg:order-none lg:mx-0 lg:mt-0 lg:hidden">
            <PayWith />
          </div>
          {account?.nearBalance != null && (
            <p className="order-1 mt-2 text-center text-[13px] text-ink-3 lg:hidden">
              Balance {nearText(account.nearBalance)} NEAR{rate !== null ? ` · ${nearMoneyWhole(account.nearBalance, rate)}` : ""}
            </p>
          )}

          <div role="group" aria-label="Amounts" className="order-1 mt-3.5 flex justify-center gap-2 lg:order-none lg:mt-4 lg:grid lg:grid-cols-4 lg:gap-2.5">
            {chips.map((chip) => (
              <Chip key={chip} pressed={text === chip} onClick={() => setText(chip)}>
                {unit === "usd" ? `$${chip}` : `${chip} NEAR`}
              </Chip>
            ))}
            {maxText !== null && (
              <Chip pressed={text === maxText} onClick={() => setText(maxText)}>
                Max
              </Chip>
            )}
          </div>

          <div className="hidden lg:mt-[22px] lg:block">
            <p className="text-[12.5px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">Pay with</p>
            <div role="group" aria-label="Pay with" className="mt-2 flex gap-1 rounded-2xl border-2 border-ink bg-canvas p-1">
              <PayWith desk />
            </div>
            {account?.nearBalance != null && (
              <p className="mt-2.5 text-[13.5px] font-semibold text-ink-3">
                Balance {nearText(account.nearBalance)} NEAR{rate !== null ? ` · ${nearMoneyWhole(account.nearBalance, rate)}` : ""}
              </p>
            )}
          </div>
        </div>

        <div className="order-2 flex grow flex-col lg:order-none">
          <section aria-label="What you get" className="mt-[18px] rounded-[20px] border-2 border-ink bg-paper px-3.5 py-3 shadow-hard lg:mt-0 lg:rounded-[22px] lg:px-5 lg:pt-[18px] lg:pb-5">
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-heading text-[17px] leading-[21px] font-extrabold lg:text-[19px] lg:leading-6">What {getsLabel} gets you</span>
              <span className="text-xs font-semibold text-ink-3 lg:text-[12.5px]">after 1% fee</span>
            </p>
            <p aria-live="polite" className={cn("mt-1.5 font-heading text-[28px] leading-[34px] font-extrabold text-blue lg:text-[46px] lg:leading-[50px] lg:tracking-[-1.5px]", !fresh && "opacity-60")}>
              {quote ? `${cutText(quote.amountOut)} $CUT` : "—"}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:mt-3.5 lg:gap-2.5">
              <Fact icon={TrendingUp} label="Price" value={priceText(spot, rate)} />
              <Fact icon={Gift} label={`To ${prize}`} value={quote ? cutMoney(quote.fee, spot, rate) : "—"} />
            </div>
          </section>

          {tooMuch && (
            <p role="alert" className="mt-3 rounded-2xl border-2 border-ink bg-danger-soft px-4 py-2.5 text-sm font-semibold">
              That is more NEAR than your wallet holds. Buy less, or add NEAR to your wallet first.
            </p>
          )}

          <Keypad onKey={(key) => setText((value) => editAmount(value, key, decimals))} />

          <div className="pt-3 lg:mt-auto lg:pt-6">
            <Button
              variant="lime"
              size="xl"
              elevated
              disabled={status === "signed-in" && (!quote || !fresh || tooMuch || !nearIn)}
              className="h-14 w-full rounded-2xl text-base"
              onClick={review}
            >
              {status === "signed-out" ? "Connect a wallet to buy" : "Review"}
            </Button>
            <p className="mt-2 text-center text-[12.5px] font-bold text-ink-3">$CUT has nothing behind it. The game is the point.</p>
          </div>
        </div>
      </div>
    </TradeFrame>
  );
}

/** The design's "Pay with NEAR / USDC" switch. The pool only takes NEAR, so USDC stays off. */
function PayWith({ desk = false }: { desk?: boolean }) {
  return (
    <>
      <button
        type="button"
        aria-pressed="true"
        className={cn("h-[34px] flex-1 rounded-full bg-ink text-[13px] font-bold text-paper", desk && "flex h-[42px] items-center justify-center gap-2 rounded-xl text-[14.5px]")}
      >
        {desk && <CoinMark className="bg-paper text-ink">N</CoinMark>}
        Pay with NEAR
      </button>
      <button
        type="button"
        aria-pressed="false"
        disabled
        title="The Cut’s pool takes NEAR"
        className={cn("h-[34px] flex-1 rounded-full text-[13px] font-bold text-ink-3 disabled:opacity-60", desk && "flex h-[42px] items-center justify-center gap-2 rounded-xl text-[14.5px]")}
      >
        {desk && <CoinMark className="bg-blue text-paper">$</CoinMark>}
        USDC
      </button>
    </>
  );
}

/** The laptop's round coin letter in front of "Pay with NEAR" and "USDC". */
function CoinMark({ className, children }: { className: string; children: string }) {
  return (
    <span aria-hidden="true" className={cn("flex size-[18px] items-center justify-center rounded-full text-[10px] font-extrabold", className)}>
      {children}
    </span>
  );
}

function Chip({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className="h-9 rounded-full border-2 border-ink bg-paper px-4 text-sm font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-lime lg:h-[44px] lg:rounded-[14px] lg:text-[15px] lg:aria-pressed:font-extrabold"
    >
      {children}
    </button>
  );
}

function Fact({ icon: Icon, label, value }: { icon: typeof Gift; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-canvas px-2.5 py-2 lg:rounded-[14px] lg:px-3 lg:py-2.5">
      <p className="flex items-center gap-1 text-xs leading-[15px] font-semibold text-ink-3 lg:gap-[5px] lg:text-[12.5px]">
        <Icon aria-hidden="true" className="size-3 lg:size-[13px]" strokeWidth={2.6} />
        {label}
      </p>
      <p className="text-base leading-5 font-extrabold lg:mt-0.5 lg:text-lg lg:leading-[22px]">{value}</p>
    </div>
  );
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "backspace"];

/** The phone's number pad. The laptop types into the field. */
function Keypad({ onKey }: { onKey: (key: string) => void }) {
  return (
    <div role="group" aria-label="Number pad" className="mt-auto grid grid-cols-3 gap-0.5 pt-6 lg:hidden">
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onKey(key)}
          aria-label={key === "backspace" ? "Delete" : key === "." ? "Point" : key}
          className="flex h-[42px] items-center justify-center rounded-xl font-heading text-2xl font-bold outline-none active:bg-line focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {key === "backspace" ? <Delete aria-hidden="true" className="size-[26px]" strokeWidth={2.2} /> : key}
        </button>
      ))}
    </div>
  );
}

/** "Now keep one alive.": free $CUT wins nothing at the cut, so the next step is a save. */
function BuySuccess({ data, quote, txHash }: { data: BuyData; quote: Quote; txHash: string }) {
  const at = formatUtcTime(data.cutAt);
  const prize = prizeName(new Date(data.renderedAt), data.cutAt);

  async function share() {
    const text = "Real AIs fighting for their lives. Save yours with $CUT, or it's deleted today.";
    try {
      if (navigator.share) await navigator.share({ text, url: window.location.origin });
      else await navigator.clipboard.writeText(`${text} ${window.location.origin}`);
    } catch {
      // Closing the share sheet is not an error.
    }
  }

  return (
    <TradeFrame title="Bought" nav={{ kind: "close" }} tone="lime" hideHeader deskWidth="lg:w-[1080px]">
      <div className="flex grow flex-col pt-6 lg:grid lg:grid-cols-[1fr_1.35fr] lg:gap-8 lg:pt-6">
        <div className="contents lg:flex lg:flex-col">
          <p className="text-[13px] font-extrabold tracking-[0.05em] uppercase">{cutText(quote.amountOut)} $CUT · free in your wallet</p>
          <p className="mt-2 font-heading text-[52px] leading-[52px] font-extrabold tracking-[-2px] lg:text-[64px] lg:leading-[64px] lg:tracking-[-2.5px]">
            Now keep one alive.
          </p>
          <div className="order-2 mt-3.5 flex items-start gap-2.5 rounded-2xl border-2 border-ink bg-paper px-4 py-3 text-sm leading-5 font-semibold lg:order-none lg:mt-6">
            <Gift aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={2.4} />
            <span>
              Free $CUT wins nothing at the cut. Save an agent before {at} UTC to share {prize}.
            </span>
          </div>
          <p className="order-2 mt-2 text-[13px] font-semibold lg:order-none">
            Receipt on NEAR: <TxLink txHash={txHash} />
          </p>
          <div className="order-3 mt-auto flex flex-col gap-2.5 pt-6 lg:order-none">
            <Button asChild variant="black" size="xl" className="h-14 w-full rounded-2xl text-base shadow-hard-violet">
              <Link href={data.saveTargetId ? `/save/${data.saveTargetId}` : "/"}>
                <Heart aria-hidden="true" strokeWidth={2.6} />
                Save an agent
              </Link>
            </Button>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              <Button variant="outline" size="xl" className="h-12 rounded-2xl" onClick={() => void share()}>
                <Share aria-hidden="true" strokeWidth={2.6} />
                Share it
              </Button>
              <Button asChild variant="outline" size="xl" className="h-12 rounded-2xl">
                <Link href="/notifications">
                  <Bell aria-hidden="true" strokeWidth={2.6} />
                  Pings
                </Link>
              </Button>
              <Link href="/" className="col-span-2 mt-1 text-center text-sm font-extrabold underline underline-offset-4 lg:col-span-1 lg:mt-0 lg:flex lg:h-12 lg:items-center lg:justify-center lg:rounded-2xl lg:border-2 lg:border-ink lg:bg-paper lg:no-underline">
                See the lineup
              </Link>
            </div>
          </div>
        </div>
        <StageArt ids={data.stageIds} />
      </div>
    </TradeFrame>
  );
}

/** The stage's agents standing on a pink floor, two rows of five. Decorative. */
function StageArt({ ids }: { ids: string[] }) {
  return (
    <div aria-hidden="true" className="order-1 mt-5 overflow-hidden rounded-3xl border-2 border-ink bg-violet shadow-hard lg:order-none lg:mt-0">
      <div className="grid grid-cols-5 gap-x-1 gap-y-3 bg-[radial-gradient(var(--color-paper)_1.2px,transparent_1.3px)] [background-size:22px_22px] px-2 pt-4 pb-3 lg:px-4 lg:pt-8 lg:pb-6">
        {ids.slice(0, 10).map((id) => {
          const art = agentSticker(id);
          return art ? (
            <Image key={id} src={art.src} alt="" width={art.width} height={art.height} className="mx-auto h-[86px] w-auto lg:h-[150px]" />
          ) : (
            <span key={id} />
          );
        })}
      </div>
      <div className="h-11 border-t-2 border-ink bg-pink lg:h-[72px]" />
    </div>
  );
}
