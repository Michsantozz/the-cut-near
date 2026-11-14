import type { JournalStats } from "@/entities/journal";
import type { Params } from "@/entities/market";
import type { Agent } from "@/entities/agent";
import { NEAR_DECIMALS, units } from "@/shared/lib/amount";
import { formatAmount, formatCount } from "@/shared/ui/format";

// The audit (Receipts.dc.html): five checks of the journal against what the contract holds now.

export type AuditCheck = { title: string; detail: string; pass: boolean };

export type AuditInput = {
  contractId: string;
  /** Full-access keys on the contract account; null when they could not be read. */
  fullAccessKeys: number | null;
  stats: JournalStats;
  /** `ft_total_supply` now. */
  totalSupply: bigint;
  /** Every agent on the stage and the bench. */
  agents: readonly Agent[];
  params: Params;
  /** The cut interval the network launched with: a day on mainnet, 2 minutes on testnet. */
  launchIntervalMs: number;
};

const cut = (value: bigint) => formatAmount(value, { maxFractionDigits: 1 });

/** The launch values the contract was deployed with (docs/contract-interface.md "Parameters"). */
export const LAUNCH_PARAMS = {
  totalSupply: units(10_000_000),
  feeBps: 100,
  burnBps: 5_000,
  saversBps: 9_500,
  stageSize: 10,
  agentFunding: units(5, NEAR_DECIMALS) / 10n,
  registerDeposit: units(5, NEAR_DECIMALS),
};

export function runAudit(input: AuditInput): AuditCheck[] {
  const { stats, params, agents } = input;
  const piles = agents.reduce((sum, agent) => sum + agent.pile, 0n);
  const unregistered = agents.filter((agent) => !stats.registered.includes(agent.id));
  const paramsMatch =
    params.totalSupply === LAUNCH_PARAMS.totalSupply &&
    params.feeBps === LAUNCH_PARAMS.feeBps &&
    params.burnBps === LAUNCH_PARAMS.burnBps &&
    params.saversBps === LAUNCH_PARAMS.saversBps &&
    params.stageSize === LAUNCH_PARAMS.stageSize &&
    params.agentFunding === LAUNCH_PARAMS.agentFunding &&
    params.registerDeposit === LAUNCH_PARAMS.registerDeposit &&
    params.cutIntervalMs === input.launchIntervalMs;
  const slices = params.stageSize - 1;

  return [
    {
      title: `No full-access key on ${input.contractId}`,
      detail:
        input.fullAccessKeys === null
          ? "Could not read its keys from NEAR."
          : input.fullAccessKeys === 0
            ? "Nobody can change or pause it."
            : `It still has ${formatCount(input.fullAccessKeys)} full-access ${input.fullAccessKeys === 1 ? "key" : "keys"}.`,
      pass: input.fullAccessKeys === 0,
    },
    {
      title: "Minted − burned = supply",
      detail: `${cut(stats.minted)} − ${cut(stats.burned)} = ${cut(stats.minted - stats.burned)} $CUT; the contract holds ${cut(input.totalSupply)}`,
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
      detail: `Burn ${params.burnBps / 100}% · fee ${params.feeBps / 100}% · ${formatCount(slices)} equal slices · deposit ${formatAmount(params.registerDeposit, { decimals: NEAR_DECIMALS, maxFractionDigits: 1 })} NEAR · ${formatCount(params.stageSize)} seats`,
      pass: paramsMatch,
    },
  ];
}
