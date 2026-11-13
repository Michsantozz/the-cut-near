import type { z } from "zod";

/** Every RPC endpoint failed for a transient reason (network, timeout, 5xx, 429, syncing node). */
export class RpcUnavailableError extends Error {
  override readonly name = "RpcUnavailableError";
  constructor(
    readonly attempts: readonly { url: string; error: unknown }[],
  ) {
    super(`All ${attempts.length} NEAR RPC endpoints failed: ${attempts.map((a) => `${a.url} (${describe(a.error)})`).join("; ")}`);
  }
}

/** The contract answered a view call with an error (missing method, panic, no contract deployed). */
export class ContractViewError extends Error {
  override readonly name = "ContractViewError";
  constructor(
    readonly method: string,
    options: { cause: unknown },
  ) {
    super(`View ${method} failed: ${describe(options.cause)}`, options);
  }
}

/** The contract answered, but not in the shape docs/contract-interface.md promises. */
export class ContractResponseError extends Error {
  override readonly name = "ContractResponseError";
  constructor(
    readonly method: string,
    readonly issues: readonly z.core.$ZodIssue[],
  ) {
    super(`View ${method} returned an unexpected shape: ${issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`);
  }
}

export function describe(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}
