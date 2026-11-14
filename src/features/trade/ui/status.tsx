"use client";

import { cn } from "cn";
import { ArrowRight, ArrowUpRight, Gift } from "lucide-react";
import type { ReactNode } from "react";

import { explorerTxUrl } from "@/shared/near";
import { useWallet } from "@/shared/wallet";

/** "8Bq2…3aR6", linking to the transaction on the explorer of the wallet's network. */
export function TxLink({ txHash, className }: { txHash: string; className?: string }) {
  const { network } = useWallet();
  const short = txHash.length > 12 ? `${txHash.slice(0, 4)}…${txHash.slice(-4)}` : txHash;
  return (
    <a
      href={explorerTxUrl(network, txHash)}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex items-center gap-1 font-bold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50", className)}
    >
      {short}
      <span className="sr-only"> (opens the transaction on NearBlocks)</span>
      <ArrowUpRight aria-hidden="true" className="size-3.5" strokeWidth={2.6} />
    </a>
  );
}

/** "Confirming on NEAR": what goes in, what comes out, and where the fee goes. */
export function PendingStep({
  title,
  from,
  to,
  note,
  caption = "One swap in The Cut’s pool",
}: {
  title: string;
  from: { label: string; sub: string };
  to: { label: string; sub: string };
  note: ReactNode;
  caption?: string;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center pt-[52px] text-center lg:pt-6 lg:pb-4">
      <p className="text-[13px] font-extrabold tracking-[0.05em] text-ink-3 uppercase">Confirming on NEAR</p>
      <p className="mt-2 max-w-[320px] font-heading text-[34px] leading-[38px] font-extrabold tracking-[-1px] text-balance lg:max-w-none">{title}</p>
      <div className="mt-9 flex items-center gap-5">
        <Coin {...from} className="bg-paper" />
        <ArrowRight aria-hidden="true" className="size-7" strokeWidth={2.6} />
        <Coin {...to} className="bg-lime" />
      </div>
      <div className="mt-8 w-full max-w-[420px]">
        <div aria-hidden="true" className="h-4 overflow-hidden rounded-full border-2 border-ink bg-paper">
          <div className="h-full w-3/5 animate-pulse bg-blue" />
        </div>
        <p className="mt-2 flex justify-between text-[13px] font-semibold text-ink-3">
          <span>{caption}</span>
          <span>about 1 second</span>
        </p>
      </div>
      <p className="mt-5 inline-flex items-center gap-2 rounded-full border-2 border-ink bg-lime-soft px-3.5 py-1.5 text-[13px] font-bold">
        <Gift aria-hidden="true" className="size-4" strokeWidth={2.4} />
        {note}
      </p>
    </div>
  );
}

function Coin({ label, sub, className }: { label: string; sub: string; className?: string }) {
  return (
    <span className={cn("flex size-24 flex-col items-center justify-center rounded-full border-2 border-ink shadow-hard", className)}>
      <span className="font-heading text-xl leading-6 font-extrabold">{label}</span>
      <span className="text-[13px] font-bold text-ink-3">{sub}</span>
    </span>
  );
}

/** The transaction did not go through: what happened, what it cost, and the way back. */
export function FailedStep({
  title,
  body,
  rows,
  actions,
  txHash = null,
}: {
  title: string;
  body: string;
  rows: { label: string; value: ReactNode }[];
  actions: ReactNode;
  /** The refused transaction, when it reached the chain. */
  txHash?: string | null;
}) {
  if (txHash) rows = [...rows, { label: "Transaction", value: <TxLink txHash={txHash} /> }];
  return (
    <div role="alert" className="flex grow flex-col pt-[72px] lg:pt-2">
      <span aria-hidden="true" className="flex size-[72px] items-center justify-center rounded-2xl border-2 border-ink bg-orange font-heading text-3xl font-extrabold shadow-hard">
        !
      </span>
      <p className="mt-6 font-heading text-[34px] leading-[38px] font-extrabold tracking-[-1px]">{title}</p>
      <p className="mt-3 text-[15px] leading-[22px] text-ink-2">{body}</p>
      <dl className="mt-4 rounded-2xl border-2 border-ink bg-paper px-4 py-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 py-0.5 text-sm">
            <dt className="text-ink-3">{row.label}</dt>
            <dd className="text-right font-bold">{row.value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-auto flex gap-2.5 pt-8 lg:mt-6 lg:pt-0">{actions}</div>
    </div>
  );
}
