import "server-only";

import { connection } from "next/server";

import { getNextCut } from "@/entities/cut/server";
import { getJournal } from "@/entities/journal/server";
import { rankByScore } from "@/entities/agent";
import { getBench, getStage } from "@/entities/agent/server";
import { getClaimable, getSaves } from "@/entities/save/server";

import { buildInbox, isNew, noticeAge, type Notice, type NoticeKind } from "../model/inbox";

export type InboxNotice = Notice & { age: string; isNew: boolean };
export type Inbox = { renderedAt: number; fresh: InboxNotice[]; earlier: InboxNotice[] };

/**
 * The viewer's notifications. `lowestPost` is the newest post of an agent, by id, which the route reads from
 * the Director (features cannot import each other). `hidden` holds the alert kinds the viewer switched off in Settings.
 * Request-time only.
 */
export async function loadInbox(
  accountId: string,
  postOf: (agentId: string) => Promise<{ text: string; at: Date } | null>,
  hidden: readonly NoticeKind[] = [],
): Promise<Inbox> {
  await connection();
  const [stage, bench, nextCut, saves, claimable, cuts, claims, registers] = await Promise.all([
    getStage(),
    getBench(),
    getNextCut(),
    getSaves(accountId),
    getClaimable(accountId),
    getJournal({ events: ["cut"], limit: 3 }),
    getJournal({ accountId, events: ["claim"], limit: 3 }),
    getJournal({ events: ["register"], limit: 200 }),
  ]);
  const now = new Date();
  // An agent whose cut is already in the journal is gone, even if the stage read lags behind it.
  const gone = new Set(cuts.entries.map((entry) => entry.agentId).filter((id): id is string => id !== null));
  const ranked = rankByScore(stage.filter((agent) => !gone.has(agent.id)));
  const lowest = ranked.at(-1);
  const names = new Map<string, string>();
  for (const entry of registers.entries) if (entry.agentId && typeof entry.data.name === "string") names.set(entry.agentId, entry.data.name);
  for (const agent of [...stage, ...bench]) names.set(agent.id, agent.name);

  const notices = buildInbox({
    now,
    cutAt: nextCut.at,
    ranked,
    savedOn: new Set(saves.filter((save) => save.amount > 0n).map((save) => save.agentId)),
    claimable,
    cuts: cuts.entries,
    claims: claims.entries,
    lowestPost: lowest ? await postOf(lowest.id) : null,
    names,
  })
    .filter((notice) => !hidden.includes(notice.kind))
    .map((notice) => ({ ...notice, age: noticeAge(notice.at, now), isNew: isNew(notice, now) }));
  return { renderedAt: now.getTime(), fresh: notices.filter((n) => n.isNew), earlier: notices.filter((n) => !n.isNew) };
}
