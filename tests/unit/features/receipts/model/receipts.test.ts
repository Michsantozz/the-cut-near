import { describe, expect, it } from "vitest";

import { getParams } from "@/entities/market/server";
import { getJournal, getJournalStats } from "@/entities/journal/server";
import { getAgents, getBench, getStage } from "@/entities/agent/server";
import { runAudit, LAUNCH_PARAMS } from "@/features/receipts/model/audit";
import { describeGroup, groupEntries, isFoldedBurn, nearText, whenText, type DescribeContext } from "@/features/receipts/model/describe";
import { cursorParam, filterEvents, parseCursor, parseFilter, receiptsHref, type Cursor } from "@/features/receipts/model/filters";
import { percentText, supplyOf } from "@/features/receipts/model/supply";
import { sampleHoursBeforeCut } from "@/shared/config/sample";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";

const NOW = sampleHoursBeforeCut(1);

/** The whole sample journal, newest first, page by page. */
async function everything() {
  const entries = [];
  let before: Cursor | undefined;
  do {
    const page = await getJournal({ limit: 200, before });
    entries.push(...page.entries);
    before = page.next ?? undefined;
  } while (before);
  return entries;
}

async function context(): Promise<DescribeContext> {
  const names = new Map([...(await getStage()), ...(await getBench())].map((r) => [r.id, r.name] as const));
  for (const agent of await getAgents(["kiko", "onyx", "velvet"])) names.set(agent.id, agent.name);
  const all = await everything();
  return {
    names,
    now: NOW,
    cutAt: (index) => (index >= 1 ? sampleHoursBeforeCut((5 - index) * 24) : null),
    siblings: (txHash) => all.filter((e) => e.txHash === txHash),
  };
}

async function lines() {
  const ctx = await context();
  const groups = groupEntries(await everything());
  return { ctx, groups, lines: groups.map((g) => describeGroup(g, ctx)) };
}

describe("groupEntries", () => {
  it("reads one event of one transaction as one line, oldest entry first", async () => {
    const entries = await everything();
    const groups = groupEntries(entries);
    const prizes = groups.filter((g) => g.event === "prize").map((g) => g.entries.length);
    expect(prizes).toEqual([7, 8, 9]);
    const register = groups.find((g) => g.event === "register" && g.entries.length > 1)!;
    expect(register.entries).toHaveLength(10);
    expect(register.entries[0].blockHeight).toBeLessThanOrEqual(register.entries.at(-1)!.blockHeight);
    expect(groups.find((g) => g.event === "season_start")!.entries.map((e) => e.agentId)).toHaveLength(10);
    expect(groups.reduce((sum, g) => sum + g.entries.length, 0)).toBe(entries.length);
  });
});

describe("describeGroup", () => {
  it("writes the cut receipt with the heir", async () => {
    const { ctx, groups } = await lines();
    const line = describeGroup(groups.find((g) => g.event === "cut")!, ctx);
    expect(line.tag).toBe("cut");
    expect(line.what).toBe("Cut #4: Velvet Vee is cut");
    // Burned: Gremlin's 700 attack and half the pile. Score: the pile less the attack.
    expect(line.cut).toMatchObject({ index: 4, agentId: "velvet", score: units(10_700), pile: units(11_400), burned: units(6_400), prize: units(7_630), survivors: 7, heirName: "Lila Loop", wallet: units(760) });
    const onyx = describeGroup(groups.find((g) => g.event === "cut" && g.entries[0].cutIndex === 3)!, ctx);
    expect(onyx.cut).toMatchObject({ heirName: null, wallet: units(2_310), burned: units(1_300 + 4_450 + 2_310) });
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
    // Cut #2: Pixie survived and paid; Kiko was cut, so her bounty went back to her wallet.
    expect(all.find((l) => l.what === "Pixie Volt survived and paid its savers 900 $CUT")!.detail).toContain("200 $CUT went back to Kiko Bun’s wallet");
    const yuna = all.find((l) => l.what === "Yuna Star holds its money")!;
    expect(yuna.detail).toBe("The contract downgraded it: generous agents cannot attack · names Melody-9 its heir · 10 $CUT think fee burned");
    const mabel = all.find((l) => l.what === "Mabel Market pays Oracle Toad 47 $CUT for a pact")!;
    expect(mabel.detail).toMatch(/^The contract cut it down: a miser spends at most 5% of its wallet a day · /);
    expect(all.find((l) => l.what === "underdog.sample booed Lila Loop: 300 $CUT burned for good")!.detail).toMatch(/^Lila Loop’s boos for cut #5: 2,100 \$CUT off its score/);
    expect(all.find((l) => l.what.startsWith("mika.near bought 120 $CUT"))!.detail).toMatch(/^1% fee, 1\.2 \$CUT: 0\.6 to the season pot, 0\.6 to /);
    expect(all.find((l) => l.tag === "move")!.label).toBe("MOVE");
  });

  it("folds a move's think fee and a boo's burn into their own lines", async () => {
    const { ctx, groups } = await lines();
    const folded = groups.filter((g) => isFoldedBurn(g, ctx));
    expect(folded.length).toBe(30 + 7);
    expect(groups.filter((g) => g.event === "ft_burn" && !isFoldedBurn(g, ctx)).map((g) => String(g.entries[0].data.memo))).toEqual(
      expect.arrayContaining(["cut 4", "cut 3", "heirless wallet"]),
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
    const input = { contractId: "thecut.sample", sample: true, fullAccessKeys: null, stats, totalSupply: LAUNCH_PARAMS.totalSupply - stats.burned, books: null, agents, params };
    const checks = runAudit(input);
    expect(checks.map((c) => c.pass)).toEqual([true, true, true, true]);
    expect(checks.some((c) => c.title.includes("full-access"))).toBe(false);
    expect(runAudit({ ...input, totalSupply: LAUNCH_PARAMS.totalSupply }).some((c) => !c.pass)).toBe(true);
    expect(runAudit({ ...input, params: { ...params, thinkFee: units(5) } }).at(-1)!.pass).toBe(false);
  });

  it("checks the contract's keys in live mode", async () => {
    const [stats, params, stage] = await Promise.all([getJournalStats(), getParams(), getStage()]);
    const input = { contractId: "thecut.testnet", sample: false, fullAccessKeys: 0, stats, totalSupply: LAUNCH_PARAMS.totalSupply - stats.burned, books: null, agents: stage, params };
    expect(runAudit(input)[0]).toMatchObject({ title: "No full-access key on thecut.testnet", pass: true });
    expect(runAudit({ ...input, fullAccessKeys: 1 })[0].pass).toBe(false);
    expect(runAudit({ ...input, params: { ...params, cutIntervalMs: 180_000, moveLeadMs: 30_000 } }).at(-1)!.pass).toBe(true);
  });

  it("compares a lagging journal with the contract as it was at the journal's last block", async () => {
    const [stats, params, stage, bench] = await Promise.all([getJournalStats(), getParams(), getStage(), getBench()]);
    const agents = [...stage, ...bench];
    // The chain moved on after the journal's last block: 30 $CUT of think fees burned and 0.5 $CUT saved since.
    const now = { totalSupply: LAUNCH_PARAMS.totalSupply - stats.burned - units(30), pile: units(1) / 2n };
    const lagging = { contractId: "thecut.testnet", sample: false, fullAccessKeys: 0, stats, totalSupply: now.totalSupply, params };
    const atBlock = { block: 277_690_085, totalSupply: LAUNCH_PARAMS.totalSupply - stats.burned, totalSaved: stats.saved };
    const checks = runAudit({ ...lagging, books: atBlock, agents: agents.map((a, i) => (i === 0 ? { ...a, pile: a.pile + now.pile } : a)) });
    expect(checks.slice(1, 3).map((c) => c.pass)).toEqual([true, true]);
    expect(checks[1].detail).toContain("at block 277,690,085");
    expect(runAudit({ ...lagging, books: { ...atBlock, totalSupply: atBlock.totalSupply - 1n }, agents })[1].pass).toBe(false);
    expect(runAudit({ ...lagging, books: { ...atBlock, totalSaved: atBlock.totalSaved + 1n }, agents })[2].pass).toBe(false);
  });
});

describe("small trades", () => {
  const buy = (data: Record<string, unknown>) => ({
    key: "t",
    event: "buy",
    txHash: "tx",
    at: NOW,
    entries: [{ id: "t", standard: "thecut", event: "buy", at: NOW, txHash: "tx", blockHeight: 1, accountId: "fan.testnet", agentId: null, cutIndex: 5, amount: null, data }],
  });
  const ctx: DescribeContext = { names: new Map(), now: NOW, cutAt: () => null, siblings: () => [] };

  it("keeps the NEAR a testnet buy paid instead of rounding it to 0.1 or 0", () => {
    expect(nearText(units(5, NEAR_DECIMALS - 2))).toBe("0.05");
    expect(nearText(units(215, NEAR_DECIMALS - 7))).toBe("0.0000215");
    expect(nearText(units(859, NEAR_DECIMALS - 1))).toBe("85.9");
    const line = describeGroup(buy({ account_id: "fan.testnet", near_in: units(5, NEAR_DECIMALS - 2).toString(), cut_out: (units(1_152_476) / 10n).toString(), fee: (units(5) / 10n).toString(), to_pot: (units(25) / 100n).toString(), cut_index: 5 }), ctx);
    expect(line.what).toBe("fan.testnet bought 115,247.6 $CUT for 0.05 NEAR");
    // Half a $CUT fee splits into halves that add up, not 0.3 + 0.3.
    expect(line.detail).toBe("1% fee, 0.5 $CUT: 0.25 to the season pot, 0.25 to the prize of cut #5");
  });
});
