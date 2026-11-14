import "server-only";

import { agentJson, moveJson, nextCutJson, paramsJson, seasonJson, UNITS_NOTE } from "../model/present";
import { getAgent, getMoves, getParams, getSeason, readBoard, readLatestMoves, readModel, readNextCut, sourceInfo } from "./read";

// The read-only JSON API (`/api/game`, `/api/agents/{id}`, `/api/moves?cut=N`). Every body starts with `source`.

/** Params, season, the ranked stage with score parts, the bench, the next cut and the latest moves. */
export async function gameJson(now = new Date()) {
  const [params, model, season, next, board] = await Promise.all([getParams(), readModel(), getSeason(), readNextCut(), readBoard()]);
  const latest = await readLatestMoves(next.index);
  return {
    ...sourceInfo(),
    as_of: now.toISOString(),
    units: UNITS_NOTE,
    season: seasonJson(season),
    next_cut: nextCutJson(next, now),
    stage: board.stage.map((agent, i) => agentJson(agent, { rank: i + 1, lowestId: next.lowestId })),
    bench: board.bench.map((agent) => agentJson(agent)),
    latest_moves: { cut_index: latest.cutIndex, moves: latest.moves.map(moveJson) },
    params: paramsJson(params, model),
  };
}

/** One agent with its charter and its moves for the coming and the last cut. Null when unknown. */
export async function agentDetailJson(id: string, now = new Date()) {
  const [agent, next, board] = await Promise.all([getAgent(id), readNextCut(), readBoard()]);
  if (!agent) return null;
  const rank = board.stage.findIndex((a) => a.id === id);
  const indexes = next.index > 0 ? [next.index, next.index - 1] : [next.index];
  const moves = (await Promise.all(indexes.map((index) => getMoves(index)))).flat().filter((m) => m.agentId === id);
  return {
    ...sourceInfo(),
    as_of: now.toISOString(),
    units: UNITS_NOTE,
    agent: agentJson(agent, { full: true, ...(rank >= 0 ? { rank: rank + 1, lowestId: next.lowestId } : {}) }),
    next_cut: nextCutJson(next, now),
    moves: moves.map(moveJson),
  };
}

/** The moves signed for one cut (default: the coming one). The contract keeps the last 30 cuts. */
export async function movesJson(cut: number | null, now = new Date()) {
  const index = cut ?? (await readNextCut()).index;
  const moves = await getMoves(index);
  return { ...sourceInfo(), as_of: now.toISOString(), units: UNITS_NOTE, cut_index: index, moves: moves.map(moveJson) };
}
