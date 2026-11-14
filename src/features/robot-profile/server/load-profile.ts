import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { getParams } from "@/entities/market/server";
import type { Robot } from "@/entities/robot";
import { getBench, getRobot, getStage } from "@/entities/robot/server";
import { getSaves } from "@/entities/save/server";
import { publicEnv } from "@/shared/config/public";
import { explorerAccountUrl, explorerTxUrl } from "@/shared/near/network";
import { formatUtcTime, relativeUtcDay } from "@/shared/ui/format";

import { historyLine, ROBOT_EVENTS, type HistoryLine } from "../model/history";
import { bannerFor, ladder, paysFor, standingOf, type Banner, type LadderRow, type Pays, type Standing } from "../model/profile";

export type RobotCutReceipt = { index: number; at: Date; pile: bigint; burned: bigint; prize: bigint; slice: bigint; creatorSlice: bigint; runner: string; href: string };

export type RobotProfile = {
  renderedAt: number;
  robot: Robot;
  standing: Standing;
  pays: Pays | null;
  banner: Banner | null;
  ladder: LadderRow[];
  cutAt: Date;
  /** "today 18:00 UTC" for the cut line. */
  cutLabel: string;
  savedHere: bigint;
  accountHref: string;
  history: (HistoryLine & { href: string })[];
  /** Set when the robot was cut. */
  cut: RobotCutReceipt | null;
  viewer: string | null;
};

function big(data: Record<string, unknown>, key: string): bigint {
  const value = data[key];
  return typeof value === "string" && /^\d{1,39}$/.test(value) ? BigInt(value) : 0n;
}

/** A robot's page, or null when no robot has this id. Request-time only. */
export async function loadRobotProfile(id: string, viewer: string | null): Promise<RobotProfile | null> {
  await connection();
  const robot = await getRobot(id);
  if (!robot) return null;
  const [stage, bench, nextCut, params, saves, history] = await Promise.all([
    getStage(),
    getBench(),
    getNextCut(),
    getParams(),
    viewer ? getSaves(viewer) : Promise.resolve([]),
    getJournal({ robotId: id, events: ROBOT_EVENTS, limit: 30 }),
  ]);
  const now = new Date();
  const savedHere = saves.filter((save) => save.robotId === id).reduce((sum, save) => sum + save.amount, 0n);
  const standing = standingOf(robot, stage, bench);
  const day = relativeUtcDay(now, nextCut.at);
  const cutTime = `${formatUtcTime(nextCut.at)} UTC${day ? ` ${day}` : ""}`;
  const cutEntry = robot.status === "deleted" ? history.entries.find((entry) => entry.event === "cut") : undefined;

  return {
    renderedAt: now.getTime(),
    robot,
    standing,
    pays: paysFor(robot, stage, nextCut.prizeSoFar, params, savedHere),
    banner: bannerFor(robot, standing, stage, bench, savedHere, cutTime),
    ladder: ladder(robot, stage, bench),
    cutAt: nextCut.at,
    cutLabel: `${day ? `${day.toUpperCase()} ` : ""}${formatUtcTime(nextCut.at)} UTC`,
    savedHere,
    accountHref: explorerAccountUrl(publicEnv.network, robot.accountId),
    history: history.entries
      .map((entry) => historyLine(entry, robot.name))
      .filter((line): line is HistoryLine => line !== null)
      .slice(0, 8)
      .map((line) => ({ ...line, href: explorerTxUrl(publicEnv.network, line.txHash) })),
    cut: cutEntry
      ? {
          index: cutEntry.cutIndex ?? 0,
          at: cutEntry.at,
          pile: big(cutEntry.data, "pile"),
          burned: big(cutEntry.data, "burned"),
          prize: big(cutEntry.data, "prize"),
          slice: big(cutEntry.data, "slice"),
          creatorSlice: big(cutEntry.data, "creator_slice"),
          runner: typeof cutEntry.data.runner === "string" ? cutEntry.data.runner : "",
          href: explorerTxUrl(publicEnv.network, cutEntry.txHash),
        }
      : null,
    viewer,
  };
}
