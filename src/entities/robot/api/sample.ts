import { units } from "@/shared/lib/amount";
import type { Robot } from "../model/types";

// The design's fictional sample day (docs/design/SPEC-v19.md §2): day 2, Fri Nov 13 2026, 13:48 UTC.
const LAUNCH = new Date("2026-11-12T15:01:00Z");

const robot = (id: string, name: string, kind: string, pile: number, savers: number, today: number, status: Robot["status"] = "stage"): Robot => ({
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

export const SAMPLE_STAGE: Robot[] = [
  robot("pixie", "Pixie Volt", "AI streamer", 182_400, 412, 6_200),
  robot("lila", "Lila Loop", "Virtual influencer", 151_200, 377, 3_900),
  robot("oracle", "Oracle Toad", "AI agent", 139_800, 351, 4_400),
  robot("mabel", "Mabel Market", "Virtual influencer", 121_500, 298, 1_800),
  robot("melody", "Melody-9", "Virtual singer", 112_300, 287, 2_600),
  robot("yuna", "Yuna Star", "AI idol", 98_700, 264, 3_100),
  robot("gremlin", "Glitch Gremlin", "AI artist", 86_900, 233, 900),
  robot("velvet", "Velvet Vee", "Virtual model", 74_200, 205, 1_200),
  robot("onyx", "Onyx Moon", "Digital model", 61_800, 187, 400),
  robot("kiko", "Kiko Bun", "VTuber", 23_600, 96, 300),
];

export const SAMPLE_BENCH: Robot[] = [
  robot("chartwise", "Chartwise", "AI analyst", 88_400, 241, 0, "bench"),
  robot("bloop", "Bloop", "AI robot", 31_200, 102, 0, "bench"),
  robot("pixelkit", "Pixel Kit", "AI robot", 12_600, 47, 0, "bench"),
];
