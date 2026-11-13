import "server-only";
import { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";

/**
 * Every failure of a NEAR AI Cloud call, as one error type with a `code` to switch on.
 * - `config`: the API key is missing or a setting is invalid.
 * - `not-private`: the model does not run in a TEE (anonymised provider model), so its lines could not be signed.
 * - `rate-limited` / `http`: the API answered with an error status after all retries.
 * - `timeout` / `network`: no answer, after all retries.
 * - `bad-response`: the API answered 2xx with a body we cannot use.
 * - `signature-unavailable`: no signature for a chat id after a bounded wait.
 */
export type NearAiErrorCode = "config" | "not-private" | "rate-limited" | "http" | "timeout" | "network" | "bad-response" | "signature-unavailable";

export class NearAiError extends Error {
  readonly code: NearAiErrorCode;
  /** HTTP status of the last answer, when there was one. */
  readonly status: number | undefined;

  constructor(code: NearAiErrorCode, message: string, options: { status?: number; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "NearAiError";
    this.code = code;
    this.status = options.status;
  }

  /** True when trying again later can succeed (rate limits, outages, timeouts, a signature not recorded yet). */
  get retryable(): boolean {
    return this.code === "rate-limited" || this.code === "timeout" || this.code === "network" || this.code === "signature-unavailable" || (this.code === "http" && (this.status ?? 0) >= 500);
  }
}

export function isNearAiError(error: unknown, code?: NearAiErrorCode): error is NearAiError {
  return error instanceof NearAiError && (code === undefined || error.code === code);
}

/** Maps an `openai` SDK error (already retried by the SDK) to a NearAiError. Leaves NearAiErrors as they are. */
export function toNearAiError(error: unknown, what: string): NearAiError {
  if (error instanceof NearAiError) return error;
  if (error instanceof APIConnectionTimeoutError) return new NearAiError("timeout", `${what}: timed out.`, { cause: error });
  if (error instanceof APIUserAbortError) return new NearAiError("timeout", `${what}: aborted.`, { cause: error });
  if (error instanceof APIConnectionError) return new NearAiError("network", `${what}: network error (${error.message}).`, { cause: error });
  if (error instanceof APIError) {
    const status = typeof error.status === "number" ? error.status : undefined;
    if (status === 429) return new NearAiError("rate-limited", `${what}: rate limited (429).`, { status, cause: error });
    if (status === 401 || status === 403) return new NearAiError("config", `${what}: the API key was refused (${status}).`, { status, cause: error });
    return new NearAiError("http", `${what}: HTTP ${status ?? "error"} (${error.message}).`, { status, cause: error });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new NearAiError("network", `${what}: ${message}`, { cause: error });
}
