import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import type { Pool, PricePoint, PriceRange, Quote } from "@/entities/market";
import {
  getBalance,
  getHolderCount,
  getNearBalance,
  getParams,
  getPool,
  getPriceHistory,
  getStorageBalance,
  getStorageMin,
  getTotalSupply,
  getUsdCentsPerNear,
  quoteBuy,
  quoteSell,
} from "@/entities/market/server";
import { rankByPile, rankByScore, type Agent } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";
import { getSaves } from "@/entities/save/server";
import { getSeason } from "@/entities/season/server";

import { DEFAULT_BUY, buyInputToNear, buyUnit } from "../model/buy";
import { buildPicker, type SavePicker } from "../model/save";
import { defaultSell } from "../model/sell";
import { splitSupply, type SupplySplit } from "../model/supply";

/** A save of the viewer, with its agent's name and whether the cut it was locked for has run. */
export type HeldSave = { agentId: string; agentName: string; amount: bigint; unlocked: boolean };

export type Market = {
  /** Request time in ms: the first frame of every live clock. */
  renderedAt: number;
  pool: Pool;
  usdCentsPerNear: bigint | null;
  cutAt: Date;
  cutIndex: number;
  feesSoFar: bigint;
  /** $CUT the lowest agent needs to pass the next one (`get_next_cut().gap_to_next`). */
  gapToNext: bigint;
  /** Share of every trade fee that goes to the season pot (`pot_bps`); the rest goes to the next day prize. */
  potBps: number;
};

async function loadMarket(): Promise<Market> {
  // Countdowns and "today" start from the request time, never from a prerendered one.
  await connection();
  const [pool, usdCentsPerNear, nextCut, params] = await Promise.all([getPool(), getUsdCentsPerNear(), getNextCut(), getParams()]);
  return {
    renderedAt: Date.now(),
    pool,
    usdCentsPerNear,
    cutAt: nextCut.at,
    cutIndex: nextCut.index,
    feesSoFar: nextCut.prizeSoFar,
    gapToNext: nextCut.gapToNext,
    potBps: params.potBps,
  };
}

function heldSaves(saves: Awaited<ReturnType<typeof getSaves>>, agents: readonly Agent[], cutIndex: number): HeldSave[] {
  const names = new Map(agents.map((agent) => [agent.id, agent.name]));
  return saves
    .filter((save) => save.amount > 0n)
    .map((save) => ({
      agentId: save.agentId,
      agentName: names.get(save.agentId) ?? save.agentId,
      amount: save.amount,
      unlocked: save.lockedForCut < cutIndex,
    }));
}

export type InitialQuote = { amount: bigint; quote: Quote } | null;

export type BuyData = Market & {
  /** NEP-145 minimum, attached once with the first buy of an unregistered account. */
  storageMin: bigint;
  /** The quote for the amount the screen opens with. */
  initial: InitialQuote;
  /** Stage agent ids by pile, for the "Now keep one alive" art. */
  stageIds: string[];
  /** Where "Save an agent" goes after a buy: the agent right above the cut line, the one that pays the most. */
  saveTargetId: string | null;
  /** Null for a visitor. */
  account: { accountId: string; nearBalance: bigint | null; registered: boolean } | null;
};

export async function loadBuy(accountId: string | null): Promise<BuyData> {
  // Live agents and prices read the clock: reach request time before any of them.
  await connection();
  const [market, storageMin, stage, account] = await Promise.all([
    loadMarket(),
    getStorageMin(),
    getStage(),
    accountId
      ? Promise.all([getNearBalance(accountId), getStorageBalance(accountId)]).then(([nearBalance, storage]) => ({
          accountId,
          nearBalance,
          registered: storage !== null,
        }))
      : null,
  ]);
  const nearIn = buyInputToNear(DEFAULT_BUY[buyUnit(market.usdCentsPerNear)], buyUnit(market.usdCentsPerNear), market.usdCentsPerNear);
  const initial = nearIn ? { amount: nearIn, quote: await quoteBuy(nearIn) } : null;
  const ranked = rankByPile(stage);
  return {
    ...market,
    storageMin,
    initial,
    stageIds: ranked.map((agent) => agent.id),
    saveTargetId: (ranked.at(-2) ?? ranked[0])?.id ?? null,
    account,
  };
}

export type SellData = Market & {
  initial: InitialQuote;
  account: { accountId: string; free: bigint; saves: HeldSave[] } | null;
};

export async function loadSell(accountId: string | null): Promise<SellData> {
  // Live agents and prices read the clock: reach request time before any of them.
  await connection();
  const market = await loadMarket();
  if (!accountId) return { ...market, initial: null, account: null };
  const [free, saves, stage, bench] = await Promise.all([getBalance(accountId), getSaves(accountId), getStage(), getBench()]);
  const cutIn = defaultSell(free);
  const initial = cutIn > 0n ? { amount: cutIn, quote: await quoteSell(cutIn) } : null;
  return { ...market, initial, account: { accountId, free, saves: heldSaves(saves, [...stage, ...bench], market.cutIndex) } };
}

export type ValueData = Market & {
  range: PriceRange;
  prices: PricePoint[];
  /** The first traded price ever: when trading began. */
  launchAt: Date | null;
  /** Day of the running season; null between seasons. */
  seasonDay: number | null;
  supply: SupplySplit;
  holders: number | null;
  account: { accountId: string; free: bigint; saves: HeldSave[] } | null;
};

export async function loadValue(accountId: string | null, range: PriceRange): Promise<ValueData> {
  // Live agents and prices read the clock: reach request time before any of them.
  await connection();
  const market = await loadMarket();
  const [prices, all, params, current, stage, bench, holders, season, account] = await Promise.all([
    getPriceHistory(range),
    range === "all" ? null : getPriceHistory("all"),
    getParams(),
    getTotalSupply(),
    getStage(),
    getBench(),
    getHolderCount(),
    getSeason(),
    accountId ? Promise.all([getBalance(accountId), getSaves(accountId)]).then(([free, saves]) => ({ free, saves })) : null,
  ]);
  // Bench queues are locked in the contract like stage piles, the same total Receipts shows.
  const saved = [...stage, ...bench].reduce((sum, agent) => sum + agent.pile, 0n);
  return {
    ...market,
    range,
    prices,
    launchAt: (all ?? prices)[0]?.at ?? null,
    seasonDay: season.active ? season.day : null,
    supply: splitSupply({ launch: params.totalSupply, current, saved }),
    holders,
    account: account && { accountId: accountId!, free: account.free, saves: heldSaves(account.saves, [...stage, ...bench], market.cutIndex) },
  };
}

export type SaveData = Market & {
  picker: SavePicker;
  /** The agent the page opened on, when it is on the stage. */
  agentId: string | null;
  account: { accountId: string; free: bigint; saves: HeldSave[]; storageAvailable: bigint | null } | null;
};

export async function loadSave(accountId: string | null, agentId: string): Promise<SaveData> {
  // Live agents and prices read the clock: reach request time before any of them.
  await connection();
  const market = await loadMarket();
  const [stage, bench, params, account] = await Promise.all([
    getStage(),
    getBench(),
    getParams(),
    accountId ? Promise.all([getBalance(accountId), getSaves(accountId), getStorageBalance(accountId)]) : null,
  ]);
  const picker = buildPicker(stage, market.feesSoFar, params);
  return {
    ...market,
    picker,
    agentId: picker.choices.some((choice) => choice.agent.id === agentId) ? agentId : null,
    account: account && {
      accountId: accountId!,
      free: account[0],
      saves: heldSaves(account[1], [...stage, ...bench], market.cutIndex),
      storageAvailable: account[2]?.available ?? null,
    },
  };
}

export type BooData = Market & {
  /** The stage, highest score first. */
  stage: Agent[];
  /** The agent the page opened on, when it is on the stage. */
  agentId: string | null;
  /** False while no season runs: then nobody can be booed. */
  seasonActive: boolean;
  account: { accountId: string; free: bigint } | null;
};

export async function loadBoo(accountId: string | null, agentId: string): Promise<BooData> {
  // Live agents and prices read the clock: reach request time before any of them.
  await connection();
  const market = await loadMarket();
  const [stage, season, free] = await Promise.all([getStage(), getSeason(), accountId ? getBalance(accountId) : null]);
  const ranked = rankByScore(stage);
  return {
    ...market,
    stage: ranked,
    agentId: ranked.some((agent) => agent.id === agentId) ? agentId : null,
    seasonActive: season.active,
    account: accountId !== null && free !== null ? { accountId, free } : null,
  };
}
