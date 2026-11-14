import { gapShown, scoreShown, type Agent } from "@/entities/agent";
import type { JournalEntry } from "@/entities/journal";
import { formatAmount, formatCutTenths, formatUtcTime } from "@/shared/ui/format";

// The viewer's notifications (Notifications.dc.html "inbox"), derived on each visit from the chain, the journal
// and the agents' signed posts. Nothing is pushed: no push service exists yet.

export type NoticeKind = "danger" | "post" | "final" | "prize" | "cut" | "collected";

export type Notice = { key: string; kind: NoticeKind; at: Date; title: string; text: string; href: string | null };

export type InboxInput = {
  now: Date;
  cutAt: Date;
  /** The stage, lowest score last: the order the cut uses. */
  ranked: readonly Pick<Agent, "id" | "name" | "score" | "joinedAt">[];
  /** Agent ids the viewer has a save on. */
  savedOn: ReadonlySet<string>;
  claimable: bigint;
  /** `cut` events, newest first. */
  cuts: readonly JournalEntry[];
  /** The viewer's `claim` events, newest first. */
  claims: readonly JournalEntry[];
  /** The newest post of the agent on the block, if any. */
  lowestPost: { text: string; at: Date } | null;
  names: ReadonlyMap<string, string>;
};

const HOUR = 3_600_000;
const cut0 = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
/** A score as the board shows it: one decimal, rounded down. */
const score = (value: bigint) => formatCutTenths(scoreShown(value));
const cut2 = (value: bigint) => formatAmount(value, { maxFractionDigits: 2 });

function big(data: Record<string, unknown>, key: string): bigint {
  const value = data[key];
  return typeof value === "string" && /^\d{1,39}$/.test(value) ? BigInt(value) : 0n;
}

/** Notices, newest first. */
export function buildInbox(input: InboxInput): Notice[] {
  const { now, cutAt, ranked } = input;
  const notices: Notice[] = [];
  const lowest = ranked.at(-1);
  const next = ranked.at(-2);
  const time = `${formatUtcTime(cutAt)} UTC`;
  // A notice about the coming cut is dated when it became true: the start of the day's countdown.
  const dayStart = new Date(cutAt.getTime() - 24 * HOUR);
  const finalHour = cutAt.getTime() - now.getTime() <= HOUR && cutAt > now;

  if (lowest && next) {
    const gap = gapShown(lowest, next);
    const mine = input.savedOn.has(lowest.id);
    notices.push({
      key: `block-${lowest.id}`,
      kind: "danger",
      // A state, not an event: it is true right now.
      at: now,
      title: mine ? `Your agent ${lowest.name} is on the block` : `${lowest.name} is on the block`,
      text: `Lowest score: ${score(lowest.score)}, ${formatCutTenths(gap)} $CUT to pass ${next.name}. The cut runs at ${time}.`,
      href: `/agents/${lowest.id}`,
    });
    // Danger for a saved agent in the bottom two that is not the lowest.
    if (input.savedOn.has(next.id)) {
      notices.push({
        key: `danger-${next.id}`,
        kind: "danger",
        at: now,
        title: `Your agent ${next.name} is in the bottom two`,
        text: `Only ${formatCutTenths(scoreShown(next.score) - scoreShown(lowest.score))} of score above ${lowest.name}. If ${lowest.name} passes it, ${next.name} is cut at ${time}.`,
        href: `/agents/${next.id}`,
      });
    }
    if (input.lowestPost) {
      notices.push({ key: `post-${lowest.id}`, kind: "post", at: input.lowestPost.at, title: `${lowest.name} posted on X`, text: `“${input.lowestPost.text}”`, href: `/agents/${lowest.id}` });
    }
  }
  if (finalHour && lowest && next) {
    notices.push({
      key: "final-hour",
      kind: "final",
      at: new Date(cutAt.getTime() - HOUR),
      title: `Final hour: the cut runs at ${formatUtcTime(cutAt)}`,
      text: `${lowest.name} needs ${formatCutTenths(gapShown(lowest, next))} $CUT to pass ${next.name}. Saves count until ${formatUtcTime(cutAt)}.`,
      href: "/",
    });
  }
  const [lastCut] = input.cuts;
  if (input.claimable > 0n) {
    const agent = typeof lastCut?.data.agent_id === "string" ? (input.names.get(lastCut.data.agent_id) ?? lastCut.data.agent_id) : null;
    notices.push({
      key: "prize-ready",
      kind: "prize",
      at: lastCut?.at ?? now,
      title: "Prize is ready",
      text: `${agent ? `${agent} was deleted. ` : ""}+${cut2(input.claimable)} $CUT waiting.`,
      href: "/prizes",
    });
  }
  for (const entry of input.cuts.slice(0, 3)) {
    const agent = typeof entry.data.agent_id === "string" ? (input.names.get(entry.data.agent_id) ?? entry.data.agent_id) : null;
    notices.push({
      key: `cut-${entry.id}`,
      kind: "cut",
      at: entry.at,
      title: agent ? `${agent} was cut` : `Cut #${entry.cutIndex ?? ""}: nobody was cut`,
      text: agent ? `Its NEAR account is gone. ${cut0(big(entry.data, "burned"))} $CUT burned and ${cut0(big(entry.data, "prize"))} $CUT went out as the prize.` : "A season started. The day prize carries to the next cut.",
      href: "/receipts?filter=cuts",
    });
  }
  if (input.cuts.length === 0) {
    notices.push({
      key: "no-cut",
      kind: "cut",
      at: dayStart,
      title: "No cut has run yet",
      text: `The show opened. Every day at ${time} the lowest score is cut.`,
      href: "/receipts",
    });
  }
  for (const entry of input.claims.slice(0, 3)) {
    notices.push({ key: `claim-${entry.id}`, kind: "collected", at: entry.at, title: `You collected ${cut2(entry.amount ?? 0n)} $CUT`, text: "Your prizes are in your wallet.", href: "/activity" });
  }
  return notices.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** "now", "12m", "3h", or the weekday, as the design dates a notification. */
export function noticeAge(at: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(at);
}

/** New: from the last 24 hours. */
export const isNew = (notice: Notice, now: Date) => now.getTime() - notice.at.getTime() < 24 * HOUR;
