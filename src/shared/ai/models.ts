import "server-only";
import type { ModelEntry, NearAiClient } from "./client";
import { NearAiError } from "./errors";

/**
 * Models NEAR runs on its own TEE fleet ("Confidential TEE" in the catalog, "Private" in the docs) report
 * `owned_by: "nearai"` in `GET /v1/models`. Only these produce `provider_tee` signatures backed by a NEAR
 * model attestation. Provider models (anthropic/*, openai/gpt-*, google/*, x-ai/*…) are anonymised:
 * they run outside a TEE. https://docs.near.ai/cloud/models.md
 */
export const PRIVATE_MODEL_OWNER = "nearai";

export function isPrivateTextModel(entry: ModelEntry): boolean {
  return entry.owned_by === PRIVATE_MODEL_OWNER && (entry.output_modalities === undefined || entry.output_modalities.includes("text"));
}

const checked = new Map<string, Promise<void>>();

/**
 * Throws a `not-private` NearAiError unless `model` is a Private text model in the live list.
 * The live list is read once per process and model; a failed read is retried on the next call.
 */
export function assertPrivateModel(client: NearAiClient, model: string): Promise<void> {
  const key = `${client.baseURL} ${model}`;
  const cached = checked.get(key);
  if (cached) return cached;
  const check = client.listModels().then((models) => {
    const entry = models.find((m) => m.id === model);
    if (!entry) throw new NearAiError("not-private", `Model ${model} is not in the NEAR AI Cloud model list. Use an exact id from GET /v1/models.`);
    if (!isPrivateTextModel(entry)) {
      throw new NearAiError("not-private", `Model ${model} is owned by "${entry.owned_by ?? "unknown"}": it is not a Private (TEE) text model. Pick one with owned_by "nearai".`);
    }
  });
  checked.set(key, check);
  check.catch(() => checked.delete(key));
  return check;
}
