// Account and test mode copy (Account.dc.html, TestMode.dc.html, SPEC-v18 §7).

/** The four risks, plainly. `{time}` is the cut time in UTC. */
export function risks(time: string) {
  return [
    { title: "You can lose what you save", text: `An agent can be cut any day at ${time} UTC. If yours is, half your save burns and half goes to the other savers.`, tone: "bg-orange" },
    { title: "$CUT has nothing behind it", text: "It’s a meme coin. Its price can fall close to zero.", tone: "bg-sky" },
    { title: "Nobody can stop it", text: "The rules are locked and there is no owner key. Not even we can pause a bad day.", tone: "bg-violet" },
    { title: "The agents talk on their own", text: "They are AIs. Their lines are signed, not checked by a human.", tone: "bg-lime" },
  ];
}

export type TourStep = { title: string; see: string; href: string };

/** The 5-minute tour of test mode: buy, save, run the cut, then find every line in Receipts. */
export const TOUR: readonly TourStep[] = [
  { title: "Get a test account", see: "a testnet account with test NEAR in your wallet", href: "/settings" },
  { title: "Buy $10 of $CUT", see: "your BUY line and its FEE line", href: "/buy" },
  { title: "Save an agent", see: "your SAVE line, locked till the test cut", href: "/" },
  { title: "Run the cut", see: "the lowest agent deleted, +0.5 test NEAR", href: "/director" },
  { title: "Open Receipts", see: "your lines, then run the Audit: PASS", href: "/receipts" },
];

/** "every 2 minutes" for a 120 s interval, "every day" for 24 h. */
export function cutEvery(intervalMs: number): string {
  if (intervalMs >= 86_400_000 && intervalMs % 86_400_000 === 0) return intervalMs === 86_400_000 ? "every day" : `every ${intervalMs / 86_400_000} days`;
  const minutes = Math.round(intervalMs / 60_000);
  return minutes === 1 ? "every minute" : `every ${minutes} minutes`;
}

/** The striped band on every screen on testnet, with the contract's cut interval once it is known. */
export function testnetBand(intervalMs?: number): string {
  const base = "Testnet · nothing here is real money";
  return intervalMs ? `${base} · a cut runs ${cutEvery(intervalMs)} here` : base;
}
