import { describe, expect, it } from "vitest";

import { pileShown, scoreParts, scoreShown } from "@/entities/agent";
import { units } from "@/shared/lib/amount";
import { formatCutTenths } from "@/shared/ui/format";

const TENTH = units(1) / 10n;
const CENT = TENTH / 10n;

function agent(pile: bigint, boos: bigint, damage: bigint) {
  return { pile, boos, damage, score: pile - boos - damage };
}

const text = (parts: ReturnType<typeof scoreParts>) =>
  `${formatCutTenths(parts.pile)} − ${formatCutTenths(parts.boos)} − ${formatCutTenths(parts.damage)} = ${formatCutTenths(parts.score)}`;

describe("the score as shown", () => {
  it("rounds scores and piles down to 0.1 $CUT, a negative score too", () => {
    expect(scoreShown(units(959) + 59n * CENT)).toBe(units(959) + 5n * TENTH);
    expect(scoreShown(units(960))).toBe(units(960));
    expect(scoreShown(-5n * CENT)).toBe(-TENTH);
    expect(pileShown(units(41_200))).toBe(units(41_200));
  });

  it("shows Kiko's 960 saved − 0.5 boos as a score of 959.5, not 960", () => {
    const parts = scoreParts(agent(units(960), 5n * TENTH, 0n));
    expect(text(parts)).toBe("960 − 0.5 − 0 = 959.5");
  });

  it("keeps whole numbers clean", () => {
    expect(text(scoreParts(agent(units(41_200), 0n, units(1_400))))).toBe("41,200 − 0 − 1,400 = 39,800");
  });

  it("adds up on screen even when every part has digits past the first decimal", () => {
    // Floor of each part alone would read 960 − 0 − 0 = 959.9.
    const cases = [
      agent(units(960) + 5n * CENT, 6n * CENT, 0n),
      agent(units(10), CENT, CENT),
      agent(units(10) + 99n * CENT, 49n * CENT, 51n * CENT),
      agent(units(3), units(5) + 7n * CENT, 3n * CENT),
      agent(units(1) + 1n, 0n, 1n),
    ];
    for (const value of cases) {
      const parts = scoreParts(value);
      expect(parts.pile - parts.boos - parts.damage).toBe(parts.score);
      expect(parts.score).toBe(scoreShown(value.score));
      expect(parts.pile).toBe(pileShown(value.pile));
      // Each part is off by less than 0.1 $CUT, and none is negative.
      for (const [shown, real] of [[parts.boos, value.boos], [parts.damage, value.damage]] as const) {
        expect(shown >= 0n).toBe(true);
        expect(shown - real < TENTH && real - shown < TENTH).toBe(true);
      }
    }
  });
});
