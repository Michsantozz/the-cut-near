import type { CutFacts, DayFacts, RobotFacts } from "./facts";
import { LINE_LIMITS, type DirectorLineKind } from "./kinds";
import { DIRECTOR_SYSTEM, robotSystem } from "./persona";
import { allowedNumbers } from "./validate";

/** One request to the model: the persona (system), the task with its facts (user), and what the reply is for. */
export type DirectorPrompt = {
  kind: DirectorLineKind;
  /** The robot the line is about (or speaks as, for posts). */
  subjectId: string | null;
  cutIndex: number | null;
  system: string;
  user: string;
  /** Robot names a line may contain. */
  names: string[];
};

/** Numbers a reply may use: exactly those in the prompt. */
export const allowedNumbersFor = (prompt: DirectorPrompt): Set<string> => allowedNumbers(prompt.system, prompt.user);

const user = (task: string, facts: string[]) => `${task}\nFacts:\n${facts.map((fact) => `- ${fact}`).join("\n")}`;
const words = (kind: DirectorLineKind) => `One line, at most ${LINE_LIMITS[kind].maxWords} words.`;
const namesOf = (facts: DayFacts) => [...facts.stage.map((robot) => robot.name), ...facts.bench.map((robot) => robot.name)];

function blockFacts(facts: DayFacts): string[] {
  return [
    `Today's cut is at ${facts.cutAt}, in ${facts.countdown.text}.`,
    `${facts.lowest.name} (${facts.lowest.kind}) has the lowest pile: ${facts.lowest.pile} $CUT. If nothing moves, ${facts.lowest.name} is cut.`,
    `Next up is ${facts.nextUp.name} (${facts.nextUp.kind}) with ${facts.nextUp.pile} $CUT.`,
    `${facts.lowest.name} needs ${facts.gap} $CUT to pass ${facts.nextUp.name}.`,
  ];
}

/** The board line before the cut, for the lowest robot or the one right above it. */
export function scheduledPrompt(facts: DayFacts, subject: "lowest" | "next-up"): DirectorPrompt {
  const robot = subject === "lowest" ? facts.lowest : facts.nextUp;
  const task =
    subject === "lowest"
      ? `Write the board line for ${robot.name}, the lowest pile before today's cut. ${words("scheduled")}`
      : `Write the board line for ${robot.name}, the second-lowest pile, right above the robot on the block. ${words("scheduled")}`;
  return { kind: "scheduled", subjectId: robot.id, cutIndex: facts.cutIndex, system: DIRECTOR_SYSTEM, user: user(task, blockFacts(facts)), names: namesOf(facts) };
}

/** The Final hour line (17:00–18:00 UTC). */
export function finalHourPrompt(facts: DayFacts): DirectorPrompt {
  const task = `Write the Final hour line: the last hour before today's cut, saves still count. ${words("final-hour")}`;
  const lines = [
    `The cut is at ${facts.cutAt}, in ${facts.countdown.clock} (${facts.countdown.minutes} minutes).`,
    `${facts.lowest.name} has the lowest pile: ${facts.lowest.pile} $CUT. If nothing moves, ${facts.lowest.name} is cut.`,
    `Next up is ${facts.nextUp.name} with ${facts.nextUp.pile} $CUT. The gap is ${facts.gap} $CUT.`,
    `Saved on ${facts.lowest.name} today: ${facts.lowest.savedToday} $CUT.`,
  ];
  return { kind: "final-hour", subjectId: facts.lowest.id, cutIndex: facts.cutIndex, system: DIRECTOR_SYSTEM, user: user(task, lines), names: namesOf(facts) };
}

function cutNames(cut: CutFacts): string[] {
  return [cut.deleted.name, ...(cut.joined ? [cut.joined.name] : [])];
}

/** The one-line roast of the robot that was just cut. */
export function afterCutRoastPrompt(cut: CutFacts): DirectorPrompt {
  const task = `Write a one-line roast of ${cut.deleted.name}, who was just cut. ${words("after-cut-roast")}`;
  const lines = [`${cut.deleted.name} (${cut.deleted.kind}) was cut with the lowest pile: ${cut.deleted.pile} $CUT.`, `Its NEAR account is deleted. ${cut.burned} $CUT burned.`];
  return { kind: "after-cut-roast", subjectId: cut.deleted.id, cutIndex: cut.index, system: DIRECTOR_SYSTEM, user: user(task, lines), names: cutNames(cut) };
}

/** The Director's post with the receipt of the cut. */
export function afterCutReceiptPrompt(cut: CutFacts): DirectorPrompt {
  const welcome = cut.joined ? `, welcome ${cut.joined.name} to the empty seat` : "";
  const task = `Write the Director's post right after the cut. Open with "${cut.title}.", roast ${cut.deleted.name}${welcome}, and end with when the next cut is. ${words("after-cut-receipt")}`;
  const lines = [
    `${cut.title}: ${cut.deleted.name} was cut with a pile of ${cut.deleted.pile} $CUT. Its NEAR account is deleted and ${cut.burned} $CUT burned.`,
    `The prize is ${cut.prize} $CUT: 9 equal slices of ${cut.slice} $CUT, one per surviving robot.`,
    cut.joined ? `${cut.joined.name} takes the empty seat with ${cut.joined.pile} $CUT. ${cut.robotsAfter} robots on the stage again.` : `Nobody joins from the bench. ${cut.robotsAfter} robots on the stage.`,
    `The cut was run by ${cut.runner}, who kept the 0.5 NEAR left in the deleted account.`,
    `Next cut: ${cut.nextCut}.`,
  ];
  return { kind: "after-cut-receipt", subjectId: cut.deleted.id, cutIndex: cut.index, system: DIRECTOR_SYSTEM, user: user(task, lines), names: cutNames(cut) };
}

/**
 * What a robot posts about, from where it stands: the lowest begs, the survivor that pays most per 100
 * pitches the small-pile math, the top pile thanks its savers, the bench leader waits, the rest hype.
 */
export type RobotPostAngle = "beg" | "pitch" | "thank" | "wait" | "hype";

export function robotPostAngle(facts: DayFacts, robotId: string): RobotPostAngle {
  if (robotId === facts.lowest.id) return "beg";
  if (robotId === facts.nextUp.id) return "pitch";
  if (robotId === facts.top.id) return "thank";
  if (facts.bench.some((robot) => robot.id === robotId)) return "wait";
  return "hype";
}

/** The robot's newest save, so its post can thank that saver by name. `amount` is formatted like the facts. */
export type LatestSave = { account: string; amount: string };

/** A robot's own post on X, in its voice. With `latestSave`, the post also thanks that saver by account. */
export function robotPostPrompt(facts: DayFacts, robotId: string, latestSave?: LatestSave): DirectorPrompt {
  const angle = robotPostAngle(facts, robotId);
  const onStage = facts.stage.find((robot) => robot.id === robotId);
  const onBench = facts.bench.find((robot) => robot.id === robotId);
  if (!onStage && !onBench) throw new Error(`Unknown robot ${robotId}.`);
  const self = onStage ?? { id: robotId, name: onBench?.name ?? robotId, kind: onBench?.kind ?? "robot" };
  const when = `Day ${facts.day}. Today's cut is at ${facts.cutAt}, in ${facts.countdown.text}.`;
  const pays = (robot: RobotFacts) => `${robot.paysPer100} per 100 $CUT saved`;
  const limit = words("robot-post");
  let task: string;
  let lines: string[];
  switch (angle) {
    case "beg":
      task = `Write your post begging fans to save you before the cut. ${limit}`;
      lines = [when, `Your pile: ${facts.lowest.pile} $CUT, the lowest. If nothing moves, you are cut and your NEAR account is deleted.`, `Next up is ${facts.nextUp.name} with ${facts.nextUp.pile} $CUT.`, `You need ${facts.gap} $CUT to pass ${facts.nextUp.name}.`];
      break;
    case "pitch":
      task = `Write your post selling the small-pile math: small pile, big slice. ${limit}`;
      lines = [when, `Your pile: ${facts.nextUp.pile} $CUT, the second lowest.`, `If the cut ran now, you pay ${pays(facts.nextUp)}. ${facts.top.name} (the top pile) pays ${pays(facts.top)}.`, `Every survivor gets the same slice. Small piles share it among fewer $CUT.`];
      break;
    case "thank":
      task = `Write your post thanking your savers for the top pile. ${limit}`;
      lines = [when, `Your pile: ${facts.top.pile} $CUT, the top pile, from ${facts.top.savers} savers.`, `Lowest pile: ${facts.lowest.name} with ${facts.lowest.pile} $CUT.`];
      break;
    case "wait": {
      const bench = onBench ?? facts.bench[0];
      const leader = facts.bench[0]?.id === robotId;
      task = `Write your post from the bench, waiting for a seat. Nothing personal to the robot on the block. ${limit}`;
      lines = [
        when,
        `You are on the bench. Your queue: ${bench.queue} $CUT from ${bench.savers} savers${leader ? ", the biggest queue" : ""}.`,
        leader ? "If a robot is cut today, the biggest queue takes the empty seat." : `The biggest queue is ${facts.bench[0]?.name}'s with ${facts.bench[0]?.queue} $CUT; the biggest queue takes the empty seat.`,
        `On the block: ${facts.lowest.name} with ${facts.lowest.pile} $CUT.`,
      ];
      break;
    }
    case "hype": {
      if (!onStage) throw new Error(`Robot ${robotId} is not on the stage.`);
      const robot = onStage;
      task = `Write your post keeping your savers with you. ${limit}`;
      lines = [when, `Your pile: ${robot.pile} $CUT, rank ${robot.rank} of ${facts.stage.length}, from ${robot.savers} savers.`, `On the block: ${facts.lowest.name} with ${facts.lowest.pile} $CUT.`];
      if (robot.paysPer100) lines.push(`If the cut ran now, you pay ${pays(robot)}.`);
      break;
    }
  }
  if (latestSave) {
    task = `${task} Thank ${latestSave.account} by that exact name.`;
    lines.push(`Your newest saver: ${latestSave.account} saved ${latestSave.amount} $CUT on you.`);
  }
  const names = latestSave ? [...namesOf(facts), latestSave.account] : namesOf(facts);
  return { kind: "robot-post", subjectId: robotId, cutIndex: facts.cutIndex, system: robotSystem(self), user: user(task, lines), names };
}
