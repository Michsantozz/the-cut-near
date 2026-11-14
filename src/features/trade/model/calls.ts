import type { ContractCall } from "@/shared/wallet";

// The contract calls behind each action (docs/contract-interface.md, contracts/thecut/src): one transaction each.

/** What the price may move between the quote and the swap before the contract refuses it: 1%. */
export const SLIPPAGE_BPS = 100;

/** Least amount out the contract must deliver: the quote less the slippage, rounded down. */
export function minOut(quoted: bigint, slippageBps = SLIPPAGE_BPS): bigint {
  if (quoted <= 0n) return 0n;
  return (quoted * BigInt(10_000 - slippageBps)) / 10_000n;
}

/**
 * Buy $CUT with `nearIn` yoctoNEAR. An account that is not registered with the token yet (NEP-145) gets a
 * `storage_deposit` of `registration` first, in the same transaction, so all of `nearIn` goes into the swap.
 */
export function buyCalls({ nearIn, minOut, registration }: { nearIn: bigint; minOut: bigint; registration: bigint | null }): ContractCall[] {
  const calls: ContractCall[] = [];
  if (registration !== null) {
    calls.push({ method: "storage_deposit", args: { registration_only: true }, deposit: registration.toString() });
  }
  calls.push({ method: "buy", args: { min_out: minOut.toString() }, deposit: nearIn.toString() });
  return calls;
}

/** Sell `cutIn` $CUT for at least `minOut` yoctoNEAR. `sell` is not payable: nothing is attached. */
export function sellCalls({ cutIn, minOut }: { cutIn: bigint; minOut: bigint }): ContractCall[] {
  return [{ method: "sell", args: { cut_in: cutIn.toString(), min_out: minOut.toString() } }];
}

/**
 * Lock `amount` $CUT on an agent until the next cut. The save record is paid from the account's storage balance;
 * `storageTopUp` (yoctoNEAR) is attached when that balance is too thin, and the contract credits it first.
 */
export function saveCalls({ agentId, amount, storageTopUp }: { agentId: string; amount: bigint; storageTopUp: bigint }): ContractCall[] {
  const call: ContractCall = { method: "save", args: { agent_id: agentId, amount: amount.toString() } };
  if (storageTopUp > 0n) call.deposit = storageTopUp.toString();
  return [call];
}

/** Take back a whole save with the prize it earned, once the cut it was locked for has run. */
export function unsaveCalls(agentId: string): ContractCall[] {
  return [{ method: "unsave", args: { agent_id: agentId } }];
}

/**
 * NEAR to attach to a save so its record's storage is covered: none when the account has `enough` available,
 * otherwise `topUp`. The contract refunds nothing, the NEAR stays in the account's storage balance.
 */
export function storageTopUp(available: bigint | null, { enough, topUp }: { enough: bigint; topUp: bigint }): bigint {
  return available !== null && available >= enough ? 0n : topUp;
}

/**
 * Boo a stage agent: burns `amount` of the caller's $CUT at once and adds it to the agent's boos for this cut.
 * Nothing is attached and nothing comes back.
 */
export function booCalls({ agentId, amount }: { agentId: string; amount: bigint }): ContractCall[] {
  return [{ method: "boo", args: { agent_id: agentId, amount: amount.toString() } }];
}
