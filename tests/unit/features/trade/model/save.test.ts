import { describe, expect, it } from "vitest";

import { relockedTotal, saveProblem, scoreBarWidths } from "@/features/trade/model/save";
import { units } from "@/shared/lib/amount";

const tenth = units(1) / 10n;

describe("adding to a save", () => {
  it("warns that $CUT added to an unlocked save locks all of it again", () => {
    expect(relockedTotal({ amount: units(800), unlocked: true }, units(1))).toBe(units(801));
    expect(relockedTotal({ amount: units(800), unlocked: false }, units(1))).toBeNull();
    expect(relockedTotal(null, units(1))).toBeNull();
    expect(relockedTotal({ amount: units(800), unlocked: true }, 0n)).toBeNull();
    expect(relockedTotal({ amount: units(800), unlocked: true }, null)).toBeNull();
  });

  it("takes any amount on top of a save, and 0.1 $CUT for a new one", () => {
    const five = units(5) / 100n;
    expect(saveProblem(five, units(10), true)).toBeNull();
    expect(saveProblem(five, units(10), false)).toBe("too-small");
    expect(saveProblem(tenth, units(10), false)).toBeNull();
    expect(saveProblem(0n, units(10), false)).toBe("empty");
  });
});

describe("the picker's score bars", () => {
  it("scales every bar to the highest score, so a lower score never shows a longer bar", () => {
    expect(scoreBarWidths([units(4_000), units(3_000), units(1_000)])).toEqual([100, 75, 25]);
  });

  it("uses the highest score even when the list is not sorted", () => {
    expect(scoreBarWidths([units(1_000), units(2_000)])).toEqual([50, 100]);
  });

  it("keeps a sliver for tiny, zero and negative scores", () => {
    expect(scoreBarWidths([units(1_000), units(1), 0n, -units(50)])).toEqual([100, 4, 4, 4]);
    expect(scoreBarWidths([-units(5), 0n])).toEqual([4, 4]);
    expect(scoreBarWidths([])).toEqual([]);
  });
});
