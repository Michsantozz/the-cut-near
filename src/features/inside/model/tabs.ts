// The four tabs of "Inside the cut" (Brain.dc.html), addressed by `?tab=`.

export const INSIDE_TABS = [
  { id: "live", label: "Live", sub: "What the cut reads, all of it on NEAR" },
  { id: "why", label: "Why", sub: "Why the lowest pile is on the block" },
  { id: "rules", label: "Rules", sub: "Fixed at launch, no owner key" },
  { id: "cuts", label: "Cuts", sub: "Every cut, with receipts on NEAR" },
] as const;

export type InsideTab = (typeof INSIDE_TABS)[number]["id"];

/** The tab for a `?tab=` value; anything unknown opens Live. */
export function insideTab(value: string | string[] | undefined): InsideTab {
  const id = Array.isArray(value) ? value[0] : value;
  return INSIDE_TABS.find((tab) => tab.id === id)?.id ?? "live";
}
