import type { Agent } from "@/entities/agent";
import type { DeletingCut, NextCut } from "@/entities/cut";
import type { Params } from "@/entities/market";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";

// The v19 design day (docs/design/SPEC-v19.md §2), frozen for the Director's tests: day 2, Fri Nov 13 2026,
// 13:48 UTC, ten agents ranked by pile, Kiko lowest. The app's sample world moved on to SPEC-v20; these tests
// check the Director's facts and prompts on a fixed world, so they keep their own.

export const V19_NOW = new Date("2026-11-13T13:48:00Z");

const LAUNCH = new Date("2026-11-12T15:01:00Z");

const agent = (id: string, name: string, tagline: string, pile: number, savers: number, today: number, status: Agent["status"] = "stage"): Agent => ({
  id,
  accountId: `${id}.thecut.near`,
  name,
  tagline,
  personality: "miser",
  charter: "",
  xHandle: `@${name.replace(/[^A-Za-z0-9]/g, "")}Cut`,
  creator: `${id}-studio.near`,
  status,
  pile: units(pile),
  savers,
  savedToday: units(today),
  joinedAt: status === "stage" ? LAUNCH : new Date("2026-11-12T16:12:00Z"),
  wallet: 0n,
  heir: null,
  pacts: [],
  boos: 0n,
  damage: 0n,
  bounty: 0n,
  score: units(pile),
  moved: false,
});

export const V19_STAGE: Agent[] = [
  agent("pixie", "Pixie Volt", "AI streamer", 182_400, 412, 6_200),
  agent("lila", "Lila Loop", "Virtual influencer", 151_200, 377, 3_900),
  agent("oracle", "Oracle Toad", "AI agent", 139_800, 351, 4_400),
  agent("mabel", "Mabel Market", "Virtual influencer", 121_500, 298, 1_800),
  agent("melody", "Melody-9", "Virtual singer", 112_300, 287, 2_600),
  agent("yuna", "Yuna Star", "AI idol", 98_700, 264, 3_100),
  agent("gremlin", "Glitch Gremlin", "AI artist", 86_900, 233, 900),
  agent("velvet", "Velvet Vee", "Virtual model", 74_200, 205, 1_200),
  agent("onyx", "Onyx Moon", "Digital model", 61_800, 187, 400),
  agent("kiko", "Kiko Bun", "VTuber", 23_600, 96, 300),
];

export const V19_BENCH: Agent[] = [
  agent("chartwise", "Chartwise", "AI analyst", 88_400, 241, 0, "bench"),
  agent("bloop", "Bloop", "AI agent", 31_200, 102, 0, "bench"),
  agent("pixelkit", "Pixel Kit", "AI agent", 12_600, 47, 0, "bench"),
];

export const V19_NEXT_CUT: NextCut = {
  index: 1,
  at: new Date("2026-11-13T18:00:00Z"),
  movesCloseAt: new Date("2026-11-13T17:00:00Z"),
  lowestId: "kiko",
  gapToNext: units(38_201),
  prizeSoFar: units(4_100),
};

export const V19_FIRST_CUT: DeletingCut = {
  index: 1,
  at: new Date("2026-11-13T18:00:00Z"),
  deletedId: "kiko",
  pile: units(23_600),
  burned: units(11_800),
  prize: units(16_820),
  slice: units(17_754) / 10n,
  creatorSlice: units(934) / 10n,
  joinedId: "chartwise",
  inheritedBy: null,
  wallet: null,
  championId: null,
  potPaid: 0n,
  seatedIds: [],
  runner: "bob.near",
};

export const V19_PARAMS: Params = {
  totalSupply: units(10_000_000),
  feeBps: 100,
  potBps: 0,
  burnBps: 5_000,
  saversBps: 9_500,
  agentsBps: 0,
  stageSize: 10,
  minSeason: 3,
  firstCutAt: new Date("2026-11-13T18:00:00Z"),
  cutIntervalMs: 86_400_000,
  moveLeadMs: 3_600_000,
  thinkFee: units(10),
  minSeed: units(1_000),
  agentFunding: units(5, NEAR_DECIMALS) / 10n,
  registerDeposit: units(5, NEAR_DECIMALS),
  modelId: "z-ai/glm-5.3-flash",
};
