import { describe, expect, it } from "vitest";

import { relockedTotal, saveProblem } from "@/features/trade/model/save";
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
