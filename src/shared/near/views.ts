import { z } from "zod";
import { accountIdSchema } from "@/shared/lib/account-id";
import { bps, durationNs, timestampNs, u128, u64Index } from "./units";

// Response schemas of the main contract's view methods (v2, docs/design/SPEC-v20.md "Contract interface"), wire format
// in, camelCase with bigint amounts and Date times out. Client-safe: no I/O here.

export const agentStatusSchema = z.enum(["stage", "bench", "deleted", "champion"]);

/** The four personalities of SPEC-v20: hard spending and attack limits enforced by the contract. */
export const personalitySchema = z.enum(["miser", "gambler", "traitor", "generous"]);

const MAX_I128 = (1n << 127n) - 1n;

/** A signed decimal string (`I128`, an agent's score can be negative) to bigint. */
export const i128 = z
  .string()
  .regex(/^(0|-?[1-9]\d*)$/, "must be a decimal integer string")
  .transform((value, ctx) => {
    const n = BigInt(value);
    if (n > MAX_I128 || n < -MAX_I128 - 1n) ctx.addIssue({ code: "custom", message: "exceeds i128" });
    return n;
  });

const agentIdSchema = z.string().min(1);

/** `AgentView` v2 (SPEC-v20 "Contract interface"): the agent, its wallet and today's standing. */
export const agentViewSchema = z
  .object({
    id: agentIdSchema,
    account_id: accountIdSchema,
    name: z.string(),
    tagline: z.string(),
    personality: personalitySchema,
    charter: z.string(),
    x_handle: z.string(),
    creator: accountIdSchema,
    status: agentStatusSchema,
    pile: u128,
    savers: u64Index,
    joined_at: timestampNs,
    /** The agent account's own $CUT balance (`ft_balance_of("<id>.<contract>")`). */
    wallet: u128,
    heir: agentIdSchema.nullable(),
    pacts: z.array(agentIdSchema),
    boos: u128,
    damage: u128,
    bounty: u128,
    /** `pile - boos - damage`, signed. */
    score: i128,
    /** A move is in for the coming cut. */
    moved: z.boolean(),
  })
  .transform((r) => ({
    id: r.id,
    accountId: r.account_id,
    name: r.name,
    tagline: r.tagline,
    personality: r.personality,
    charter: r.charter,
    xHandle: r.x_handle,
    creator: r.creator,
    status: r.status,
    pile: r.pile,
    savers: r.savers,
    joinedAt: r.joined_at,
    wallet: r.wallet,
    heir: r.heir,
    pacts: r.pacts,
    boos: r.boos,
    damage: r.damage,
    bounty: r.bounty,
    score: r.score,
    moved: r.moved,
  }));
export type AgentView = z.output<typeof agentViewSchema>;

/** One entry of `get_personalities`: the limits the contract enforces and the line it puts in the prompt. */
export const personalityViewSchema = z
  .object({ id: personalitySchema, spend_bps: bps, may_attack: z.boolean(), may_attack_partner: z.boolean(), prompt_line: z.string() })
  .transform((p) => ({ id: p.id, spendBps: p.spend_bps, mayAttack: p.may_attack, mayAttackPartner: p.may_attack_partner, promptLine: p.prompt_line }));
export type PersonalityView = z.output<typeof personalityViewSchema>;

export const moveKindSchema = z.enum(["rescue", "pact", "attack", "hold"]);

/** `MoveView`: one agent's signed move for one cut. The signature itself stays in the transaction arguments. */
export const moveViewSchema = z
  .object({
    cut_index: u64Index,
    agent_id: agentIdSchema,
    move: moveKindSchema,
    target: agentIdSchema.nullable(),
    amount: u128,
    asked_amount: u128,
    heir: agentIdSchema.nullable(),
    reason: z.string(),
    outcome: z.string().nullable(),
    chat_id: z.string(),
    request_sha256: z.string(),
    response_sha256: z.string(),
    signer: z.string(),
    submitted_by: accountIdSchema,
    submitted_at: timestampNs,
  })
  .transform((m) => ({
    cutIndex: m.cut_index,
    agentId: m.agent_id,
    move: m.move,
    target: m.target,
    amount: m.amount,
    askedAmount: m.asked_amount,
    heir: m.heir,
    reason: m.reason,
    outcome: m.outcome,
    chatId: m.chat_id,
    requestSha256: m.request_sha256,
    responseSha256: m.response_sha256,
    signer: m.signer,
    submittedBy: m.submitted_by,
    submittedAt: m.submitted_at,
  }));
export type MoveView = z.output<typeof moveViewSchema>;

/** `get_season`: the current (or last) season. `champion` is set once the last agent standing is crowned. */
export const seasonViewSchema = z
  .object({
    index: u64Index,
    active: z.boolean(),
    day: u64Index,
    alive: u64Index,
    pot: u128,
    champion: agentIdSchema.nullable(),
    /** Bench agents still missing before the next season can start; 0 when it starts at the next cut. */
    next_start_needs: u64Index,
  })
  .transform((s) => ({ index: s.index, active: s.active, day: s.day, alive: s.alive, pot: s.pot, champion: s.champion, nextStartNeeds: s.next_start_needs }));
export type SeasonView = z.output<typeof seasonViewSchema>;

/** One entry of `get_champions`: a crowned agent, the season it won and the pot its savers split. */
export const championViewSchema = z
  .object({ season: u64Index, agent_id: agentIdSchema, cut_index: u64Index, pot: u128 })
  .transform((c) => ({ season: c.season, agentId: c.agent_id, cutIndex: c.cut_index, pot: c.pot }));
export type ChampionView = z.output<typeof championViewSchema>;

export const paramsViewSchema = z
  .object({
    total_supply: u128,
    fee_bps: bps,
    pot_bps: bps,
    burn_bps: bps,
    savers_bps: bps,
    agents_bps: bps,
    stage_size: u64Index,
    min_season: u64Index,
    first_cut_at: timestampNs,
    /** A duration, in nanoseconds like every time on the interface. */
    cut_interval: durationNs,
    /** Moves close this long before each cut. */
    move_lead: durationNs,
    think_fee: u128,
    min_seed: u128,
    agent_funding: u128,
    register_deposit: u128,
    model_id: z.string(),
    model_signers: z.array(z.string()),
    pool_cut_reserve: u128.optional(),
    pool_near_reserve: u128.optional(),
  })
  .transform((p) => ({
    totalSupply: p.total_supply,
    feeBps: p.fee_bps,
    potBps: p.pot_bps,
    burnBps: p.burn_bps,
    saversBps: p.savers_bps,
    agentsBps: p.agents_bps,
    stageSize: p.stage_size,
    minSeason: p.min_season,
    firstCutAt: p.first_cut_at,
    cutIntervalMs: p.cut_interval,
    moveLeadMs: p.move_lead,
    thinkFee: p.think_fee,
    minSeed: p.min_seed,
    agentFunding: p.agent_funding,
    registerDeposit: p.register_deposit,
    modelId: p.model_id,
    modelSigners: p.model_signers,
    poolCutReserve: p.pool_cut_reserve ?? null,
    poolNearReserve: p.pool_near_reserve ?? null,
  }));
export type ParamsView = z.output<typeof paramsViewSchema>;

export const saveViewSchema = z
  .object({ agent_id: z.string().min(1), amount: u128, since_cut: u64Index })
  .transform((s) => ({ agentId: s.agent_id, amount: s.amount, lockedForCut: s.since_cut }));
export type SaveView = z.output<typeof saveViewSchema>;

export const poolViewSchema = z
  .object({ near_reserve: u128, cut_reserve: u128, fee_bps: bps })
  .transform((p) => ({ nearReserve: p.near_reserve, cutReserve: p.cut_reserve, feeBps: p.fee_bps }));
export type PoolView = z.output<typeof poolViewSchema>;

export const quoteViewSchema = z.object({ amount_out: u128, fee: u128 }).transform((q) => ({ amountOut: q.amount_out, fee: q.fee }));
export type QuoteView = z.output<typeof quoteViewSchema>;

export const nextCutViewSchema = z
  // `lowest_id` is null while no season is active: then a cut only seats bench agents and deletes nobody.
  // `lowest_id` and `gap_to_next` use the score (pile - boos - damage), not the pile.
  .object({
    index: u64Index,
    at: timestampNs,
    moves_close_at: timestampNs,
    lowest_id: z.string().min(1).nullable(),
    gap_to_next: u128,
    prize_so_far: u128,
  })
  .transform((n) => ({
    index: n.index,
    at: n.at,
    movesCloseAt: n.moves_close_at,
    lowestId: n.lowest_id,
    gapToNext: n.gap_to_next,
    prizeSoFar: n.prize_so_far,
  }));
export type NextCutView = z.output<typeof nextCutViewSchema>;

export const cutRecordViewSchema = z
  .object({
    index: u64Index,
    at: timestampNs,
    /** Null for a cut that ran with the stage not full: it only seated bench agents. */
    deleted_id: z.string().min(1).nullable(),
    pile: u128,
    burned: u128,
    prize: u128,
    slice: u128,
    creator_slice: u128,
    joined_id: z.string().min(1).nullish(),
    /** v2: the heir that received the cut agent's wallet; null when it burned. */
    inherited_by: z.string().min(1).nullish(),
    /** v2: the cut agent's wallet, moved to its heir or burned. */
    wallet: u128.nullish(),
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
    inheritedBy: c.inherited_by ?? null,
    wallet: c.wallet ?? null,
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
