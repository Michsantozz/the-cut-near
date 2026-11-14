// Share copy and links (Share.dc.html, ShareCard.dc.html). Pure: used by the page, the OG image and tests.

/** X counts a post up to 280 characters; a link always counts as 23. */
export const POST_LIMIT = 280;
const LINK_WEIGHT = 23;

export type CutShareFacts = { deletedName: string; joinedName: string | null; quote: string | null };

/** "Kiko Bun was deleted." */
export function cutHeadline({ deletedName }: Pick<CutShareFacts, "deletedName">): string {
  return `${deletedName} was deleted.`;
}

/** "Chartwise took the seat." or null when nobody joined. */
export function cutSubline({ joinedName }: Pick<CutShareFacts, "joinedName">): string | null {
  return joinedName ? `${joinedName} took the seat.` : null;
}

/** "Season 1 starts." for a cut that seated a season (and deleted nobody). */
export function seasonHeadline({ season }: { season: number | null }): string {
  return season ? `Season ${season} starts.` : "A season starts.";
}

/** "10 agents on stage." */
export function seasonSubline({ seated }: { seated: number }): string {
  return `${seated} ${seated === 1 ? "agent" : "agents"} on stage.`;
}

/** The default post for a season start: the Director's quote, the stage, and who goes first. Trimmed to fit with a link. */
export function seasonPost({ season, seated, quote }: { season: number | null; seated: number; quote: string | null }): string {
  const happened = `${seasonHeadline({ season }).replace(/\.$/, ":")} ${seated} AI agents on stage. The lowest score is deleted every day.`;
  const parts = [quote ? `“${quote}”` : null, happened, "Who goes first?"].filter((part): part is string => part !== null);
  const text = parts.join(" ");
  return postLength(text, true) <= POST_LIMIT ? text : parts.slice(1).join(" ");
}

type ShareFacts =
  | { kind: "deleted"; deleted: { name: string }; joined: { name: string } | null }
  | { kind: "season"; season: number | null; seated: readonly unknown[] };

/** The card's big line: "Kiko Bun was deleted." or "Season 1 starts." */
export function shareHeadline(share: ShareFacts): string {
  return share.kind === "deleted" ? cutHeadline({ deletedName: share.deleted.name }) : seasonHeadline({ season: share.season });
}

/** The card's second line: "Chartwise took the seat.", "10 agents on stage." or null. */
export function shareSubline(share: ShareFacts): string | null {
  return share.kind === "deleted" ? cutSubline({ joinedName: share.joined?.name ?? null }) : seasonSubline({ seated: share.seated.length });
}

/** The default post for a cut's share card. */
export function sharePost(share: ShareFacts, quote: string | null): string {
  return share.kind === "deleted"
    ? cutPost({ deletedName: share.deleted.name, joinedName: share.joined?.name ?? null, quote })
    : seasonPost({ season: share.season, seated: share.seated.length, quote });
}

/** The default post: the Director's quote, what happened, and a question back. Trimmed to fit with a link. */
export function cutPost(facts: CutShareFacts): string {
  const happened = facts.joinedName ? `${facts.deletedName} was deleted, ${facts.joinedName} took the seat.` : `${facts.deletedName} was deleted.`;
  const parts = [facts.quote ? `“${facts.quote}”` : null, happened, "Who goes at the next cut?"].filter((part): part is string => part !== null);
  const text = parts.join(" ");
  return postLength(text, true) <= POST_LIMIT ? text : parts.slice(1).join(" ");
}

/** The length X counts: characters, plus a 23-character link when one is attached. */
export function postLength(text: string, withLink: boolean): number {
  return [...text].length + (withLink ? LINK_WEIGHT + 1 : 0);
}

export { xIntentUrl } from "@/shared/lib/x-intent";

/** Telegram's share link with the link and the text. */
export function telegramShareUrl(text: string, url: string): string {
  return `https://t.me/share/url?${new URLSearchParams({ url, text })}`;
}

const QUOTE_MAX = 60;

/** The Director's line cut to a quotable bit: skips a short opener ("First cut."), keeps whole sentences up to 60 characters. */
export function quoteOf(line: string): string {
  const sentences = line.match(/[^.!?]+[.!?]+/g)?.map((sentence) => sentence.trim()) ?? [line.trim()];
  while (sentences.length > 1 && (sentences[0]?.length ?? 0) < 15) sentences.shift();
  let quote = "";
  for (const sentence of sentences) {
    const next = quote ? `${quote} ${sentence}` : sentence;
    if (quote && next.length > QUOTE_MAX) break;
    quote = next;
  }
  return quote;
}
