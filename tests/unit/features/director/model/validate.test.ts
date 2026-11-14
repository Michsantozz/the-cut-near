import { describe, expect, it } from "vitest";
import { allowedNumbers, lineFromReply, numberTokens, validateLine } from "@/features/director/model/validate";

const allowed = allowedNumbers("Kiko Bun has 23,600 $CUT. Onyx Moon has 61,800. Pays 1.80 per 100. Cut at 18:00 UTC. Melody-9.");

describe("numberTokens / allowedNumbers", () => {
  it("normalizes separators, keeps times whole and accepts trailing-zero variants", () => {
    expect(numberTokens("23,600 $CUT at 18:00, 1.80 and 0:42:10")).toEqual(["18:00", "0:42:10", "23600", "1.80"]);
    expect([...allowed]).toEqual(expect.arrayContaining(["23600", "61800", "1.80", "1.8", "100", "18:00", "9"]));
  });
});

describe("lineFromReply", () => {
  it("reads structured JSON, fenced JSON or plain text, and strips quotes", () => {
    expect(lineFromReply('{"line":"Pack your buns."}')).toBe("Pack your buns.");
    expect(lineFromReply('```json\n{"line": "Pack your buns."}\n```')).toBe("Pack your buns.");
    expect(lineFromReply('"Pack your buns."')).toBe("Pack your buns.");
    expect(lineFromReply('{"text":"nope"}')).toBeNull();
    expect(lineFromReply("")).toBeNull();
  });
});

describe("validateLine", () => {
  it("accepts a short plain line whose numbers come from the facts", () => {
    expect(validateLine("  23,600 $CUT between Kiko and oblivion.   Pack your buns. ", "after-cut-roast", allowed)).toEqual({ ok: true, line: "23,600 $CUT between Kiko and oblivion. Pack your buns." });
  });

  it("enforces the length limits of each kind", () => {
    expect(validateLine("Too short", "scheduled", allowed).ok).toBe(false);
    expect(validateLine("word ".repeat(17).trim(), "scheduled", allowed)).toEqual({ ok: false, reason: "At most 16 words." });
    expect(validateLine("x".repeat(91), "after-cut-roast", allowed).ok).toBe(false);
    expect(validateLine("a\nb that is long enough", "scheduled", allowed)).toEqual({ ok: false, reason: "More than one line." });
  });

  it("never lets a number through that the facts do not have", () => {
    expect(validateLine("Kiko has 23,600 and needs 40,000 more.", "scheduled", allowed)).toEqual({ ok: false, reason: "The number 40000 is not in the facts." });
    expect(validateLine("Kiko pays 1.8 per 100 saved, if the cut ran now.", "agent-post", allowed).ok).toBe(true);
  });

  it("refuses financial advice, hype, links, handles, markup and emoji", () => {
    for (const line of ["Buy $CUT before 18:00 UTC, bunny fans.", "Guaranteed gains for Kiko savers today.", "Kiko to the moon, savers, hold tight.", "Kiko could 10x your pile tonight, friends.", "The price of a seat is 23,600 today."]) {
      expect(validateLine(line, "agent-post", allowed).ok, line).toBe(false);
    }
    expect(validateLine("Save Kiko at thecut.app before 18:00 UTC.", "agent-post", allowed)).toEqual({ ok: false, reason: "Contains a link." });
    expect(validateLine("Save Kiko, @PixieVoltCut is watching you.", "agent-post", allowed).ok).toBe(false);
    expect(validateLine("Save Kiko, **now** before the cut, please.", "agent-post", allowed).ok).toBe(false);
    expect(validateLine("Save Kiko before the cut, please 🐰", "agent-post", allowed)).toEqual({ ok: false, reason: "Contains an emoji." });
  });

  it("does not read agent names as hype", () => {
    expect(validateLine("Onyx Moon has 61,800 and a smug grin.", "scheduled", allowed, ["Onyx Moon"]).ok).toBe(true);
    expect(validateLine("Onyx Moon has 61,800 and a smug grin.", "scheduled", allowed).ok).toBe(false);
  });
});
