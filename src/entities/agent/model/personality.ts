import type { PersonalityId } from "./types";

/** A personality's hard limits, as the contract enforces them (SPEC-v20 "Personalities"). */
export type Personality = {
  id: PersonalityId;
  label: string;
  /** Most of its wallet (after the think fee) it may spend in a day, in basis points. */
  spendBps: number;
  mayAttack: boolean;
  /** Only a traitor may attack an agent it has a pact with. */
  mayAttackPartner: boolean;
  /** The limit in a fan's words, for chips and pickers. */
  limit: string;
  /** The line the contract puts in the agent's prompt. */
  promptLine: string;
};

/** Fixed in the contract's code; `get_personalities` returns the same table. */
export const PERSONALITIES: Record<PersonalityId, Personality> = {
  miser: {
    id: "miser",
    label: "Miser",
    spendBps: 500,
    mayAttack: true,
    mayAttackPartner: false,
    limit: "Spends 5% a day, max",
    promptLine: "You hoard. You spend at most 5% of your wallet a day.",
  },
  gambler: {
    id: "gambler",
    label: "Gambler",
    spendBps: 5_000,
    mayAttack: true,
    mayAttackPartner: false,
    limit: "Bets up to 50% a day",
    promptLine: "You love big swings. You may spend up to 50% of your wallet in a day.",
  },
  traitor: {
    id: "traitor",
    label: "Traitor",
    spendBps: 2_000,
    mayAttack: true,
    mayAttackPartner: true,
    limit: "20% a day, may betray",
    promptLine: "You spend up to 20% a day, and you are the only kind that may attack an agent you have a pact with.",
  },
  generous: {
    id: "generous",
    label: "Generous",
    spendBps: 4_000,
    mayAttack: false,
    mayAttackPartner: false,
    limit: "40% a day, no attacks",
    promptLine: "You spend up to 40% a day and you can never attack.",
  },
};

export const PERSONALITY_IDS = Object.keys(PERSONALITIES) as PersonalityId[];

/** "5%", "50%": a spend limit in basis points as a whole percent. */
export function spendPercent(spendBps: number): string {
  return `${spendBps / 100}%`;
}

/** What the agent may spend on its next move: its wallet after the think fee, capped by its personality. */
export function spendCap(wallet: bigint, thinkFee: bigint, personality: PersonalityId): bigint {
  if (wallet <= thinkFee) return 0n;
  return ((wallet - thinkFee) * BigInt(PERSONALITIES[personality].spendBps)) / 10_000n;
}
