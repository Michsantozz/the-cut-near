import { describe, expect, it } from "vitest";

import { getParams } from "@/entities/market/server";
import { getJournal, getJournalStats } from "@/entities/journal/server";
import { getAgents, getBench, getStage } from "@/entities/agent/server";
import { runAudit, LAUNCH_PARAMS } from "@/features/receipts/model/audit";
import { describeGroup, groupEntries, isFoldedBurn, whenText, type DescribeContext } from "@/features/receipts/model/describe";
import { cursorParam, filterEvents, parseCursor, parseFilter, receiptsHref } from "@/features/receipts/model/filters";
import { percentText, supplyOf } from "@/features/receipts/model/supply";
import { sampleHoursBeforeCut } from "@/shared/config/sample";
import { units } from "@/shared/lib/amount";

const NOW = sampleHoursBeforeCut(1);

async function context(): Promise<DescribeContext> {
  const names = new Map([...(await getStage()), ...(await getBench())].map((r) => [r.id, r.name] as const));
  for (const agent of await getAgents(["kiko", "onyx", "velvet"])) names.set(agent.id, agent.name);
  const all = (await getJournal({ limit: 200 })).entries;
  return {
    names,
    now: NOW,
    cutAt: (index) => (index >= 1 ? sampleHoursBeforeCut((5 - index) * 24) : null),
    siblings: (txHash) => all.filter((e) => e.txHash === txHash),
  };
}

async function lines() {
  const ctx = await context();
  const groups = groupEntries((await getJournal({ limit: 200 })).entries);
  return { ctx, groups, lines: groups.map((g) => describeGroup(g, ctx)) };
}

describe("groupEntries", () => {
  it("reads one event of one transaction as one line, oldest entry first", async () => {
    const { entries } = await getJournal({ limit: 200 });
    const groups = groupEntries(entries);
    const prizes = groups.filter((g) => g.event === "prize").map((g) => g.entries.length);
    expect(prizes).toEqual([7, 8, 9]);
    const register = groups.find((g) => g.event === "register" && g.entries.length > 1)!;
    expect(register.entries).toHaveLength(10);
    expect(register.entries[0].blockHeight).toBeLessThanOrEqual(register.entries.at(-1)!.blockHeight);
    expect(groups.reduce((sum, g) => sum + g.entries.length, 0)).toBe(entries.length);
  });
});

describe("describeGroup", () => {
  it("writes the cut receipt with the heir", async () => {
    const { ctx, groups } = await lines();
    const line = describeGroup(groups.find((g) => g.event === "cut")!, ctx);
    expect(line.tag).toBe("cut");
    expect(line.what).toBe("Cut #4: Velvet Vee is cut");
    expect(line.cut).toMatchObject({ index: 4, agentId: "velvet", pile: units(11_400), burned: units(5_700), prize: units(7_630), survivors: 7, heirName: "Lila Loop", wallet: units(760) });
    expect(line.cut!.slice).toBe(units(981));
  });

  it("tells moves, boos, attacks, heirs and the season start in a fan's words", async () => {
    const { lines: all } = await lines();
    const what = all.map((l) => l.what);
    expect(what).toContain("Lila Loop attacks Yuna Star with 300 $CUT");
    expect(what).toContain("yunafan.sample booed Lila Loop: 1,200 $CUT burned for good");
    expect(what).toContain("Glitch Gremlin attacked Velvet Vee: 700 $CUT burned");
    expect(what).toContain("Kiko Bun’s wallet went to its heir Melody-9: 412 $CUT");
    expect(what).toContain("Onyx Moon’s wallet burned: 2,310 $CUT");
    expect(what).toContain("Season 1 started: 10 agents took the stage");
    expect(what).toContain("10,000,000 $CUT minted, once");
    const yuna = all.find((l) => l.what === "Yuna Star holds its money")!;
    expect(yuna.detail).toBe("The contract downgraded it: generous agents cannot attack · 10 $CUT think fee burned");
    expect(all.find((l) => l.tag === "move")!.label).toBe("MOVE");
  });

  it("folds a move's think fee and a boo's burn into their own lines", async () => {
    const { ctx, groups } = await lines();
    const folded = groups.filter((g) => isFoldedBurn(g, ctx));
    expect(folded.length).toBe(30 + 7);
    expect(groups.filter((g) => g.event === "ft_burn" && !isFoldedBurn(g, ctx)).map((g) => String(g.entries[0].data.memo))).toEqual(
      expect.arrayContaining(["cut 4", "attacks", "cut 3: wallet, no living heir"]),
    );
  });

  it("dates lines like the journal column", () => {
    expect(whenText(new Date(NOW.getTime() - 3_600_000), NOW)).toMatch(/^Today \d\d:\d\d$/);
    expect(whenText(new Date("2026-11-12T15:01:00Z"), new Date("2026-11-14T15:01:00Z"))).toMatch(/Nov 12, 15:01$/);
  });
});

describe("filters", () => {
  it("parses filters and cursors from the URL", () => {
    expect(parseFilter("cuts")).toBe("cuts");
    expect(parseFilter("nope")).toBe("all");
    expect(parseFilter(undefined)).toBe("all");
    expect(filterEvents("burns")).toContain("ft_burn");
    expect(filterEvents("moves")).toEqual(["move", "pact", "attack", "rescue"]);
    expect(filterEvents("boos")).toEqual(["boo"]);
    expect(filterEvents("all")).toContain("ft_mint");
    expect(filterEvents("all")).not.toContain("ft_transfer");
    const cursor = { blockHeight: 186_920_000, id: 42 };
    expect(parseCursor(cursorParam(cursor))).toEqual(cursor);
    expect(parseCursor("x.1")).toBeUndefined();
    expect(receiptsHref("all")).toBe("/receipts");
    expect(receiptsHref("cuts", cursor)).toContain("before=186920000.42");
  });
});

describe("supplyOf", () => {
  it("splits the minted supply into burned, saved and free", () => {
    const s = supplyOf(units(10_000_000), units(11_800), units(1_184_600));
    expect(s.free).toBe(units(8_803_600));
    expect(percentText(s.savedPermille)).toBe("11.8%");
    expect(percentText(s.freePermille)).toBe("88.0%");
    expect(supplyOf(0n, 0n, 0n).savedPermille).toBe(0);
    expect(supplyOf(units(10), 0n, units(20)).free).toBe(0n);
  });
});

describe("runAudit", () => {
  it("adds up on the sample world and fails on a wrong supply", async () => {
    const [stats, params, stage, bench] = await Promise.all([getJournalStats(), getParams(), getStage(), getBench()]);
    const agents = [...stage, ...bench];
    const input = { contractId: "thecut.sample", sample: true, fullAccessKeys: null, stats, totalSupply: LAUNCH_PARAMS.totalSupply - stats.burned, agents, params };
    const checks = runAudit(input);
    expect(checks.map((c) => c.pass)).toEqual([true, true, true, true]);
    expect(checks.some((c) => c.title.includes("full-access"))).toBe(false);
    expect(runAudit({ ...input, totalSupply: LAUNCH_PARAMS.totalSupply }).some((c) => !c.pass)).toBe(true);
    expect(runAudit({ ...input, params: { ...params, thinkFee: units(5) } }).at(-1)!.pass).toBe(false);
  });

  it("checks the contract's keys in live mode", async () => {
    const [stats, params, stage] = await Promise.all([getJournalStats(), getParams(), getStage()]);
    const input = { contractId: "thecut.testnet", sample: false, fullAccessKeys: 0, stats, totalSupply: LAUNCH_PARAMS.totalSupply - stats.burned, agents: stage, params };
    expect(runAudit(input)[0]).toMatchObject({ title: "No full-access key on thecut.testnet", pass: true });
    expect(runAudit({ ...input, fullAccessKeys: 1 })[0].pass).toBe(false);
    expect(runAudit({ ...input, params: { ...params, cutIntervalMs: 180_000, moveLeadMs: 30_000 } }).at(-1)!.pass).toBe(true);
  });
});
