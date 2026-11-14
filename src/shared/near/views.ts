import { z } from "zod";
import { accountIdSchema } from "@/shared/lib/account-id";
import { bps, durationNs, timestampNs, u128, u64Index } from "./units";

// Response schemas of the main contract's view methods (docs/contract-interface.md), wire format
// in, camelCase with bigint amounts and Date times out. Client-safe: no I/O here.

export const robotStatusSchema = z.enum(["stage", "bench", "deleted"]);

export const robotViewSchema = z
  .object({
    id: z.string().min(1),
    account_id: accountIdSchema,
    name: z.string(),
    kind: z.string(),
    x_handle: z.string(),
    creator: accountIdSchema,
    status: robotStatusSchema,
    pile: u128,
    savers: u64Index,
    joined_at: timestampNs,
  })
  .transform((r) => ({
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    kind: r.kind,
    xHandle: r.x_handle,
    creator: r.creator,
    status: r.status,
    pile: r.pile,
    savers: r.savers,
    joinedAt: r.joined_at,
  }));
export type RobotView = z.output<typeof robotViewSchema>;

export const paramsViewSchema = z
  .object({
    total_supply: u128,
    fee_bps: bps,
    burn_bps: bps,
    savers_bps: bps,
    stage_size: u64Index,
    first_cut_at: timestampNs,
    /** A duration, in nanoseconds like every time on the interface. */
    cut_interval: durationNs,
    robot_funding: u128,
    register_deposit: u128,
    pool_cut_reserve: u128.optional(),
    pool_near_reserve: u128.optional(),
  })
  .transform((p) => ({
    totalSupply: p.total_supply,
    feeBps: p.fee_bps,
    burnBps: p.burn_bps,
    saversBps: p.savers_bps,
    stageSize: p.stage_size,
    firstCutAt: p.first_cut_at,
    cutIntervalMs: p.cut_interval,
    robotFunding: p.robot_funding,
    registerDeposit: p.register_deposit,
    poolCutReserve: p.pool_cut_reserve ?? null,
    poolNearReserve: p.pool_near_reserve ?? null,
  }));
export type ParamsView = z.output<typeof paramsViewSchema>;

export const saveViewSchema = z
  .object({ robot_id: z.string().min(1), amount: u128, since_cut: u64Index })
  .transform((s) => ({ robotId: s.robot_id, amount: s.amount, lockedForCut: s.since_cut }));
export type SaveView = z.output<typeof saveViewSchema>;

export const poolViewSchema = z
  .object({ near_reserve: u128, cut_reserve: u128, fee_bps: bps })
  .transform((p) => ({ nearReserve: p.near_reserve, cutReserve: p.cut_reserve, feeBps: p.fee_bps }));
export type PoolView = z.output<typeof poolViewSchema>;

export const quoteViewSchema = z.object({ amount_out: u128, fee: u128 }).transform((q) => ({ amountOut: q.amount_out, fee: q.fee }));
export type QuoteView = z.output<typeof quoteViewSchema>;

export const nextCutViewSchema = z
  // `lowest_id` is null while the stage is not full: then a cut only seats bench robots and deletes nobody.
  .object({ index: u64Index, at: timestampNs, lowest_id: z.string().min(1).nullable(), gap_to_next: u128, prize_so_far: u128 })
  .transform((n) => ({ index: n.index, at: n.at, lowestId: n.lowest_id, gapToNext: n.gap_to_next, prizeSoFar: n.prize_so_far }));
export type NextCutView = z.output<typeof nextCutViewSchema>;

export const cutRecordViewSchema = z
  .object({
    index: u64Index,
    at: timestampNs,
    /** Null for a cut that ran with the stage not full: it only seated bench robots. */
    deleted_id: z.string().min(1).nullable(),
    pile: u128,
    burned: u128,
    prize: u128,
    slice: u128,
    creator_slice: u128,
    joined_id: z.string().min(1).nullish(),
    runner: accountIdSchema,
  })
  .transform((c) => ({
    index: c.index,
    at: c.at,
    deletedId: c.deleted_id,
    pile: c.pile,
    burned: c.burned,
    prize: c.prize,
    slice: c.slice,
    creatorSlice: c.creator_slice,
    joinedId: c.joined_id ?? null,
    runner: c.runner,
  }));
export type CutRecordView = z.output<typeof cutRecordViewSchema>;

export const ftMetadataSchema = z
  .object({
    spec: z.string(),
    name: z.string(),
    symbol: z.string(),
    icon: z.string().nullish(),
    reference: z.string().nullish(),
    reference_hash: z.string().nullish(),
    decimals: z.number().int().min(0).max(38),
  })
  .transform((m) => ({ spec: m.spec, name: m.name, symbol: m.symbol, icon: m.icon ?? null, decimals: m.decimals }));
export type FtMetadataView = z.output<typeof ftMetadataSchema>;

/** NEP-145 `storage_balance_of`: null when the account is not registered with the token. */
export const storageBalanceSchema = z
  .object({ total: u128, available: u128 })
  .transform((b) => ({ total: b.total, available: b.available }))
  .nullable();
export type StorageBalanceView = z.output<typeof storageBalanceSchema>;

/** NEP-145 `storage_balance_bounds`. */
export const storageBoundsSchema = z
  .object({ min: u128, max: u128.nullish() })
  .transform((b) => ({ min: b.min, max: b.max ?? null }));
export type StorageBoundsView = z.output<typeof storageBoundsSchema>;
