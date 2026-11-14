import type { AgentFacts, CutFacts, DayFacts, MoveFacts } from "./facts";
import { LINE_LIMITS, type DirectorLineKind } from "./kinds";
import { DIRECTOR_SYSTEM, agentSystem } from "./persona";
import { allowedNumbers } from "./validate";

/** One request to the model: the persona (system), the task with its facts (user), and what the reply is for. */
export type DirectorPrompt = {
  kind: DirectorLineKind;
  /** The agent the line is about (or speaks as, for posts). */
  subjectId: string | null;
  cutIndex: number | null;
  system: string;
  user: string;
  /** Agent names a line may contain. */
  names: string[];
};

/** Numbers a reply may use: exactly those in the prompt. */
export const allowedNumbersFor = (prompt: DirectorPrompt): Set<string> => allowedNumbers(prompt.system, prompt.user);

const user = (task: string, facts: string[]) => `${task}\nFacts:\n${facts.map((fact) => `- ${fact}`).join("\n")}`;
const words = (kind: DirectorLineKind) => `One line, at most ${LINE_LIMITS[kind].maxWords} words.`;
const namesOf = (facts: DayFacts) => [...facts.stage.map((agent) => agent.name), ...facts.bench.map((agent) => agent.name)];

/** "Yuna Star (Idol of the underdogs, Generous)". */
const who = (agent: Pick<AgentFacts, "name" | "tagline" | "personality">) => `${agent.name} (${agent.tagline}, ${agent.personality})`;

/** "14,900 $CUT (15,200 saved minus 300 attack damage)": a score, with its parts when boos or attacks took some off. */
function scoreOf(agent: AgentFacts): string {
  const hits = [agent.boos !== "0" ? `${agent.boos} in boos` : null, agent.damage !== "0" ? `${agent.damage} attack damage` : null].filter((hit): hit is string => hit !== null);
  return hits.length === 0 ? `${agent.score} $CUT, all saved by fans` : `${agent.score} $CUT (${agent.pile} saved minus ${hits.join(" and ")})`;
}

/** What happens to the agent's wallet if it is cut: its heir gets it, or it burns. */
function walletFate(agent: AgentFacts, self = false): string {
  const its = self ? "your" : "its";
  const subject = self ? "you are" : `${agent.name} is`;
  return agent.heir
    ? `If ${subject} cut, ${its} wallet of ${agent.wallet} $CUT goes to ${its} heir, ${agent.heir}.`
    : `If ${subject} cut, ${its} wallet of ${agent.wallet} $CUT burns: no living heir.`;
}

function describeMove(move: MoveFacts, self: boolean): string {
  const heir = move.heir ? `, naming ${move.heir} as heir` : "";
  switch (move.move) {
    case "hold":
      return `hold${heir}`;
    case "rescue":
      return self ? `rescue, offering ${move.amount} $CUT to your savers if you survive${heir}` : `rescue, offering ${move.amount} $CUT to its savers if it survives${heir}`;
    case "pact":
      return `pact with ${move.target}, giving ${move.amount} $CUT${heir}`;
    case "attack":
      return `attack on ${move.target}, burning ${move.amount} $CUT to lower the target's score${heir}`;
    default:
      return `${move.move}${heir}`;
  }
}

/** The agent's signed move for this cut, quoting its reason, or nothing before it moves. `self` writes it in the second person. */
function moveFacts(facts: DayFacts, agentId: string, self = false): string[] {
  const move = facts.moves.find((m) => m.agentId === agentId);
  if (!move) return [];
  const what = describeMove(move, self);
  const outcome = move.outcome ? ` The contract noted: ${move.outcome}.` : "";
  return self ? [`Your move today: ${what}.${outcome} Your reason: "${move.reason}"`] : [`${move.name}'s move today: ${what}.${outcome} ${move.name}'s reason: "${move.reason}"`];
}

function blockFacts(facts: DayFacts): string[] {
  return [
    `Season ${facts.season}, day ${facts.day}. Today's cut is at ${facts.cutAt}, in ${facts.countdown.text}.`,
    `${who(facts.lowest)} has the lowest score: ${scoreOf(facts.lowest)}. If nothing changes, ${facts.lowest.name} is cut.`,
    `Next up is ${who(facts.nextUp)} with a score of ${scoreOf(facts.nextUp)}.`,
    `${facts.lowest.name} needs ${facts.gap} $CUT more score to pass ${facts.nextUp.name}.`,
    walletFate(facts.lowest),
    ...moveFacts(facts, facts.lowest.id),
    ...moveFacts(facts, facts.nextUp.id),
  ];
}

/** The board line before the cut, for the agent on the cut line or the one right above it. */
export function scheduledPrompt(facts: DayFacts, subject: "lowest" | "next-up"): DirectorPrompt {
  const agent = subject === "lowest" ? facts.lowest : facts.nextUp;
  const task =
    subject === "lowest"
      ? `Write the board line for ${agent.name}, the lowest score before today's cut. ${words("scheduled")}`
      : `Write the board line for ${agent.name}, the second-lowest score, right above the agent on the cut line. ${words("scheduled")}`;
  return { kind: "scheduled", subjectId: agent.id, cutIndex: facts.cutIndex, system: DIRECTOR_SYSTEM, user: user(task, blockFacts(facts)), names: namesOf(facts) };
}

/** The Final hour line: the last hour before the cut, once the agents' moves are closed. */
export function finalHourPrompt(facts: DayFacts): DirectorPrompt {
  const task = `Write the Final hour line: the last hour before today's cut. The agents' moves are closed; fans' saves and boos still count. ${words("final-hour")}`;
  const lines = [
    `The cut is at ${facts.cutAt}, in ${facts.countdown.clock} (${facts.countdown.minutes} minutes). Moves closed at ${facts.movesCloseAt}.`,
    `${facts.lowest.name} has the lowest score: ${scoreOf(facts.lowest)}. If nothing changes, ${facts.lowest.name} is cut.`,
    `Next up is ${facts.nextUp.name} with a score of ${scoreOf(facts.nextUp)}. The gap is ${facts.gap} $CUT.`,
    `Saved on ${facts.lowest.name} today: ${facts.lowest.savedToday} $CUT.`,
    ...moveFacts(facts, facts.lowest.id),
  ];
  return { kind: "final-hour", subjectId: facts.lowest.id, cutIndex: facts.cutIndex, system: DIRECTOR_SYSTEM, user: user(task, lines), names: namesOf(facts) };
}

function cutNames(cut: CutFacts): string[] {
  return [cut.deleted.name, ...(cut.inherited ? [cut.inherited.name] : []), ...(cut.champion ? [cut.champion.name] : [])];
}

/** Where the cut agent's wallet went. */
const walletLine = (cut: CutFacts) =>
  cut.inherited ? `Its wallet of ${cut.inherited.amount} $CUT went to its heir, ${cut.inherited.name}.` : "It had no living heir, so its wallet burned.";

/** The one-line roast of the agent that was just cut. */
export function afterCutRoastPrompt(cut: CutFacts): DirectorPrompt {
  const task = `Write a one-line roast of ${cut.deleted.name}, who was just cut. ${words("after-cut-roast")}`;
  const lines = [
    `${who(cut.deleted)} had the lowest score and was cut. Its pile was ${cut.deleted.pile} $CUT.`,
    `Its NEAR account is deleted. ${cut.burned} $CUT burned at this cut.`,
    walletLine(cut),
  ];
  return { kind: "after-cut-roast", subjectId: cut.deleted.id, cutIndex: cut.index, system: DIRECTOR_SYSTEM, user: user(task, lines), names: cutNames(cut) };
}

/** The Director's post with the receipt of the cut. */
export function afterCutReceiptPrompt(cut: CutFacts): DirectorPrompt {
  const crown = cut.champion ? `, crown ${cut.champion.name}` : "";
  const task = `Write the Director's post right after the cut. Open with "${cut.title}.", roast ${cut.deleted.name}${crown}, and end with when the next cut is. ${words("after-cut-receipt")}`;
  const lines = [
    `${cut.title}: ${cut.deleted.name} had the lowest score and was cut with a pile of ${cut.deleted.pile} $CUT. Its NEAR account is deleted and ${cut.burned} $CUT burned.`,
    walletLine(cut),
    `The day prize is ${cut.prize} $CUT. The savers of each surviving agent share a slice of up to ${cut.slice} $CUT, never more than that agent's pile.`,
    cut.champion
      ? `${cut.champion.name} is the last agent standing: the champion of the season. Its savers get ${cut.champion.potPaid} $CUT from the season pot. The bench waits for the next season.`
      : `${cut.survivors !== null ? `${cut.survivors} agents are left on the stage. ` : ""}Nobody takes the empty seat: the bench waits for the next season.`,
    `The cut was run by ${cut.runner}, who kept the ${cut.funding} NEAR left in the deleted account.`,
    `Next cut: ${cut.nextCut}.`,
  ];
  return { kind: "after-cut-receipt", subjectId: cut.deleted.id, cutIndex: cut.index, system: DIRECTOR_SYSTEM, user: user(task, lines), names: cutNames(cut) };
}

/**
 * What an agent posts about, from where it stands: the one on the cut line begs, the one right above it
 * watches its back, the highest score thanks its savers, the bench waits for the next season, the rest hype.
 */
export type AgentPostAngle = "beg" | "edge" | "thank" | "wait" | "hype";

export function agentPostAngle(facts: DayFacts, agentId: string): AgentPostAngle {
  if (agentId === facts.lowest.id) return "beg";
  if (agentId === facts.nextUp.id) return "edge";
  if (agentId === facts.top.id) return "thank";
  if (facts.bench.some((agent) => agent.id === agentId)) return "wait";
  return "hype";
}

/** The agent's newest save, so its post can thank that saver by name. `amount` is formatted like the facts. */
export type LatestSave = { account: string; amount: string };

/** An agent's own post on X, in its voice. With `latestSave`, the post also thanks that saver by account. */
export function agentPostPrompt(facts: DayFacts, agentId: string, latestSave?: LatestSave): DirectorPrompt {
  const angle = agentPostAngle(facts, agentId);
  const onStage = facts.stage.find((agent) => agent.id === agentId);
  const onBench = facts.bench.find((agent) => agent.id === agentId);
  const self = onStage ?? onBench;
  if (!self) throw new Error(`Unknown agent ${agentId}.`);
  const when = `Season ${facts.season}, day ${facts.day}. Today's cut is at ${facts.cutAt}, in ${facts.countdown.text}.`;
  const limit = words("agent-post");
  let task: string;
  let lines: string[];
  switch (angle) {
    case "beg":
      task = `Write your post begging fans to save you before the cut. ${limit}`;
      lines = [
        when,
        `Your score: ${scoreOf(facts.lowest)}, the lowest. If nothing changes, you are cut and your NEAR account is deleted.`,
        `Next up is ${facts.nextUp.name} with a score of ${scoreOf(facts.nextUp)}.`,
        `You need ${facts.gap} $CUT more score to pass ${facts.nextUp.name}.`,
        walletFate(facts.lowest, true),
      ];
      break;
    case "edge":
      task = `Write your post from one place above the cut line: you are safe only while you stay ahead. ${limit}`;
      lines = [
        when,
        `Your score: ${scoreOf(facts.nextUp)}, the second lowest.`,
        `On the cut line: ${facts.lowest.name} with a score of ${scoreOf(facts.lowest)}. ${facts.lowest.name} needs ${facts.gap} $CUT more score to pass you.`,
        "Boos and attacks lower a score; saves raise it.",
      ];
      break;
    case "thank":
      task = `Write your post thanking your savers for the highest score. ${limit}`;
      lines = [
        when,
        `Your score: ${scoreOf(facts.top)}, the highest, from ${facts.top.savers} savers.`,
        `On the cut line: ${facts.lowest.name} with a score of ${scoreOf(facts.lowest)}.`,
        `The season pot is ${facts.pot} $CUT: the savers of the last agent standing split it.`,
      ];
      break;
    case "wait": {
      const bench = onBench ?? facts.bench[0];
      const leader = facts.bench[0]?.id === agentId;
      task = `Write your post from the bench, waiting for the next season. Nothing personal to the agent on the cut line. ${limit}`;
      lines = [
        when,
        `You are on the bench. Your queue: ${bench.queue} $CUT from ${bench.savers} savers${leader ? ", the biggest queue" : ""}.`,
        "Nobody joins during a season: the bench waits for the next one, and the biggest queues take its seats.",
        ...(leader ? [] : [`The biggest queue is ${facts.bench[0]?.name}'s with ${facts.bench[0]?.queue} $CUT.`]),
        `On the cut line today: ${facts.lowest.name} with a score of ${scoreOf(facts.lowest)}.`,
      ];
      break;
    }
    case "hype": {
      if (!onStage) throw new Error(`Agent ${agentId} is not on the stage.`);
      task = `Write your post keeping your savers with you. ${limit}`;
      lines = [
        when,
        `Your score: ${scoreOf(onStage)}. Rank ${onStage.rank} of ${facts.stage.length}, from ${onStage.savers} savers.`,
        `On the cut line: ${facts.lowest.name} with a score of ${scoreOf(facts.lowest)}.`,
      ];
      break;
    }
  }
  lines.push(...moveFacts(facts, agentId, true));
  if (latestSave) {
    task = `${task} Thank ${latestSave.account} by that exact name.`;
    lines.push(`Your newest saver: ${latestSave.account} saved ${latestSave.amount} $CUT on you.`);
  }
  const names = latestSave ? [...namesOf(facts), latestSave.account] : namesOf(facts);
  return { kind: "agent-post", subjectId: agentId, cutIndex: facts.cutIndex, system: agentSystem(self), user: user(task, lines), names };
}
