// The club (Club.dc.html): what a member holds and the off-chain extras of the sample day.
// Club points, perks and the savers' ranking have no table yet, so only the sample day shows them.

export type ClubTier = { name: string; at: number };

/** Tiers by club points: Regular from the first point, Superfan at 25. */
export const CLUB_TIERS: readonly ClubTier[] = [
  { name: "Regular", at: 0 },
  { name: "Superfan", at: 25 },
];

export type ClubPoints = { points: number; rank: number };

export type Perk = {
  robotId: string;
  audience: "ALL MEMBERS" | "PERK CHECK";
  title: string;
  sub: string;
  cta: "Get" | "Listen" | "Confirm";
  href: string;
};

export type TopSaver = { rank: number; accountId: string; points: number };

/** The tier a member is in and the next one, with how far along the bar is (0 to 100). */
export function tierOf(points: number): { tier: ClubTier; next: ClubTier | null; percent: number } {
  const index = CLUB_TIERS.findLastIndex((tier) => points >= tier.at);
  const tier = CLUB_TIERS[Math.max(index, 0)]!;
  const next = CLUB_TIERS[index + 1] ?? null;
  const percent = next ? Math.min(100, Math.max(4, Math.round((points / next.at) * 100))) : 100;
  return { tier, next, percent };
}

/** 1 → "1st", 2 → "2nd", 5 → "5th", 11 → "11th", 22 → "22nd". */
export function ordinal(value: number): string {
  const mod100 = value % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? "th" : (["th", "st", "nd", "rd"][value % 10] ?? "th");
  return `${value}${value % 10 > 3 ? "th" : suffix}`;
}

/** The design's sample day (Club.dc.html, DeskClub.dc.html). Every account and number is fictional. */
export const SAMPLE_CLUB = {
  members: 2_140,
  since: "Thu Nov 12 · launch day",
  points: { points: 1, rank: 1_204 } satisfies ClubPoints,
  perks: [
    { robotId: "pixie", audience: "ALL MEMBERS", title: "Pixie Volt reads your name live", sub: "Tonight 20:00 · 31 left", cta: "Get", href: "/robots/pixie" },
    { robotId: "melody", audience: "ALL MEMBERS", title: "Melody-9’s new song, early", sub: "A day early", cta: "Listen", href: "/robots/melody" },
    { robotId: "lila", audience: "PERK CHECK", title: "Lila Loop sticker pack", sub: "Sent yesterday · did it arrive?", cta: "Confirm", href: "/robots/lila" },
  ] satisfies Perk[],
  topSavers: [
    { rank: 1, accountId: "nova.near", points: 4 },
    { rank: 2, accountId: "bitbunny.near", points: 3 },
    { rank: 3, accountId: "tomi.near", points: 3 },
  ] satisfies TopSaver[],
};
