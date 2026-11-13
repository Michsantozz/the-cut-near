import "server-only";
import { getCut, getNextCut } from "@/entities/cut/server";
import { getParams } from "@/entities/market/server";
import { getBench, getStage } from "@/entities/robot/server";
import type { CutRecord } from "@/entities/cut";
import { nearAiClientFromEnv, readAiEnv } from "@/shared/ai";
import { createHardwareVerifier } from "@/shared/ai/verify/server";
import { buildCutFacts, buildDayFacts } from "../model/facts";
import { afterCutReceiptPrompt, afterCutRoastPrompt, finalHourPrompt, robotPostPrompt, scheduledPrompt, type DirectorPrompt } from "../model/prompts";
import { DirectorSession, type DirectorDeps } from "./generate";
import { defaultDirectorStore } from "./runtime";

/**
 * When the Director speaks:
 * - `scheduled`: before the cut: the board lines for the two lowest piles, plus robot posts on X
 *   (the lowest begs, the next up pitches its slice, the top pile thanks, the bench leader waits).
 * - `final-hour`: at 17:00 UTC.
 * - `after-cut`: right after the cut: the roast and the receipt post.
 */
export type DirectorMoment = "scheduled" | "final-hour" | "after-cut";

export type DirectorRunReport = {
  moment: DirectorMoment;
  model: string;
  lines: { id: string; kind: string; subjectId: string | null; text: string; proofStatus: string }[];
  failures: { kind: string; subjectId: string | null; error: string }[];
};

/** Deps from the environment: NEAR_AI_* settings and the default store. Throws a `config` NearAiError without an API key. */
export function directorDepsFromEnv(): DirectorDeps {
  const env = readAiEnv();
  return {
    client: nearAiClientFromEnv(env),
    store: defaultDirectorStore(),
    model: env.NEAR_AI_MODEL,
    signingAlgo: env.NEAR_AI_SIGNING_ALGO,
    hardware: env.NEAR_AI_HARDWARE_CHECKS === "on" ? createHardwareVerifier() : null,
    reasoningEffort: env.NEAR_AI_REASONING_EFFORT === "none" ? undefined : env.NEAR_AI_REASONING_EFFORT,
  };
}

async function latestCut(fromIndex: number): Promise<CutRecord | null> {
  for (let index = fromIndex; index >= 1; index--) {
    const cut = await getCut(index);
    if (cut) return cut;
  }
  return null;
}

/** The prompts of a moment, from the entities' data. */
export async function momentPrompts(moment: DirectorMoment, options: { now?: Date; cutIndex?: number } = {}): Promise<DirectorPrompt[]> {
  const [stage, bench, nextCut, params] = await Promise.all([getStage(), getBench(), getNextCut(), getParams()]);
  if (moment === "after-cut") {
    const cut = options.cutIndex !== undefined ? await getCut(options.cutIndex) : await latestCut(nextCut.index);
    if (!cut) throw new Error("No cut has run yet.");
    const facts = buildCutFacts({ cut, robots: [...stage, ...bench], params });
    return [afterCutRoastPrompt(facts), afterCutReceiptPrompt(facts)];
  }
  const facts = buildDayFacts({ stage, bench, nextCut, params, now: options.now ?? new Date() });
  if (moment === "final-hour") return [finalHourPrompt(facts)];
  const posters = [facts.lowest.id, facts.nextUp.id, facts.top.id, ...(facts.bench[0] ? [facts.bench[0].id] : [])];
  return [scheduledPrompt(facts, "lowest"), scheduledPrompt(facts, "next-up"), ...posters.map((id) => robotPostPrompt(facts, id))];
}

/**
 * Runs a moment: one attestation, then each line in turn. A line that fails is reported and the rest go on.
 * Meant for the keeper cron (17:00 final hour, 18:00 after the cut, and a scheduled run before).
 */
export async function runDirectorMoment(moment: DirectorMoment, options: { deps?: DirectorDeps; now?: Date; cutIndex?: number } = {}): Promise<DirectorRunReport> {
  const deps = options.deps ?? directorDepsFromEnv();
  const prompts = await momentPrompts(moment, options);
  const session = new DirectorSession(deps);
  await session.attestation();
  const report: DirectorRunReport = { moment, model: deps.model, lines: [], failures: [] };
  for (const prompt of prompts) {
    try {
      const line = await session.generate(prompt);
      report.lines.push({ id: line.id, kind: line.kind, subjectId: line.subjectId, text: line.text ?? "", proofStatus: line.proof?.status ?? "unavailable" });
    } catch (error) {
      report.failures.push({ kind: prompt.kind, subjectId: prompt.subjectId, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return report;
}
