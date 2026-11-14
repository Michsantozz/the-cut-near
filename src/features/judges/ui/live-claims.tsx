"use client";

import {
  Bot,
  CalendarClock,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  FileCode,
  Fingerprint,
  KeyRound,
  LoaderCircle,
  RotateCw,
  Scale,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { useCallback, useEffect, useRef, useState } from "react";

import type { NearNetwork } from "@/shared/config/public";
import { explorerAccountUrl, explorerTxUrl } from "@/shared/near/network";
import { browserRpc, recentCalls } from "@/shared/near/browser-rpc";
import { Button } from "@/shared/ui/button";

import { CLAIMS, type ClaimMeta } from "../model/desk";
import { CLAIM_IDS, runLiveChecks, type ClaimId, type ClaimResult, type PublishedBuild } from "../model/live-checks";

import { LinkChip, SourceChip } from "./source-link";

export type LiveClaimsProps = {
  live: boolean;
  network: NearNetwork;
  contractId: string;
  rpcUrls: readonly string[];
  txApiUrl: string;
  build: PublishedBuild | null;
  repoUrl: string | null;
};

type RowState = { status: "checking" } | { status: "done"; result: ClaimResult } | { status: "sample" };

const initial = (live: boolean): Record<ClaimId, RowState> =>
  Object.fromEntries(CLAIM_IDS.map((id) => [id, live ? { status: "checking" } : { status: "sample" }])) as Record<ClaimId, RowState>;

const clock = (at: Date) => at.toISOString().slice(11, 19);

/** The live claims: each row is checked in the reader's browser against NEAR RPC, never on our server. */
export function LiveClaims(props: LiveClaimsProps) {
  const { live, network, contractId, rpcUrls, txApiUrl, build } = props;
  const [rows, setRows] = useState<Record<ClaimId, RowState>>(() => initial(live));
  const [run, setRun] = useState<{ at: Date; endpoint: string } | null>(null);
  const [running, setRunning] = useState(live);
  const generation = useRef(0);

  const execute = useCallback(async () => {
    const mine = ++generation.current;
    const rpc = browserRpc(rpcUrls);
    await runLiveChecks(
      {
        view: (method, args) => rpc.view(contractId, method, args),
        accessKeys: () => rpc.accessKeys(contractId),
        codeHash: async () => (await rpc.account(contractId)).codeHash,
        submitMoveCalls: () => recentCalls(txApiUrl, contractId, "submit_move"),
      },
      { contractId, build, now: () => new Date() },
      (id, result) => generation.current === mine && setRows((current) => ({ ...current, [id]: { status: "done", result } })),
    );
    if (generation.current !== mine) return;
    setRun({ at: new Date(), endpoint: new URL(rpc.lastUrl()).host });
    setRunning(false);
  }, [build, contractId, rpcUrls, txApiUrl]);

  // The checks start once the page is in the reader's browser; their results arrive one by one.
  useEffect(() => {
    if (live) void execute();
  }, [execute, live]);

  const again = () => {
    setRows(initial(true));
    setRunning(true);
    void execute();
  };

  const results = Object.values(rows).flatMap((row) => (row.status === "done" ? [row.result.tone] : []));
  const count = (tone: ClaimResult["tone"]) => results.filter((value) => value === tone).length;

  return (
    <section id="claims" aria-labelledby="claims-title" className="scroll-mt-4 rounded-3xl border-2 border-ink bg-paper shadow-hard lg:scroll-mt-24">
      <div className="flex flex-col gap-3 border-b-2 border-ink px-4 pt-3.5 pb-3 lg:flex-row lg:items-end lg:justify-between lg:px-6 lg:pt-5 lg:pb-4">
        <div className="min-w-0">
          <h2 id="claims-title" className="font-heading text-xl leading-[26px] font-extrabold tracking-[-0.4px] lg:text-[28px] lg:leading-8 lg:tracking-[-0.8px]">
            Live claims
          </h2>
          <p className="mt-1 text-[14px] leading-5 text-ink-3 lg:max-w-[760px] lg:text-[15px]">
            {live ? (
              <>
                Each row is read from NEAR {network} by your browser, now. Nothing here comes from our server.{" "}
                <span className="font-semibold text-ink-2">Contract {contractId}.</span>
              </>
            ) : (
              "Sample world: this app is running on made-up data, so nothing here is checked and nothing shows green. Open the live app to run every check against the contract."
            )}
          </p>
        </div>
        {live ? (
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
            <p className="text-[13px] font-bold text-ink-2 tabular-nums" aria-live="polite">
              {running ? "Checking…" : `${count("holds")} hold · ${count("amber")} amber · ${count("fails")} fail`}
              {run && !running && <span className="font-semibold text-ink-3"> · {run.endpoint} at {clock(run.at)} UTC</span>}
            </p>
            <Button variant="outline" size="sm" onClick={again} disabled={running}>
              <RotateCw aria-hidden="true" className={cn("size-3.5", running && "animate-spin")} strokeWidth={2.6} />
              Check again
            </Button>
          </div>
        ) : (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border-2 border-dashed border-ink-3 bg-canvas px-3 py-1 text-[13px] font-bold text-ink-2">
            <CircleDashed aria-hidden="true" className="size-4" strokeWidth={2.6} />
            Not checked in the sample world
          </span>
        )}
      </div>

      <div role="list" className="divide-y-2 divide-line">
        {CLAIMS.map((meta) => (
          <ClaimRow key={meta.id} meta={meta} state={rows[meta.id]} {...props} />
        ))}
      </div>
    </section>
  );
}

/** One icon per claim, next to its title. */
const CLAIM_ICON: Record<ClaimId, LucideIcon> = {
  keys: KeyRound,
  code: FileCode,
  books: Scale,
  moving: Bot,
  signatures: ShieldCheck,
  personalities: Fingerprint,
  season: CalendarClock,
};

function ClaimRow({ meta, state, network, contractId, build, repoUrl }: { meta: ClaimMeta; state: RowState } & LiveClaimsProps) {
  const ownBuild = build?.contract === contractId ? build : null;
  const chainTx = meta.chain === "deploy-tx" ? ownBuild?.deployTx : meta.chain === "delete-key-tx" ? ownBuild?.deleteKeyTx : null;
  const proofs = state.status === "done" ? (state.result.proofs ?? []) : [];

  return (
    <div role="listitem" id={`claim-${meta.id}`} className="scroll-mt-4 px-4 py-3.5 lg:grid lg:scroll-mt-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-6 lg:px-6 lg:py-4">
      <div className="min-w-0">
        <h3 className="flex items-start gap-2 text-[16px] leading-[21px] font-extrabold lg:text-[17px]">
          <ClaimIcon id={meta.id} />
          <span>{meta.claim}</span>
        </h3>
        <p className="mt-1 text-[13px] leading-[18px] text-ink-3">{meta.how}</p>
      </div>

      <div className="mt-2.5 min-w-0 lg:mt-0" aria-live="polite">
        <Verdict state={state} />
        {proofs.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1">
            {proofs.map((proof) => (
              <li key={`${proof.agentId}-${proof.cutIndex}`} className="flex items-start gap-1.5 text-[12.5px] leading-[17px]">
                {proof.ok ? (
                  <CircleCheck aria-label="verified" className="mt-px size-3.5 shrink-0 text-gain" strokeWidth={2.8} />
                ) : (
                  <CircleX aria-label="not verified" className="mt-px size-3.5 shrink-0 text-burn" strokeWidth={2.8} />
                )}
                <span className="min-w-0">
                  <b className="font-extrabold">{proof.agentId}</b> <span className="text-ink-3">{proof.note}</span>
                  {proof.txHash && (
                    <>
                      {" · "}
                      <a href={explorerTxUrl(network, proof.txHash)} target="_blank" rel="noreferrer" className="font-bold underline underline-offset-2 hover:text-ink-2">
                        tx {proof.txHash.slice(0, 6)}…
                      </a>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2.5 flex min-w-0 flex-wrap content-start gap-1.5 lg:mt-0">
        <SourceChip refTo={meta.code} repoUrl={repoUrl} kind="code" />
        <SourceChip refTo={meta.test} repoUrl={repoUrl} kind="test" />
        {chainTx ? (
          <LinkChip href={explorerTxUrl(network, chainTx)} external>
            {meta.chain === "deploy-tx" ? "Deploy transaction" : "Key-delete transaction"}
          </LinkChip>
        ) : (
          <LinkChip href={explorerAccountUrl(network, contractId)} external>
            {contractId} on the explorer
          </LinkChip>
        )}
      </div>
    </div>
  );
}

const TONE = {
  holds: { label: "Holds now", icon: CircleCheck, pill: "bg-lime text-ink" },
  amber: { label: "Can’t confirm now", icon: CircleAlert, pill: "bg-orange text-ink" },
  fails: { label: "Fails", icon: CircleX, pill: "bg-danger text-paper" },
} as const;

function ClaimIcon({ id }: { id: ClaimId }) {
  const Icon = CLAIM_ICON[id];
  return <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 lg:mt-[3px]" strokeWidth={2.6} />;
}

function Verdict({ state }: { state: RowState }) {
  if (state.status === "sample") {
    return (
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-dashed border-ink-3 bg-canvas px-2.5 py-0.5 text-[12.5px] font-extrabold text-ink-2">
          <CircleDashed aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
          Sample world
        </span>
        <p className="mt-1.5 text-[14px] leading-5 font-semibold text-ink-2">Open the live app to check.</p>
      </div>
    );
  }
  if (state.status === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-paper px-2.5 py-0.5 text-[12.5px] font-extrabold">
        <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" strokeWidth={2.8} />
        Checking…
      </span>
    );
  }
  const { tone, headline, facts } = state.result;
  const { label, icon: Icon, pill } = TONE[tone];
  return (
    <div>
      <span className={cn("inline-flex items-center gap-1.5 rounded-full border-2 border-ink px-2.5 py-0.5 text-[12.5px] font-extrabold", pill)}>
        <Icon aria-hidden="true" className="size-3.5" strokeWidth={2.8} />
        {label}
      </span>
      <p className="mt-1.5 text-[15px] leading-5 font-extrabold tabular-nums">{headline}</p>
      {facts.map((fact) => (
        <p key={fact} className="mt-1 text-[13px] leading-[18px] break-words text-ink-2 tabular-nums">
          {fact}
        </p>
      ))}
    </div>
  );
}
