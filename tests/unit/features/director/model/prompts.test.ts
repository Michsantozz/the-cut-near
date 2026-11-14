import { describe, expect, it } from "vitest";
import { SAMPLE_FIRST_CUT, SAMPLE_NEXT_CUT, SAMPLE_NOW } from "@/entities/cut/api/sample";
import { SAMPLE_PARAMS } from "@/entities/market/api/sample";
import { SAMPLE_BENCH, SAMPLE_STAGE } from "@/entities/robot/api/sample";
import { units } from "@/shared/lib/amount";
import { buildCutFacts, buildDayFacts } from "@/features/director/model/facts";
import { DIRECTOR_SYSTEM } from "@/features/director/model/persona";
import { afterCutReceiptPrompt, afterCutRoastPrompt, allowedNumbersFor, finalHourPrompt, robotPostAngle, robotPostPrompt, scheduledPrompt } from "@/features/director/model/prompts";
import { SAMPLE_LINES } from "@/features/director/model/sample";
import { validateLine } from "@/features/director/model/validate";

const day = buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: SAMPLE_NEXT_CUT, params: SAMPLE_PARAMS, now: SAMPLE_NOW, fees: units(5_020) });
// The sample world the app shows: 4,100 $CUT of fees so far, so Onyx pays 2.72 per 100 and Pixie 0.92.
const world = buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: SAMPLE_NEXT_CUT, params: SAMPLE_PARAMS, now: SAMPLE_NOW, fees: units(4_100) });
const cut = buildCutFacts({ cut: SAMPLE_FIRST_CUT, robots: [...SAMPLE_STAGE, ...SAMPLE_BENCH], params: SAMPLE_PARAMS });

describe("scheduled line prompt", () => {
  it("gives the countdown, the lowest pile and the gap with the SPEC numbers", () => {
    const prompt = scheduledPrompt(day, "lowest");
    expect(prompt).toMatchObject({ kind: "scheduled", subjectId: "kiko", cutIndex: 1, system: DIRECTOR_SYSTEM });
    expect(prompt.user).toBe(
      [
        "Write the board line for Kiko Bun, the lowest pile before today's cut. One line, at most 16 words.",
        "Facts:",
        "- Today's cut is at 18:00 UTC, in 4h 12m.",
        "- Kiko Bun (VTuber) has the lowest pile: 23,600 $CUT. If nothing moves, Kiko Bun is cut.",
        "- Next up is Onyx Moon (Digital model) with 61,800 $CUT.",
        "- Kiko Bun needs 38,201 $CUT to pass Onyx Moon.",
      ].join("\n"),
    );
    expect(scheduledPrompt(day, "next-up").subjectId).toBe("onyx");
  });

  it("allows exactly the numbers of the prompt, so the design's lines pass and invented numbers do not", () => {
    const allowed = allowedNumbersFor(scheduledPrompt(day, "lowest"));
    for (const n of ["23600", "61800", "38201", "18:00", "4", "12"]) expect(allowed.has(n)).toBe(true);
    expect(validateLine("23,600 $CUT and 4 hours. A miracle or a whale, bunny.", "scheduled", allowed).ok).toBe(true);
    expect(validateLine("Only 38,201 above the bunny. Nobody here is safe.", "scheduled", allowed).ok).toBe(true);
    expect(validateLine("23,601 $CUT and 4 hours. A miracle or a whale, bunny.", "scheduled", allowed)).toEqual({ ok: false, reason: "The number 23601 is not in the facts." });
  });
});

describe("final hour prompt", () => {
  it("uses the clock countdown and the saves of the day", () => {
    const late = buildDayFacts({ stage: SAMPLE_STAGE, bench: SAMPLE_BENCH, nextCut: SAMPLE_NEXT_CUT, params: SAMPLE_PARAMS, now: new Date("2026-11-13T17:17:50Z") });
    const prompt = finalHourPrompt(late);
    expect(prompt.user).toContain("in 0:42:10 (42 minutes)");
    expect(prompt.user).toContain("Saved on Kiko Bun today: 300 $CUT.");
  });
});

describe("after-cut prompts", () => {
  it("roast and receipt carry the cut's numbers, and the design's lines validate against them", () => {
    const roast = afterCutRoastPrompt(cut);
    const receipt = afterCutReceiptPrompt(cut);
    expect(roast.user).toContain("Kiko Bun (VTuber) was cut with the lowest pile: 23,600 $CUT.");
    expect(receipt.user).toContain('Open with "First cut."');
    expect(receipt.user).toContain("Chartwise takes the empty seat with 88,400 $CUT. 10 robots on the stage again.");
    expect(receipt.user).toContain("Next cut: tomorrow, 18:00 UTC.");
    const line = (id: string) => SAMPLE_LINES.find((l) => l.id === id)?.text ?? "";
    expect(validateLine(line("sample-roast-1"), "after-cut-roast", allowedNumbersFor(roast), roast.names).ok).toBe(true);
    expect(validateLine(line("sample-receipt-1"), "after-cut-receipt", allowedNumbersFor(receipt), receipt.names).ok).toBe(true);
  });
});

describe("robot posts", () => {
  it("picks the angle from where the robot stands", () => {
    expect(["kiko", "onyx", "pixie", "chartwise", "bloop", "melody"].map((id) => robotPostAngle(day, id))).toEqual(["beg", "pitch", "thank", "wait", "wait", "hype"]);
    expect(robotPostPrompt(day, "bloop").user).toContain("The biggest queue is Chartwise's with 88,400 $CUT");
  });

  it("writes in the robot's voice with its own numbers; the SPEC posts validate", () => {
    const onyx = robotPostPrompt(day, "onyx");
    expect(onyx.system).toContain("You are Onyx Moon, a cool, smug digital model");
    expect(onyx.user).toContain("If the cut ran now, you pay 2.87 per 100 $CUT saved. Pixie Volt (the top pile) pays 0.97 per 100 $CUT saved.");
    expect(robotPostPrompt(world, "onyx").user).toContain("you pay 2.72 per 100 $CUT saved. Pixie Volt (the top pile) pays 0.92 per 100 $CUT saved.");
    const mikaOnMelody = { account: "mika.near", amount: "400" };
    for (const sample of SAMPLE_LINES.filter((l) => l.kind === "robot-post")) {
      const prompt = robotPostPrompt(world, sample.subjectId, sample.subjectId === "melody" ? mikaOnMelody : undefined);
      expect(validateLine(sample.text, "robot-post", allowedNumbersFor(prompt), prompt.names), sample.id).toMatchObject({ ok: true });
    }
    expect(robotPostPrompt(day, "chartwise").user).toContain("Your queue: 88,400 $CUT from 241 savers, the biggest queue.");
    expect(robotPostPrompt(day, "pixie").user).toContain("from 412 savers");
    expect(() => robotPostPrompt(day, "nobody")).toThrow();
  });

  it("thanks the newest saver by account when there is one", () => {
    const prompt = robotPostPrompt(day, "melody", { account: "fan42.near", amount: "1,250" });
    expect(prompt.user).toContain("Thank fan42.near by that exact name.");
    expect(prompt.user).toContain("- Your newest saver: fan42.near saved 1,250 $CUT on you.");
    expect(prompt.names).toContain("fan42.near");
    expect(validateLine("Thank you fan42.near for 1,250 $CUT, this chorus is yours.", "robot-post", allowedNumbersFor(prompt), prompt.names)).toMatchObject({ ok: true });
    expect(robotPostPrompt(day, "melody").user).not.toContain("newest saver");
  });
});
