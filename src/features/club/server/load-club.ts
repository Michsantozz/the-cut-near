import "server-only";

import { connection } from "next/server";

import { paysPer100, sliceIfCut } from "@/entities/cut";
import { getNextCut } from "@/entities/cut/server";
import { getParams } from "@/entities/market/server";
import { rankByPile, type Agent } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";
import { getSaves } from "@/entities/save/server";
import { getSeason } from "@/entities/season/server";
import { dataSource } from "@/shared/config/data-source";

import { SAMPLE_CLUB, type ClubPoints, type Perk, type TopSaver } from "../model/club";

export type ClubSave = {
  agent: Agent;
  amount: bigint;
  /** 1 = top pile; null on the bench. */
  rank: number | null;
  stageSize: number;
  lowest: Agent | null;
  /** What 100 $CUT saved on this agent get if the cut ran now; null when it is the one cut. */
  paysPer100: bigint | null;
};

export type ClubMember = {
  accountId: string;
  since: string | null;
  points: ClubPoints | null;
  topSavers: TopSaver[];
  /** The member's biggest save, or null. */
  save: ClubSave | null;
};

export type Club = {
  renderedAt: number;
  cutAt: Date;
  /** Day of the running season; null between seasons. */
  day: number | null;
  /** Null when the count is not known (live: no holder index yet). */
  members: number | null;
  /** Agents on the stage, for the faces row and the visitor's perks. */
  stage: Agent[];
  /** This week's perks from creators (sample day only until perks have a table). */
  perks: Perk[];
  member: ClubMember | null;
};

/** The club for a member, or the locked card for a visitor (null). Request-time only. */
export async function loadClub(accountId: string | null): Promise<Club> {
  await connection();
  const sample = dataSource() === "sample";
  const [stage, bench, nextCut, params, season, saves] = await Promise.all([getStage(), getBench(), getNextCut(), getParams(), getSeason(), accountId ? getSaves(accountId) : []]);
  const ranked = rankByPile(stage);
  const lowest = ranked.find((agent) => agent.id === nextCut.lowestId) ?? ranked.at(-1) ?? null;
  const slice = lowest ? sliceIfCut(lowest.pile, nextCut.prizeSoFar, params) : 0n;

  const biggest = [...saves].sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1))[0];
  const agent = biggest ? [...stage, ...bench].find((candidate) => candidate.id === biggest.agentId) : undefined;
  const rankIndex = agent ? ranked.indexOf(agent) : -1;
  const save: ClubSave | null =
    biggest && agent
      ? {
          agent,
          amount: biggest.amount,
          rank: rankIndex >= 0 ? rankIndex + 1 : null,
          stageSize: ranked.length,
          lowest,
          paysPer100: agent === lowest || rankIndex < 0 ? null : paysPer100(slice, agent.pile),
        }
      : null;

  return {
    renderedAt: Date.now(),
    cutAt: nextCut.at,
    day: season.active ? season.day : null,
    members: sample ? SAMPLE_CLUB.members : null,
    stage: ranked,
    perks: sample ? SAMPLE_CLUB.perks : [],
    member: accountId
      ? {
          accountId,
          since: sample ? SAMPLE_CLUB.since : null,
          points: sample ? SAMPLE_CLUB.points : null,
          topSavers: sample ? SAMPLE_CLUB.topSavers : [],
          save,
        }
      : null,
  };
}
