import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { getRpc } from "@/shared/near/rpc";
import { getLiveParams, getLivePriceHistory } from "./api/live";
import {
  SAMPLE_CUT_BALANCES,
  SAMPLE_HOLDERS,
  SAMPLE_NEAR_BALANCES,
  SAMPLE_PARAMS,
  SAMPLE_POOL,
  SAMPLE_PRICES,
  SAMPLE_STORAGE,
  SAMPLE_STORAGE_MIN,
  SAMPLE_TOTAL_SUPPLY,
  SAMPLE_USD_CENTS_PER_NEAR,
} from "./api/sample";
import { quoteBuy as sampleQuoteBuy, quoteSell as sampleQuoteSell } from "./model/quote";
import type { Params, Pool, PricePoint, PriceRange, Quote, StorageBalance } from "./model/types";

const live = () => dataSource() === "live";

export async function getParams(): Promise<Params> {
  return live() ? getLiveParams() : SAMPLE_PARAMS;
}

export async function getPool(): Promise<Pool> {
  return live() ? cutContract().getPool() : SAMPLE_POOL;
}

/** $CUT out and the fee for buying with `nearIn` yoctoNEAR (`quote_buy`). */
export async function quoteBuy(nearIn: bigint): Promise<Quote> {
  return live() ? cutContract().quoteBuy(nearIn) : sampleQuoteBuy(SAMPLE_POOL, nearIn);
}

/** yoctoNEAR out and the $CUT fee for selling `cutIn` (`quote_sell`). */
export async function quoteSell(cutIn: bigint): Promise<Quote> {
  return live() ? cutContract().quoteSell(cutIn) : sampleQuoteSell(SAMPLE_POOL, cutIn);
}

/** Free $CUT of an account (`ft_balance_of`). Saved $CUT sits in the contract and is not part of it. */
export async function getBalance(accountId: string): Promise<bigint> {
  return live() ? cutContract().ftBalanceOf(accountId) : (SAMPLE_CUT_BALANCES.get(accountId) ?? 0n);
}

/** Liquid NEAR in the account's wallet, in yoctoNEAR; null when the account does not exist. */
export async function getNearBalance(accountId: string): Promise<bigint | null> {
  return live() ? getRpc().nearBalance(accountId) : (SAMPLE_NEAR_BALANCES.get(accountId) ?? null);
}

/** The account's NEP-145 storage balance with $CUT, or null when it is not registered yet. */
export async function getStorageBalance(accountId: string): Promise<StorageBalance | null> {
  return live() ? cutContract().storageBalanceOf(accountId) : (SAMPLE_STORAGE.get(accountId) ?? null);
}

/** The NEP-145 registration minimum, in yoctoNEAR. */
export async function getStorageMin(): Promise<bigint> {
  return live() ? (await cutContract().storageBalanceBounds()).min : SAMPLE_STORAGE_MIN;
}

/**
 * The contract's supply and saved total at the end of `blockHeight`, or null in sample mode or when the RPC no longer
 * keeps that block. The audit reads them at the journal's last block so a journal that lags the chain still adds up.
 */
export async function getBooksAt(blockHeight: number): Promise<{ totalSupply: bigint; totalSaved: bigint } | null> {
  if (!live()) return null;
  try {
    return await cutContract().getBooksAt(blockHeight);
  } catch (error) {
    console.warn(`[market] get_stats at block ${blockHeight} failed`, error);
    return null;
  }
}

/** $CUT in existence (`ft_total_supply`): the launch supply minus every burn. */
export async function getTotalSupply(): Promise<bigint> {
  return live() ? cutContract().ftTotalSupply() : SAMPLE_TOTAL_SUPPLY;
}

/**
 * US cents per NEAR, for showing dollars next to NEAR. The contract has no price feed, so live data has none yet
 * (null): screens then show NEAR and $CUT only.
 */
export async function getUsdCentsPerNear(): Promise<bigint | null> {
  return live() ? null : SAMPLE_USD_CENTS_PER_NEAR;
}

/** Accounts holding $CUT. The contract does not count them, so live data has none yet (null). */
export async function getHolderCount(): Promise<number | null> {
  return live() ? null : SAMPLE_HOLDERS;
}

/** Traded prices in the range, oldest first. Reads the clock in live mode: call at request time. */
export async function getPriceHistory(range: PriceRange): Promise<PricePoint[]> {
  return live() ? getLivePriceHistory(range, new Date()) : SAMPLE_PRICES[range];
}
