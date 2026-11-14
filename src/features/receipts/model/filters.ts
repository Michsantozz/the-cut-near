import { CUT_EVENTS } from "@/shared/near/events";

// The journal's filter chips (Receipts.dc.html). "Mine" is every event about the viewer's account.

export const RECEIPT_FILTERS = ["all", "saves", "cuts", "burns", "prizes", "fees", "mine"] as const;
export type ReceiptFilter = (typeof RECEIPT_FILTERS)[number];

/** Our events and the token's mint and burn. `ft_transfer` stays out: it repeats every buy, sell, save and claim. */
export const RECEIPT_EVENTS: readonly string[] = [...CUT_EVENTS, "ft_mint", "ft_burn"];

export const FILTER_LABELS: Record<ReceiptFilter, string> = {
  all: "All",
  saves: "Saves",
  cuts: "Cuts",
  burns: "Burns",
  prizes: "Prizes",
  fees: "Fees",
  mine: "Mine",
};

const FILTER_EVENTS: Record<ReceiptFilter, readonly string[]> = {
  all: RECEIPT_EVENTS,
  saves: ["save", "unsave"],
  cuts: ["cut", "delete", "join"],
  burns: ["ft_burn"],
  prizes: ["prize", "claim"],
  fees: ["fee"],
  mine: RECEIPT_EVENTS,
};

export function parseFilter(value: string | string[] | undefined): ReceiptFilter {
  return RECEIPT_FILTERS.find((filter) => filter === value) ?? "all";
}

export function filterEvents(filter: ReceiptFilter): readonly string[] {
  return FILTER_EVENTS[filter];
}

/** A page cursor in the URL: "<block height>.<row id>". */
export type Cursor = { blockHeight: number; id: number };

export function parseCursor(value: string | string[] | undefined): Cursor | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(\d{1,15})\.(\d{1,15})$/.exec(value);
  return match ? { blockHeight: Number(match[1]), id: Number(match[2]) } : undefined;
}

export const cursorParam = (cursor: Cursor) => `${cursor.blockHeight}.${cursor.id}`;

/** The Receipts URL for a filter and page. */
export function receiptsHref(filter: ReceiptFilter, before?: Cursor): string {
  const params = new URLSearchParams();
  if (filter !== "all") params.set("filter", filter);
  if (before) params.set("before", cursorParam(before));
  const query = params.toString();
  return query ? `/receipts?${query}` : "/receipts";
}
