import "server-only";

import { connection } from "next/server";

import { rankByPile, rankByScore, type Agent } from "@/entities/agent";
import { getAgents, getBench, getStage } from "@/entities/agent/server";
import { getCuts, getNextCut } from "@/entities/cut/server";
import { getParams } from "@/entities/market/server";
import type { Champion, Season } from "@/entities/season";
import { getChampions, getSeason } from "@/entities/season/server";
import { isLive } from "@/shared/config/data-source";

import { nextSeated, potPayout, seats, type Seat } from "../model/season";

/** The crowned agent of the season shown, with what its savers got. */
export type Crowned = { agent: Agent; potPaid: bigint; carried: bigint };

export type SeasonPage = {
  renderedAt: number;
  season: Season;
  cutAt: Date;
  /** Every seat of this season, alive first. */
  seats: Seat[];
  /** Highest score on the stage: the one closest to the crown. */
  leader: Agent | null;
  crowned: Crowned | null;
  stageSize: number;
  minSeason: number;
  /** The next season's queue, biggest first. */
  bench: Agent[];
  /** Bench agents that would take a seat if the next season started now. */
  seated: Set<string>;
  champions: Champion[];
  sample: boolean;
  /** Sample mode only: the page shows how a crowned season looks, with made-up numbers. */
  preview: boolean;
};

/** The season page. `preview` (sample mode only) shows the end of a season: the current leader crowned. */
export async function loadSeason({ preview = false }: { preview?: boolean } = {}): Promise<SeasonPage> {
  await connection();
  const [stage, bench, nextCut, real, params, champions] = await Promise.all([getStage(), getBench(), getNextCut(), getSeason(), getParams(), getChampions()]);
  const start = nextCut.index - real.day;
  const cuts = real.day > 0 ? await getCuts(start + 1, nextCut.index - 1) : [];
  const cutIds = cuts.flatMap((cut) => (cut.deletedId ? [cut.deletedId] : []));
  const gone = await getAgents(cutIds);
  const cutEntries = cuts.flatMap((cut) => {
    const agent = gone.find((one) => one.id === cut.deletedId);
    return agent ? [{ agent, day: cut.index - start }] : [];
  });
  const ranked = rankByScore(stage);
  const queue = rankByPile(bench);
  const sample = !isLive();
  const showPreview = preview && sample && ranked.length > 0;

  let season = real;
  let crowned: Crowned | null = null;
  let alive = ranked;
  let fallen = cutEntries;
  if (showPreview) {
    // The leader is the last one standing; everyone else is cut on the days still to come.
    const [champion, ...rest] = ranked;
    fallen = [...cutEntries, ...[...rest].reverse().map((agent, i) => ({ agent, day: real.day + i }))];
    alive = [champion];
    // Today's cut is day `day`'s; one more agent goes at each cut until one is left.
    season = { ...real, active: false, alive: 1, day: real.day + rest.length - 1, champion: champion.id };
    const { paid, carried } = potPayout(real.pot, champion.pile);
    crowned = { agent: champion, potPaid: paid, carried };
  } else if (real.champion) {
    const [champion] = await getAgents([real.champion]);
    const record = champions.find((one) => one.season === real.index);
    if (champion) crowned = { agent: champion, potPaid: record?.pot ?? 0n, carried: 0n };
  }

  return {
    renderedAt: Date.now(),
    season,
    cutAt: nextCut.at,
    seats: seats(crowned ? [crowned.agent] : alive, fallen, crowned?.agent.id ?? null),
    leader: alive[0] ?? null,
    crowned,
    stageSize: params.stageSize,
    minSeason: params.minSeason,
    bench: queue,
    seated: nextSeated(queue, params.stageSize),
    champions,
    sample,
    preview: showPreview,
  };
}
