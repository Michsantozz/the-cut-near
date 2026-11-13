import "server-only";

import { SAMPLE_BENCH, SAMPLE_STAGE } from "./api/sample";
import type { Robot } from "./model/types";

// Data access for robots. Sample data until the live source (NEAR RPC + index) is wired by the platform layer.
export async function getStage(): Promise<Robot[]> {
  return SAMPLE_STAGE;
}

export async function getBench(): Promise<Robot[]> {
  return SAMPLE_BENCH;
}
