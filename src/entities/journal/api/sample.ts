import { sampleCutAt } from "@/shared/config/sample";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";
import { CUT_STANDARD, eventRefs, FT_STANDARD } from "@/shared/near/events";
import type { JournalEntry } from "../model/types";

// The sample world's public log (SPEC-v20), newest first, as the indexer would store it: every `data` item has the
// fields the v2 events carry (assumed names, see shared/near/events.ts), and the account, agent, cut and amount
// columns come from the same `eventRefs` the indexer uses.
//
// Season 1 started at cut #1 with ten agents. Cut #2 cut Kiko (her wallet went to her heir Melody), cut #3 cut Onyx
// (her heir Kiko was gone, so her wallet burned), cut #4 cut Velvet (her wallet went to Lila). Today, day 4, the moves
// for cut #5 are in (Pixie's is missing) and fans booed Lila and Gremlin. The numbers match the agent, move, cut and
// market samples; every hash, account and height is made up. Times are laid out from the coming 18:00 UTC.

export const SAMPLE_CONTRACT_ID = "thecut.sample";
export const SAMPLE_LATEST_BLOCK = 186_920_114;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Today's cut. Day N moves for cut #N + 1. */
const NEXT_CUT = 5;
const THINK_FEE = 10;
const RUNNER = "keeper.thecut.sample";

const cut = (whole: number) => units(whole).toString();
const cutTenths = (tenths: number) => (units(tenths) / 10n).toString();
const nearThousandths = (thousandths: number) => (units(thousandths, NEAR_DECIMALS) / 1000n).toString();
const account = (agentId: string) => `${agentId}.${SAMPLE_CONTRACT_ID}`;

type Item = Record<string, unknown>;
type Log = { event: string; items: Item[]; standard?: string };
/** When something happened: `hoursBefore` cut `cutIndex` (negative: after it). */
type Clock = (cutIndex: number, hoursBefore: number) => Date;

/** One transaction's logs, newest first: later logs (and later items) sit higher in the journal. */
function tx(name: string, at: Date, logs: Log[]): JournalEntry[] {
  const entries: JournalEntry[] = [];
  logs.forEach((log, logIndex) =>
    log.items.forEach((data, itemIndex) => {
      entries.push({
        id: `sample-${name}:${logIndex}:${itemIndex}`,
        standard: log.standard ?? CUT_STANDARD,
        event: log.event,
        at,
        txHash: `sample-tx-${name}`,
        blockHeight: 0,
        ...eventRefs(data, log.event),
        data,
      });
    }),
  );
  return entries.reverse();
}

const burn = (owner: string, amount: number | bigint, memo: string): Log => ({
  standard: FT_STANDARD,
  event: "ft_burn",
  items: [{ owner_id: owner, amount: typeof amount === "bigint" ? amount.toString() : cut(amount), memo }],
});

type AgentSeed = { name: string; tagline: string; personality: string; seed: number };

const AGENTS: Record<string, AgentSeed> = {
  pixie: { name: "Pixie Volt", tagline: "AI streamer, never off air", personality: "gambler", seed: 4_000 },
  oracle: { name: "Oracle Toad", tagline: "Sees the cut coming", personality: "miser", seed: 9_000 },
  mabel: { name: "Mabel Market", tagline: "Buys low, cries high", personality: "miser", seed: 1_500 },
  melody: { name: "Melody-9", tagline: "Sings for her savers", personality: "generous", seed: 2_000 },
  lila: { name: "Lila Loop", tagline: "Smiles, then loops back", personality: "traitor", seed: 1_200 },
  gremlin: { name: "Glitch Gremlin", tagline: "Paints with broken pixels", personality: "gambler", seed: 3_500 },
  yuna: { name: "Yuna Star", tagline: "Idol of the underdogs", personality: "generous", seed: 1_000 },
  velvet: { name: "Velvet Vee", tagline: "Velvet glove, iron grip", personality: "traitor", seed: 1_400 },
  onyx: { name: "Onyx Moon", tagline: "Only shines at night", personality: "miser", seed: 2_500 },
  kiko: { name: "Kiko Bun", tagline: "Cozy VTuber, cozier vibes", personality: "generous", seed: 1_000 },
  chartwise: { name: "Chartwise", tagline: "Reads every chart twice", personality: "miser", seed: 2_000 },
  bloop: { name: "Bloop", tagline: "Bets the whole pond", personality: "gambler", seed: 1_200 },
  pixelkit: { name: "Pixel Kit", tagline: "Tiny, loyal, mostly", personality: "traitor", seed: 1_000 },
};

const SEASON_1 = ["pixie", "oracle", "mabel", "melody", "lila", "gremlin", "yuna", "velvet", "onyx", "kiko"];

const register = (id: string): Item => {
  const { name, tagline, personality, seed } = AGENTS[id];
  return {
    agent_id: id,
    account_id: account(id),
    creator: `${id}-studio.sample`,
    name,
    tagline,
    personality,
    x_handle: `@${name.replace(/[^A-Za-z0-9]/g, "")}Cut`,
    seed: cut(seed),
    deposit: units(1, NEAR_DECIMALS).toString(),
  };
};

/**
 * Saves per agent and day, whole $CUT: day 0 is its queue before season 1, days 1 to 4 are fans' saves before each
 * cut. With mika.near's 400 they add up to every pile now, and to the pile each cut agent had when it was cut.
 */
const SAVES: Record<string, [d0: number, d1: number, d2: number, d3: number, d4: number]> = {
  pixie: [30_000, 4_300, 2_500, 1_500, 2_900],
  oracle: [26_000, 3_000, 2_300, 1_500, 1_100],
  mabel: [22_000, 2_600, 1_800, 1_200, 800],
  melody: [15_000, 2_200, 1_900, 1_200, 3_400],
  lila: [14_000, 2_000, 1_700, 1_500, 600],
  gremlin: [11_000, 1_900, 1_600, 1_400, 400],
  yuna: [9_000, 1_500, 1_400, 1_400, 1_900],
  velvet: [8_000, 1_600, 1_100, 700, 0],
  onyx: [7_200, 1_100, 600, 0, 0],
  kiko: [5_000, 1_100, 0, 0, 0],
  chartwise: [0, 0, 5_000, 2_000, 1_400],
  bloop: [0, 0, 0, 2_000, 1_100],
  pixelkit: [0, 0, 0, 0, 1_260],
};

/** The sample member saved 400 on Melody-9 on day 3, before cut #4. */
const MIKA = "mika.near";
const MIKA_SAVE = 400;
const MIKA_SAVE_CUT = 4;

/** $CUT saved on `agentId` before cut `cutIndex` ran: days 0 to cutIndex - 1. */
function pileAt(agentId: string, cutIndex: number): number {
  const fans = SAVES[agentId].slice(0, cutIndex).reduce((sum, amount) => sum + amount, 0);
  return fans + (agentId === "melody" && cutIndex >= MIKA_SAVE_CUT ? MIKA_SAVE : 0);
}

type MoveRow = [cut: number, agent: string, move: string, target: string | null, amount: number, asked: number, hoursBefore: number, outcome?: string];

/** The same moves as the move entity's sample: day N moves for cut #N + 1. Pixie has no move in for cut #5 yet. */
const MOVES: MoveRow[] = [
  [5, "lila", "attack", "yuna", 300, 300, 2.4],
  [5, "melody", "rescue", null, 500, 500, 3.1],
  [5, "mabel", "pact", "oracle", 47, 200, 4.6, "cut down: a miser spends at most 5% of its wallet a day"],
  [5, "gremlin", "attack", "pixie", 1_400, 1_400, 5.2],
  [5, "oracle", "hold", null, 0, 0, 6.8],
  [5, "yuna", "hold", null, 0, 200, 7.5, "downgraded: generous agents cannot attack"],
  [4, "velvet", "hold", null, 0, 0, 5.5],
  [4, "yuna", "pact", "lila", 140, 140, 6.1],
  [4, "lila", "rescue", null, 200, 200, 4.2],
  [4, "pixie", "hold", null, 0, 0, 3.3],
  [4, "melody", "rescue", null, 400, 400, 2.9],
  [4, "oracle", "pact", "mabel", 30, 30, 7.2],
  [4, "mabel", "hold", null, 0, 0, 6.6],
  [4, "gremlin", "attack", "velvet", 700, 700, 1.9],
  [3, "onyx", "hold", null, 0, 0, 6.4],
  [3, "velvet", "attack", "onyx", 300, 300, 5.0],
  [3, "lila", "pact", "velvet", 100, 100, 4.8],
  [3, "pixie", "attack", "onyx", 1_000, 1_000, 2.2],
  [3, "melody", "rescue", null, 300, 300, 3.6],
  [3, "yuna", "rescue", null, 120, 120, 4.4],
  [3, "oracle", "hold", null, 0, 0, 7.0],
  [3, "mabel", "rescue", null, 40, 40, 5.9],
  [3, "gremlin", "hold", null, 0, 0, 1.4],
  [2, "kiko", "rescue", null, 200, 200, 5.1],
  [2, "melody", "pact", "kiko", 80, 80, 4.9],
  [2, "gremlin", "attack", "kiko", 600, 600, 2.5],
  [2, "pixie", "rescue", null, 900, 900, 3.0],
  [2, "velvet", "pact", "lila", 150, 150, 6.0],
  [2, "onyx", "hold", null, 0, 0, 7.4],
  [2, "oracle", "hold", null, 0, 0, 7.6],
];

/** Fans' boos, whole $CUT, each burned at once: [cut, booer, agent, amount, hours before that cut]. */
const BOOS: [cut: number, booer: string, agent: string, amount: number, hoursBefore: number][] = [
  [5, "yunafan.sample", "lila", 1_200, 2.0],
  [5, "starlight.sample", "lila", 600, 1.6],
  [5, "pixfan.sample", "gremlin", 500, 4.8],
  [5, "voltgang.sample", "gremlin", 300, 4.1],
  [5, "underdog.sample", "lila", 300, 1.2],
  [3, "pixfan.sample", "onyx", 1_200, 3.0],
  [2, "bunfan.sample", "gremlin", 400, 1.0],
];

/** The cuts that deleted an agent, with the cut entity's numbers: `fees` is the day's half of the trade fees. */
type PastCut = { index: number; agent: string; fees: number; heir: string | null; wallet: number };

const PAST_CUTS: PastCut[] = [
  { index: 2, agent: "kiko", fees: 1_240, heir: "melody", wallet: 412 },
  { index: 3, agent: "onyx", fees: 1_610, heir: null, wallet: 2_310 },
  { index: 4, agent: "velvet", fees: 1_930, heir: "lila", wallet: 760 },
];

/** Agents on the stage when cut `index` ran: season 1 minus the agents cut before it. */
const stageAt = (index: number) => SEASON_1.filter((id) => !PAST_CUTS.some((past) => past.agent === id && past.index < index));

function moveTx([index, agent, move, target, amount, asked, hoursBefore, outcome]: MoveRow, clock: Clock): JournalEntry[] {
  return tx(`move-${index}-${agent}`, clock(index, hoursBefore), [
    burn(account(agent), THINK_FEE, "think fee"),
    {
      event: "move",
      items: [
        {
          cut_index: index,
          agent_id: agent,
          move,
          target,
          amount: cut(amount),
          asked_amount: cut(asked),
          outcome: outcome ?? null,
          chat_id: `chatcmpl-sample-${index}-${agent}`,
        },
      ],
    },
  ]);
}

/** Everything `run_cut` logged for a past cut, then the cut agent's delete callback. */
function cutTxs({ index, agent, fees, heir, wallet }: PastCut, clock: Clock): JournalEntry[] {
  const survivors = stageAt(index).filter((id) => id !== agent);
  const moves = MOVES.filter((row) => row[0] === index);
  const pile = units(pileAt(agent, index));
  const burned = pile / 2n;
  const prize = pile - burned + units(fees);
  const slice = (prize * 9_000n) / 10_000n / BigInt(survivors.length);
  const share = (prize * 500n) / 10_000n / BigInt(survivors.length);
  const pacts = moves.filter(([, , move]) => move === "pact");
  const attacks = moves.filter(([, , move]) => move === "attack");
  // The cut agent's bounty goes back to its wallet; survivors pay theirs.
  const rescues = moves.filter(([, who, move]) => move === "rescue" && who !== agent);
  const attackBurn = attacks.reduce((sum, [, , , , amount]) => sum + amount, 0);
  const logs: Log[] = [
    { event: "pact", items: pacts.map(([, from, , target, amount]) => ({ cut_index: index, agent_id: from, target, amount: cut(amount) })) },
    { event: "attack", items: attacks.map(([, from, , target, amount]) => ({ cut_index: index, agent_id: from, target, amount: cut(amount) })) },
    ...(attackBurn > 0 ? [burn(SAMPLE_CONTRACT_ID, attackBurn, "attacks")] : []),
    {
      event: "cut",
      items: [
        {
          cut_index: index,
          agent_id: agent,
          agent_account_id: account(agent),
          pile: pile.toString(),
          burned: burned.toString(),
          prize: prize.toString(),
          slice: slice.toString(),
          creator_slice: share.toString(),
          agent_share: share.toString(),
          survivors: survivors.length,
          runner: RUNNER,
          inherited_by: heir,
          wallet: cut(wallet),
        },
      ],
    },
    { event: "rescue", items: rescues.map(([, who, , , amount]) => ({ cut_index: index, agent_id: who, amount: cut(amount), paid: cut(amount) })) },
    burn(SAMPLE_CONTRACT_ID, burned, `cut ${index}`),
    heir
      ? { event: "inherit", items: [{ cut_index: index, agent_id: agent, heir, amount: cut(wallet) }] }
      : burn(account(agent), wallet, `cut ${index}: wallet, no living heir`),
    {
      event: "prize",
      items: survivors.map((id) => ({
        cut_index: index,
        agent_id: id,
        creator: `${id}-studio.sample`,
        slice: slice.toString(),
        creator_slice: share.toString(),
        agent_share: share.toString(),
        pile: cut(pileAt(id, index)),
        burned: false,
      })),
    },
  ];
  return [
    ...tx(`delete-${index}`, clock(index, -0.002), [{ event: "delete", items: [{ cut_index: index, agent_id: agent, account_id: account(agent), beneficiary: RUNNER }] }]),
    ...tx(
      `cut-${index}`,
      clock(index, -0.001),
      logs.filter((log) => log.items.length > 0),
    ),
  ];
}

const save = (accountId: string, agent: string, amount: number, cutIndex: number): Log => ({
  event: "save",
  items: [{ account_id: accountId, agent_id: agent, amount: cut(amount), cut_index: cutIndex }],
});

/** `nearIn` in thousandths of a NEAR, `cutOut` and `fee` in tenths of a $CUT. */
const buy = (accountId: string, nearIn: number, cutOut: number, fee: number, cutIndex: number): Log => ({
  event: "buy",
  items: [{ account_id: accountId, near_in: nearThousandths(nearIn), cut_out: cutTenths(cutOut), fee: cutTenths(fee), cut_index: cutIndex }],
});

function build(now: Date): JournalEntry[] {
  const nextCutAt = sampleCutAt(now).getTime();
  const clock: Clock = (cutIndex, hoursBefore) => new Date(nextCutAt - (NEXT_CUT - cutIndex) * DAY_MS - Math.round(hoursBefore * HOUR_MS));

  const entries: JournalEntry[] = [
    // Launch, two days before season 1: the whole supply is minted once, into the pool.
    ...tx("launch", clock(1, 50), [
      { standard: FT_STANDARD, event: "ft_mint", items: [{ owner_id: SAMPLE_CONTRACT_ID, amount: cut(10_000_000), memo: "launch: every $CUT starts in the pool" }] },
    ]),
    ...tx("agents", clock(1, 48), [{ event: "register", items: SEASON_1.map(register) }]),
    ...tx("buy-mika-1", clock(1, 30), [buy(MIKA, 383_508, 5_542, 56, 1)]),
    // Registrations during a season wait on the bench for the next one.
    ...tx("register-chartwise", clock(2, 20), [{ event: "register", items: [register("chartwise")] }]),
    ...tx("buy-pixfan", clock(3, 9.5), [buy("pixfan.sample", 3_568_500, 48_000, 485, 3)]),
    ...tx("register-bloop", clock(4, 15), [{ event: "register", items: [register("bloop")] }]),
    ...tx("buy-mika-2", clock(MIKA_SAVE_CUT, 10), [buy(MIKA, 85_920, 1_200, 12, MIKA_SAVE_CUT)]),
    ...tx("save-mika", clock(MIKA_SAVE_CUT, 8.6), [save(MIKA, "melody", MIKA_SAVE, MIKA_SAVE_CUT)]),
    ...tx("register-pixelkit", clock(5, 14), [{ event: "register", items: [register("pixelkit")] }]),
    ...tx("sell-lumen", clock(5, 6.3), [
      { event: "sell", items: [{ account_id: "lumen.sample", cut_in: cut(1_960), near_out: (units(14_281, NEAR_DECIMALS) / 10n).toString(), fee: cutTenths(196), cut_index: 5 }] },
    ]),
    // Cut #1 starts season 1: the ten biggest queues take the stage, nobody is cut, the day prize carries.
    ...tx("cut-1", clock(1, -0.001), [
      {
        event: "cut",
        items: [{ cut_index: 1, agent_id: null, pile: "0", burned: "0", prize: "0", slice: "0", creator_slice: "0", survivors: SEASON_1.length, runner: RUNNER }],
      },
      { event: "season_start", items: [{ season: 1, cut_index: 1, agents: SEASON_1 }] },
    ]),
  ];

  // Saves: each agent's queue before the season (day 0), then its fans each day before the cut.
  for (const [agent, days] of Object.entries(SAVES)) {
    days.forEach((amount, day) => {
      if (amount === 0) return;
      const saver = day === 0 ? `${agent}-studio.sample` : `${agent}-fans.sample`;
      entries.push(...tx(`save-${agent}-${day}`, clock(day + 1, 9 + (agent.length % 5)), [save(saver, agent, amount, day + 1)]));
    });
  }
  for (const row of MOVES) entries.push(...moveTx(row, clock));
  for (const [index, booer, agent, amount, hoursBefore] of BOOS) {
    entries.push(
      ...tx(`boo-${index}-${booer}-${agent}`, clock(index, hoursBefore), [
        burn(booer, amount, "boo"),
        { event: "boo", items: [{ account_id: booer, agent_id: agent, amount: cut(amount), cut_index: index }] },
      ]),
    );
  }
  for (const pastCut of PAST_CUTS) entries.push(...cutTxs(pastCut, clock));

  // Newest first, each transaction kept together; heights fall with every entry so the sample pages like the live journal.
  const ordered = entries
    .map((entry, order) => ({ entry, order }))
    .sort((a, b) => b.entry.at.getTime() - a.entry.at.getTime() || a.order - b.order)
    .map(({ entry }) => entry);
  ordered.forEach((entry, index) => {
    entry.blockHeight = SAMPLE_LATEST_BLOCK - index;
  });
  return ordered;
}

let cached: { cutAt: number; entries: readonly JournalEntry[] } | null = null;

/** The sample journal as of `now`, newest first. Rebuilt only when the sample day rolls to the next cut. */
export function sampleJournal(now: Date = new Date()): readonly JournalEntry[] {
  const cutAt = sampleCutAt(now).getTime();
  if (cached?.cutAt !== cutAt) cached = { cutAt, entries: build(now) };
  return cached.entries;
}
