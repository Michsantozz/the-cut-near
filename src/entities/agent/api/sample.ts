import { units } from "@/shared/lib/amount";
import type { Agent } from "../model/types";

// The design's fictional sample day (docs/design/SPEC-v19.md §2): day 2, Fri Nov 13 2026, 13:48 UTC.
const LAUNCH = new Date("2026-11-12T15:01:00Z");

const agent = (id: string, name: string, kind: string, pile: number, savers: number, today: number, status: Agent["status"] = "stage"): Agent => ({
  id,
  accountId: `${id}.thecut.near`,
  name,
  kind,
  xHandle: `@${name.replace(/[^A-Za-z0-9]/g, "")}Cut`,
  creator: `${id}-studio.near`,
  status,
  pile: units(pile),
  savers,
  savedToday: units(today),
  joinedAt: status === "stage" ? LAUNCH : new Date("2026-11-12T16:12:00Z"),
});

export const SAMPLE_STAGE: Agent[] = [
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

export const SAMPLE_BENCH: Agent[] = [
  agent("chartwise", "Chartwise", "AI analyst", 88_400, 241, 0, "bench"),
  agent("bloop", "Bloop", "AI agent", 31_200, 102, 0, "bench"),
  agent("pixelkit", "Pixel Kit", "AI agent", 12_600, 47, 0, "bench"),
];
