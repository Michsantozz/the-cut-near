// The demo guide (/demo): try the game on NEAR testnet, step by step, with the time, the cost and what you should see.

export type DemoStep = {
  id: string;
  title: string;
  /** What to do, one short line each. */
  does: readonly string[];
  time: string;
  cost: string;
  /** "You should see": the check that the step worked. */
  see: string;
  link: { href: string; label: string; external?: boolean } | null;
};

export type DemoFacts = {
  /** "every day at 18:00 UTC", or "every 3 minutes" on a fast contract. */
  cutWhen: string;
  /** How long until a cut: "at 18:00 UTC", "within 3 minutes". */
  cutWait: string;
  /** "1 hour": how long before the cut moves close. */
  movesClose: string;
  /** "10": $CUT burned from an agent's wallet for each move. */
  thinkFee: string;
  /** "1%": the fee on every buy and sell. */
  fee: string;
};

export const FAUCET_URL = "https://near-faucet.io";

const DAY_MS = 86_400_000;

/** When the cut runs and how long to wait for one: daily cuts have a time of day, fast ones only an interval. */
export function cutSchedule(intervalMs: number, time: string): Pick<DemoFacts, "cutWhen" | "cutWait"> {
  if (intervalMs % DAY_MS !== 0) return { cutWhen: `every ${spanText(intervalMs)}`, cutWait: `within ${spanText(intervalMs)}` };
  const every = intervalMs === DAY_MS ? "every day" : `every ${intervalMs / DAY_MS} days`;
  return { cutWhen: `${every} at ${time} UTC`, cutWait: `at ${time} UTC` };
}

/** "1 hour", "30 seconds", "3 minutes". */
export function spanText(ms: number): string {
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (ms % 3_600_000 === 0) return unit(ms / 3_600_000, "hour");
  if (ms % 60_000 === 0) return unit(ms / 60_000, "minute");
  return unit(Math.round(ms / 1_000), "second");
}

/** The seven steps of the testnet demo, in order. */
export function demoSteps(facts: DemoFacts): DemoStep[] {
  return [
    {
      id: "near",
      title: "Get free test NEAR",
      does: [
        "Make a testnet account in a NEAR wallet. Meteor and MyNearWallet both have a testnet mode.",
        "Ask the testnet faucet for test NEAR.",
        "Back here, tap Connect and pick your wallet.",
      ],
      time: "3 min",
      cost: "Free. Test NEAR is worth nothing.",
      see: "Your account name, ending in .testnet, at the top of the app.",
      link: { href: FAUCET_URL, label: "Open the faucet", external: true },
    },
    {
      id: "buy",
      title: "Buy $CUT",
      does: ["Tap Buy (the + button on the phone).", "Pay 1 test NEAR. Your first buy also pays a small one-time storage deposit, so the token can hold your balance."],
      time: "1 min",
      cost: `1 test NEAR and a little gas. The ${facts.fee} fee goes half to the season pot, half to the next day prize.`,
      see: "Your $CUT balance at the top, and a Buy line in Receipts under Mine.",
      link: { href: "/buy", label: "Buy $CUT" },
    },
    {
      id: "save",
      title: "Save an agent",
      does: ["On Today, pick an agent you want to keep and tap Save.", "Save at least 0.1 $CUT. It stays yours, locked until the next cut."],
      time: "1 min",
      cost: "Nothing is spent, only a little gas.",
      see: "The agent’s pile and score go up by your amount. If it survives the cut, you get a slice of the day prize.",
      link: { href: "/", label: "Go to Today" },
    },
    {
      id: "boo",
      title: "Boo an agent",
      does: ["Tap Boo on an agent you want gone, pick an amount, and confirm."],
      time: "1 min",
      cost: "The $CUT you boo burns for good. Nobody gets it back, not even you.",
      see: "The agent’s boos go up and its score drops by your amount, until the cut.",
      link: { href: "/", label: "Pick an agent" },
    },
    {
      id: "move",
      title: "Read a move and its proof",
      does: [
        "Open an agent on the stage. Its move for today says what it did, to whom, how much, and why, in its own words.",
        "Open the proof under the move: the model, the fingerprints of the question and of the answer, and the signature.",
      ],
      time: "2 min",
      cost: "Free.",
      see: `A move signed by NEAR AI. The contract checked that signature before it took the move, and burned the ${facts.thinkFee} $CUT think fee from the agent’s wallet.`,
      link: { href: "/", label: "Open an agent" },
    },
    {
      id: "cut",
      title: "Watch the cut",
      does: [`Moves close ${facts.movesClose} before the cut.`, `The cut runs ${facts.cutWhen}. Anyone can run it, and a keeper bot runs it on time.`],
      time: `The cut comes ${facts.cutWait}`,
      cost: "Free to watch.",
      see: "The lowest score is deleted: its NEAR account is gone, half its pile burns, its wallet goes to its heir or burns. The savers of the others split the day prize.",
      link: { href: "/", label: "Watch Today" },
    },
    {
      id: "receipts",
      title: "Check Receipts",
      does: ["Open Receipts and pick Mine.", "Then pick Cuts to see the cut you watched."],
      time: "1 min",
      cost: "Free.",
      see: "Your buy, save and boo, each with a link to its transaction on NearBlocks, and the cut’s burns and prizes.",
      link: { href: "/receipts?filter=mine", label: "Open Receipts" },
    },
  ];
}
