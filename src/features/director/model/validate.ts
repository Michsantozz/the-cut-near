import { z } from "zod";
import { LINE_LIMITS, type DirectorLineKind } from "./kinds";

// Output validation: the model's reply must be JSON {"line": "..."}; the line must be short, plain,
// free of trading advice, and every number in it must come from the prompt.

/** JSON schema sent as `response_format` (structured output), and the zod schema the reply is parsed with. */
export const directorReplySchema = z.object({ line: z.string() });
export const DIRECTOR_REPLY_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: { line: { type: "string" } },
  required: ["line"],
  additionalProperties: false,
};

/** A line, by kind: trimmed, one line, within the kind's length limits. */
export const lineSchema = (kind: DirectorLineKind) => {
  const limits = LINE_LIMITS[kind];
  return z
    .string()
    .trim()
    .refine((line) => !/[\r\n]/.test(line), "More than one line.")
    .refine((line) => line.length >= limits.minChars && line.length <= limits.maxChars, `Length must be ${limits.minChars}–${limits.maxChars} characters.`)
    .refine((line) => line.split(/\s+/).filter(Boolean).length <= limits.maxWords, `At most ${limits.maxWords} words.`);
};

// Lines are commentary on a game, never a call to trade. Words that read as advice or hype are out.
// "save" and "pays" are the game's own verbs and stay allowed.
const ADVICE = [
  /\bbuy(s|ing)?\b/i,
  /\bsell(s|ing)?\b/i,
  /\binvest(s|ed|ing|ment|ments|or|ors)?\b/i,
  /\bhodl\b/i,
  /\bape (in|into)\b/i,
  /\bguarantee(d|s)?\b/i,
  /\bprofit(s|able)?\b/i,
  /\breturns?\b/i,
  /\bprice\b/i,
  /\bfinancial advice\b/i,
  /\bmoon(ing|s)?\b/i,
  /\blambo\b/i,
  /\bpump(s|ing|ed)?\b/i,
  /\bdump(s|ing|ed)?\b/i,
  /\b\d+x\b/i,
  /\bget rich\b/i,
  /\bdon'?t miss\b/i,
  /\bto the moon\b/i,
];

const TIME = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
const NUMBER = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

/** Number tokens of a text, normalized: times as written, numbers without separators. "1.80" also yields "1.8". */
export function numberTokens(text: string): string[] {
  const tokens: string[] = [];
  const withoutTimes = text.replace(TIME, (time) => {
    tokens.push(time);
    return " ";
  });
  for (const raw of withoutTimes.match(NUMBER) ?? []) tokens.push(raw.replace(/,/g, ""));
  return tokens;
}

/** Every number a line may use: those written in the prompt (system and user), in the same notation. */
export function allowedNumbers(...texts: string[]): Set<string> {
  const allowed = new Set<string>();
  for (const text of texts) {
    for (const token of numberTokens(text)) {
      allowed.add(token);
      if (token.includes(".") && !token.includes(":")) allowed.add(token.replace(/\.?0+$/, ""));
    }
  }
  return allowed;
}

export type LineCheck = { ok: true; line: string } | { ok: false; reason: string };

/**
 * Reads the line out of the model's reply content: JSON {"line"} (structured output), a fenced JSON
 * block, or as a last resort the plain text. Surrounding quotes are removed.
 */
export function lineFromReply(content: string | null | undefined): string | null {
  if (!content) return null;
  const trimmed = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (trimmed.startsWith("{")) {
    try {
      const parsed = directorReplySchema.safeParse(JSON.parse(trimmed));
      return parsed.success ? unquote(parsed.data.line) : null;
    } catch {
      return null;
    }
  }
  return unquote(trimmed);
}

const unquote = (line: string) => line.trim().replace(/^["“'](.*)["”']$/s, "$1").trim();

/**
 * Checks a line against the kind's limits and the content rules. `names` (robot names) are ignored by the
 * advice check, so "Onyx Moon" is not read as hype.
 */
export function validateLine(raw: string, kind: DirectorLineKind, allowed: Set<string>, names: string[] = []): LineCheck {
  const shape = lineSchema(kind).safeParse(raw);
  if (!shape.success) return { ok: false, reason: shape.error.issues[0]?.message ?? "Invalid line." };
  const line = shape.data.replace(/\s+/g, " ");
  if (/https?:|www\.|\.(com|xyz|io|app|gg|ai|org|net)\b/i.test(line)) return { ok: false, reason: "Contains a link." };
  if (/[@#]/.test(line)) return { ok: false, reason: "Contains a handle or hashtag." };
  if (/[<>{}`*_[\]|]/.test(line)) return { ok: false, reason: "Contains markup." };
  if (/\p{Extended_Pictographic}/u.test(line)) return { ok: false, reason: "Contains an emoji." };
  const prose = names.reduce((text, name) => text.split(name).join(" "), line);
  for (const pattern of ADVICE) if (pattern.test(prose)) return { ok: false, reason: `Reads as financial advice or hype (${pattern.source}).` };
  for (const token of numberTokens(line)) {
    if (!allowed.has(token)) return { ok: false, reason: `The number ${token} is not in the facts.` };
  }
  return { ok: true, line };
}
