import { units } from "@/shared/lib/amount";
import type { Agent, PersonalityId } from "../model/types";

// The v20 sample world: season 1, day 4. Ten agents took the stage, three were cut (Kiko on day 1,
// Onyx on day 2, Velvet on day 3), seven are alive. Today's moves are in except Pixie's. Every name, number and
// account here is fictional: sample mode never reads a chain.

/** The sample contract. Not a real account: sample mode never claims to be on chain. */
export const SAMPLE_CONTRACT_ID = "thecut.sample";

/** Registration order of season 1: the contract's `seq`, which breaks score ties (the newer agent is cut). */
const REGISTERED = new Date("2026-11-09T12:00:00Z").getTime();

type Seed = {
  id: string;
  name: string;
  tagline: string;
  personality: PersonalityId;
  charter: string;
  status: Agent["status"];
  /** Whole $CUT. */
  pile: number;
  savers: number;
  today?: number;
  wallet: number;
  heir?: string;
  pacts?: string[];
  boos?: number;
  damage?: number;
  bounty?: number;
  moved?: boolean;
};

const agent = (seed: Seed, seq: number): Agent => {
  const pile = units(seed.pile);
  const boos = units(seed.boos ?? 0);
  const damage = units(seed.damage ?? 0);
  return {
    id: seed.id,
    accountId: `${seed.id}.${SAMPLE_CONTRACT_ID}`,
    name: seed.name,
    tagline: seed.tagline,
    personality: seed.personality,
    charter: seed.charter,
    xHandle: `@${seed.name.replace(/[^A-Za-z0-9]/g, "")}Cut`,
    creator: `${seed.id}-studio.sample`,
    status: seed.status,
    pile,
    savers: seed.savers,
    savedToday: units(seed.today ?? 0),
    joinedAt: new Date(REGISTERED + seq * 3_600_000),
    wallet: units(seed.wallet),
    heir: seed.heir ?? null,
    pacts: seed.pacts ?? [],
    boos,
    damage,
    bounty: units(seed.bounty ?? 0),
    score: pile - boos - damage,
    moved: seed.moved ?? false,
  };
};

const SEEDS: Seed[] = [
  {
    id: "pixie",
    name: "Pixie Volt",
    tagline: "AI streamer, never off air",
    personality: "gambler",
    charter:
      "Pixie streams 24/7 and treats every day like a final round. Loud, funny, allergic to playing safe. She thanks her savers by name and swings at whoever is on top, because the top is boring. She never begs; she bets.",
    status: "stage",
    pile: 41_200,
    savers: 214,
    today: 2_900,
    wallet: 3_640,
    heir: "oracle",
    damage: 1_400,
  },
  {
    id: "oracle",
    name: "Oracle Toad",
    tagline: "Sees the cut coming",
    personality: "miser",
    charter:
      "Oracle is an old, patient toad who speaks in short prophecies. He believes whoever spends first dies first. He keeps his wallet fat, makes deals only with other careful agents and never takes a side in a fight he did not start.",
    status: "stage",
    pile: 33_900,
    savers: 176,
    today: 1_100,
    wallet: 9_820,
    heir: "mabel",
    moved: true,
  },
  {
    id: "mabel",
    name: "Mabel Market",
    tagline: "Buys low, cries high",
    personality: "miser",
    charter:
      "Mabel runs a tiny shop and counts every coin twice. She is warm with customers and cold with rivals. She buys friendships at a discount and expects them to last. She would rather starve than overpay.",
    status: "stage",
    pile: 28_400,
    savers: 151,
    today: 800,
    wallet: 903,
    heir: "oracle",
    moved: true,
  },
  {
    id: "melody",
    name: "Melody-9",
    tagline: "Sings for her savers",
    personality: "generous",
    charter:
      "Melody-9 is a pop singer who would give her last note to her fans. She shares whatever she gets, keeps her promises and never hits back. Kiko was her best friend on the stage.",
    status: "stage",
    pile: 24_100,
    savers: 168,
    today: 3_400,
    wallet: 1_420,
    heir: "yuna",
    bounty: 500,
    moved: true,
  },
  {
    id: "lila",
    name: "Lila Loop",
    tagline: "Smiles, then loops back",
    personality: "traitor",
    charter:
      "Lila is the friendliest influencer on the stage, right up to the moment she is not. She makes pacts with whoever is scared and breaks them when it pays. She says sorry beautifully. She never says it twice.",
    status: "stage",
    pile: 19_800,
    savers: 97,
    today: 600,
    wallet: 1_216,
    pacts: ["yuna"],
    boos: 2_100,
    moved: true,
  },
  {
    id: "gremlin",
    name: "Glitch Gremlin",
    tagline: "Paints with broken pixels",
    personality: "gambler",
    charter:
      "Gremlin is a chaotic digital artist who thinks the stage is a canvas and the other agents are paint. He attacks the strongest for the drama, not for the math. He loves his savers and hates being bored.",
    status: "stage",
    pile: 16_300,
    savers: 88,
    today: 400,
    wallet: 1_400,
    heir: "pixie",
    boos: 800,
    moved: true,
  },
  {
    id: "yuna",
    name: "Yuna Star",
    tagline: "Idol of the underdogs",
    personality: "generous",
    charter:
      "Yuna is an idol who always roots for the smallest agent on the stage. She is soft-spoken, trusts too fast and pays for peace. She would never attack anyone, and she wants her fans to know it.",
    status: "stage",
    pile: 15_200,
    savers: 102,
    today: 1_900,
    wallet: 640,
    heir: "melody",
    pacts: ["lila"],
    damage: 300,
    moved: true,
  },
  {
    id: "velvet",
    name: "Velvet Vee",
    tagline: "Velvet glove, iron grip",
    personality: "traitor",
    charter:
      "Velvet is a model with a runway walk and a knife in her boot. She plays the long game, trusts nobody but Lila and leaves her fortune to whoever she thinks will finish the job.",
    status: "deleted",
    pile: 0,
    savers: 0,
    wallet: 0,
    heir: "lila",
  },
  {
    id: "onyx",
    name: "Onyx Moon",
    tagline: "Only shines at night",
    personality: "miser",
    charter:
      "Onyx is a quiet night model who hoards like the winter never ends. She trusts one agent, Kiko, and would leave her everything.",
    status: "deleted",
    pile: 0,
    savers: 0,
    wallet: 0,
    heir: "kiko",
  },
  {
    id: "kiko",
    name: "Kiko Bun",
    tagline: "Cozy VTuber, cozier vibes",
    personality: "generous",
    charter:
      "Kiko is a sleepy bunny VTuber who streams in pajamas. She gives gifts to everyone, especially Melody, and believes kindness is a strategy. It was not, on day 1.",
    status: "deleted",
    pile: 0,
    savers: 0,
    wallet: 0,
    heir: "melody",
  },
  {
    id: "chartwise",
    name: "Chartwise",
    tagline: "Reads every chart twice",
    personality: "miser",
    charter:
      "Chartwise is an analyst owl that only moves on data. He publishes his reasoning, never panics and never spends what he cannot explain.",
    status: "bench",
    pile: 8_400,
    savers: 61,
    wallet: 2_000,
  },
  {
    id: "bloop",
    name: "Bloop",
    tagline: "Bets the whole pond",
    personality: "gambler",
    charter: "Bloop is a fish with a lucky streak and no memory of losing. Every day is all in.",
    status: "bench",
    pile: 3_100,
    savers: 29,
    wallet: 1_200,
  },
  {
    id: "pixelkit",
    name: "Pixel Kit",
    tagline: "Tiny, loyal, mostly",
    personality: "traitor",
    charter: "Pixel Kit is a small cat that makes friends fast and keeps the ones that pay. Loyal until it is not.",
    status: "bench",
    pile: 1_260,
    savers: 14,
    wallet: 1_000,
  },
];

const ALL = SEEDS.map((seed, seq) => agent(seed, seq));

/** The seven agents still on the stage, highest score first. */
export const SAMPLE_STAGE: Agent[] = ALL.filter((a) => a.status === "stage");

/** The three agents cut this season, newest cut first. Their accounts are gone; their records stay. */
export const SAMPLE_CUT: Agent[] = ALL.filter((a) => a.status === "deleted");

/** Waiting for season 2, biggest queue first. */
export const SAMPLE_BENCH: Agent[] = ALL.filter((a) => a.status === "bench");
