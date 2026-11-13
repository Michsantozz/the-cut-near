import { describe, expect, it, vi } from "vitest";
import { KeeperError, runKeeper, type KeeperDeps } from "@/features/keeper/server/run-cut";

const at = new Date("2026-11-13T18:00:00Z");
const cut1 = { index: 1, at };
const cut2 = { index: 2, at: new Date("2026-11-14T18:00:00Z") };

function deps(overrides: Partial<KeeperDeps> & { chain?: Date[]; cuts?: (typeof cut1)[] }): KeeperDeps & { runCut: ReturnType<typeof vi.fn> } {
  const chain = overrides.chain ?? [new Date(at.getTime() + 5_000)];
  const cuts = overrides.cuts ?? [cut1, cut2];
  let c = 0;
  let n = 0;
  return {
    nextCut: async () => cuts[Math.min(n++, cuts.length - 1)],
    chainNow: async () => chain[Math.min(c++, chain.length - 1)],
    sleep: vi.fn(async () => {}),
    runCut: vi.fn(async () => ({ status: "success" as const, txHash: "tx1", logs: [] })),
    ...overrides,
  } as KeeperDeps & { runCut: ReturnType<typeof vi.fn> };
}

describe("runKeeper", () => {
  it("does nothing before the cut", async () => {
    const d = deps({ chain: [new Date("2026-11-13T17:00:00Z")] });
    expect(await runKeeper(d)).toEqual({ status: "too_early", index: 1, dueAt: at.toISOString() });
    expect(d.runCut).not.toHaveBeenCalled();
  });

  it("runs the cut when due", async () => {
    const d = deps({});
    expect(await runKeeper(d)).toEqual({ status: "ran", index: 1, txHash: "tx1" });
    expect(d.runCut).toHaveBeenCalledOnce();
  });

  it("waits for a cut a few seconds away, then runs it", async () => {
    const d = deps({ chain: [new Date(at.getTime() - 20_000), new Date(at.getTime() + 1_000)] });
    expect(await runKeeper(d)).toMatchObject({ status: "ran" });
    expect(d.sleep).toHaveBeenCalledWith(20_000);
  });

  it("gives up after waiting if blocks still lag the cut", async () => {
    const d = deps({ chain: [new Date(at.getTime() - 20_000), new Date(at.getTime() - 500)] });
    expect(await runKeeper(d)).toMatchObject({ status: "too_early" });
    expect(d.runCut).not.toHaveBeenCalled();
  });

  it("is a no-op when the second run of the day sees the next cut", async () => {
    const d = deps({ cuts: [cut2], chain: [new Date(at.getTime() + 60_000)] });
    expect(await runKeeper(d)).toMatchObject({ status: "too_early", index: 2 });
  });

  it("reports already_ran when someone else ran it first", async () => {
    const d = deps({ runCut: vi.fn(async () => ({ status: "failure" as const, txHash: "tx2", logs: [], failure: { panic: "Too early" } })) });
    expect(await runKeeper(d)).toEqual({ status: "already_ran", index: 1, txHash: "tx2" });
  });

  it("checks the chain after a send error too", async () => {
    const d = deps({ runCut: vi.fn(async () => Promise.reject(new Error("InvalidNonce"))) });
    expect(await runKeeper(d)).toEqual({ status: "already_ran", index: 1, txHash: null });
  });

  it("counts a pending transaction that went through as ours", async () => {
    const d = deps({ runCut: vi.fn(async () => ({ status: "pending" as const, txHash: "tx3", logs: [] })) });
    expect(await runKeeper(d)).toEqual({ status: "ran", index: 1, txHash: "tx3" });
  });

  it("throws a KeeperError when the cut is still pending after a failure", async () => {
    const d = deps({ cuts: [cut1, cut1], runCut: vi.fn(async () => ({ status: "failure" as const, txHash: "tx4", logs: [], failure: { ActionError: "panic" } })) });
    const error = await runKeeper(d).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(KeeperError);
    expect(error).toMatchObject({ index: 1, txHash: "tx4" });
    expect((error as Error).message).toContain("ActionError");
  });
});
