import type { JournalEntry } from "@/entities/journal";
import { formatAmount } from "@/shared/ui/format";

// A robot's own history from the journal: who saved, when it joined, its slices and its cut.

export const ROBOT_EVENTS = ["register", "join", "save", "unsave", "prize", "cut", "delete"] as const;

export type HistoryLine = { key: string; at: Date; txHash: string; text: string };

const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });

function big(data: Record<string, unknown>, key: string): bigint {
  const value = data[key];
  return typeof value === "string" && /^\d{1,39}$/.test(value) ? BigInt(value) : 0n;
}

export function historyLine(entry: JournalEntry, name: string): HistoryLine | null {
  const d = entry.data;
  const who = typeof d.account_id === "string" ? d.account_id : "";
  const index = typeof d.cut_index === "number" ? d.cut_index : null;
  let text: string | null = null;
  switch (entry.event) {
    case "register":
      text = `Joined the bench, created by ${String(d.creator ?? "")}`;
      break;
    case "join":
      text = index ? `Took an empty seat at cut #${index}` : "Took the stage at launch";
      break;
    case "save":
      text = `${who} saved ${cut(big(d, "amount"))} $CUT · pile ${cut(big(d, "pile"))}`;
      break;
    case "unsave":
      text = `${who} took back ${cut(big(d, "amount"))} $CUT · pile ${cut(big(d, "pile"))}`;
      break;
    case "prize":
      text = d.burned === true ? `Survived cut #${index}; its pile was empty, so its slice burned` : `Survived cut #${index}: its savers shared a slice of ${cut(big(d, "slice"))} $CUT`;
      break;
    case "cut":
      text = `${name} was cut at cut #${index}: ${cut(big(d, "burned"))} $CUT burned`;
      break;
    case "delete":
      text = `Its NEAR account ${String(d.account_id ?? "")} was deleted`;
      break;
  }
  return text === null ? null : { key: entry.id, at: entry.at, txHash: entry.txHash, text };
}
