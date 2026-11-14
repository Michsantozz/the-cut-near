import { units } from "@/shared/lib/amount";
import type { Champion, Season } from "../model/types";

/** Season 1 of the sample world (SPEC-v20): day 4, seven of ten agents alive, three on the bench for season 2. */
export const SAMPLE_SEASON: Season = {
  index: 1,
  active: true,
  day: 4,
  alive: 7,
  pot: units(21_460),
  champion: null,
  nextStartNeeds: 0,
};

/** No season of the sample world has ended yet. */
export const SAMPLE_CHAMPIONS: Champion[] = [];
