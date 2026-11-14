import "server-only";
import { z } from "zod";
import { publicEnv } from "@/shared/config/public";
import { getRpc, type NearRpc } from "./rpc";
import { u128 } from "./units";
import {
  cutRecordViewSchema,
  ftMetadataSchema,
  nextCutViewSchema,
  paramsViewSchema,
  poolViewSchema,
  quoteViewSchema,
  agentViewSchema,
  saveViewSchema,
  storageBalanceSchema,
  storageBoundsSchema,
} from "./views";

/**
 * Typed reads of the main contract, one per view in docs/contract-interface.md. Amounts come back
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
