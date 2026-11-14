import "server-only";

import { connection } from "next/server";

import { getAgents, getBench, getStage } from "@/entities/agent/server";
import type { CutRecord } from "@/entities/cut";
import { getCut } from "@/entities/cut/server";
import { getChampions } from "@/entities/season/server";

import { isShareableCut } from "../model/shareable";

export type ShareAgent = { id: string; name: string };

type CutShareBase = { index: number; at: Date; pile: bigint; burned: bigint };

/** A cut that deleted an agent (and maybe seated a bench agent in its place). */
export type DeletedCutShare = CutShareBase & { kind: "deleted"; deleted: ShareAgent; joined: ShareAgent | null };

/** A cut that started a season: it seated bench agents on the stage and deleted nobody. */
export type SeasonCutShare = CutShareBase & { kind: "season"; season: number | null; seated: ShareAgent[] };

export type CutShare = DeletedCutShare | SeasonCutShare;

/** The facts a cut's share card shows, or null when that cut has not run (or ran with nothing to show). */
export async function loadCutShare(index: number): Promise<CutShare | null> {
  if (!Number.isSafeInteger(index) || index < 1) return null;
  // Live agents read the clock: reach request time first.
  await connection();
  const cut = await getCut(index);
  if (!cut || !isShareableCut(cut)) return null;
  const base = { index: cut.index, at: cut.at, pile: cut.pile, burned: cut.burned };
  if (cut.deletedId === null) return { ...base, kind: "season", ...(await seasonStart(cut)) };
  const [deleted, joined] = await namesOf([cut.deletedId, ...(cut.joinedId ? [cut.joinedId] : [])]);
  return { ...base, kind: "deleted", deleted: deleted ?? { id: cut.deletedId, name: cut.deletedId }, joined: joined ?? null };
}

/** The season a seating cut started (one more than the champions crowned before it) and the agents it seated. */
async function seasonStart(cut: CutRecord): Promise<{ season: number | null; seated: ShareAgent[] }> {
  const [champions, seated] = await Promise.all([getChampions().catch(() => null), namesOf(cut.seatedIds)]);
  const season = champions ? champions.filter((champion) => champion.cutIndex < cut.index).length + 1 : null;
  return { season, seated };
}

/** Each id with its agent's name, in order. One read of the stage and the bench, then the agents still missing. */
async function namesOf(ids: readonly string[]): Promise<ShareAgent[]> {
  const [stage, bench] = await Promise.all([getStage(), getBench()]);
  const names = new Map([...stage, ...bench].map((agent) => [agent.id, agent.name]));
  const missing = ids.filter((id) => !names.has(id));
  if (missing.length) for (const agent of await getAgents(missing)) names.set(agent.id, agent.name);
  return ids.map((id) => ({ id, name: names.get(id) ?? id }));
}
