import { describe, expect, it } from "vitest";
import { cutHasRun, decideCut, MAX_WAIT_MS } from "@/features/keeper/model/decide";

const at = new Date("2026-11-13T18:00:00Z");
const next = { index: 1, at };
const plus = (ms: number) => new Date(at.getTime() + ms);

describe("decideCut", () => {
  it("runs at or after the cut time", () => {
    expect(decideCut(next, at)).toEqual({ action: "run", index: 1 });
    expect(decideCut(next, plus(3_600_000))).toEqual({ action: "run", index: 1 });
  });

  it("waits when the cut is seconds away", () => {
    expect(decideCut(next, plus(-10_000))).toEqual({ action: "wait", index: 1, waitMs: 10_000 });
    expect(decideCut(next, plus(-MAX_WAIT_MS))).toEqual({ action: "wait", index: 1, waitMs: MAX_WAIT_MS });
  });

  it("does nothing earlier than that", () => {
    expect(decideCut(next, plus(-MAX_WAIT_MS - 1))).toEqual({ action: "skip", reason: "too_early", index: 1, dueAt: at });
    expect(decideCut(next, plus(-1), 0)).toMatchObject({ action: "skip" });
  });
});

describe("cutHasRun", () => {
  it("is true once the contract points at a later cut", () => {
    expect(cutHasRun(next, { index: 2, at: plus(86_400_000) })).toBe(true);
    expect(cutHasRun(next, next)).toBe(false);
  });
});
