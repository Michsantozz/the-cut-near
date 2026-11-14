import type { NextCut } from "@/entities/cut";
import { valueInUsdCents, type Params, type Pool } from "@/entities/market";
import { barPercent, rankByScore, type Agent } from "@/entities/agent";
import { units } from "@/shared/lib/amount";

// The public landing (Landing.dc.html, RULES.md): the stage, the prize rule and one cut worked out, all from the
// same data as the app. "If the cut ran now" numbers floor each step like the contract (`contracts/thecut/src/math.rs`).

const BPS = 10_000n;
const HUNDRED_CUT = units(100);

/** The worked example's save: 400 $CUT, the design's example amount. */
export const EXAMPLE_SAVE = units(400);

export type StageRow = {
  agent: Agent;
  rank: number;
  /** Score bar width, percent of the top score. */
  bar: number;
  /** What 100 $CUT saved here gets if the cut ran now. Null for the agent the cut takes, or an empty pile. */
  pays: bigint | null;
  isLowest: boolean;
};

export type WorkedSave = { agent: Agent; part: bigint };

export type LandingNumbers = {
  /** The stage ranked by score (pile - boos - damage), highest first. */
  rows: StageRow[];
  lowest: Agent | null;
  /** The agent right above the lowest: the one it has to pass. */
  next: Agent | null;
  totalSaved: bigint;
  /** If the cut ran now: `burnBps` of the lowest pile burns, the rest plus the day's fees is the day prize. */
  burn: bigint;
  prize: bigint;
  /** The prize's three shares: savers (equal slices per survivor), the survivors' wallets, the creators. */
  saversTotal: bigint;
  agentsTotal: bigint;
  creatorsTotal: bigint;
  /** One survivor's savers' slice; each survivor's savers get at most its pile (1 $CUT per $CUT saved). */
  slice: bigint;
  /** What each surviving agent's wallet gets. */
  agentShare: bigint;
  creatorSlice: bigint;
  survivors: number;
  supplyAfter: bigint;
  /** The survivor that pays the most per $CUT (smallest surviving pile) and the one that pays the least. */
  topPayer: StageRow | null;
  leader: StageRow | null;
  /** The worked example: 400 $CUT on the middle agent, and the same 400 on the top payer. */
  example: { save: WorkedSave; usdCents: bigint | null; alt: WorkedSave | null } | null;
};

export type LandingInput = {
  stage: readonly Agent[];
  lowestId: NextCut["lowestId"];
  fees: bigint;
  params: Params;
  supply: bigint;
  pool: Pick<Pool, "nearReserve" | "cutReserve">;
  usdCentsPerNear: bigint | null;
};

/** What `amount` saved on `pile` gets from a slice, capped at 1 $CUT per $CUT saved like the contract. */
function partOfSlice(amount: bigint, pile: bigint, slice: bigint): bigint {
  if (pile <= 0n) return 0n;
  return (amount * (slice < pile ? slice : pile)) / pile;
}

/** Everything the landing derives from the stage, the fees so far and the launch parameters. */
export function landingNumbers({ stage, lowestId, fees, params, supply, pool, usdCentsPerNear }: LandingInput): LandingNumbers {
  const ranked = rankByScore(stage);
  const lowest = ranked.find((agent) => agent.id === lowestId) ?? ranked.at(-1) ?? null;
  const next = lowest ? (ranked[ranked.indexOf(lowest) - 1] ?? null) : null;
  const top = ranked[0]?.score ?? 0n;
  const survivors = Math.max(ranked.length - 1, 1);
  const count = BigInt(survivors);

  const burn = lowest ? (lowest.pile * BigInt(params.burnBps)) / BPS : 0n;
  const prize = lowest ? lowest.pile - burn + fees : 0n;
  const saversTotal = (prize * BigInt(params.saversBps)) / BPS;
  const agentsTotal = (prize * BigInt(params.agentsBps)) / BPS;
  const creatorsTotal = prize - saversTotal - agentsTotal;
  const slice = saversTotal / count;

  const rows: StageRow[] = ranked.map((agent, index) => ({
    agent,
    rank: index + 1,
    bar: barPercent(agent.score > 0n ? agent.score : 0n, top > 0n ? top : 0n, 4),
    pays: agent === lowest || agent.pile <= 0n ? null : partOfSlice(HUNDRED_CUT, agent.pile, slice),
    isLowest: agent === lowest,
  }));
  const paying = rows.filter((row) => row.pays !== null);
  const byPays = [...paying].sort((a, b) => (a.pays! === b.pays! ? 0 : a.pays! > b.pays! ? -1 : 1));
  const topPayer = byPays[0] ?? null;
  const leader = byPays.at(-1) ?? null;

  const middle = ranked[Math.floor((ranked.length - 1) / 2)];
  const partOf = (agent: Agent) => partOfSlice(EXAMPLE_SAVE, agent.pile, slice);
  const example =
    middle && middle !== lowest && slice > 0n && middle.pile > 0n
      ? {
          save: { agent: middle, part: partOf(middle) },
          usdCents: usdCentsPerNear === null ? null : valueInUsdCents(partOf(middle), pool, usdCentsPerNear),
          alt: topPayer && topPayer.agent !== middle ? { agent: topPayer.agent, part: partOf(topPayer.agent) } : null,
        }
      : null;

  return {
    rows,
    lowest,
    next,
    totalSaved: ranked.reduce((sum, agent) => sum + agent.pile, 0n),
    burn,
    prize,
    saversTotal,
    agentsTotal,
    creatorsTotal,
    slice,
    agentShare: agentsTotal / count,
    creatorSlice: creatorsTotal / count,
    survivors,
    supplyAfter: supply - burn,
    topPayer,
    leader,
    example,
  };
}

/** How many times more the top payer pays than the leader, rounded: "about 3x". Null when it is not at least 2x. */
export function payRatio(numbers: Pick<LandingNumbers, "topPayer" | "leader">): number | null {
  const top = numbers.topPayer?.pays;
  const low = numbers.leader?.pays;
  if (!top || !low || numbers.topPayer === numbers.leader) return null;
  const ratio = Math.round(Number((top * 100n) / low) / 100);
  return ratio >= 2 ? ratio : null;
}

/** "Bloop, queue 31,200 from 102 savers, and Pixel Kit, 12,600 from 47": the bench past its first agent. */
export function benchRest(bench: readonly Agent[], cut: (value: bigint) => string): string | null {
  const rest = bench.slice(1);
  if (rest.length === 0) return null;
  const items = rest.map((agent, index) => (index === 0 ? `${agent.name}, queue ${cut(agent.pile)} from ${agent.savers} savers` : `${agent.name}, ${cut(agent.pile)} from ${agent.savers}`));
  return items.length === 1 ? items[0]! : `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

const DAY_MS = 86_400_000;

/** How often the cut runs, from `cut_interval`: "every day", "every 2 minutes". */
export function cadence(intervalMs: number): string {
  if (intervalMs === DAY_MS) return "every day";
  if (intervalMs % DAY_MS === 0) return `every ${intervalMs / DAY_MS} days`;
  const minutes = Math.round(intervalMs / 60_000);
  return minutes === 1 ? "every minute" : `every ${minutes} minutes`;
}

/** The agent account's parent, the account that created it: "kiko.thecut.near" → "thecut.near". */
export function parentAccount(accountId: string): string {
  return accountId.split(".").slice(1).join(".");
}
