import "server-only";
import { FailoverRpcProvider, JsonRpcProvider, TypedError, type BlockReference, type Provider } from "near-api-js";
import {
  AccessKeyDoesNotExistError,
  AccountDoesNotExistError,
  DoesNotTrackShardError,
  GarbageCollectedBlockError,
  InternalHandlerError,
  InternalRpcError,
  NoNewBlocksError,
  NoSyncedBlocksError,
  NodeIsSyncingError,
  NotSyncedYetError,
  RequestRoutedError,
  RpcError,
  ShardCongestedError,
  ShardNotTrackedError,
  ShardStuckError,
  TransactionTimeoutError,
  UnavailableShardError,
  UnknownBlockError,
} from "near-api-js/rpc-errors";
import type { z } from "zod";
import { publicEnv } from "@/shared/config/public";
import { serverEnv } from "@/shared/config/server";
import { ContractResponseError, ContractViewError, RpcUnavailableError } from "./errors";
import { rpcUrls } from "./network";

/** Raised by {@link NearRpc} when one endpoint takes longer than the attempt timeout. */
export class RpcTimeoutError extends Error {
  override readonly name = "RpcTimeoutError";
}

// Node-side conditions another endpoint may not share. Everything else the node answers
// (unknown account or key, contract panic, bad request) is deterministic and is not retried elsewhere.
const TRANSIENT_RPC_ERRORS = [
  InternalRpcError,
  InternalHandlerError,
  NodeIsSyncingError,
  NoSyncedBlocksError,
  NotSyncedYetError,
  NoNewBlocksError,
  UnavailableShardError,
  DoesNotTrackShardError,
  ShardNotTrackedError,
  RequestRoutedError,
  UnknownBlockError,
  GarbageCollectedBlockError,
  ShardCongestedError,
  ShardStuckError,
  TransactionTimeoutError,
] as const;

/** True for failures that say "this endpoint, right now" rather than "this request". */
export function isTransientRpcError(error: unknown): boolean {
  if (error instanceof RpcTimeoutError) return true;
  if (TRANSIENT_RPC_ERRORS.some((type) => error instanceof type)) return true;
  if (error instanceof RpcError) return false;
  if (error instanceof TypedError) return error.type === "RetriesExceeded";
  // fetch() network failure, or an endpoint that answered with something other than JSON-RPC.
  if (error instanceof TypeError) return /fetch/i.test(error.message);
  if (error instanceof SyntaxError) return true;
  if (error instanceof Error) {
    // near-api-js ProviderError: HTTP 408, 429, 500, 502 or 503, with the status as `cause`.
    if (typeof error.cause === "number") return true;
    return error.message.startsWith("JSON RPC response must include");
  }
  return false;
}

/** `gasKey` marks the gas-key variants, which carry their own NEAR balance for fees. */
export type AccessKeyPermission =
  | { kind: "full"; gasKey: boolean }
  | { kind: "function_call"; gasKey: boolean; receiverId: string; methodNames: readonly string[]; allowance: bigint | null };

export type BlockInfo = { height: number; hash: string; timestampNs: bigint; timestamp: Date };

export type NearRpcOptions = {
  /** Per-endpoint budget, including that endpoint's own retries. */
  attemptTimeoutMs?: number;
  /** Attempts per endpoint for 408/500/503 and network errors before moving to the next one. */
  attemptsPerEndpoint?: number;
};

/**
 * NEAR JSON-RPC with failover across endpoints. Unlike near-api-js `FailoverRpcProvider`, which
 * moves on after any rejection, this only fails over on transient errors: a missing account or a
 * contract panic is answered once instead of being repeated on every endpoint (and every rate limit).
 * The last endpoint that answered stays preferred.
 */
export class NearRpc {
  readonly urls: readonly string[];
  private readonly providers: JsonRpcProvider[];
  private readonly attemptTimeoutMs: number;
  private preferred = 0;

  constructor(urls: readonly string[], { attemptTimeoutMs = 8_000, attemptsPerEndpoint = 2 }: NearRpcOptions = {}) {
    if (urls.length === 0) throw new Error("NearRpc needs at least one endpoint.");
    this.urls = urls;
    this.attemptTimeoutMs = attemptTimeoutMs;
    this.providers = urls.map((url) => new JsonRpcProvider({ url }, { retries: attemptsPerEndpoint, wait: 200, backoff: 2 }));
  }

  /** Runs `operation` against the preferred endpoint, then the others, until one answers. */
  async run<T>(operation: (provider: Provider) => Promise<T>): Promise<T> {
    const attempts: { url: string; error: unknown }[] = [];
    for (let offset = 0; offset < this.providers.length; offset++) {
      const index = (this.preferred + offset) % this.providers.length;
      try {
        const result = await withTimeout(operation(this.providers[index]), this.attemptTimeoutMs);
        this.preferred = index;
        return result;
      } catch (error) {
        if (!isTransientRpcError(error)) throw error;
        attempts.push({ url: this.urls[index], error });
      }
    }
    throw new RpcUnavailableError(attempts);
  }

  /** Calls a view method and validates the decoded JSON with `schema`. */
  async view<T>(contractId: string, method: string, args: Record<string, unknown>, schema: z.ZodType<T>, blockQuery: BlockReference = { finality: "optimistic" }): Promise<T> {
    let raw: unknown;
    try {
      raw = await this.run((provider) => provider.callFunction({ contractId, method, args, blockQuery }));
    } catch (error) {
      if (error instanceof RpcUnavailableError) throw error;
      throw new ContractViewError(method, { cause: error });
    }
    const parsed = schema.safeParse(raw ?? null);
    if (!parsed.success) throw new ContractResponseError(method, parsed.error.issues);
    return parsed.data;
  }

  /** The permission of `publicKey` on `accountId`, or null when the account or the key does not exist. */
  async accessKey(accountId: string, publicKey: string): Promise<AccessKeyPermission | null> {
    try {
      const key = await this.run((provider) => provider.viewAccessKey({ accountId, publicKey, finalityQuery: { finality: "optimistic" } }));
      const permission = key.permission;
      if (permission === "FullAccess") return { kind: "full", gasKey: false };
      if ("GasKeyFullAccess" in permission) return { kind: "full", gasKey: true };
      const call = "FunctionCall" in permission ? permission.FunctionCall : permission.GasKeyFunctionCall;
      return {
        kind: "function_call",
        gasKey: !("FunctionCall" in permission),
        receiverId: call.receiver_id,
        methodNames: call.method_names,
        allowance: call.allowance === null || call.allowance === undefined ? null : BigInt(call.allowance),
      };
    } catch (error) {
      if (error instanceof AccessKeyDoesNotExistError || error instanceof AccountDoesNotExistError) return null;
      throw error;
    }
  }

  /** Liquid NEAR of `accountId` in yoctoNEAR (`amount`, staked NEAR excluded), or null when the account does not exist. */
  async nearBalance(accountId: string): Promise<bigint | null> {
    try {
      const account = await this.run((provider) => provider.viewAccount({ accountId, blockQuery: { finality: "optimistic" } }));
      return BigInt(account.amount);
    } catch (error) {
      if (error instanceof AccountDoesNotExistError) return null;
      throw error;
    }
  }

  /** How many full-access keys `accountId` has (0 for a locked contract), or null when the account does not exist. */
  async fullAccessKeyCount(accountId: string): Promise<number | null> {
    try {
      let count = 0;
      let afterKey: string | undefined;
      do {
        const page = await this.run((provider) => provider.viewAccessKeyList({ accountId, afterKey, finalityQuery: { finality: "final" } }));
        count += page.keys.filter(({ access_key }) => access_key.permission === "FullAccess" || (typeof access_key.permission === "object" && "GasKeyFullAccess" in access_key.permission)).length;
        afterKey = page.last_key ?? undefined;
      } while (afterKey);
      return count;
    } catch (error) {
      if (error instanceof AccountDoesNotExistError) return null;
      throw error;
    }
  }

  async block(finality: "final" | "optimistic" = "final"): Promise<BlockInfo> {
    const { header } = await this.run((provider) => provider.viewBlock({ finality }));
    const timestampNs = BigInt(header.timestamp_nanosec);
    return { height: header.height, hash: header.hash, timestampNs, timestamp: new Date(Number(timestampNs / 1_000_000n)) };
  }

  /**
   * A near-api-js provider for signing accounts. Transaction submission uses the library's
   * failover: resending the same signed transaction elsewhere is safe (its nonce makes it single-use).
   */
  submissionProvider(): Provider {
    return this.providers.length === 1 ? this.providers[0] : new FailoverRpcProvider(this.providers);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RpcTimeoutError(`No answer within ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const globalForRpc = globalThis as typeof globalThis & { __theCutRpc?: NearRpc };

/** The app's RPC client: NEAR_RPC_URL first, then the network's public endpoints. */
export function getRpc(): NearRpc {
  const urls = rpcUrls(publicEnv.network, serverEnv().NEAR_RPC_URL);
  const cached = globalForRpc.__theCutRpc;
  if (cached && cached.urls.join() === urls.join()) return cached;
  globalForRpc.__theCutRpc = new NearRpc(urls);
  return globalForRpc.__theCutRpc;
}
