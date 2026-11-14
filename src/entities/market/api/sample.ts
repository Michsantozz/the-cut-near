import { units, NEAR_DECIMALS } from "@/shared/lib/amount";
import type { Params, Pool, PricePoint, PriceRange, StorageBalance } from "../model/types";

/** SPEC-v20 "Parameters", testnet daily. */
export const SAMPLE_PARAMS: Params = {
  totalSupply: units(10_000_000),
  feeBps: 100,
  potBps: 5_000,
  burnBps: 5_000,
  saversBps: 9_000,
  agentsBps: 500,
  stageSize: 10,
  minSeason: 3,
  firstCutAt: new Date("2026-11-11T18:00:00Z"),
  cutIntervalMs: 86_400_000,
  moveLeadMs: 3_600_000,
  thinkFee: units(10),
  minSeed: units(1_000),
  agentFunding: units(3, NEAR_DECIMALS) / 10n,
  registerDeposit: units(1, NEAR_DECIMALS),
  modelId: "z-ai/glm-5.3-flash",
};

/** $CUT at $1.84 with 1 NEAR = $2.50: 0.736 NEAR per $CUT. */
export const SAMPLE_POOL: Pool = {
  nearReserve: units(736_000, NEAR_DECIMALS),
  cutReserve: units(1_000_000),
  feeBps: 100,
};

/** The design's NEAR price: 1 NEAR = $2.50 (SPEC-v18 §5). */
export const SAMPLE_USD_CENTS_PER_NEAR = 250n;

/** Minted 10,000,000 minus every sample burn so far (cut piles, boos, attacks, think fees, a heirless wallet). */
export const SAMPLE_TOTAL_SUPPLY = units(9_967_354);

export const SAMPLE_HOLDERS = 2_140;

/** The design's signed-in member, mika.near (SPEC-v19 §2): 674.2 $CUT (400 of it saved), 1,156 NEAR in the wallet. */
export const SAMPLE_CUT_BALANCES = new Map<string, bigint>([["mika.near", units(2_742) / 10n]]);
export const SAMPLE_NEAR_BALANCES = new Map<string, bigint>([["mika.near", units(1_156, NEAR_DECIMALS)]]);

/** NEP-145 minimum of the contract (`STORAGE_MIN`): 0.01 NEAR. */
export const SAMPLE_STORAGE_MIN = units(1, NEAR_DECIMALS) / 100n;
export const SAMPLE_STORAGE = new Map<string, StorageBalance>([["mika.near", { total: SAMPLE_STORAGE_MIN, available: 0n }]]);

// The design's price chart (DeskValue.dc.html): 13 points from launch, Thu Nov 12 15:01, to now, Fri Nov 13 13:48,
// and 13 points over today from 00:00. In US dollars at $2.50 per NEAR.
const SINCE_LAUNCH = [1.733, 1.75, 1.79, 1.77, 1.8, 1.826, 1.81, 1.78, 1.76, 1.79, 1.81, 1.83, 1.84];
const TODAY = [1.812, 1.815, 1.81, 1.818, 1.822, 1.83, 1.826, 1.829, 1.835, 1.832, 1.838, 1.836, 1.84];

function series(dollars: number[], from: string, to: string): PricePoint[] {
  const start = new Date(from).getTime();
  const step = (new Date(to).getTime() - start) / (dollars.length - 1);
  return dollars.map((usd, i) => ({
    at: new Date(start + Math.round(step * i)),
    // milli-dollars → yoctoNEAR at $2.50: × 10^21 / 2.5
    yoctoNearPerCut: (units(Math.round(usd * 1000), NEAR_DECIMALS - 3) * 100n) / SAMPLE_USD_CENTS_PER_NEAR,
  }));
}

export const SAMPLE_PRICES: Record<PriceRange, PricePoint[]> = {
  day: series(TODAY, "2026-11-13T00:00:00Z", "2026-11-13T13:48:00Z"),
  week: series(SINCE_LAUNCH, "2026-11-12T15:01:00Z", "2026-11-13T13:48:00Z"),
  all: series(SINCE_LAUNCH, "2026-11-12T15:01:00Z", "2026-11-13T13:48:00Z"),
};
