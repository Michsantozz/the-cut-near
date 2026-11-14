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
