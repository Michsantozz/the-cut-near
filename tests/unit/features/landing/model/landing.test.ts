import { describe, expect, it } from "vitest";

import { getNextCut } from "@/entities/cut/server";
import { getParams, getPool, getTotalSupply } from "@/entities/market/server";
import { getBench, getStage } from "@/entities/agent/server";
import { benchRest, cadence, landingNumbers, parentAccount, payRatio } from "@/features/landing/model/landing";
import { formatAmount } from "@/shared/ui/format";

const whole = (value: bigint) => formatAmount(value, { maxFractionDigits: 0 });
const two = (value: bigint | null) => (value === null ? null : formatAmount(value, { maxFractionDigits: 2, minFractionDigits: 2 }));

async function sampleNumbers() {
  const [stage, nextCut, params, supply, pool] = await Promise.all([getStage(), getNextCut(), getParams(), getTotalSupply(), getPool()]);
  return landingNumbers({ stage, lowestId: nextCut.lowestId, fees: nextCut.prizeSoFar, params, supply, pool, usdCentsPerNear: 250n });
}

describe("landingNumbers on the sample day", () => {
  it("ranks the stage by score and puts the cut line above the lowest score", async () => {
    const numbers = await sampleNumbers();
    expect(numbers.rows.map((row) => row.agent.id)).toEqual(["pixie", "oracle", "mabel", "melody", "lila", "gremlin", "yuna"]);
    expect(numbers.lowest?.id).toBe("yuna");
    expect(numbers.next?.id).toBe("gremlin");
    expect(numbers.rows.at(-1)).toMatchObject({ isLowest: true, pays: null });
    expect(whole(numbers.totalSaved)).toBe("178,900");
  });

  it("works the cut out like the contract: half the pile burns, the rest plus the fees is split 90/5/5", async () => {
    const numbers = await sampleNumbers();
    // Yuna's pile is 15,200 and 2,180 $CUT of fees are in: 7,600 burns, 7,600 + 2,180 = 9,780 is the prize.
    expect(whole(numbers.burn)).toBe("7,600");
    expect(whole(numbers.prize)).toBe("9,780");
    expect(whole(numbers.saversTotal)).toBe("8,802");
    expect(whole(numbers.agentsTotal)).toBe("489");
    expect(numbers.saversTotal + numbers.agentsTotal + numbers.creatorsTotal).toBe(numbers.prize);
    expect(numbers.survivors).toBe(6);
    expect(whole(numbers.slice)).toBe("1,467");
    expect(numbers.supplyAfter).toBe((await getTotalSupply()) - numbers.burn);
  });

  it("pays the most on the smallest surviving pile and names the worked example", async () => {
    const numbers = await sampleNumbers();
    expect(numbers.topPayer?.agent.id).toBe("gremlin");
    expect(numbers.leader?.agent.id).toBe("pixie");
    expect(two(numbers.topPayer?.pays ?? null)).toBe("9.00");
    expect(payRatio(numbers)).toBe(3);
    expect(numbers.example?.save.agent.id).toBe("melody");
    expect(numbers.example?.alt?.agent.id).toBe("gremlin");
    expect(numbers.example?.usdCents).not.toBeNull();
  });

  it("caps a slice at 1 $CUT per $CUT saved", async () => {
    const [stage, params, supply, pool] = await Promise.all([getStage(), getParams(), getTotalSupply(), getPool()]);
    const tiny = stage.map((agent) => (agent.id === "pixie" ? { ...agent, pile: 1_000n * 10n ** 18n } : agent));
    const numbers = landingNumbers({ stage: tiny, lowestId: "yuna", fees: 0n, params, supply, pool, usdCentsPerNear: null });
    expect(numbers.rows.find((row) => row.agent.id === "pixie")?.pays).toBe(100n * 10n ** 18n);
  });

  it("has nothing to cut on an empty stage", async () => {
    const [params, supply, pool] = await Promise.all([getParams(), getTotalSupply(), getPool()]);
    const numbers = landingNumbers({ stage: [], lowestId: null, fees: 0n, params, supply, pool, usdCentsPerNear: null });
    expect(numbers.lowest).toBeNull();
    expect(numbers.rows).toEqual([]);
    expect(numbers.example).toBeNull();
    expect(payRatio(numbers)).toBeNull();
  });
});

describe("landing copy helpers", () => {
  it("lists the bench past its first agent", async () => {
    expect(benchRest(await getBench(), whole)).toBe("Bloop, queue 3,100 from 29 savers, and Pixel Kit, 1,260 from 14");
  });

  it("says how often the cut runs", () => {
    expect(cadence(86_400_000)).toBe("every day");
    expect(cadence(120_000)).toBe("every 2 minutes");
  });

  it("names the account that created an agent", () => {
    expect(parentAccount("kiko.thecut-daily.testnet")).toBe("thecut-daily.testnet");
  });
});
