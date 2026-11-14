import { NextRequest } from "next/server";
import { getRewrittenUrl, isRewrite, unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAgent = vi.fn();
const getCut = vi.fn();

vi.mock("@/shared/config/data-source", () => ({ dataSource: () => "sample" }));
vi.mock("@/entities/agent/server", () => ({ getAgent: (id: string) => getAgent(id) }));
vi.mock("@/entities/cut/server", () => ({ getCut: (index: number) => getCut(index) }));
vi.mock("@/shared/near/contract", () => ({ cutContract: () => ({ getAgent: (id: string) => getAgent(id) }) }));

const { config, proxy } = await import("@/proxy");

const matches = (url: string) => unstable_doesMiddlewareMatch({ config, nextConfig: {}, url });
const run = (path: string) => proxy(new NextRequest(`https://the-cut.test${path}`));

describe("proxy matcher", () => {
  it("runs on agent and cut share pages", () => {
    expect(matches("/agents/pixie")).toBe(true);
    expect(matches("/share/cut/1")).toBe(true);
  });

  it("never runs on the agent art in public/agents/", () => {
    expect(matches("/agents/pixie.svg")).toBe(false);
    expect(matches("/agents/kiko-pose-a.webp")).toBe(false);
  });

  it("leaves the Open Graph images alone", () => {
    expect(matches("/agents/pixie/opengraph-image-abc123")).toBe(false);
    expect(matches("/share/cut/1/opengraph-image-abc123")).toBe(false);
  });
});

describe("proxy", () => {
  beforeEach(() => {
    getAgent.mockReset();
    getCut.mockReset();
  });

  it("lets an existing agent through", async () => {
    getAgent.mockResolvedValue({ id: "pixie" });
    expect(isRewrite(await run("/agents/pixie"))).toBe(false);
  });

  it("answers a missing agent with the not-found page", async () => {
    getAgent.mockResolvedValue(null);
    const response = await run("/agents/nobody");
    expect(isRewrite(response)).toBe(true);
    expect(getRewrittenUrl(response)).toBe("https://the-cut.test/_not-found-404");
  });

  it("never treats a file as an agent", async () => {
    expect(isRewrite(await run("/agents/pixie.svg"))).toBe(false);
    expect(getAgent).not.toHaveBeenCalled();
  });

  it("lets a cut that started a season through, and 404s a cut that has not run", async () => {
    getCut.mockImplementation(async (index: number) => (index === 1 ? { deletedId: null, seatedIds: ["pixie"] } : null));
    expect(isRewrite(await run("/share/cut/1"))).toBe(false);
    expect(isRewrite(await run("/share/cut/2"))).toBe(true);
    expect(isRewrite(await run("/share/cut/abc"))).toBe(true);
  });

  it("renders the page when the chain cannot be read", async () => {
    getAgent.mockRejectedValue(new Error("rpc down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(isRewrite(await run("/agents/pixie"))).toBe(false);
  });
});
