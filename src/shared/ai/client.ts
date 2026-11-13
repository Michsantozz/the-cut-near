import "server-only";
import OpenAI, { NotFoundError } from "openai";
import { z } from "zod";
import { readAiEnv, type AiEnv } from "./env";
import { NearAiError, toNearAiError } from "./errors";
import { fromUtf8, utf8 } from "./verify/bytes";
import { attestationReportSchema, chatSignatureSchema, signatureUnavailableSchema, type AttestationReport, type ChatSignature, type SigningAlgo } from "./verify/schemas";

// NEAR AI Cloud client: the OpenAI-compatible gateway at https://cloud-api.near.ai/v1, reached through
// the `openai` SDK (timeouts, and retries with exponential backoff for 408/409/429/5xx and network errors,
// honoring Retry-After). Chat calls keep the exact request and response bytes, because the TEE signs
// their SHA-256 hashes: https://docs.near.ai/cloud/verification/cloud-api/response-signatures.md

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  seed?: number;
  reasoning_effort?: "low" | "medium" | "high";
  response_format?: { type: "json_object" } | { type: "json_schema"; json_schema: { name: string; strict?: boolean; schema: Record<string, unknown> } };
  /** Signatures are only checked for non-streamed replies here: a streamed reply is re-signed by the gateway. */
  stream?: false;
};

export const chatCompletionSchema = z.looseObject({
  id: z.string().min(1),
  model: z.string().optional(),
  choices: z
    .array(
      z.looseObject({
        finish_reason: z.string().nullish(),
        message: z.looseObject({ content: z.string().nullish(), reasoning_content: z.string().nullish() }),
      }),
    )
    .min(1),
  usage: z.looseObject({ prompt_tokens: z.number(), completion_tokens: z.number() }).optional(),
});
export type ChatCompletion = z.infer<typeof chatCompletionSchema>;

/** A chat completion with the exact bytes that went over the wire, as UTF-8 text. */
export type RawCompletion = {
  /** Exact request body sent. */
  requestBody: string;
  /** Exact response body received, before any parsing. */
  responseBody: string;
  completion: ChatCompletion;
  chatId: string;
  receivedAt: Date;
};

export const modelEntrySchema = z.looseObject({ id: z.string(), owned_by: z.string().optional(), output_modalities: z.array(z.string()).optional() });
export type ModelEntry = z.infer<typeof modelEntrySchema>;
const modelListSchema = z.looseObject({ data: z.array(modelEntrySchema) });

export type SignatureWait = { attempts: number; delayMs: number };

export type NearAiClientOptions = {
  apiKey: string;
  baseURL?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Bounded wait for a signature that is not recorded yet (404 or "not found"). Default: 6 tries, 500 ms doubling, at most 4 s apart. */
  signatureWait?: SignatureWait;
};

export interface NearAiClient {
  readonly baseURL: string;
  /** POSTs `/chat/completions` with `request` serialized once, and returns the exact bytes both ways. */
  chatCompletion(request: ChatCompletionRequest): Promise<RawCompletion>;
  /** Gateway report plus NEAR model-report candidates for `model`, bound to `nonce`. */
  attestationReport(params: { model: string; nonce: string; signingAlgo: SigningAlgo }): Promise<AttestationReport>;
  /** The signature of a chat id, waiting a bounded time if it is not recorded yet. */
  chatSignature(params: { chatId: string; model: string; signingAlgo: SigningAlgo }): Promise<ChatSignature>;
  listModels(): Promise<ModelEntry[]>;
}

const DEFAULT_SIGNATURE_WAIT: SignatureWait = { attempts: 6, delayMs: 500 };
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The model id must reach the TEE unchanged: it is part of the signed text. */
const NO_ALIASING = { "x-no-aliasing": "true" } as const;

export function createNearAiClient(options: NearAiClientOptions): NearAiClient {
  const baseURL = (options.baseURL ?? "https://cloud-api.near.ai/v1").replace(/\/+$/, "");
  const sdk = new OpenAI({
    apiKey: options.apiKey,
    baseURL,
    timeout: options.timeoutMs ?? 45_000,
    maxRetries: options.maxRetries ?? 3,
    // Resolved per call, so a fetch patched after construction (tests, instrumentation) is used.
    fetch: (input, init) => globalThis.fetch(input, init),
  });
  const wait = options.signatureWait ?? DEFAULT_SIGNATURE_WAIT;

  const parse = <T>(schema: z.ZodType<T>, value: unknown, what: string): T => {
    const result = schema.safeParse(value);
    if (!result.success) throw new NearAiError("bad-response", `${what}: unexpected body (${z.prettifyError(result.error)}).`);
    return result.data;
  };

  return {
    baseURL,

    async chatCompletion(request) {
      const requestBody = JSON.stringify({ ...request, stream: false });
      let bytes: Uint8Array;
      try {
        const response = await sdk
          .post("/chat/completions", {
            body: utf8(requestBody),
            headers: { "content-type": "application/json", accept: "application/json", "accept-encoding": "identity", ...NO_ALIASING },
          })
          .asResponse();
        bytes = new Uint8Array(await response.arrayBuffer());
      } catch (error) {
        throw toNearAiError(error, "Chat completion");
      }
      let responseBody: string;
      try {
        responseBody = fromUtf8(bytes);
      } catch {
        throw new NearAiError("bad-response", "Chat completion: the reply is not valid UTF-8.");
      }
      let json: unknown;
      try {
        json = JSON.parse(responseBody);
      } catch {
        throw new NearAiError("bad-response", "Chat completion: the reply is not JSON.");
      }
      const completion = parse(chatCompletionSchema, json, "Chat completion");
      return { requestBody, responseBody, completion, chatId: completion.id, receivedAt: new Date() };
    },

    async attestationReport({ model, nonce, signingAlgo }) {
      try {
        const body = await sdk.get<unknown>("/attestation/report", {
          query: { model, provider: "near", include_tls_fingerprint: "false", signing_algo: signingAlgo, nonce },
          headers: { accept: "application/json", ...NO_ALIASING },
        });
        return parse(attestationReportSchema, body, "Attestation report");
      } catch (error) {
        throw toNearAiError(error, "Attestation report");
      }
    },

    async chatSignature({ chatId, model, signingAlgo }) {
      let delay = wait.delayMs;
      let last = "no answer";
      for (let attempt = 1; attempt <= wait.attempts; attempt++) {
        try {
          const body = await sdk.get<unknown>(`/signature/${encodeURIComponent(chatId)}`, {
            query: { model, signing_algo: signingAlgo },
            headers: { accept: "application/json" },
          });
          const signature = chatSignatureSchema.safeParse(body);
          if (signature.success) return signature.data;
          const unavailable = signatureUnavailableSchema.safeParse(body);
          if (!unavailable.success) throw new NearAiError("bad-response", `Chat signature: unexpected body (${z.prettifyError(signature.error)}).`);
          last = `${unavailable.data.error_code}${unavailable.data.message ? `: ${unavailable.data.message}` : ""}`;
        } catch (error) {
          // A model can run on several TEE nodes; the node that served the chat may not have recorded the signature yet.
          if (!(error instanceof NotFoundError)) throw toNearAiError(error, "Chat signature");
          last = "404 not found";
        }
        if (attempt < wait.attempts) {
          await sleep(delay);
          delay = Math.min(delay * 2, 4_000);
        }
      }
      throw new NearAiError("signature-unavailable", `Chat signature for ${chatId}: unavailable after ${wait.attempts} tries (${last}).`);
    },

    async listModels() {
      try {
        const body = await sdk.get<unknown>("/models", { headers: { accept: "application/json" } });
        return parse(modelListSchema, body, "Model list").data;
      } catch (error) {
        throw toNearAiError(error, "Model list");
      }
    },
  };
}

/** A client configured from the environment. Throws a `config` NearAiError when NEAR_AI_API_KEY is not set. */
export function nearAiClientFromEnv(env: AiEnv = readAiEnv()): NearAiClient {
  if (!env.NEAR_AI_API_KEY) throw new NearAiError("config", "NEAR_AI_API_KEY is not set.");
  return createNearAiClient({ apiKey: env.NEAR_AI_API_KEY, baseURL: env.NEAR_AI_BASE_URL, timeoutMs: env.NEAR_AI_TIMEOUT_MS, maxRetries: env.NEAR_AI_MAX_RETRIES });
}
