import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { SAMPLE_CLAIMABLE, SAMPLE_REGISTERED, SAMPLE_SAVES } from "./api/sample";
import type { Save } from "./model/types";

export async function getSaves(accountId: string): Promise<Save[]> {
  if (dataSource() === "live") {
    const saves = await cutContract().getSaves(accountId);
    return saves.map((save) => ({ accountId, ...save }));
  }
  return SAMPLE_SAVES.filter((save) => save.accountId === accountId);
}

/** $CUT the account can collect now with `claim()`: prizes earned by its saves plus its creator slices. */
export async function getClaimable(accountId: string): Promise<bigint> {
  if (dataSource() === "live") return cutContract().getClaimable(accountId);
  return SAMPLE_CLAIMABLE.get(accountId) ?? 0n;
}

/** True when the account has paid its NEP-145 storage, so it can receive $CUT (from `claim()`) without a deposit. */
export async function isStorageRegistered(accountId: string): Promise<boolean> {
  if (dataSource() === "live") return (await cutContract().storageBalanceOf(accountId)) !== null;
  return SAMPLE_REGISTERED.has(accountId);
}
