import "server-only";
import { getDb } from "@/shared/db/client";
import { startOfUtcDay } from "@/shared/lib/time";
import { cutContract } from "@/shared/near/contract";
import { savedSince } from "@/shared/near/journal";
import type { RobotView } from "@/shared/near/views";
import type { Robot } from "../model/types";

export function toRobot(view: RobotView, savedToday: bigint): Robot {
  return { ...view, savedToday };
}

/**
 * $CUT saved on each robot since midnight UTC, from the journal. The chain stays the source of
 * truth for piles: if the journal is unreachable, "Today" reads 0 instead of failing the lineup.
 */
async function savedToday(now: Date): Promise<Map<string, bigint>> {
  try {
    return await savedSince(getDb(), startOfUtcDay(now));
  } catch (error) {
    console.error("[robot] journal unavailable, showing 0 saved today", error);
    return new Map();
  }
}

export async function getLiveRobots(which: "stage" | "bench", now: Date = new Date()): Promise<Robot[]> {
  const contract = cutContract();
  const [views, saved] = await Promise.all([which === "stage" ? contract.getStage() : contract.getBench(), savedToday(now)]);
  return views.map((view) => toRobot(view, saved.get(view.id) ?? 0n));
}

export async function getLiveRobot(id: string, now: Date = new Date()): Promise<Robot | null> {
  const [view, saved] = await Promise.all([cutContract().getRobot(id), savedToday(now)]);
  return view ? toRobot(view, saved.get(view.id) ?? 0n) : null;
}
