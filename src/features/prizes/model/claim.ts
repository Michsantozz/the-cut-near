import type { ContractCall } from "@/shared/wallet";

// The collect transaction (contracts/thecut/src/saves.rs `claim`, `unsave`).

/** NEP-145 minimum storage: `claim()` adds an attached deposit to it, needed once to receive $CUT. */
export const STORAGE_MIN_YOCTO = "10000000000000000000000";
export const CLAIM_GAS = "100000000000000";

/**
 * `claim()`, plus `unsave` for a save the viewer does not keep for the next cut. `claim` runs first, so the
 * unsave pays no prize twice. An account that never paid storage attaches the minimum once.
 */
export function collectCalls({ registered, unsaveRobotId }: { registered: boolean; unsaveRobotId: string | null }): ContractCall[] {
  const calls: ContractCall[] = [{ method: "claim", args: {}, deposit: registered ? "0" : STORAGE_MIN_YOCTO, gas: CLAIM_GAS }];
  if (unsaveRobotId) calls.push({ method: "unsave", args: { robot_id: unsaveRobotId }, deposit: "0", gas: CLAIM_GAS });
  return calls;
}
