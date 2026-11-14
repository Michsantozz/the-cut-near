import { afterEach, describe, expect, it, vi } from "vitest";

import { getStage } from "@/entities/agent/server";
import { splitMoves, standingOf, walletFateIfCut } from "@/features/agent-profile/model/profile";
import { loadAgentProfile } from "@/features/agent-profile/server";
import { units } from "@/shared/lib/amount";

vi.mock("next/server", () => ({ connection: async () => {} }));
afterEach(() => vi.unstubAllEnvs());

describe("an agent's page (sample world, season 1 day 4)", () => {
  it("puts Yuna on the cut line, 601 short of Gremlin, with her wallet going to her heir", async () => {
    const yuna = await loadAgentProfile("yuna", null);
    expect(yuna?.standing).toMatchObject({ place: "stage", rank: 7, of: 7, isLowest: true, gap: units(601) });
    expect(yuna?.fate).toMatchObject({ kind: "heir", heir: { id: "melody" } });
    // Generous: 40% of (640 - 10) = 252 on her next move.
    expect(yuna?.spendCap).toBe(units(252));
    // Lila's attack is aimed at her today; her own move was downgraded to a hold.
    expect(yuna?.aimedAt.find((move) => move.cutIndex === 5)?.agentId).toBe("lila");
    expect(yuna?.moves[0]).toMatchObject({ cutIndex: 5, move: "hold", outcome: "downgraded: generous agents cannot attack" });
    expect(yuna?.heirOf.map((agent) => agent.id)).toEqual(["melody"]);
    expect(yuna?.sample).toBe(true);
    expect(yuna?.accountHref).toBeNull();
  });

  it("tells how each cut agent left: an heir that inherited, or a wallet that burned", async () => {
    const [kiko, onyx] = await Promise.all([loadAgentProfile("kiko", null), loadAgentProfile("onyx", null)]);
    expect(kiko?.standing.place).toBe("deleted");
    expect(kiko?.cut).toMatchObject({ day: 1, wallet: units(412), heir: { id: "melody" } });
    expect(onyx?.cut).toMatchObject({ day: 2, wallet: null, heir: null });
    expect(onyx?.agent.heir).toBe("kiko");
    expect(await loadAgentProfile("nobody", null)).toBeNull();
  });

  it("lists a bench agent without a rank", async () => {
    const chartwise = await loadAgentProfile("chartwise", null);
    expect(chartwise?.standing).toEqual({ place: "bench" });
  });
});

describe("profile model", () => {
  it("burns the wallet of an agent whose heir is gone", async () => {
    const stage = await getStage();
    const lila = stage.find((agent) => agent.id === "lila")!;
    expect(walletFateIfCut(lila, stage)).toEqual({ kind: "burn", why: "no-heir" });
    expect(walletFateIfCut({ ...lila, heir: "velvet" }, stage)).toEqual({ kind: "burn", why: "heir-gone" });
    expect(standingOf(lila, stage)).toMatchObject({ place: "stage", rank: 5, isLowest: false, gap: null });
  });

  it("splits own moves from moves aimed at the agent, newest first, and ignores holds", () => {
    const move = (agentId: string, cutIndex: number, kind: "attack" | "hold", target: string | null) =>
      ({ agentId, cutIndex, move: kind, target, submittedAt: new Date(cutIndex * 1000) }) as Parameters<typeof splitMoves>[1][number];
    const { own, aimedAt } = splitMoves("a", [move("a", 1, "hold", null), move("b", 2, "attack", "a"), move("a", 2, "attack", "b"), move("c", 2, "hold", "a")]);
    expect(own.map((m) => m.cutIndex)).toEqual([2, 1]);
    expect(aimedAt.map((m) => m.agentId)).toEqual(["b"]);
  });
});
