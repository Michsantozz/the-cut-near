import type { JournalStats } from "@/entities/journal";
import type { Params } from "@/entities/market";
import type { Agent } from "@/entities/agent";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";
import { formatAmount, formatCount } from "@/shared/ui/format";

// The audit (Receipts.dc.html): checks of the journal against what the contract holds now. In sample mode there is
// no contract to read, so the key check is left out and the rest replays the sample journal.

export type AuditCheck = { title: string; detail: string; pass: boolean };

export type AuditInput = {
  contractId: string;
  /** True in sample mode: nothing is read from NEAR, so nothing is claimed about a deployed contract. */
  sample: boolean;
  /** Full-access keys on the contract account; null when they could not be read. */
  fullAccessKeys: number | null;
  stats: JournalStats;
  /** `ft_total_supply` now. */
  totalSupply: bigint;
  /** Every agent on the stage and the bench. */
  agents: readonly Agent[];
  params: Params;
};

const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });

/** The launch values of SPEC-v20 "Parameters": the same for both testnet contracts except the schedule. */
export const LAUNCH_PARAMS = {
  totalSupply: units(10_000_000),
  feeBps: 100,
  potBps: 5_000,
  burnBps: 5_000,
  saversBps: 9_000,
  agentsBps: 500,
  stageSize: 10,
  minSeason: 3,
  thinkFee: units(10),
  minSeed: units(1_000),
  agentFunding: units(3, NEAR_DECIMALS) / 10n,
  registerDeposit: units(1, NEAR_DECIMALS),
  /** Daily (the app) and fast (the demo): a cut every 24 h with moves closing 1 h before, or every 3 min with 30 s. */
  schedules: [
    { cutIntervalMs: 86_400_000, moveLeadMs: 3_600_000 },
    { cutIntervalMs: 180_000, moveLeadMs: 30_000 },
  ],
};

function paramsMatch(params: Params): boolean {
  const l = LAUNCH_PARAMS;
  return (
    params.totalSupply === l.totalSupply &&
    params.feeBps === l.feeBps &&
    params.potBps === l.potBps &&
    params.burnBps === l.burnBps &&
    params.saversBps === l.saversBps &&
    params.agentsBps === l.agentsBps &&
    params.stageSize === l.stageSize &&
    params.minSeason === l.minSeason &&
    params.thinkFee === l.thinkFee &&
    params.minSeed === l.minSeed &&
    params.agentFunding === l.agentFunding &&
    params.registerDeposit === l.registerDeposit &&
    l.schedules.some((s) => s.cutIntervalMs === params.cutIntervalMs && s.moveLeadMs === params.moveLeadMs)
  );
}

export function runAudit(input: AuditInput): AuditCheck[] {
  const { stats, params, agents } = input;
  const piles = agents.reduce((sum, agent) => sum + agent.pile, 0n);
  const unregistered = agents.filter((agent) => !stats.registered.includes(agent.id));
  const where = input.sample ? "the sample contract" : input.contractId;

  const keys: AuditCheck = {
    title: `No full-access key on ${input.contractId}`,
    detail:
      input.fullAccessKeys === null
        ? "Could not read its keys from NEAR."
        : input.fullAccessKeys === 0
          ? "Nobody can change or pause it."
          : `It still has ${formatCount(input.fullAccessKeys)} full-access ${input.fullAccessKeys === 1 ? "key" : "keys"}.`,
    pass: input.fullAccessKeys === 0,
  };

  return [
    ...(input.sample ? [] : [keys]),
    {
      title: "Minted − burned = supply",
      detail: `${cut(stats.minted)} − ${cut(stats.burned)} burned by cuts, boos, attacks and think fees = ${cut(stats.minted - stats.burned)} $CUT; ${where} holds ${cut(input.totalSupply)}`,
      pass: stats.minted - stats.burned === input.totalSupply,
    },
    {
      title: "Sum of piles = saved total",
      detail: `The ${formatCount(agents.length)} piles and queues add up to ${cut(piles)} $CUT; the journal says ${cut(stats.saved)}.`,
      pass: piles === stats.saved,
    },
    {
      title: "Every agent account made by the contract",
      detail:
        unregistered.length === 0
          ? `Each *.${input.contractId} agent traces back to a register call on ${input.contractId}.`
          : `No register event for ${unregistered.map((agent) => agent.name).join(", ")}.`,
      pass: unregistered.length === 0,
    },
    {
      title: "Parameters equal launch values",
      detail: `Burn ${params.burnBps / 100}% · fee ${params.feeBps / 100}%, half to the pot · think fee ${cut(params.thinkFee)} · seed ${cut(params.minSeed)}+ · deposit ${formatAmount(params.registerDeposit, { decimals: NEAR_DECIMALS, maxFractionDigits: 1 })} NEAR · ${formatCount(params.stageSize)} seats`,
      pass: paramsMatch(params),
    },
  ];
}
