import "server-only";

// NEAR AI Cloud, server side: client, settings, typed errors and the Private-model guard.
// Verification helpers live in `@/shared/ai/verify` (pure) and `@/shared/ai/verify/server` (network).
export { createNearAiClient, nearAiClientFromEnv, type ChatCompletion, type ChatCompletionRequest, type ChatMessage, type ModelEntry, type NearAiClient, type NearAiClientOptions, type RawCompletion, type SignatureWait } from "./client";
export { DEFAULT_NEAR_AI_MODEL, readAiEnv, type AiEnv } from "./env";
export { isNearAiError, NearAiError, type NearAiErrorCode } from "./errors";
export { assertPrivateModel, isPrivateTextModel, PRIVATE_MODEL_OWNER } from "./models";
