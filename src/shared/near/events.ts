import { z } from "zod";

// NEP-297 events: a log line "EVENT_JSON:" + {"standard","version","event","data"}.
// https://github.com/near/NEPs/blob/master/neps/nep-0297.md

export const EVENT_PREFIX = "EVENT_JSON:";

/** The main contract's own events (docs/contract-interface.md "Events"). */
export const CUT_STANDARD = "thecut";
export const CUT_EVENTS = ["buy", "sell", "fee", "save", "unsave", "cut", "delete", "prize", "join", "register"] as const;
/** `ft_mint` and `ft_burn` (and `ft_transfer`) follow NEP-141. */
export const FT_STANDARD = "nep141";

export type CutEventName = (typeof CUT_EVENTS)[number];

const envelopeSchema = z.object({
  standard: z.string().min(1),
  version: z.string().min(1),
  event: z.string().min(1),
  data: z.unknown().optional(),
});

export type Nep297Event = z.output<typeof envelopeSchema>;

/** The event in one log line, or null when the line is not a well-formed NEP-297 event. */
export function parseEventLog(log: string): Nep297Event | null {
  if (!log.startsWith(EVENT_PREFIX)) return null;
  let json: unknown;
  try {
    json = JSON.parse(log.slice(EVENT_PREFIX.length));
  } catch {
    return null;
  }
  const parsed = envelopeSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/** True for the events the app keeps: ours and the token's NEP-141 events. */
export function isTrackedEvent(event: Nep297Event): boolean {
  return event.standard === CUT_STANDARD || event.standard === FT_STANDARD;
}

export type EventItem = Record<string, unknown>;

/** NEP-297 `data` is usually an array of objects; a single object or no data is one item. */
export function eventItems(event: Nep297Event): EventItem[] {
  const { data } = event;
  const items = Array.isArray(data) ? data : [data ?? {}];
  return items.map((item) => (item !== null && typeof item === "object" && !Array.isArray(item) ? (item as EventItem) : { value: item }));
}

/** The references the app filters by, read from the keys the interface promises on every data item. */
export type EventRefs = { accountId: string | null; robotId: string | null; cutIndex: number | null; amount: bigint | null };

const ACCOUNT_KEYS = ["account_id", "owner_id", "runner", "creator"] as const;

export function eventRefs(item: EventItem): EventRefs {
  return {
    accountId: firstString(item, ACCOUNT_KEYS),
    robotId: firstString(item, ["robot_id"]),
    cutIndex: firstIndex(item, ["cut_index", "index"]),
    amount: firstAmount(item, ["amount"]),
  };
}

function firstString(item: EventItem, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}

function firstIndex(item: EventItem, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return value;
    if (typeof value === "string" && /^\d{1,15}$/.test(value)) return Number(value);
  }
  return null;
}

function firstAmount(item: EventItem, keys: readonly string[]): bigint | null {
  for (const key of keys) {
    const value = item[key];
    if (typeof value === "string" && /^(0|[1-9]\d{0,38})$/.test(value)) return BigInt(value);
  }
  return null;
}
