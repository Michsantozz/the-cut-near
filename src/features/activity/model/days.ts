import { startOfUtcDay } from "@/shared/lib/time";
import { formatUtcTime, isSameUtcDay } from "@/shared/ui/format";

import type { ActivityKind, ActivityRow } from "./rows";

// The laptop's day strip (DeskActivity.dc.html): eight days from launch, what the viewer did on each,
// and the cut that comes every day.

const DAY_MS = 86_400_000;

export type DayChip = { kind: ActivityKind; label: string; ahead: boolean };
export type DayCell = { key: string; weekday: string; day: string; tag: "LAUNCH" | "TODAY" | null; state: "past" | "today" | "future"; chips: DayChip[] };

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

/** Eight days from launch (or from yesterday, once launch is further back). */
export function dayStrip(rows: readonly ActivityRow[], now: Date, launchedAt: Date | null, cutTime: Date, days = 8): DayCell[] {
  const today = startOfUtcDay(now);
  const launchDay = launchedAt ? startOfUtcDay(launchedAt) : today;
  const start = new Date(Math.max(launchDay.getTime(), today.getTime() - DAY_MS));
  const cutLabel = `Cut ${formatUtcTime(cutTime)}`;
  const cutMs = cutTime.getTime() - startOfUtcDay(cutTime).getTime();

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start.getTime() + i * DAY_MS);
    const state = date < today ? "past" : date.getTime() === today.getTime() ? "today" : "future";
    const mine = rows.filter((row) => isSameUtcDay(row.at, date));
    const chips: DayChip[] = [];
    const add = (kind: ActivityKind, label: string, ahead = false) => {
      if (!chips.some((chip) => chip.label === label)) chips.push({ kind, label, ahead });
    };
    for (const row of [...mine].reverse()) {
      if (row.kind === "buy") add("buy", "Bought");
      else if (row.kind === "sell") add("sell", "Sold");
      else if (row.kind === "save") add("save", row.title.startsWith("Saved") ? row.title.replace(/^Saved ([\d,.]+) .*/, "Saved $1") : "Took back");
      else if (row.kind === "prize") add("prize", "Collected");
      else if (row.title === "The show opened") add("cut", "Show opened");
      else add("cut", cutLabel);
    }
    const cutPassed = now.getTime() >= date.getTime() + cutMs;
    const firstCutDay = launchedAt ? startOfUtcDay(launchedAt).getTime() + DAY_MS : 0;
    if (date.getTime() >= firstCutDay && !chips.some((chip) => chip.label === cutLabel) && state !== "past") add("cut", cutLabel, state === "today" && !cutPassed);
    return {
      key: date.toISOString().slice(0, 10),
      weekday: WEEKDAY.format(date).toUpperCase(),
      day: String(date.getUTCDate()),
      tag: state === "today" ? "TODAY" : launchedAt && isSameUtcDay(date, launchedAt) ? "LAUNCH" : null,
      state,
      chips: chips.slice(0, 3),
    };
  });
}
