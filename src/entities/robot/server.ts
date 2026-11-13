import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { getLiveRobot, getLiveRobots } from "./api/live";
import { SAMPLE_BENCH, SAMPLE_STAGE } from "./api/sample";
import type { Robot } from "./model/types";

// Data access for robots: the design's sample day by default, the contract (plus the journal for
// "saved today") with DATA_SOURCE=live. Live reads hit the network: render callers inside <Suspense>.

/** Stage robots, highest pile first. */
export async function getStage(): Promise<Robot[]> {
  return dataSource() === "live" ? getLiveRobots("stage") : SAMPLE_STAGE;
}

/** Bench robots, biggest queue first. */
export async function getBench(): Promise<Robot[]> {
  return dataSource() === "live" ? getLiveRobots("bench") : SAMPLE_BENCH;
}

export async function getRobot(id: string): Promise<Robot | null> {
  if (dataSource() === "live") return getLiveRobot(id);
  return [...SAMPLE_STAGE, ...SAMPLE_BENCH].find((robot) => robot.id === id) ?? null;
}
