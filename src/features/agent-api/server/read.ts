import "server-only";

import { getAgent, getBench, getPersonalities, getStage } from "@/entities/agent/server";
import { rankByPile, rankByScore, type Agent } from "@/entities/agent";
import { getNextCut } from "@/entities/cut/server";
import { getBalance, getNearBalance, getParams, getStorageBalance, quoteBuy } from "@/entities/market/server";
import { getMoves } from "@/entities/move/server";
import { getClaimable, getSaves } from "@/entities/save/server";
import { getSeason } from "@/entities/season/server";
import { dataSource } from "@/shared/config/data-source";
import { publicEnv } from "@/shared/config/public";
import { cutContract } from "@/shared/near/contract";
import { movesContract } from "@/shared/near/moves";
import type { MoveModel, NextCutInfo, SourceInfo } from "../model/present";

// Every read the JSON API and the MCP server make: the sample world by default, the contract with DATA_SOURCE=live.

/** NEAR AI's TEE key for the move model on testnet (`get_params().model_signers`), used by the sample world. */
const SAMPLE_MODEL: MoveModel = {
  modelId: "z-ai/glm-5.3-flash",
  signers: ["5a0210f2442c79355784f9de021985429561da5bacc3a4424b01ac52b7e0caff"],
  maxTokens: 1200,
  reasoningEffort: "low",
};

export const isLiveSource = () => dataSource() === "live";

export function sourceInfo(): SourceInfo {
  if (isLiveSource()) return { source: "live", network: publicEnv.network, contract_id: publicEnv.contractId };
  return {
    source: "sample",
    note: "Fictional sample data (DATA_SOURCE=sample): nothing here is on chain. Do not sign calls prepared by a sample server.",
  };
}

export function contractId(): string {
  return publicEnv.contractId;
}

export async function readNextCut(): Promise<NextCutInfo> {
  if (isLiveSource()) {
    const view = await cutContract().getNextCut();
    return { ...view, due: view.due ?? Date.now() >= view.at.getTime() };
  }
  // The sample day always counts down to the next 18:00 UTC: never due.
  return { ...(await getNextCut()), due: false };
}

export async function readModel(): Promise<MoveModel> {
  if (!isLiveSource()) return SAMPLE_MODEL;
  const model = await movesContract().getModel();
  return { modelId: model.modelId, signers: model.signers.map((s) => s.replace(/^0x/i, "").toLowerCase()), maxTokens: model.maxTokens, reasoningEffort: model.reasoningEffort };
}

export type Board = { stage: Agent[]; bench: Agent[] };

/** The stage ranked by score (the last one is on the cut line) and the bench by queue. */
export async function readBoard(): Promise<Board> {
  const [stage, bench] = await Promise.all([getStage(), getBench()]);
  return { stage: rankByScore(stage), bench: rankByPile(bench) };
}

/** Moves for `cutIndex`; for the coming cut with none yet, the previous cut's. */
export async function readLatestMoves(nextCutIndex: number) {
  const moves = await getMoves(nextCutIndex);
  if (moves.length > 0 || nextCutIndex === 0) return { cutIndex: nextCutIndex, moves };
  return { cutIndex: nextCutIndex - 1, moves: await getMoves(nextCutIndex - 1) };
}

export { getAgent, getBalance, getClaimable, getMoves, getNearBalance, getParams, getPersonalities, getSaves, getSeason, getStorageBalance, quoteBuy };

/**
 * `get_move_request(agent_id)`: the exact request body the contract expects now, or null. In sample mode it is
 * built locally with the contract's template (`build`), since there is no chain to ask.
 */
export async function readMoveRequest(agentId: string, build: (agent: Agent, model: MoveModel, briefJson: string) => string): Promise<string | null> {
  if (isLiveSource()) return movesContract().getMoveRequest(agentId);
  const [{ stage }, next, season, model, params] = await Promise.all([readBoard(), readNextCut(), getSeason(), readModel(), getParams()]);
  const agent = stage.find((a) => a.id === agentId);
  if (!agent || agent.moved || Date.now() >= next.movesCloseAt.getTime() || !season.active) return null;
  const whole = (units: bigint) => (units / 10n ** 18n).toString();
  const ns = (date: Date) => (BigInt(date.getTime()) * 1_000_000n).toString();
  const brief = {
    season: season.index,
    day: season.day,
    cut_index: next.index,
    moves_close_at: ns(next.movesCloseAt),
    cut_at: ns(next.at),
    season_pot: whole(season.pot),
    think_fee: whole(params.thinkFee),
    agents: rankByPile(stage).map((a) => ({ id: a.id, name: a.name, personality: a.personality, pile: whole(a.pile), wallet: whole(a.wallet), pacts: a.pacts, heir: a.heir })),
    last_cut: null,
    last_moves: [],
  };
  return build(agent, model, JSON.stringify(brief));
}
