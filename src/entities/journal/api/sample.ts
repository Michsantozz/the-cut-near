import { NEAR_DECIMALS, units } from "@/shared/lib/amount";
import type { JournalEntry } from "../model/types";

// The design's sample history (docs/design/SPEC-v19.md §2), newest first. Fictional hashes and heights.
const entry = (n: number, event: string, at: string, fields: Partial<JournalEntry> & { data: Record<string, unknown> }): JournalEntry => ({
  id: `sample-receipt-${n}:0:0`,
  standard: "thecut",
  event,
  at: new Date(at),
  txHash: `sample-tx-${n}`,
  blockHeight: 190_000_000 + n,
  accountId: null,
  robotId: null,
  cutIndex: null,
  amount: null,
  ...fields,
});

export const SAMPLE_JOURNAL: JournalEntry[] = [
  entry(4, "save", "2026-11-13T13:41:00Z", {
    accountId: "mika.near",
    robotId: "melody",
    cutIndex: 1,
    amount: units(400),
    data: { account_id: "mika.near", robot_id: "melody", amount: units(400).toString(), cut_index: 1 },
  }),
  entry(3, "buy", "2026-11-13T09:14:00Z", {
    accountId: "mika.near",
    amount: units(120),
    data: { account_id: "mika.near", amount: units(120).toString(), near_in: (units(859, NEAR_DECIMALS) / 10n).toString() },
  }),
  entry(2, "register", "2026-11-12T16:12:00Z", {
    accountId: "chartwise-studio.near",
    robotId: "chartwise",
    data: { account_id: "chartwise-studio.near", robot_id: "chartwise" },
  }),
  entry(1, "buy", "2026-11-12T15:20:00Z", {
    accountId: "mika.near",
    amount: units(5542) / 10n,
    data: { account_id: "mika.near", amount: (units(5542) / 10n).toString(), near_in: (units(3835, NEAR_DECIMALS) / 10n).toString() },
  }),
];
