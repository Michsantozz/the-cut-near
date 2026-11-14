import { z } from "zod";

// NEP-297 events: a log line "EVENT_JSON:" + {"standard","version","event","data"}.
// https://github.com/near/NEPs/blob/master/neps/nep-0297.md

export const EVENT_PREFIX = "EVENT_JSON:";

/** The main contract's own events (docs/contract-interface.md "Events"). */
export const CUT_STANDARD = "thecut";
export const CUT_EVENTS = ["buy", "sell", "fee", "save", "unsave", "cut", "delete", "prize", "join", "register", "claim"] as const;
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

/** The references the app filters by. `amount` is the event's $CUT amount; NEAR amounts stay in `data`. */
export type EventRefs = { accountId: string | null; robotId: string | null; cutIndex: number | null; amount: bigint | null };

type RefKeys = { account: readonly string[]; amount: readonly string[] };

// Field names per event, as emitted by contracts/thecut/src/events.rs (docs/contract-interface.md "Events").
// The account is the person the event is about: the buyer, the cut's runner, the creator. Never a robot account.
const REF_KEYS: Record<string, RefKeys> = {
  buy: { account: ["account_id"], amount: ["cut_out"] },
  sell: { account: ["account_id"], amount: ["cut_in"] },
  fee: { account: ["account_id"], amount: ["amount"] },
  save: { account: ["account_id"], amount: ["amount"] },
  unsave: { account: ["account_id"], amount: ["amount"] },
  cut: { account: ["runner"], amount: ["burned"] },
  prize: { account: ["creator"], amount: ["slice"] },
  join: { account: [], amount: ["pile"] },
  delete: { account: ["beneficiary"], amount: [] },
  register: { account: ["creator"], amount: [] },
  claim: { account: ["account_id"], amount: ["amount"] },
  ft_mint: { account: ["owner_id"], amount: ["amount"] },
  ft_burn: { account: ["owner_id"], amount: ["amount"] },
  ft_transfer: { account: ["old_owner_id"], amount: ["amount"] },
};

const FALLBACK_KEYS: RefKeys = { account: ["account_id", "owner_id"], amount: ["amount"] };

export function eventRefs(item: EventItem, event?: string): EventRefs {
  const keys = (event !== undefined && REF_KEYS[event]) || FALLBACK_KEYS;
  return {
    accountId: firstString(item, keys.account),
    robotId: firstString(item, ["robot_id"]),
    cutIndex: firstIndex(item, ["cut_index"]),
    amount: firstAmount(item, keys.amount),
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
