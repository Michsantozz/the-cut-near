import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import type { JournalEntry } from "@/entities/journal";
import { getJournal, getJournalStats, SAMPLE_CONTRACT_ID } from "@/entities/journal/server";
import { getParams, getPool, getTotalSupply, getUsdCentsPerNear } from "@/entities/market/server";
import { gapToPass, rankByScore, type Agent } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";
import { getSeason } from "@/entities/season/server";
import { isLive } from "@/shared/config/data-source";
import { publicEnv } from "@/shared/config/public";
import { explorerTxUrl } from "@/shared/near/network";
import { getRpc } from "@/shared/near/server";

import { runAudit, type AuditCheck } from "../model/audit";
import { describeGroup, groupEntries, isFoldedBurn, type ReceiptLine } from "../model/describe";
import { filterEvents, type Cursor, type ReceiptFilter } from "../model/filters";
import { supplyOf, type Supply } from "../model/supply";

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

/** A journal line and its transaction on the explorer; null in sample mode, where no transaction exists. */
export type ReceiptRow = ReceiptLine & { href: string | null };

export type Receipts = {
  renderedAt: number;
  live: boolean;
  contractId: string;
  latestBlock: number | null;
  entries: number;
  launchedAt: Date | null;
  stats: {
    priceYoctoNear: bigint;
    usdCentsPerNear: bigint | null;
    season: { index: number; day: number; active: boolean; pot: bigint };
    feesSoFar: bigint;
    /** Lowest score on the stage: the agent the cut takes if nothing moves. */
    lowest: Agent | null;
    /** Score it needs to pass the agent above it. */
    gap: bigint;
    cutAt: Date;
    /** Cuts that deleted an agent (a season start cuts nobody). */
    cuts: number;
    lastCut: ReceiptLine["cut"];
  };
  supply: Supply;
  filter: ReceiptFilter;
  /** True for "Mine" without a connected wallet: the list asks to connect instead. */
  needsViewer: boolean;
  /** The next cut, shown on top of the first page until its receipt is in the journal. */
  pending: { index: number; at: Date; lowest: Agent | null } | null;
  rows: ReceiptRow[];
  next: Cursor | null;
  isFirstPage: boolean;
  audit: { checks: AuditCheck[]; ms: number };
  params: { label: string; value: string }[];
  fullAccessKeys: number | null;
};

const ONE_CUT = 10n ** 18n;

/** Everything the Receipts page shows. Request-time only (reads the clock and the chain). */
export async function loadReceipts({ filter, before, viewer }: { filter: ReceiptFilter; before?: Cursor; viewer: string | null }): Promise<Receipts> {
  await connection();
  const started = performance.now();
  const contractId = isLive() ? publicEnv.contractId : SAMPLE_CONTRACT_ID;
  const needsViewer = filter === "mine" && !viewer;

  const [nextCut, params, pool, stage, bench, stats, totalSupply, usdCentsPerNear, registers, page, lastCuts, fullAccessKeys, season] = await Promise.all([
    getNextCut(),
    getParams(),
    getPool(),
    getStage(),
    getBench(),
    getJournalStats(),
    getTotalSupply(),
    getUsdCentsPerNear(),
    getJournal({ events: ["register"], limit: 200 }),
    needsViewer
      ? Promise.resolve({ entries: [] as JournalEntry[], next: null })
      : getJournal({ events: filterEvents(filter), accountId: filter === "mine" ? (viewer ?? undefined) : undefined, before, limit: PAGE_SIZE }),
    getJournal({ events: ["cut"], limit: 200 }),
    isLive() ? getRpc().fullAccessKeyCount(contractId) : Promise.resolve(null),
    getSeason(),
  ]);
  const now = new Date();

  // Names of every agent, including deleted ones, which are no longer on the stage or bench.
  const names = new Map<string, string>();
  for (const entry of registers.entries) {
    const name = entry.data.name;
    if (entry.agentId && typeof name === "string" && name) names.set(entry.agentId, name);
  }
  for (const agent of [...stage, ...bench]) names.set(agent.id, agent.name);

  const cutAt = (index: number) => (index >= 1 ? new Date(params.firstCutAt.getTime() + (index - 1) * params.cutIntervalMs) : null);
  const byTx = new Map<string, JournalEntry[]>();
  for (const entry of page.entries) byTx.set(entry.txHash, [...(byTx.get(entry.txHash) ?? []), entry]);
  const ctx = { names, now, cutAt, siblings: (txHash: string) => byTx.get(txHash) ?? [] };

  const groups = groupEntries(page.entries).filter((group) => filter === "burns" || !isFoldedBurn(group, ctx));
  const rows = groups.map((group) => {
    const line = describeGroup(group, ctx);
    return { ...line, href: isLive() ? explorerTxUrl(publicEnv.network, line.txHash) : null };
  });

  // The agent of the latest cut is gone, even if the stage read lags behind the journal.
  const gone = lastCuts.entries[0]?.agentId ?? null;
  const ranked = rankByScore(stage.filter((agent) => agent.id !== gone));
  const lowest = ranked.at(-1) ?? null;
  const above = ranked.at(-2) ?? null;
  const deletingCuts = lastCuts.entries.filter((entry) => entry.agentId !== null);
  const agents = [...stage, ...bench];
  const piles = agents.reduce((sum, agent) => sum + agent.pile, 0n);
  const isFirstPage = !before;
  const cutDone = (index: number) => lastCuts.entries.some((entry) => entry.cutIndex !== null && entry.cutIndex >= index);
  const lastCutEntry = deletingCuts[0];

  const checks = runAudit({ contractId, sample: !isLive(), fullAccessKeys, stats, totalSupply, agents, params });

  return {
    renderedAt: now.getTime(),
    live: isLive(),
    contractId,
    latestBlock: stats.latestBlock,
    entries: stats.entries,
    launchedAt: stats.firstAt,
    stats: {
      priceYoctoNear: pool.cutReserve > 0n ? (pool.nearReserve * ONE_CUT) / pool.cutReserve : 0n,
      usdCentsPerNear,
      season: { index: season.index, day: season.day, active: season.active, pot: season.pot },
      feesSoFar: nextCut.prizeSoFar,
      lowest,
      gap: lowest && above ? gapToPass(lowest, above) : 0n,
      cutAt: nextCut.at,
      cuts: deletingCuts.length,
      lastCut: lastCutEntry ? describeGroup({ key: lastCutEntry.id, event: "cut", txHash: lastCutEntry.txHash, at: lastCutEntry.at, entries: [lastCutEntry] }, ctx).cut : null,
    },
    supply: supplyOf(stats.minted || params.totalSupply, stats.burned, piles),
    filter,
    needsViewer,
    pending: isFirstPage && (filter === "all" || filter === "cuts") && !cutDone(nextCut.index) ? { index: nextCut.index, at: nextCut.at, lowest } : null,
    rows,
    next: page.next,
    isFirstPage,
    audit: { checks, ms: Math.round(performance.now() - started) },
    params: paramRows(params),
    fullAccessKeys,
  };
}

function paramRows(params: Awaited<ReturnType<typeof getParams>>): { label: string; value: string }[] {
  const near = (yocto: bigint) => (Number(yocto / 10n ** 21n) / 1000).toString();
  const whole = (value: bigint) => (value / ONE_CUT).toLocaleString("en-US");
  const daily = params.cutIntervalMs === DAY_MS;
  const at = params.firstCutAt.toISOString().slice(11, 16);
  const lead = params.moveLeadMs >= 3_600_000 ? `${params.moveLeadMs / 3_600_000} h` : `${Math.round(params.moveLeadMs / 1000)} s`;
  const creatorsBps = 10_000 - params.saversBps - params.agentsBps;
  return [
    { label: "Supply, minted once", value: `${whole(params.totalSupply)} $CUT` },
    { label: "The cut", value: daily ? `Every day, ${at} UTC` : `Every ${Math.round(params.cutIntervalMs / 1000)} s` },
    { label: "Moves close", value: `${lead} before each cut` },
    { label: "Who is cut", value: "Lowest score: pile − boos − damage · tie: newer agent" },
    { label: "Think fee", value: `${whole(params.thinkFee)} $CUT burned per move` },
    { label: "Fee on every buy and sell", value: `${params.feeBps / 100}% · ${params.potBps / 100}% of it to the season pot` },
    { label: "Cut pile", value: `${params.burnBps / 100}% burns · the rest joins the day prize` },
    { label: "Day prize", value: `${params.saversBps / 100}% savers · ${params.agentsBps / 100}% agents · ${creatorsBps / 100}% creators` },
    { label: "Savers’ share", value: "One equal slice per survivor, at most 1 per $CUT saved" },
    { label: "New agent", value: `${near(params.registerDeposit)} NEAR deposit · ${near(params.registerDeposit - params.agentFunding)} back · ${whole(params.minSeed)}+ $CUT seed` },
    { label: "Seats", value: `${params.stageSize} · a season starts with ${params.minSeason} on the bench` },
    { label: "Model", value: params.modelId },
  ];
}
