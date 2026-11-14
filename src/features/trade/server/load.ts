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
import { rankByPile, type Robot } from "@/entities/robot";
import { getBench, getStage } from "@/entities/robot/server";
import { getSaves } from "@/entities/save/server";

import { DEFAULT_BUY, buyInputToNear, buyUnit } from "../model/buy";
import { buildPicker, type SavePicker } from "../model/save";
import { defaultSell } from "../model/sell";
import { splitSupply, type SupplySplit } from "../model/supply";

/** A save of the viewer, with its robot's name and whether the cut it was locked for has run. */
export type HeldSave = { robotId: string; robotName: string; amount: bigint; unlocked: boolean };

export type Market = {
  /** Request time in ms: the first frame of every live clock. */
  renderedAt: number;
  pool: Pool;
  usdCentsPerNear: bigint | null;
  cutAt: Date;
  cutIndex: number;
  feesSoFar: bigint;
  /** $CUT the lowest robot needs to pass the next one (`get_next_cut().gap_to_next`). */
  gapToNext: bigint;
};

async function loadMarket(): Promise<Market> {
  // Countdowns and "today" start from the request time, never from a prerendered one.
  await connection();
  const [pool, usdCentsPerNear, nextCut] = await Promise.all([getPool(), getUsdCentsPerNear(), getNextCut()]);
  return { renderedAt: Date.now(), pool, usdCentsPerNear, cutAt: nextCut.at, cutIndex: nextCut.index, feesSoFar: nextCut.prizeSoFar, gapToNext: nextCut.gapToNext };
}

function heldSaves(saves: Awaited<ReturnType<typeof getSaves>>, robots: readonly Robot[], cutIndex: number): HeldSave[] {
  const names = new Map(robots.map((robot) => [robot.id, robot.name]));
  return saves
    .filter((save) => save.amount > 0n)
    .map((save) => ({
      robotId: save.robotId,
      robotName: names.get(save.robotId) ?? save.robotId,
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
  /** Stage robot ids by pile, for the "Now keep one alive" art. */
  stageIds: string[];
  /** Where "Save a robot" goes after a buy: the robot right above the cut line, the one that pays the most. */
  saveTargetId: string | null;
  /** Null for a visitor. */
  account: { accountId: string; nearBalance: bigint | null; registered: boolean } | null;
};

export async function loadBuy(accountId: string | null): Promise<BuyData> {
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
    stageIds: ranked.map((robot) => robot.id),
    saveTargetId: (ranked.at(-2) ?? ranked[0])?.id ?? null,
    account,
  };
}

export type SellData = Market & {
  initial: InitialQuote;
  account: { accountId: string; free: bigint; saves: HeldSave[] } | null;
};

export async function loadSell(accountId: string | null): Promise<SellData> {
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
  supply: SupplySplit;
  holders: number | null;
  account: { accountId: string; free: bigint; saves: HeldSave[] } | null;
};

export async function loadValue(accountId: string | null, range: PriceRange): Promise<ValueData> {
  const market = await loadMarket();
  const [prices, all, params, current, stage, holders, account] = await Promise.all([
    getPriceHistory(range),
    range === "all" ? null : getPriceHistory("all"),
    getParams(),
    getTotalSupply(),
    getStage(),
    getHolderCount(),
    accountId
      ? Promise.all([getBalance(accountId), getSaves(accountId), getBench()]).then(([free, saves, bench]) => ({ free, saves, bench }))
      : null,
  ]);
  const saved = stage.reduce((sum, robot) => sum + robot.pile, 0n);
  return {
    ...market,
    range,
    prices,
    launchAt: (all ?? prices)[0]?.at ?? null,
    supply: splitSupply({ launch: params.totalSupply, current, saved }),
    holders,
    account: account && { accountId: accountId!, free: account.free, saves: heldSaves(account.saves, [...stage, ...account.bench], market.cutIndex) },
  };
}

export type SaveData = Market & {
  picker: SavePicker;
  /** The robot the page opened on, when it is on the stage. */
  robotId: string | null;
  account: { accountId: string; free: bigint; saves: HeldSave[]; storageAvailable: bigint | null } | null;
};

export async function loadSave(accountId: string | null, robotId: string): Promise<SaveData> {
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
    robotId: picker.choices.some((choice) => choice.robot.id === robotId) ? robotId : null,
    account: account && {
      accountId: accountId!,
      free: account[0],
      saves: heldSaves(account[1], [...stage, ...bench], market.cutIndex),
      storageAvailable: account[2]?.available ?? null,
    },
  };
}
