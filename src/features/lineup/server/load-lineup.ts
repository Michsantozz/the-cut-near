import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import { getBalance, getParams, getPool, getUsdCentsPerNear } from "@/entities/market/server";
import type { Robot } from "@/entities/robot";
import { getBench, getStage } from "@/entities/robot/server";
import type { Save } from "@/entities/save";
import { getSaves } from "@/entities/save/server";

import { boardOrders, buildBoard, dayOfCut, rankBench, type Board, type SortKey } from "../model/board";
import { summarizeSaves, valueInUsdCents, type SavedOn } from "../model/holdings";

export type LineupMember = {
  accountId: string;
  /** Null when the balance is not known yet; the card then shows only the saves. */
  balance: bigint | null;
  valueUsdCents: bigint | null;
  saves: SavedOn[];
  savedTotal: bigint;
};

export type Lineup = {
  /** Request time in ms: the first frame of every live countdown. */
  renderedAt: number;
  cutAt: Date;
  day: number;
  board: Board;
  orders: Record<SortKey, string[]>;
  bench: Robot[];
  /** Null for a visitor. */
  member: LineupMember | null;
};

/** Everything the "today's cut" screen shows, for a visitor (null) or a member account. Request-time only. */
export async function loadLineup(accountId: string | null): Promise<Lineup> {
  // The countdowns start from the request time, never from a prerendered one.
  await connection();
  const [stage, bench, nextCut, params, pool, member] = await Promise.all([
    getStage(),
    getBench(),
    getNextCut(),
    getParams(),
    getPool(),
    accountId ? loadMember(accountId) : null,
  ]);
  const board = buildBoard(stage, nextCut.prizeSoFar, params);

  return {
    renderedAt: Date.now(),
    cutAt: nextCut.at,
    day: dayOfCut(nextCut.index),
    board,
    orders: boardOrders(board.entries),
    bench: rankBench(bench),
    member: member && {
      accountId: member.accountId,
      balance: member.balance,
      valueUsdCents:
        member.balance !== null && member.usdCentsPerNear !== null ? valueInUsdCents(member.balance, pool, member.usdCentsPerNear) : null,
      ...summarizeMemberSaves(member.saves, [...stage, ...bench]),
    },
  };
}

export type MemberCardData = Pick<LineupMember, "accountId" | "balance" | "valueUsdCents" | "savedTotal">;

/** The account card in the app shell: value, balance and how much is saved. */
export async function loadMemberCard(accountId: string): Promise<MemberCardData> {
  const [member, pool] = await Promise.all([loadMember(accountId), getPool()]);
  return {
    accountId,
    balance: member.balance,
    valueUsdCents: member.balance !== null && member.usdCentsPerNear !== null ? valueInUsdCents(member.balance, pool, member.usdCentsPerNear) : null,
    savedTotal: member.saves.reduce((sum, save) => sum + save.amount, 0n),
  };
}

/** Balance is everything the account holds: free $CUT (`ft_balance_of`) plus its saves, which sit in the contract. */
async function loadMember(accountId: string) {
  const [saves, free, usdCentsPerNear] = await Promise.all([getSaves(accountId), getBalance(accountId), getUsdCentsPerNear()]);
  const balance = free + saves.reduce((sum, save) => sum + save.amount, 0n);
  return { accountId, saves, balance, usdCentsPerNear };
}

function summarizeMemberSaves(saves: Save[], robots: Robot[]) {
  const { items, total } = summarizeSaves(saves, robots);
  return { saves: items, savedTotal: total };
}
