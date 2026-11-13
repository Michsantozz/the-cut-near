import "server-only";

import { SAMPLE_SAVES } from "./api/sample";
import type { Save } from "./model/types";

export async function getSaves(accountId: string): Promise<Save[]> {
  return SAMPLE_SAVES.filter((save) => save.accountId === accountId);
}
