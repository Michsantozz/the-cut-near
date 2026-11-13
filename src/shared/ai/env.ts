import "server-only";
import { z } from "zod";

/**
 * NEAR AI Cloud settings, read from the environment.
 *
 * Choosing the model (`NEAR_AI_MODEL`): only "Private" models run inside a TEE and sign their replies.
 * In the live list (`curl https://cloud-api.near.ai/v1/models`) those are the entries with
 * `"owned_by": "nearai"` (the catalog at https://near.ai/models labels them "Confidential TEE").
 * Anthropic, OpenAI, Google, xAI and other provider models are "Incognito"/anonymised: they run
 * outside a TEE, so they are refused at runtime (see `assertPrivateModel`). Copy the exact `id`
 * (canonical, never an alias: the model id is part of the signed text). Default: `z-ai/glm-5.3-flash`.
 */
export const DEFAULT_NEAR_AI_MODEL = "z-ai/glm-5.3-flash";
export const DEFAULT_NEAR_AI_BASE_URL = "https://cloud-api.near.ai/v1";

// An optional key copied from .env.example as `KEY=` is empty, which means "not set".
const blankIsUnset = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

export const aiEnvSchema = z.object({
  /** API key from https://cloud.near.ai. Needed to generate lines and read signatures, not to read stored proofs. */
  NEAR_AI_API_KEY: z.preprocess(blankIsUnset, z.string().min(1).optional()),
  NEAR_AI_MODEL: z.preprocess(blankIsUnset, z.string().min(3).default(DEFAULT_NEAR_AI_MODEL)),
  NEAR_AI_BASE_URL: z.preprocess(blankIsUnset, z.url().default(DEFAULT_NEAR_AI_BASE_URL)),
  /** Per-request timeout in milliseconds. */
  NEAR_AI_TIMEOUT_MS: z.preprocess(blankIsUnset, z.coerce.number().int().min(1_000).max(300_000).default(45_000)),
  /** Retries for 408/409/429/5xx and network errors, with exponential backoff that honors Retry-After. */
  NEAR_AI_MAX_RETRIES: z.preprocess(blankIsUnset, z.coerce.number().int().min(0).max(8).default(3)),
  /** Algorithm used for both the attestation report and the chat signature. */
  NEAR_AI_SIGNING_ALGO: z.preprocess(blankIsUnset, z.enum(["ecdsa", "ed25519"]).default("ecdsa")),
  /** Sent as `reasoning_effort`. "low" keeps GLM-5.3 Flash replies fast; "none" omits the field. */
  NEAR_AI_REASONING_EFFORT: z.preprocess(blankIsUnset, z.enum(["none", "low", "medium", "high"]).default("low")),
  /** "on" checks the Intel TDX quote (dcap-qvl + Phala PCCS) and the GPU evidence (NVIDIA NRAS) for every attestation. */
  NEAR_AI_HARDWARE_CHECKS: z.preprocess(blankIsUnset, z.enum(["on", "off"]).default("on")),
});

export type AiEnv = z.infer<typeof aiEnvSchema>;

/** Parses the AI settings from `env`. Throws a ZodError naming the bad variable. */
export function readAiEnv(env: Record<string, string | undefined> = process.env): AiEnv {
  return aiEnvSchema.parse(env);
}
