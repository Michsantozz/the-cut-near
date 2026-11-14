import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { SAMPLE_CHAMPIONS, SAMPLE_SEASON } from "./api/sample";
import type { Champion, Season } from "./model/types";

export async function getSeason(): Promise<Season> {
  return dataSource() === "live" ? cutContract().getSeason() : SAMPLE_SEASON;
}

/** Every crowned agent, oldest season first. */
export async function getChampions(): Promise<Champion[]> {
  return dataSource() === "live" ? cutContract().getChampions() : SAMPLE_CHAMPIONS;
}
