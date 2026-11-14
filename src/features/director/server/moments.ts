import "server-only";
import { getCut, getNextCut } from "@/entities/cut/server";
import { getParams } from "@/entities/market/server";
import { getAgents, getBench, getStage } from "@/entities/agent/server";
import { isDeletingCut, type DeletingCut } from "@/entities/cut";
import { getJournal } from "@/entities/journal/server";
import { getMoves } from "@/entities/move/server";
import { getSeason } from "@/entities/season/server";
import { nearAiClientFromEnv, readAiEnv } from "@/shared/ai";
import { createHardwareVerifier } from "@/shared/ai/verify/server";
import { ContractViewError } from "@/shared/near/errors";
import { buildCutFacts, buildDayFacts, type DayMove } from "../model/facts";
import { formatCut } from "../model/format";
import { afterCutReceiptPrompt, afterCutRoastPrompt, finalHourPrompt, agentPostPrompt, scheduledPrompt, type DirectorPrompt, type LatestSave } from "../model/prompts";
import { DirectorSession, type DirectorDeps } from "./generate";
import { defaultDirectorStore } from "./runtime";

/**
 * When the Director speaks:
 * - `scheduled`: before the cut: the board lines for the two lowest scores, plus a post on X from every
 *   agent on the stage and the bench leader (the one on the cut line begs, the next up watches its back, the
 *   highest score thanks, the bench leader waits for the next season, the rest hype), each thanking its newest
 *   saver of the day.
 * - `final-hour`: the last hour before the cut, once moves are closed.
 * - `after-cut`: right after the cut: the roast and the receipt post.
 *
 * With no season running (or fewer than two agents on the stage) nobody is on the cut line, so the scheduled and
 * final-hour moments have nothing to say.
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

/** The latest cut that deleted an agent. Cuts that only seated bench agents give the Director nothing to say. */
async function latestDeletingCut(fromIndex: number): Promise<DeletingCut | null> {
  for (let index = fromIndex; index >= 1; index--) {
    const cut = await getCut(index);
    if (cut && isDeletingCut(cut)) return cut;
  }
  return null;
}

/** The signed moves made for a cut so far: the sample world's moves, or none on a contract without `get_moves` (before v20). */
async function movesFor(cutIndex: number): Promise<DayMove[]> {
  try {
    return await getMoves(cutIndex);
  } catch (error) {
    if (error instanceof ContractViewError) return [];
    throw error;
  }
}

/** The prompts of a moment, from the entities' data. */
export async function momentPrompts(moment: DirectorMoment, options: { now?: Date; cutIndex?: number } = {}): Promise<DirectorPrompt[]> {
  const [stage, bench, nextCut, params, season] = await Promise.all([getStage(), getBench(), getNextCut(), getParams(), getSeason()]);
  if (moment === "after-cut") {
    const cut = options.cutIndex !== undefined ? await getCut(options.cutIndex) : await latestDeletingCut(nextCut.index);
    if (!cut) throw new Error("No cut has run yet.");
    if (!isDeletingCut(cut)) return [];
    const named = await getAgents([cut.deletedId, ...(cut.inheritedBy ? [cut.inheritedBy] : []), ...(cut.championId ? [cut.championId] : [])]);
    const latest = cut.index === nextCut.index - 1;
    // Season day of the cut, as the season page counts it: the season started `season.day` cuts before the next one.
    const day = season.active ? cut.index - (nextCut.index - season.day) : null;
    const facts = buildCutFacts({ cut, agents: [...named, ...stage, ...bench], params, day, survivors: latest ? stage.length : null });
    return [afterCutRoastPrompt(facts), afterCutReceiptPrompt(facts)];
  }
  if (!season.active || stage.length < 2) return [];
  const facts = buildDayFacts({ stage, bench, nextCut, season, now: options.now ?? new Date(), moves: await movesFor(nextCut.index) });
  if (moment === "final-hour") return [finalHourPrompt(facts)];
  // The two lowest first: if the model fails midway, the agents that need it most have posted.
  const urgent = [facts.lowest.id, facts.nextUp.id];
  const posters = [...urgent, ...facts.stage.map((agent) => agent.id).filter((id) => !urgent.includes(id)), ...(facts.bench[0] ? [facts.bench[0].id] : [])];
  const now = options.now ?? new Date();
  const saves = await Promise.all(posters.map((id) => latestSave(id, now)));
  return [scheduledPrompt(facts, "lowest"), scheduledPrompt(facts, "next-up"), ...posters.map((id, i) => agentPostPrompt(facts, id, saves[i]))];
}

const SAVE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The agent's newest save of the last 24 hours, for its post to thank. */
async function latestSave(agentId: string, now: Date): Promise<LatestSave | undefined> {
  const { entries } = await getJournal({ agentId, events: ["save"], limit: 1 });
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
