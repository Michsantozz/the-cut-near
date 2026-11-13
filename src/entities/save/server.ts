import "server-only";

import { dataSource } from "@/shared/config/data-source";
import { cutContract } from "@/shared/near/contract";
import { SAMPLE_SAVES } from "./api/sample";
import type { Save } from "./model/types";

export async function getSaves(accountId: string): Promise<Save[]> {
  if (dataSource() === "live") {
    const saves = await cutContract().getSaves(accountId);
    return saves.map((save) => ({ accountId, ...save }));
  }
  return SAMPLE_SAVES.filter((save) => save.accountId === accountId);
}
