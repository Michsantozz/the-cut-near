"use server";

import { getRobot } from "@/entities/robot/server";
import { publicEnv } from "@/shared/config/public";

import { robotIdError } from "../model/robot-form";

export type RobotIdStatus = "free" | "taken" | "invalid";

/** Whether `<id>.<contract>` can still be created: ids of deleted robots are never reused, so any known robot takes it. */
export async function checkRobotId(id: string): Promise<RobotIdStatus> {
  if (typeof id !== "string" || robotIdError(id, publicEnv.contractId)) return "invalid";
  return (await getRobot(id)) ? "taken" : "free";
}
