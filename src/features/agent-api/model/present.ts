import type { Agent, Personality } from "@/entities/agent";
import type { Move } from "@/entities/move";
import type { Save } from "@/entities/save";
import type { Season } from "@/entities/season";
import type { Params } from "@/entities/market";
import { cutText, nearText } from "./amounts";
import { MAX_BENCH, MAX_SAVES, MIN_SAVE } from "./calls";

// JSON for outside agents: snake_case like the contract, amounts as exact decimal strings of whole $CUT (`*_cut`)
// or NEAR (`*_near`), times as ISO 8601 UTC (`*_at`). The contract itself takes the smallest unit.

/** Where the data comes from, spread at the top of every response. */
export type SourceInfo = { source: "sample"; note: string } | { source: "live"; network: string; contract_id: string };

export const UNITS_NOTE =
  "Amounts ending in _cut are exact decimal $CUT (18 decimals on chain), _near are NEAR (24 decimals). Times are ISO 8601 UTC. score = pile - boos - damage; the lowest score is cut.";

/** The move model and its TEE signers (`get_params`). */
export type MoveModel = { modelId: string; signers: readonly string[]; maxTokens: number | null; reasoningEffort: "low" | "medium" | "high" | null };

/** `get_next_cut` plus whether it is due now. */
export type NextCutInfo = { index: number; at: Date; movesCloseAt: Date; lowestId: string | null; gapToNext: bigint; prizeSoFar: bigint; due: boolean };

export function agentJson(agent: Agent, extra: { rank?: number; lowestId?: string | null; full?: boolean } = {}) {
  return {
    id: agent.id,
    name: agent.name,
    account_id: agent.accountId,
    status: agent.status,
    personality: agent.personality,
    ...(extra.rank !== undefined ? { rank: extra.rank, on_cut_line: extra.lowestId === agent.id } : {}),
    score_cut: cutText(agent.score),
    pile_cut: cutText(agent.pile),
    boos_cut: cutText(agent.boos),
    damage_cut: cutText(agent.damage),
    bounty_cut: cutText(agent.bounty),
    wallet_cut: cutText(agent.wallet),
    saved_today_cut: cutText(agent.savedToday),
    savers: agent.savers,
    moved: agent.moved,
    heir: agent.heir,
    pacts: agent.pacts,
    tagline: agent.tagline,
    ...(extra.full ? { charter: agent.charter, x_handle: agent.xHandle, creator: agent.creator, joined_at: agent.joinedAt.toISOString() } : {}),
  };
}

export function moveJson(move: Move) {
  return {
    cut_index: move.cutIndex,
    agent_id: move.agentId,
    move: move.move,
    target: move.target,
    amount_cut: cutText(move.amount),
    asked_amount_cut: cutText(move.askedAmount),
    heir: move.heir,
    reason: move.reason,
    outcome: move.outcome,
    chat_id: move.chatId,
    request_sha256: move.requestSha256,
    response_sha256: move.responseSha256,
    signer: move.signer,
    submitted_by: move.submittedBy,
    submitted_at: move.submittedAt.toISOString(),
  };
}

export function seasonJson(season: Season) {
  return {
    index: season.index,
    active: season.active,
    day: season.day,
    alive: season.alive,
    pot_cut: cutText(season.pot),
    champion: season.champion,
    next_start_needs: season.nextStartNeeds,
  };
}

export function nextCutJson(next: NextCutInfo, now: Date) {
  return {
    index: next.index,
    at: next.at.toISOString(),
    moves_close_at: next.movesCloseAt.toISOString(),
    moves_open: now < next.movesCloseAt,
    due: next.due,
    lowest_id: next.lowestId,
    gap_to_next_cut: cutText(next.gapToNext),
    prize_so_far_cut: cutText(next.prizeSoFar),
  };
}

export function paramsJson(params: Params, model: MoveModel) {
  return {
    total_supply_at_launch_cut: cutText(params.totalSupply),
    fee_bps: params.feeBps,
    pot_bps: params.potBps,
    burn_bps: params.burnBps,
    savers_bps: params.saversBps,
    agents_bps: params.agentsBps,
    stage_size: params.stageSize,
    min_season: params.minSeason,
    first_cut_at: params.firstCutAt.toISOString(),
    cut_interval_seconds: params.cutIntervalMs / 1000,
    move_lead_seconds: params.moveLeadMs / 1000,
    think_fee_cut: cutText(params.thinkFee),
    min_seed_cut: cutText(params.minSeed),
    agent_funding_near: nearText(params.agentFunding),
    register_deposit_near: nearText(params.registerDeposit),
    min_save_cut: cutText(MIN_SAVE),
    max_saves_per_account: MAX_SAVES,
    max_bench: MAX_BENCH,
    model_id: model.modelId,
    model_signers: model.signers,
    max_tokens: model.maxTokens,
    reasoning_effort: model.reasoningEffort,
  };
}

export function personalityJson(p: Personality) {
  return {
    id: p.id,
    label: p.label,
    spend_bps: p.spendBps,
    spend_percent: `${p.spendBps / 100}%`,
    may_attack: p.mayAttack,
    may_attack_partner: p.mayAttackPartner,
    limit: p.limit,
    prompt_line: p.promptLine,
  };
}

export function saveJson(save: Save, nextCutIndex: number, agentStatus: string | null) {
  return {
    agent_id: save.agentId,
    amount_cut: cutText(save.amount),
    locked_for_cut: save.lockedForCut,
    unlocked: save.lockedForCut < nextCutIndex,
    agent_status: agentStatus,
  };
}
