import "server-only";

import { connection } from "next/server";

import { paysPer100, sliceIfCut } from "@/entities/cut";
import { getNextCut } from "@/entities/cut/server";
import { getParams } from "@/entities/market/server";
import { rankByPile, type Robot } from "@/entities/robot";
import { getBench, getStage } from "@/entities/robot/server";
import { getSaves } from "@/entities/save/server";
import { dataSource } from "@/shared/config/data-source";

import { SAMPLE_CLUB, type ClubPoints, type Perk, type TopSaver } from "../model/club";

export type ClubSave = {
  robot: Robot;
  amount: bigint;
  /** 1 = top pile; null on the bench. */
  rank: number | null;
  stageSize: number;
  lowest: Robot | null;
  /** What 100 $CUT saved on this robot get if the cut ran now; null when it is the one cut. */
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
  day: number;
  /** Null when the count is not known (live: no holder index yet). */
  members: number | null;
  /** Robots on the stage, for the faces row and the visitor's perks. */
  stage: Robot[];
  /** This week's perks from creators (sample day only until perks have a table). */
  perks: Perk[];
  member: ClubMember | null;
};

/** The club for a member, or the locked card for a visitor (null). Request-time only. */
export async function loadClub(accountId: string | null): Promise<Club> {
  await connection();
  const sample = dataSource() === "sample";
  const [stage, bench, nextCut, params, saves] = await Promise.all([getStage(), getBench(), getNextCut(), getParams(), accountId ? getSaves(accountId) : []]);
  const ranked = rankByPile(stage);
  const lowest = ranked.find((robot) => robot.id === nextCut.lowestId) ?? ranked.at(-1) ?? null;
  const slice = lowest ? sliceIfCut(lowest.pile, nextCut.prizeSoFar, params) : 0n;

  const biggest = [...saves].sort((a, b) => (a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1))[0];
  const robot = biggest ? [...stage, ...bench].find((candidate) => candidate.id === biggest.robotId) : undefined;
  const rankIndex = robot ? ranked.indexOf(robot) : -1;
  const save: ClubSave | null =
    biggest && robot
      ? {
          robot,
          amount: biggest.amount,
          rank: rankIndex >= 0 ? rankIndex + 1 : null,
          stageSize: ranked.length,
          lowest,
          paysPer100: robot === lowest || rankIndex < 0 ? null : paysPer100(slice, robot.pile),
        }
      : null;

  return {
    renderedAt: Date.now(),
    cutAt: nextCut.at,
    day: nextCut.index + 1,
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
