import "server-only";
import { z } from "zod";
import { publicEnv } from "@/shared/config/public";
import { getRpc, type NearRpc } from "./rpc";
import { u128 } from "./units";
import {
  championViewSchema,
  cutRecordViewSchema,
  ftMetadataSchema,
  moveViewSchema,
  nextCutViewSchema,
  paramsViewSchema,
  personalityViewSchema,
  poolViewSchema,
  quoteViewSchema,
  agentViewSchema,
  saveViewSchema,
  seasonViewSchema,
  storageBalanceSchema,
  storageBoundsSchema,
} from "./views";

/**
 * Typed reads of the main contract, one per v2 view (RULES.md "Contract interface"). Amounts come back
 * as bigint, times as Date. Errors: RpcUnavailableError (no endpoint answered), ContractViewError
 * (the call failed), ContractResponseError (the answer broke the interface).
 */
export function cutContract(rpc: NearRpc = getRpc(), contractId: string = publicEnv.contractId) {
  const view = <T>(method: string, args: Record<string, unknown>, schema: z.ZodType<T>) => rpc.view(contractId, method, args, schema);

  return {
    contractId,
    getParams: () => view("get_params", {}, paramsViewSchema),
    /** Sorted by pile, highest first. */
    getStage: () => view("get_stage", {}, z.array(agentViewSchema)),
    /** Sorted by queue, highest first. */
    getBench: () => view("get_bench", {}, z.array(agentViewSchema)),
    getAgent: (id: string) => view("get_agent", { id }, agentViewSchema.nullable()),
    getSaves: (accountId: string) => view("get_saves", { account_id: accountId }, z.array(saveViewSchema)),
    getPool: () => view("get_pool", {}, poolViewSchema),
    quoteBuy: (nearIn: bigint) => view("quote_buy", { near_in: nearIn.toString() }, quoteViewSchema),
    quoteSell: (cutIn: bigint) => view("quote_sell", { cut_in: cutIn.toString() }, quoteViewSchema),
    getNextCut: () => view("get_next_cut", {}, nextCutViewSchema),
    getCut: (index: number) => view("get_cut", { index }, cutRecordViewSchema.nullable()),
    getPersonalities: () => view("get_personalities", {}, z.array(personalityViewSchema)),
    getSeason: () => view("get_season", {}, seasonViewSchema),
    /** Crowned agents in season order, at most 100 per call. */
    getChampions: (fromIndex = 0, limit = 100) => view("get_champions", { from_index: fromIndex, limit }, z.array(championViewSchema)),
    /** The moves signed for one cut, in arrival order. Empty when unknown or older than 30 cuts. */
    getMoves: (cutIndex: number) => view("get_moves", { cut_index: cutIndex }, z.array(moveViewSchema)),
    getClaimable: (accountId: string) => view("get_claimable", { account_id: accountId }, u128),
    ftBalanceOf: (accountId: string) => view("ft_balance_of", { account_id: accountId }, u128),
    ftTotalSupply: () => view("ft_total_supply", {}, u128),
    ftMetadata: () => view("ft_metadata", {}, ftMetadataSchema),
    /** NEP-145: null when the account is not registered with $CUT yet. */
    storageBalanceOf: (accountId: string) => view("storage_balance_of", { account_id: accountId }, storageBalanceSchema),
    storageBalanceBounds: () => view("storage_balance_bounds", {}, storageBoundsSchema),
  };
}

export type CutContract = ReturnType<typeof cutContract>;
