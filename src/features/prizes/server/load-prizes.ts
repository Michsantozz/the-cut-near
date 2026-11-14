import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { getParams, getPool, getUsdCentsPerNear } from "@/entities/market/server";
import { getBench, getStage } from "@/entities/robot/server";
import { getClaimable, getSaves, isStorageRegistered } from "@/entities/save/server";
import { publicEnv } from "@/shared/config/public";
import { explorerTxUrl } from "@/shared/near/network";

import { latestBreakdown, type Breakdown } from "../model/breakdown";

const ONE_CUT = 10n ** 18n;
const ONE_NEAR = 10n ** 24n;

export type PastPrize = { key: string; at: Date; amount: bigint; href: string };

export type Prizes = {
  renderedAt: number;
  accountId: string;
  claimable: bigint;
  claimableUsdCents: bigint | null;
  /** Collected so far plus what is ready. */
  total: bigint;
  /** Cuts that paid this account something (collected claims count once each). */
  cutsPaid: number;
  breakdown: Breakdown | null;
  names: Record<string, string>;
  /** The save that keeps riding into the next cut unless the viewer takes it back with the collect. */
  keep: { robotId: string; robotName: string; amount: bigint } | null;
  /** Total saved now, and the robot with the biggest save, for the empty state. */
  saved: { total: bigint; robotName: string | null };
  registered: boolean;
  nextCut: { index: number; at: Date; lowestName: string | null };
  /** Claims already collected, newest first. */
  past: PastPrize[];
};

/** The viewer's prizes: ready to collect, how the last one was made, and past slices. Request-time only. */
export async function loadPrizes(accountId: string): Promise<Prizes> {
  await connection();
  // An after-cut screen: sample data shows it a minute after cut #1 ran.
  const [claimable, saves, registered, cuts, prizes, claims, nextCut, params, pool, usd, stage, bench, registers] = await Promise.all([
    getClaimable(accountId),
    getSaves(accountId),
    isStorageRegistered(accountId),
    getJournal({ events: ["cut"], limit: 10, sampleMoment: "after-cut" }),
    getJournal({ events: ["prize"], limit: 200, sampleMoment: "after-cut" }),
    getJournal({ accountId, events: ["claim"], limit: 20, sampleMoment: "after-cut" }),
    getNextCut(),
    getParams(),
    getPool(),
    getUsdCentsPerNear(),
    getStage(),
    getBench(),
    getJournal({ events: ["register"], limit: 200, sampleMoment: "after-cut" }),
  ]);
  const names: Record<string, string> = {};
  for (const entry of registers.entries) if (entry.robotId && typeof entry.data.name === "string") names[entry.robotId] = entry.data.name;
  for (const robot of [...stage, ...bench]) names[robot.id] = robot.name;

  const breakdown = latestBreakdown(cuts.entries, prizes.entries, saves, params.saversBps);
  const latestCut = cuts.entries.reduce((max, entry) => Math.max(max, entry.cutIndex ?? 0), 0);
  const alive = new Set([...stage, ...bench].map((robot) => robot.id));
  // A save can be taken back once the cut it was locked for has run, on a robot that is still there.
  const unlocked = saves.filter((save) => save.amount > 0n && save.lockedForCut <= latestCut && alive.has(save.robotId));
  const keepSave = breakdown ? unlocked.find((save) => save.robotId === breakdown.robotId) : unlocked[0];
  const biggest = [...saves].sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1))[0];
  const collected = claims.entries.reduce((sum, entry) => sum + (entry.amount ?? 0n), 0n);
  const priceYocto = pool.cutReserve > 0n ? (pool.nearReserve * ONE_CUT) / pool.cutReserve : 0n;
  const lowest = [...stage].sort((a, b) => (a.pile === b.pile ? 0 : a.pile < b.pile ? -1 : 1))[0];

  return {
    renderedAt: Date.now(),
    accountId,
    claimable,
    claimableUsdCents: usd === null ? null : ((claimable * priceYocto) / ONE_CUT * usd * 2n + ONE_NEAR) / (2n * ONE_NEAR),
    total: collected + claimable,
    cutsPaid: claims.entries.length + (claimable > 0n ? 1 : 0),
    breakdown,
    names,
    keep: keepSave ? { robotId: keepSave.robotId, robotName: names[keepSave.robotId] ?? keepSave.robotId, amount: keepSave.amount } : null,
    saved: { total: saves.reduce((sum, save) => sum + save.amount, 0n), robotName: biggest ? (names[biggest.robotId] ?? biggest.robotId) : null },
    registered,
    nextCut: { index: nextCut.index, at: nextCut.at, lowestName: lowest?.name ?? null },
    past: claims.entries.map((entry) => ({ key: entry.id, at: entry.at, amount: entry.amount ?? 0n, href: explorerTxUrl(publicEnv.network, entry.txHash) })),
  };
}
