import { NEAR_DECIMALS, units } from "@/shared/lib/amount";
import { CUT_STANDARD, eventRefs, FT_STANDARD } from "@/shared/near/events";
import type { JournalEntry } from "../model/types";

// The design's sample history (docs/design/SPEC-v19.md §2, Receipts.dc.html), newest first, as the indexer
// would store it: every `data` item has the fields `contracts/thecut/src/events.rs` emits, and the
// account, robot, cut and amount columns come from the same `eventRefs` the indexer uses.
// Launch is Thu Nov 12 15:01 UTC; cut #1 runs Fri Nov 13 18:00 UTC. Fictional hashes and heights.

export const SAMPLE_CONTRACT_ID = "thecut.near";
export const SAMPLE_LATEST_BLOCK = 186_920_114;

const cut = (whole: number) => units(whole).toString();
const cutTenths = (tenths: number) => (units(tenths) / 10n).toString();
const nearTenths = (tenths: number) => (units(tenths, NEAR_DECIMALS) / 10n).toString();
const ns = (iso: string) => (BigInt(Date.parse(iso)) * 1_000_000n).toString();

type Item = Record<string, unknown>;
type Log = { event: string; items: Item[]; standard?: string };

/** One transaction's logs, newest first: later logs (and later items) sit higher in the journal. */
function tx(name: string, at: string, logs: Log[]): JournalEntry[] {
  const entries: JournalEntry[] = [];
  logs.forEach((log, logIndex) =>
    log.items.forEach((data, itemIndex) => {
      entries.push({
        id: `sample-${name}:${logIndex}:${itemIndex}`,
        standard: log.standard ?? CUT_STANDARD,
        event: log.event,
        at: new Date(at),
        txHash: `sample-tx-${name}`,
        blockHeight: 0,
        ...eventRefs(data, log.event),
        data,
      });
    }),
  );
  return entries.reverse();
}

const STAGE = ["pixie", "lila", "oracle", "mabel", "melody", "yuna", "gremlin", "velvet", "onyx", "kiko"] as const;
const ROBOT_NAMES: Record<string, [name: string, kind: string]> = {
  pixie: ["Pixie Volt", "AI streamer"],
  lila: ["Lila Loop", "Virtual influencer"],
  oracle: ["Oracle Toad", "AI agent"],
  mabel: ["Mabel Market", "Virtual influencer"],
  melody: ["Melody-9", "Virtual singer"],
  yuna: ["Yuna Star", "AI idol"],
  gremlin: ["Glitch Gremlin", "AI artist"],
  velvet: ["Velvet Vee", "Virtual model"],
  onyx: ["Onyx Moon", "Digital model"],
  kiko: ["Kiko Bun", "VTuber"],
  chartwise: ["Chartwise", "AI analyst"],
  bloop: ["Bloop", "AI robot"],
  pixelkit: ["Pixel Kit", "AI robot"],
};
const SURVIVOR_PILES: Record<string, number> = {
  pixie: 182_400,
  lila: 151_200,
  oracle: 139_800,
  mabel: 121_500,
  melody: 112_300,
  yuna: 98_700,
  gremlin: 86_900,
  velvet: 74_200,
  onyx: 61_800,
};

const register = (id: string): Item => {
  const [name, kind] = ROBOT_NAMES[id] ?? [id, "AI robot"];
  return {
    robot_id: id,
    account_id: `${id}.${SAMPLE_CONTRACT_ID}`,
    creator: `${id}-studio.near`,
    name,
    kind,
    x_handle: `@${name.replace(/[^A-Za-z0-9]/g, "")}Cut`,
    deposit: units(5, NEAR_DECIMALS).toString(),
  };
};

const buy = (account: string, nearIn: number, cutOut: number, fee: number): Log[] => [
  { event: "buy", items: [{ account_id: account, near_in: nearTenths(nearIn), cut_out: cutTenths(cutOut), fee: cutTenths(fee), cut_index: 1 }] },
  { event: "fee", items: [{ account_id: account, amount: cutTenths(fee), source: "buy", cut_index: 1 }] },
];

const save = (account: string, robot: string, amount: number, pile: number): Log => ({
  event: "save",
  items: [{ account_id: account, robot_id: robot, amount: cut(amount), total: cut(amount), pile: cut(pile), cut_index: 1 }],
});

const SLICE = cutTenths(17_754);
const CREATOR_SLICE = cutTenths(934);

const HISTORY: JournalEntry[] = [
  // Cut #1, run by bob.near: Kiko Bun's 23,600 is cut, half burns, 9 equal slices, Chartwise takes the seat.
  ...tx("delete-1", "2026-11-13T18:00:03Z", [
    { event: "delete", items: [{ cut_index: 1, robot_id: "kiko", account_id: `kiko.${SAMPLE_CONTRACT_ID}`, beneficiary: "bob.near" }] },
  ]),
  ...tx("cut-1", "2026-11-13T18:00:01Z", [
    { standard: FT_STANDARD, event: "ft_burn", items: [{ owner_id: SAMPLE_CONTRACT_ID, amount: cut(11_800), memo: "cut 1" }] },
    {
      event: "cut",
      items: [
        {
          cut_index: 1,
          robot_id: "kiko",
          robot_account_id: `kiko.${SAMPLE_CONTRACT_ID}`,
          pile: cut(23_600),
          burned: cut(11_800),
          prize: cut(16_820),
          slice: SLICE,
          creator_slice: CREATOR_SLICE,
          survivors: 9,
          runner: "bob.near",
          creator_refund: (units(45, NEAR_DECIMALS) / 10n).toString(),
          next_cut_at: ns("2026-11-14T18:00:00Z"),
        },
      ],
    },
    {
      event: "prize",
      items: Object.entries(SURVIVOR_PILES).map(([id, pile]) => ({
        cut_index: 1,
        robot_id: id,
        creator: `${id}-studio.near`,
        slice: SLICE,
        creator_slice: CREATOR_SLICE,
        pile: cut(pile),
        burned: false,
      })),
    },
    { event: "join", items: [{ cut_index: 1, robot_id: "chartwise", pile: cut(88_400) }] },
  ]),
  // Day 2, before the cut.
  ...tx("save-mika", "2026-11-13T13:41:00Z", [save("mika.near", "melody", 400, 112_300)]),
  ...tx("sell-lumen", "2026-11-13T13:22:00Z", [
    { event: "sell", items: [{ account_id: "lumen.near", cut_in: cut(1_960), near_out: nearTenths(14_281), fee: cutTenths(196), cut_index: 1 }] },
    { event: "fee", items: [{ account_id: "lumen.near", amount: cutTenths(196), source: "sell", cut_index: 1 }] },
  ]),
  ...tx("save-bunfan", "2026-11-13T12:58:00Z", [save("bunfan.near", "kiko", 300, 23_600)]),
  ...tx("buy-pixfan", "2026-11-13T11:30:00Z", buy("pixfan.near", 35_685, 48_000, 485)),
  ...tx("buy-mika-2", "2026-11-13T09:14:00Z", buy("mika.near", 859, 1_200, 12)),
  ...tx("register-pixelkit", "2026-11-13T08:02:00Z", [{ event: "register", items: [register("pixelkit")] }]),
  ...tx("register-bloop", "2026-11-12T19:40:00Z", [{ event: "register", items: [register("bloop")] }]),
  // Day 1: launch.
  ...tx("register-chartwise", "2026-11-12T16:12:00Z", [{ event: "register", items: [register("chartwise")] }]),
  ...tx("buy-mika-1", "2026-11-12T15:20:00Z", buy("mika.near", 3_835, 5_542, 56)),
  ...tx("stage", "2026-11-12T15:01:30Z", [{ event: "join", items: STAGE.map((id) => ({ cut_index: 0, robot_id: id, pile: cut(0) })) }]),
  ...tx("robots", "2026-11-12T15:01:20Z", [{ event: "register", items: STAGE.map(register) }]),
  ...tx("launch", "2026-11-12T15:01:00Z", [
    { standard: FT_STANDARD, event: "ft_mint", items: [{ owner_id: SAMPLE_CONTRACT_ID, amount: cut(10_000_000), memo: "launch: every $CUT starts in the pool" }] },
  ]),
];

// Heights fall with every entry, newest first, so the sample pages like the live journal.
HISTORY.forEach((entry, index) => {
  entry.blockHeight = SAMPLE_LATEST_BLOCK - index;
});

export const SAMPLE_JOURNAL: readonly JournalEntry[] = HISTORY;
