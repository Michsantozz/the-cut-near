import "server-only";

import { connection } from "next/server";

import type { Agent } from "@/entities/agent";
import { getAgents, getBench, getStage } from "@/entities/agent/server";
import { getCuts, getNextCut } from "@/entities/cut/server";
import { getBalance, getPool, getUsdCentsPerNear } from "@/entities/market/server";
import { getMoves } from "@/entities/move/server";
import type { Save } from "@/entities/save";
import { getSaves } from "@/entities/save/server";
import type { Season } from "@/entities/season";
import { getSeason } from "@/entities/season/server";
import { isLive } from "@/shared/config/data-source";

import { buildBoard, rankBench, seasonStartCut, type Board } from "../model/board";
import { summarizeSaves, valueInUsdCents, type SavedOn } from "../model/holdings";

export type LineupMember = {
  accountId: string;
  /** Null when the balance is not known yet; the card then shows only the saves. */
  balance: bigint | null;
  valueUsdCents: bigint | null;
  saves: SavedOn[];
  savedTotal: bigint;
};

/** An agent cut this season, with what happened to its wallet. */
export type CutThisSeason = {
  agent: Agent;
  /** Day of the season it was cut on. */
  day: number;
  /** Its pile at the cut: half burned, half went to the day prize. */
  pile: bigint;
  /** Its wallet at the cut; null when the record does not say. */
  wallet: bigint | null;
  /** The heir that received the wallet; null: it burned. */
  heir: Agent | null;
};

export type Lineup = {
  /** Request time in ms: the first frame of every live countdown. */
  renderedAt: number;
  cutAt: Date;
  movesCloseAt: Date;
  cutIndex: number;
  season: Season;
  board: Board;
  /** Newest cut first. */
  cutThisSeason: CutThisSeason[];
  bench: Agent[];
  /** Every agent's name by id, for move targets, heirs and pacts. */
  names: Record<string, string>;
  /** True in sample mode: moves are not signed and nothing is read from NEAR. */
  sample: boolean;
  /** $CUT in the day prize so far. */
  prizeSoFar: bigint;
  /** Null for a visitor. */
  member: LineupMember | null;
};

/** Everything the "today's cut" screen shows, for a visitor (null) or a member account. Request-time only. */
export async function loadLineup(accountId: string | null): Promise<Lineup> {
  // The countdowns start from the request time, never from a prerendered one.
  await connection();
  const [stage, bench, nextCut, season, member] = await Promise.all([getStage(), getBench(), getNextCut(), getSeason(), accountId ? loadMember(accountId) : null]);
  const start = seasonStartCut(nextCut.index, season.day);
  const [moves, cuts] = await Promise.all([season.active ? getMoves(nextCut.index) : [], season.active ? getCuts(start + 1, nextCut.index - 1) : []]);
  const deleting = cuts.filter((cut) => cut.deletedId !== null);
  const gone = await getAgents([...new Set(deleting.flatMap((cut) => [cut.deletedId!, ...(cut.inheritedBy ? [cut.inheritedBy] : [])]))]);
  const everyone = new Map([...stage, ...bench, ...gone].map((agent) => [agent.id, agent]));

  return {
    renderedAt: Date.now(),
    cutAt: nextCut.at,
    movesCloseAt: nextCut.movesCloseAt,
    cutIndex: nextCut.index,
    season,
    board: buildBoard(stage, moves),
    cutThisSeason: deleting
      .map((cut) => ({
        agent: everyone.get(cut.deletedId!)!,
        day: cut.index - start,
        pile: cut.pile,
        wallet: cut.wallet,
        heir: cut.inheritedBy ? (everyone.get(cut.inheritedBy) ?? null) : null,
      }))
      .filter((entry) => entry.agent !== undefined)
      .reverse(),
    bench: rankBench(bench),
    names: Object.fromEntries([...everyone.values()].map((agent) => [agent.id, agent.name])),
    sample: !isLive(),
    prizeSoFar: nextCut.prizeSoFar,
    member: member && {
      accountId: member.accountId,
      balance: member.balance,
      valueUsdCents: member.balance !== null && member.usdCentsPerNear !== null ? valueInUsdCents(member.balance, member.pool, member.usdCentsPerNear) : null,
      ...summarizeMemberSaves(member.saves, [...stage, ...bench]),
    },
  };
}

export type MemberCardData = Pick<LineupMember, "accountId" | "balance" | "valueUsdCents" | "savedTotal">;

/** The account card in the app shell: value, balance and how much is saved. */
export async function loadMemberCard(accountId: string): Promise<MemberCardData> {
  const member = await loadMember(accountId);
  return {
    accountId,
    balance: member.balance,
    valueUsdCents: member.balance !== null && member.usdCentsPerNear !== null ? valueInUsdCents(member.balance, member.pool, member.usdCentsPerNear) : null,
    savedTotal: member.saves.reduce((sum, save) => sum + save.amount, 0n),
  };
}

/** Balance is everything the account holds: free $CUT (`ft_balance_of`) plus its saves, which sit in the contract. */
async function loadMember(accountId: string) {
  const [saves, free, usdCentsPerNear, pool] = await Promise.all([getSaves(accountId), getBalance(accountId), getUsdCentsPerNear(), getPool()]);
  const balance = free + saves.reduce((sum, save) => sum + save.amount, 0n);
  return { accountId, saves, balance, usdCentsPerNear, pool };
}

function summarizeMemberSaves(saves: Save[], agents: Agent[]) {
  const { items, total } = summarizeSaves(saves, agents);
  return { saves: items, savedTotal: total };
}
