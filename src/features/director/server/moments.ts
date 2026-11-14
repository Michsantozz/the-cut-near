import "server-only";
import { getCut, getNextCut } from "@/entities/cut/server";
import { getParams } from "@/entities/market/server";
import { getBench, getStage } from "@/entities/robot/server";
import { isDeletingCut, type DeletingCut } from "@/entities/cut";
import { getJournal } from "@/entities/journal/server";
import { nearAiClientFromEnv, readAiEnv } from "@/shared/ai";
import { createHardwareVerifier } from "@/shared/ai/verify/server";
import { buildCutFacts, buildDayFacts } from "../model/facts";
import { formatCut } from "../model/format";
import { afterCutReceiptPrompt, afterCutRoastPrompt, finalHourPrompt, robotPostPrompt, scheduledPrompt, type DirectorPrompt, type LatestSave } from "../model/prompts";
import { DirectorSession, type DirectorDeps } from "./generate";
import { defaultDirectorStore } from "./runtime";

/**
 * When the Director speaks:
 * - `scheduled`: before the cut: the board lines for the two lowest piles, plus a post on X from every
 *   robot on the stage and the bench leader (the lowest begs, the next up pitches its slice, the top
 *   pile thanks, the bench leader waits, the rest hype), each thanking its newest saver of the day.
 * - `final-hour`: at 17:00 UTC.
 * - `after-cut`: right after the cut: the roast and the receipt post.
 */
export type DirectorMoment = "scheduled" | "final-hour" | "after-cut";

export type DirectorRunReport = {
  moment: DirectorMoment;
  model: string;
  lines: { id: string; kind: string; subjectId: string | null; text: string; proofStatus: string }[];
  failures: { kind: string; subjectId: string | null; error: string }[];
  /** Lines this moment already has for the same cut, from an earlier or duplicate run. */
  skipped: { kind: string; subjectId: string | null }[];
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

/** The latest cut that deleted a robot. Cuts that only seated bench robots give the Director nothing to say. */
async function latestDeletingCut(fromIndex: number): Promise<DeletingCut | null> {
  for (let index = fromIndex; index >= 1; index--) {
    const cut = await getCut(index);
    if (cut && isDeletingCut(cut)) return cut;
  }
  return null;
}

/** The prompts of a moment, from the entities' data. */
export async function momentPrompts(moment: DirectorMoment, options: { now?: Date; cutIndex?: number } = {}): Promise<DirectorPrompt[]> {
  const [stage, bench, nextCut, params] = await Promise.all([getStage(), getBench(), getNextCut(), getParams()]);
  if (moment === "after-cut") {
    const cut = options.cutIndex !== undefined ? await getCut(options.cutIndex) : await latestDeletingCut(nextCut.index);
    if (!cut) throw new Error("No cut has run yet.");
    if (!isDeletingCut(cut)) return [];
    const facts = buildCutFacts({ cut, robots: [...stage, ...bench], params });
    return [afterCutRoastPrompt(facts), afterCutReceiptPrompt(facts)];
  }
  const facts = buildDayFacts({ stage, bench, nextCut, params, now: options.now ?? new Date() });
  if (moment === "final-hour") return [finalHourPrompt(facts)];
  // The two lowest first: if the model fails midway, the robots that need it most have posted.
  const urgent = [facts.lowest.id, facts.nextUp.id];
  const posters = [...urgent, ...facts.stage.map((robot) => robot.id).filter((id) => !urgent.includes(id)), ...(facts.bench[0] ? [facts.bench[0].id] : [])];
  const now = options.now ?? new Date();
  const saves = await Promise.all(posters.map((id) => latestSave(id, now)));
  return [scheduledPrompt(facts, "lowest"), scheduledPrompt(facts, "next-up"), ...posters.map((id, i) => robotPostPrompt(facts, id, saves[i]))];
}

const SAVE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The robot's newest save of the last 24 hours, for its post to thank. */
async function latestSave(robotId: string, now: Date): Promise<LatestSave | undefined> {
  const { entries } = await getJournal({ robotId, events: ["save"], limit: 1 });
  const save = entries[0];
  if (!save?.accountId || !save.amount || now.getTime() - save.at.getTime() > SAVE_WINDOW_MS) return undefined;
  return { account: save.accountId, amount: formatCut(save.amount) };
}

const promptKey = (line: { kind: string; subjectId: string | null; cutIndex: number | null }) => `${line.kind}|${line.subjectId ?? ""}|${line.cutIndex ?? ""}`;

/** Lines the moment already has for its cut. Crons may fire twice, and each line costs a signed completion. */
async function doneKeys(deps: DirectorDeps, prompts: DirectorPrompt[]): Promise<Set<string>> {
  const kinds = [...new Set(prompts.map((prompt) => prompt.kind))];
  if (kinds.length === 0) return new Set();
  const lines = await deps.store.latestLines({ kinds, provenOnly: false, limit: 100 });
  return new Set(lines.map(promptKey));
}

/**
 * Runs a moment: one attestation, then each line in turn. A line that fails is reported and the rest go on.
 * Lines the moment already has for the same cut are skipped, so a repeated run costs nothing.
 * Meant for the keeper cron (17:00 final hour, 18:00 after the cut, and a scheduled run before).
 */
export async function runDirectorMoment(moment: DirectorMoment, options: { deps?: DirectorDeps; now?: Date; cutIndex?: number } = {}): Promise<DirectorRunReport> {
  const deps = options.deps ?? directorDepsFromEnv();
  const all = await momentPrompts(moment, options);
  const done = await doneKeys(deps, all);
  const prompts = all.filter((prompt) => !done.has(promptKey(prompt)));
  const report: DirectorRunReport = { moment, model: deps.model, lines: [], failures: [], skipped: all.filter((prompt) => done.has(promptKey(prompt))).map(({ kind, subjectId }) => ({ kind, subjectId })) };
  if (prompts.length === 0) return report;
  const session = new DirectorSession(deps);
  await session.attestation();
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
