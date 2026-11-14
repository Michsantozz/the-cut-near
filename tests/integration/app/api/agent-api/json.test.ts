import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as agentRoute } from "@/app/api/agents/[id]/route";
import { GET as gameRoute, OPTIONS as gameOptions } from "@/app/api/game/route";
import { GET as movesRoute } from "@/app/api/moves/route";

// The read-only JSON API in sample mode: no chain, no database.

beforeEach(() => vi.stubEnv("DATA_SOURCE", "sample"));
afterEach(() => vi.unstubAllEnvs());

const agentParams = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/game", () => {
  it("serves the board with source sample, score parts, bench and moves", async () => {
    const response = await gameRoute(new Request("http://x/api/game"));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toContain("max-age=5");
    const body = await response.json();
    expect(Object.keys(body)[0]).toBe("source");
    expect(body.source).toBe("sample");
    expect(body.contract_id).toBeUndefined();
    expect(body.season).toMatchObject({ index: 1, active: true, day: 4 });
    expect(body.next_cut).toMatchObject({ index: 5, lowest_id: "yuna", due: false });
    expect(Date.parse(body.next_cut.moves_close_at)).toBeLessThan(Date.parse(body.next_cut.at));
    expect(body.stage).toHaveLength(7);
    const last = body.stage.at(-1);
    expect(last).toMatchObject({ id: "yuna", rank: 7, on_cut_line: true });
    for (const agent of body.stage) {
      const score = Number(agent.pile_cut) - Number(agent.boos_cut) - Number(agent.damage_cut);
      expect(Number(agent.score_cut)).toBeCloseTo(score, 6);
    }
    expect(body.bench[0].id).toBe("chartwise");
    expect(body.latest_moves.cut_index).toBe(5);
    expect(body.latest_moves.moves.length).toBeGreaterThan(0);
    expect(body.params).toMatchObject({ fee_bps: 100, min_seed_cut: "1000", register_deposit_near: "1", model_id: "z-ai/glm-5.3-flash" });
  });

  it("answers the CORS preflight", async () => {
    const response = gameOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("GET");
  });
});

describe("GET /api/agents/{id}", () => {
  it("serves one agent with its charter and moves", async () => {
    const body = await (await agentRoute(new Request("http://x/api/agents/lila"), agentParams("lila"))).json();
    expect(body.source).toBe("sample");
    expect(body.agent).toMatchObject({ id: "lila", status: "stage" });
    expect(typeof body.agent.charter).toBe("string");
    expect(body.moves.every((m: { agent_id: string }) => m.agent_id === "lila")).toBe(true);
  });

  it("says 404 for an unknown agent and 400 for a bad id", async () => {
    const missing = await agentRoute(new Request("http://x"), agentParams("nobody"));
    expect(missing.status).toBe(404);
    expect((await missing.json()).message).toContain("/api/game");
    expect((await agentRoute(new Request("http://x"), agentParams("BAD ID"))).status).toBe(400);
  });
});

describe("GET /api/moves", () => {
  it("serves the coming cut's moves by default and any cut by ?cut=", async () => {
    const today = await (await movesRoute(new Request("http://x/api/moves"))).json();
    expect(today).toMatchObject({ source: "sample", cut_index: 5 });
    expect(today.moves[0]).toHaveProperty("amount_cut");
    const past = await (await movesRoute(new Request("http://x/api/moves?cut=3"))).json();
    expect(past.cut_index).toBe(3);
    expect(past.moves.every((m: { cut_index: number }) => m.cut_index === 3)).toBe(true);
  });

  it("refuses a cut that is not a number", async () => {
    expect((await movesRoute(new Request("http://x/api/moves?cut=-1"))).status).toBe(400);
  });
});
