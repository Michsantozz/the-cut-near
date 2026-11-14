import "server-only";

import { connection } from "next/server";

import { getCut, getNextCut } from "@/entities/cut/server";
import { getParams, getTotalSupply } from "@/entities/market/server";
import { rankByPile, type Robot } from "@/entities/robot";
import { getBench, getStage } from "@/entities/robot/server";
import { isSameUtcDay } from "@/shared/ui/format";

import { directorState, linesForFeed, type DirectorState } from "../model/screen";
import type { DirectorLineView } from "../model/view";
import { getDirectorLines } from "./queries";

export type DirectorScreenCut = {
  index: number;
  at: Date;
  deleted: { id: string; name: string; accountId: string };
  pile: bigint;
  burned: bigint;
  prize: bigint;
  slice: bigint;
  survivors: number;
  joined: { id: string; name: string; pile: bigint } | null;
  runner: string;
  supplyAfter: bigint;
};

export type DirectorScreen = {
  /** Request time in ms: the first frame of every live countdown. */
  renderedAt: number;
  state: DirectorState;
  cutAt: Date;
  cutIndex: number;
  /** The robot the cut takes if nothing moves, and the one right above it. */
  lowest: Robot | null;
  next: Robot | null;
  gap: bigint;
  fees: bigint;
  /** What the button does if pressed now: half the lowest pile burns, the rest plus fees is the prize. */
  burnIfCut: bigint;
  prizeIfCut: bigint;
  /** The bench robot that takes the seat. */
  seatTaker: Robot | null;
  robotFunding: bigint;
  stage: Robot[];
  /** The last cut, shown as the receipt on the day it ran. */
  lastCut: DirectorScreenCut | null;
  /** The Director's line about each robot on the block, and the receipt of the last cut. */
  blockLines: Record<string, DirectorLineView | null>;
  receiptLine: DirectorLineView | null;
  /** Every line the Director signed, newest first, without lines about cuts that did not run yet. */
  feed: DirectorLineView[];
};

const BPS = 10_000n;

/** Everything the Director page shows. Request-time only. */
export async function loadDirectorScreen(): Promise<DirectorScreen> {
  await connection();
  const now = new Date();
  const [stage, bench, nextCut, params, supply, lines] = await Promise.all([
    getStage(),
    getBench(),
    getNextCut(),
    getParams(),
    getTotalSupply(),
    getDirectorLines({ limit: 40 }),
  ]);
  const ranked = rankByPile(stage);
  const lowest = ranked.find((robot) => robot.id === nextCut.lowestId) ?? ranked.at(-1) ?? null;
  const next = lowest ? (ranked[ranked.indexOf(lowest) - 1] ?? null) : null;
  const benchRanked = rankByPile(bench);

  const lastRecord = nextCut.index > 1 ? await getCut(nextCut.index - 1) : null;
  const robots = [...stage, ...bench];
  const lastCut = lastRecord && isSameUtcDay(now, lastRecord.at) ? describeCut(lastRecord, robots, supply, params.stageSize) : null;

  const burnIfCut = lowest ? (lowest.pile * BigInt(params.burnBps)) / BPS : 0n;
  const feed = linesForFeed(lines, nextCut.index);
  const lineAbout = (id: string | undefined) => (id ? (feed.find((line) => line.kind === "scheduled" && line.subjectId === id) ?? null) : null);

  return {
    renderedAt: now.getTime(),
    state: directorState({ now, cutAt: nextCut.at, lastCutAt: lastCut?.at ?? null }),
    cutAt: nextCut.at,
    cutIndex: nextCut.index,
    lowest,
    next,
    gap: nextCut.gapToNext,
    fees: nextCut.prizeSoFar,
    burnIfCut,
    prizeIfCut: lowest ? lowest.pile - burnIfCut + nextCut.prizeSoFar : 0n,
    seatTaker: benchRanked[0] ?? null,
    robotFunding: params.robotFunding,
    stage: ranked,
    lastCut,
    blockLines: { [lowest?.id ?? ""]: lineAbout(lowest?.id), [next?.id ?? ""]: lineAbout(next?.id) },
    receiptLine: lastCut ? (feed.find((line) => line.kind === "after-cut-receipt" && line.cutIndex === lastCut.index) ?? null) : null,
    feed,
  };
}

function describeCut(
  cut: NonNullable<Awaited<ReturnType<typeof getCut>>>,
  robots: Robot[],
  supplyNow: bigint,
  stageSize: number,
): DirectorScreenCut {
  const name = (id: string) => robots.find((robot) => robot.id === id)?.name ?? id;
  const joined = cut.joinedId ? robots.find((robot) => robot.id === cut.joinedId) : undefined;
  return {
    index: cut.index,
    at: cut.at,
    deleted: { id: cut.deletedId, name: name(cut.deletedId), accountId: robots.find((robot) => robot.id === cut.deletedId)?.accountId ?? cut.deletedId },
    pile: cut.pile,
    burned: cut.burned,
    prize: cut.prize,
    slice: cut.slice,
    survivors: stageSize - 1,
    joined: joined ? { id: joined.id, name: joined.name, pile: joined.pile } : null,
    runner: cut.runner,
    // Shown on the day of the cut, when this burn is the last one.
    supplyAfter: supplyNow,
  };
}
