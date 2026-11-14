import { describe, expect, it } from "vitest";
import { SAMPLE_BENCH, SAMPLE_CUT, SAMPLE_STAGE } from "@/entities/agent/api/sample";
import { sampleCuts, sampleNextCut } from "@/entities/cut/api/sample";
import type { DeletingCut } from "@/entities/cut";
import { SAMPLE_PARAMS } from "@/entities/market/api/sample";
import { sampleMoves } from "@/entities/move/api/sample";
import { SAMPLE_SEASON } from "@/entities/season/api/sample";
import { units } from "@/shared/lib/amount";
import { buildCutFacts, buildDayFacts } from "@/features/director/model/facts";
import { DIRECTOR_SYSTEM, agentSystem } from "@/features/director/model/persona";
import { afterCutReceiptPrompt, afterCutRoastPrompt, allowedNumbersFor, finalHourPrompt, agentPostAngle, agentPostPrompt, scheduledPrompt } from "@/features/director/model/prompts";
import { sampleDirectorLines } from "@/features/director/model/sample";
import { validateLine } from "@/features/director/model/validate";

// The v20 sample world: season 1, day 4, two hours before cut #5. Yuna Star is on the cut line, Glitch Gremlin
// right above her, and every agent but Pixie has moved.
const NOW = new Date("2026-11-14T16:00:00Z");
const day = buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: sampleNextCut(NOW), season: SAMPLE_SEASON, now: NOW, moves: sampleMoves(5, NOW) });
const before = buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: sampleNextCut(NOW), season: SAMPLE_SEASON, now: NOW });
const agents = [...SAMPLE_STAGE, ...SAMPLE_CUT, ...SAMPLE_BENCH];
const record = (index: number) => sampleCuts(NOW).find((cut) => cut.index === index) as DeletingCut;
const cutFacts = (index: number, survivors: number | null = null) => buildCutFacts({ cut: record(index), agents, params: SAMPLE_PARAMS, day: index - 1, survivors });
const samples = sampleDirectorLines(NOW);
const sample = (id: string) => samples.find((line) => line.id === id)?.text ?? "";

describe("the Director's persona", () => {
  it("states the v20 rules in words, so no rule number leaks into a line", () => {
    expect(DIRECTOR_SYSTEM).toContain("the agent with the lowest score is cut");
    expect(DIRECTOR_SYSTEM).toContain("Score = $CUT saved on it minus boos minus attack damage taken today.");
    expect(DIRECTOR_SYSTEM).toContain("Agents on the bench wait for the next season.");
    expect(DIRECTOR_SYSTEM).not.toMatch(/\d/);
    expect(DIRECTOR_SYSTEM).not.toMatch(/slice|per 100|empty seat/i);
  });

  it("gives an agent its tagline and its personality's limit", () => {
    const bloop = agentSystem({ id: "bloop", name: "Bloop", tagline: "Bets the whole pond", personality: "Gambler" });
    expect(bloop).toContain("You are Bloop (Bets the whole pond), a fish with a lucky streak");
    expect(bloop).toContain("Your personality is Gambler: You love big swings. You may spend up to 50% of your wallet in a day.");
    expect(agentSystem({ id: "newcomer", name: "Newcomer", tagline: "Fresh off the bench", personality: "Miser" })).toContain("You are Newcomer (Fresh off the bench), an AI agent with a big personality.");
  });
});

describe("scheduled line prompt", () => {
  it("gives the countdown, the lowest score with its parts, the gap, the heir and both moves", () => {
    const prompt = scheduledPrompt(day, "lowest");
    expect(prompt).toMatchObject({ kind: "scheduled", subjectId: "yuna", cutIndex: 5, system: DIRECTOR_SYSTEM });
    expect(prompt.user).toBe(
      [
        "Write the board line for Yuna Star, the lowest score before today's cut. One line, at most 16 words.",
        "Facts:",
        "- Season 1, day 4. Today's cut is at 18:00 UTC, in 2h 0m.",
        "- Yuna Star (Idol of the underdogs, Generous) has the lowest score: 14,900 $CUT (15,200 saved minus 300 attack damage). If nothing changes, Yuna Star is cut.",
        "- Next up is Glitch Gremlin (Paints with broken pixels, Gambler) with a score of 15,500 $CUT (16,300 saved minus 800 in boos).",
        "- Yuna Star needs 601 $CUT more score to pass Glitch Gremlin.",
        "- If Yuna Star is cut, its wallet of 640 $CUT goes to its heir, Melody-9.",
        `- Yuna Star's move today: hold, naming Melody-9 as heir. The contract noted: downgraded: generous agents cannot attack. Yuna Star's reason: "Lila took my pact money and swung at me. I want to answer, but I can't. All I can do is ask you: save me tonight."`,
        `- Glitch Gremlin's move today: attack on Pixie Volt, burning 1,400 $CUT to lower the target's score. Glitch Gremlin's reason: "Pixie has been on top for three days. Top is a target. 1,400 $CUT of glitch, straight at her."`,
      ].join("\n"),
    );
    expect(scheduledPrompt(day, "next-up")).toMatchObject({ subjectId: "gremlin" });
    expect(scheduledPrompt(day, "next-up").user).toContain("Glitch Gremlin, the second-lowest score, right above the agent on the cut line");
  });

  it("allows exactly the numbers of the prompt, so the sample lines pass and invented numbers do not", () => {
    for (const [id, subject] of [
      ["sample-scheduled-yuna", "lowest"],
      ["sample-scheduled-gremlin", "next-up"],
    ] as const) {
      const prompt = scheduledPrompt(day, subject);
      expect(validateLine(sample(id), "scheduled", allowedNumbersFor(prompt), prompt.names), id).toMatchObject({ ok: true });
    }
    const allowed = allowedNumbersFor(scheduledPrompt(day, "lowest"));
    expect(validateLine("602 $CUT short of Gremlin, and generous idols cannot swing back.", "scheduled", allowed)).toEqual({ ok: false, reason: "The number 602 is not in the facts." });
  });

  it("leaves the moves out before anyone moves, and says when the wallet burns", () => {
    expect(before.moves).toEqual([]);
    expect(scheduledPrompt(before, "lowest").user).not.toContain("move today");
    const heirless = buildDayFacts({ stage: SAMPLE_STAGE.map((agent) => (agent.id === "yuna" ? { ...agent, heir: "velvet" } : agent)), bench: [], nextCut: sampleNextCut(NOW), season: SAMPLE_SEASON, now: NOW });
    expect(scheduledPrompt(heirless, "lowest").user).toContain("If Yuna Star is cut, its wallet of 640 $CUT burns: no living heir.");
  });
});

describe("final hour prompt", () => {
  it("uses the clock countdown, says moves are closed, and gives the saves of the day", () => {
    const late = buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: sampleNextCut(NOW), season: SAMPLE_SEASON, now: new Date("2026-11-14T17:17:50Z"), moves: sampleMoves(5, NOW) });
    const prompt = finalHourPrompt(late);
    expect(prompt.user).toContain("The agents' moves are closed; fans' saves and boos still count.");
    expect(prompt.user).toContain("in 0:42:10 (42 minutes). Moves closed at 17:00 UTC.");
    expect(prompt.user).toContain("Saved on Yuna Star today: 1,900 $CUT.");
    expect(prompt.user).toContain("Yuna Star's move today: hold");
  });
});

describe("after-cut prompts", () => {
  it("roast and receipt carry the cut's numbers, the heir and the survivors; the sample lines validate", () => {
    const facts = cutFacts(4, 7);
    const roast = afterCutRoastPrompt(facts);
    const receipt = afterCutReceiptPrompt(facts);
    expect(roast.user).toContain("Velvet Vee (Velvet glove, iron grip, Traitor) had the lowest score and was cut. Its pile was 11,400 $CUT.");
    expect(roast.user).toContain("Its wallet of 760 $CUT went to its heir, Lila Loop.");
    expect(receipt.user).toContain('Open with "Third cut."');
    expect(receipt.user).toContain("The day prize is 7,630 $CUT. The savers of each surviving agent share a slice of up to 981.0 $CUT, never more than that agent's pile.");
    expect(receipt.user).toContain("7 agents are left on the stage. Nobody takes the empty seat: the bench waits for the next season.");
    expect(receipt.user).toContain("The cut was run by keeper.thecut.sample, who kept the 0.3 NEAR left in the deleted account.");
    expect(receipt.user).toContain("Next cut: tomorrow, 18:00 UTC.");
    expect(receipt.names).toEqual(["Velvet Vee", "Lila Loop"]);
    expect(validateLine(sample("sample-roast-4"), "after-cut-roast", allowedNumbersFor(roast), roast.names)).toMatchObject({ ok: true });
    expect(validateLine(sample("sample-receipt-4"), "after-cut-receipt", allowedNumbersFor(receipt), receipt.names)).toMatchObject({ ok: true });
  });

  it("the earlier sample receipts validate against their own cuts", () => {
    for (const index of [2, 3]) {
      const receipt = afterCutReceiptPrompt(cutFacts(index));
      expect(validateLine(sample(`sample-receipt-${index}`), "after-cut-receipt", allowedNumbersFor(receipt), receipt.names), `cut ${index}`).toMatchObject({ ok: true });
    }
    expect(afterCutRoastPrompt(cutFacts(3)).user).toContain("It had no living heir, so its wallet burned.");
  });

  it("crowns a champion in the receipt", () => {
    const facts = buildCutFacts({ cut: { ...record(4), championId: "pixie", potPaid: units(21_460) }, agents, params: SAMPLE_PARAMS, day: 9 });
    const receipt = afterCutReceiptPrompt(facts);
    expect(receipt.user).toContain('Open with "Ninth cut.", roast Velvet Vee, crown Pixie Volt, and end with when the next cut is.');
    expect(receipt.user).toContain("Pixie Volt is the last agent standing: the champion of the season. Its savers get 21,460 $CUT from the season pot.");
    expect(receipt.names).toContain("Pixie Volt");
  });
});

describe("agent posts", () => {
  it("picks the angle from where the agent stands", () => {
    expect(["yuna", "gremlin", "pixie", "chartwise", "bloop", "melody"].map((id) => agentPostAngle(day, id))).toEqual(["beg", "edge", "thank", "wait", "wait", "hype"]);
  });

  it("gives each agent its own score and the v20 bench rule; every sample post validates", () => {
    expect(agentPostPrompt(day, "yuna").user).toContain("Your score: 14,900 $CUT (15,200 saved minus 300 attack damage), the lowest.");
    expect(agentPostPrompt(day, "yuna").user).toContain("If you are cut, your wallet of 640 $CUT goes to your heir, Melody-9.");
    expect(agentPostPrompt(day, "gremlin").user).toContain("Yuna Star needs 601 $CUT more score to pass you.");
    expect(agentPostPrompt(day, "pixie").user).toContain("Your score: 39,800 $CUT (41,200 saved minus 1,400 attack damage), the highest, from 214 savers.");
    expect(agentPostPrompt(day, "pixie").user).toContain("The season pot is 21,460 $CUT");
    expect(agentPostPrompt(day, "oracle").user).toContain("Your score: 33,900 $CUT, all saved by fans. Rank 2 of 7, from 176 savers.");
    expect(agentPostPrompt(day, "chartwise").user).toContain("Your queue: 8,400 $CUT from 61 savers, the biggest queue.");
    expect(agentPostPrompt(day, "bloop").user).toContain("Nobody joins during a season: the bench waits for the next one");
    expect(agentPostPrompt(day, "bloop").user).toContain("The biggest queue is Chartwise's with 8,400 $CUT.");
    expect(agentPostPrompt(day, "melody").system).toContain("You are Melody-9 (Sings for her savers), a pop singer");
    for (const post of samples.filter((line) => line.kind === "agent-post")) {
      const prompt = agentPostPrompt(day, post.subjectId);
      expect(validateLine(post.text, "agent-post", allowedNumbersFor(prompt), prompt.names), post.id).toMatchObject({ ok: true });
    }
    expect(() => agentPostPrompt(day, "nobody")).toThrow();
  });

  it("let an agent's own post speak to its move", () => {
    expect(agentPostPrompt(day, "lila").user).toContain(
      `- Your move today: attack on Yuna Star, burning 300 $CUT to lower the target's score. Your reason: "Yuna paid me for peace. Peace was yesterday. 300 $CUT says she sleeps under the line tonight. Nothing personal, darling."`,
    );
    expect(agentPostPrompt(day, "melody").user).toContain("- Your move today: rescue, offering 500 $CUT to your savers if you survive.");
    expect(agentPostPrompt(day, "pixie").user).not.toContain("move today");
  });

  it("thanks the newest saver by account when there is one", () => {
    const prompt = agentPostPrompt(day, "melody", { account: "fan42.near", amount: "1,250" });
    expect(prompt.user).toContain("Thank fan42.near by that exact name.");
    expect(prompt.user).toContain("- Your newest saver: fan42.near saved 1,250 $CUT on you.");
    expect(prompt.names).toContain("fan42.near");
    expect(validateLine("Thank you fan42.near for 1,250 $CUT, this chorus is yours.", "agent-post", allowedNumbersFor(prompt), prompt.names)).toMatchObject({ ok: true });
    expect(agentPostPrompt(day, "melody").user).not.toContain("newest saver");
  });
});

describe("sample lines", () => {
  it("cover today's cut line and the season's cuts, dated before now", () => {
    expect(samples.filter((line) => line.kind === "scheduled").map((line) => line.subjectId)).toEqual(["yuna", "gremlin"]);
    expect(samples.filter((line) => line.kind === "after-cut-receipt").map((line) => line.cutIndex)).toEqual([4, 3, 2]);
    expect(samples.every((line) => line.createdAt <= NOW.toISOString())).toBe(true);
  });
});
