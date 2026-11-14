import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import type { JournalEntry } from "@/entities/journal";
import { getJournal, getJournalStats, SAMPLE_CONTRACT_ID } from "@/entities/journal/server";
import { getParams, getPool, getTotalSupply, getUsdCentsPerNear } from "@/entities/market/server";
import { rankByPile, type Robot } from "@/entities/robot";
import { getBench, getStage } from "@/entities/robot/server";
import { isLive } from "@/shared/config/data-source";
import { publicEnv } from "@/shared/config/public";
import { explorerTxUrl } from "@/shared/near/network";
import { getRpc } from "@/shared/near/server";

import { runAudit, type AuditCheck } from "../model/audit";
import { describeGroup, groupEntries, type ReceiptLine } from "../model/describe";
import { filterEvents, type Cursor, type ReceiptFilter } from "../model/filters";
import { supplyOf, type Supply } from "../model/supply";

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;
const TEST_CUT_INTERVAL_MS = 120_000;

export type ReceiptRow = ReceiptLine & { href: string };

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
    buyers: number;
    feesSoFar: bigint;
    lowest: Robot | null;
    gap: bigint;
    cutAt: Date;
    cuts: number;
    lastCut: ReceiptLine["cut"];
  };
  supply: Supply;
  filter: ReceiptFilter;
  /** True for "Mine" without a connected wallet: the list asks to connect instead. */
  needsViewer: boolean;
  /** The next cut, shown on top of the first page until its receipt is in the journal. */
  pending: { index: number; at: Date; lowest: Robot | null } | null;
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

  const [nextCut, params, pool, stage, bench, stats, totalSupply, usdCentsPerNear, registers, page, lastCuts, fullAccessKeys] = await Promise.all([
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
    getJournal({ events: ["cut"], limit: 1 }),
    isLive() ? getRpc().fullAccessKeyCount(contractId) : Promise.resolve(0),
  ]);
  const now = new Date();

  // Names of every robot, including deleted ones, which are no longer on the stage or bench.
  const names = new Map<string, string>();
  for (const entry of registers.entries) {
    const name = entry.data.name;
    if (entry.robotId && typeof name === "string" && name) names.set(entry.robotId, name);
  }
  for (const robot of [...stage, ...bench]) names.set(robot.id, robot.name);

  const cutAt = (index: number) => (index >= 1 ? new Date(params.firstCutAt.getTime() + (index - 1) * params.cutIntervalMs) : null);
  const byTx = new Map<string, JournalEntry[]>();
  for (const entry of page.entries) byTx.set(entry.txHash, [...(byTx.get(entry.txHash) ?? []), entry]);
  const ctx = { names, now, cutAt, siblings: (txHash: string) => byTx.get(txHash) ?? [] };

  const rows = groupEntries(page.entries).map((group) => {
    const line = describeGroup(group, ctx);
    return { ...line, href: explorerTxUrl(publicEnv.network, line.txHash) };
  });

  // The robot of the latest cut is gone, even if the stage read lags behind the journal.
  const gone = lastCuts.entries[0]?.robotId ?? null;
  const ranked = rankByPile(stage.filter((robot) => robot.id !== gone));
  const lowest = ranked.at(-1) ?? null;
  const above = ranked.at(-2) ?? null;
  const robots = [...stage, ...bench];
  const piles = robots.reduce((sum, robot) => sum + robot.pile, 0n);
  const isFirstPage = !before;
  const cutDone = (index: number) => lastCuts.entries.some((entry) => entry.cutIndex !== null && entry.cutIndex >= index);
  const lastCutEntry = lastCuts.entries[0];

  const checks = runAudit({
    contractId,
    fullAccessKeys,
    stats,
    totalSupply,
    robots,
    params,
    // The sample day is mainnet-shaped: a cut every day.
    launchIntervalMs: !isLive() || publicEnv.network === "mainnet" ? DAY_MS : TEST_CUT_INTERVAL_MS,
  });

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
      buyers: stats.buyers,
      feesSoFar: nextCut.prizeSoFar,
      lowest,
      gap: lowest && above ? above.pile - lowest.pile + ONE_CUT : 0n,
      cutAt: nextCut.at,
      cuts: stats.cuts,
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
  const daily = params.cutIntervalMs === DAY_MS;
  const at = params.firstCutAt.toISOString().slice(11, 19);
  return [
    { label: "Supply, minted once", value: `${(params.totalSupply / ONE_CUT).toLocaleString("en-US")} $CUT` },
    { label: "The cut", value: daily ? `Every day, ${at} UTC` : `Every ${Math.round(params.cutIntervalMs / 1000)} s` },
    { label: "Who is cut", value: "Lowest pile · tie: newer robot" },
    { label: "Burn", value: `${params.burnBps / 100}% of the cut pile` },
    { label: "Fee on every buy and sell", value: `${params.feeBps / 100}% · to the prize` },
    { label: "Prize split", value: `${params.saversBps / 100}% savers · ${(10_000 - params.saversBps) / 100}% creators` },
    { label: `Savers’ ${params.saversBps / 100}%`, value: `${params.stageSize - 1} equal slices, one per survivor` },
    { label: "Run the cut", value: `Anyone · keeps ${near(params.robotFunding)} NEAR` },
    { label: "Robot deposit", value: `${near(params.registerDeposit)} NEAR · ${near(params.registerDeposit - params.robotFunding)} back` },
    { label: "Seats on the stage", value: params.stageSize.toString() },
  ];
}
