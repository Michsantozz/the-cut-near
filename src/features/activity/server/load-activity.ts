import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { getParams, getPool, getUsdCentsPerNear } from "@/entities/market/server";
import { getBench, getStage } from "@/entities/robot/server";
import { publicEnv } from "@/shared/config/public";
import { explorerAccountUrl, explorerTxUrl } from "@/shared/near/network";

import { dayStrip, type DayCell } from "../model/days";
import { ACCOUNT_EVENTS, activityRow, filterRows, groupByDay, mergeNewestFirst, type ActivityFilter, type ActivityGroup, type ActivityRow } from "../model/rows";

const ONE_CUT = 10n ** 18n;

export type Activity = {
  renderedAt: number;
  accountId: string;
  filter: ActivityFilter;
  /** Before any filter: false means the account has done nothing yet. */
  hasAny: boolean;
  rows: (ActivityRow & { href: string })[];
  groups: ActivityGroup<ActivityRow & { href: string }>[];
  days: DayCell[];
  dayNumber: number;
  launchedAt: Date | null;
  firstCutAt: Date;
  cutAt: Date;
  /** The account's page on the explorer: every receipt it ever signed. */
  explorerHref: string;
};

/** The viewer's history and the shared moments, newest first. Request-time only. */
export async function loadActivity(accountId: string, filter: ActivityFilter): Promise<Activity> {
  await connection();
  const [mine, shared, launch, registers, params, pool, usdCentsPerNear, nextCut, stage, bench] = await Promise.all([
    getJournal({ accountId, events: ACCOUNT_EVENTS, limit: 100 }),
    getJournal({ events: ["cut"], limit: 30 }),
    getJournal({ events: ["ft_mint"], limit: 1 }),
    getJournal({ events: ["register"], limit: 200 }),
    getParams(),
    getPool(),
    getUsdCentsPerNear(),
    getNextCut(),
    getStage(),
    getBench(),
  ]);
  const now = new Date();
  const names = new Map<string, string>();
  for (const entry of registers.entries) if (entry.robotId && typeof entry.data.name === "string") names.set(entry.robotId, entry.data.name);
  for (const robot of [...stage, ...bench]) names.set(robot.id, robot.name);

  const launchedAt = launch.entries[0]?.at ?? null;
  const ctx = {
    names,
    priceYoctoNear: pool.cutReserve > 0n ? (pool.nearReserve * ONE_CUT) / pool.cutReserve : 0n,
    usdCentsPerNear,
    firstCutAt: params.firstCutAt,
    cutAt: (index: number) => (index >= 1 ? new Date(params.firstCutAt.getTime() + (index - 1) * params.cutIntervalMs) : null),
  };
  // Only the account's own entries mean it has activity; the shared moments alone are an empty history.
  const hasAny = mine.entries.length > 0;
  const all = mergeNewestFirst(mine.entries, shared.entries, launch.entries)
    .map((entry) => activityRow(entry, ctx))
    .filter((row): row is ActivityRow => row !== null);
  const rows = filterRows(all, filter).map((row) => ({ ...row, href: explorerTxUrl(publicEnv.network, row.txHash) }));
  const day = launchedAt ? Math.floor((now.getTime() - Date.UTC(launchedAt.getUTCFullYear(), launchedAt.getUTCMonth(), launchedAt.getUTCDate())) / 86_400_000) + 1 : 1;

  return {
    renderedAt: now.getTime(),
    accountId,
    filter,
    hasAny,
    rows,
    groups: groupByDay(rows, now, launchedAt),
    days: dayStrip(all, now, launchedAt, nextCut.at),
    dayNumber: day,
    launchedAt,
    firstCutAt: params.firstCutAt,
    cutAt: nextCut.at,
    explorerHref: explorerAccountUrl(publicEnv.network, accountId),
  };
}
