import { base64ToBytes } from "@/shared/lib/base64";

// Reads NEAR from the browser with plain fetch: JSON-RPC with failover across endpoints, and the FastNEAR Transactions API
// for a contract's recent function calls. Client-safe on purpose (no server env, no near-api-js), so a page can run its
// checks in front of the reader. Server code uses NearRpc (./rpc.ts).

/** No endpoint answered (network, timeout, HTTP error). */
export class BrowserRpcUnavailableError extends Error {
  override readonly name = "BrowserRpcUnavailableError";
}

/** An endpoint answered with an error about the request itself (unknown account, contract panic). Not retried. */
export class BrowserRpcAnswerError extends Error {
  override readonly name = "BrowserRpcAnswerError";
}

export type AccessKeyEntry = { publicKey: string; fullAccess: boolean };

export type AccountState = { codeHash: string; amount: bigint };

export type BrowserRpc = {
  readonly urls: readonly string[];
  /** The endpoint that answered last. */
  lastUrl(): string;
  view<T = unknown>(contractId: string, method: string, args?: Record<string, unknown>): Promise<T>;
  accessKeys(accountId: string): Promise<AccessKeyEntry[]>;
  account(accountId: string): Promise<AccountState>;
};

const describe = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 200);

function utf8Base64(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** JSON-RPC over `urls` in order; the last endpoint that answered stays preferred. */
export function browserRpc(urls: readonly string[], { timeoutMs = 8_000 }: { timeoutMs?: number } = {}): BrowserRpc {
  if (urls.length === 0) throw new Error("browserRpc needs at least one endpoint.");
  let preferred = 0;

  async function call<T>(method: string, params: unknown): Promise<T> {
    let lastError: unknown = null;
    for (let offset = 0; offset < urls.length; offset++) {
      const index = (preferred + offset) % urls.length;
      try {
        const response = await fetch(urls[index], {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jsonrpc: "2.0", id: "the-cut", method, params }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new BrowserRpcUnavailableError(`HTTP ${response.status}`);
        const body = (await response.json()) as { result?: T; error?: { name?: string; cause?: { name?: string }; message?: string; data?: unknown } };
        if (body.error) {
          const name = body.error.cause?.name ?? body.error.name ?? "error";
          // A node that is behind or overloaded may answer differently elsewhere.
          if (/INTERNAL|TIMEOUT|NO_SYNCED|NOT_SYNCED|UNAVAILABLE_SHARD|UNKNOWN_BLOCK/.test(name)) throw new BrowserRpcUnavailableError(name);
          throw new BrowserRpcAnswerError(`${name}: ${typeof body.error.data === "string" ? body.error.data : (body.error.message ?? "")}`.trim());
        }
        preferred = index;
        return body.result as T;
      } catch (error) {
        if (error instanceof BrowserRpcAnswerError) throw error;
        lastError = error;
      }
    }
    throw new BrowserRpcUnavailableError(`No NEAR endpoint answered (${describe(lastError)}).`);
  }

  return {
    urls,
    lastUrl: () => urls[preferred],
    async view<T = unknown>(contractId: string, method: string, args: Record<string, unknown> = {}): Promise<T> {
      const result = await call<{ result?: number[]; error?: string }>("query", {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: utf8Base64(JSON.stringify(args)),
      });
      if (result.error) throw new BrowserRpcAnswerError(`${method}: ${result.error}`);
      return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result ?? []))) as T;
    },
    async accessKeys(accountId: string): Promise<AccessKeyEntry[]> {
      const result = await call<{ keys: { public_key: string; access_key: { permission: unknown } }[] }>("query", {
        request_type: "view_access_key_list",
        finality: "final",
        account_id: accountId,
      });
      return result.keys.map(({ public_key, access_key }) => ({
        publicKey: public_key,
        fullAccess: access_key.permission === "FullAccess" || (typeof access_key.permission === "object" && access_key.permission !== null && "GasKeyFullAccess" in access_key.permission),
      }));
    },
    async account(accountId: string): Promise<AccountState> {
      const result = await call<{ code_hash: string; amount: string }>("query", { request_type: "view_account", finality: "final", account_id: accountId });
      return { codeHash: result.code_hash, amount: BigInt(result.amount) };
    },
  };
}

/** One successful function call to a contract, with its decoded JSON arguments. */
export type RecentCall = { txHash: string; signerId: string; method: string; args: unknown; blockTimestampNs: bigint };

/** The Transactions API takes at most this many hashes per request. */
const HASHES_PER_REQUEST = 20;

/**
 * The newest successful calls of `method` on `contractId`, from the last `scan` function-call transactions that touched it
 * (FastNEAR Transactions API: `POST /v0/account`, then `POST /v0/transactions` 20 hashes at a time). Arguments that are not
 * JSON come back as null.
 */
export async function recentCalls(txApiUrl: string, contractId: string, method: string, { scan = 200, timeoutMs = 15_000 }: { scan?: number; timeoutMs?: number } = {}): Promise<RecentCall[]> {
  const post = async <T>(path: string, body: unknown): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`${txApiUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new BrowserRpcUnavailableError(`${txApiUrl} did not answer (${describe(error)}).`);
    }
    if (!response.ok) throw new BrowserRpcUnavailableError(`${txApiUrl}${path} answered HTTP ${response.status}.`);
    return (await response.json()) as T;
  };

  const listed = await post<{ account_txs: { transaction_hash: string; tx_block_timestamp: string; is_success?: boolean; is_receiver?: boolean }[] }>("/v0/account", {
    account_id: contractId,
    is_function_call: true,
    desc: true,
    limit: scan,
  });
  const candidates = listed.account_txs.filter((tx) => tx.is_success !== false && tx.is_receiver !== false);
  const timestamps = new Map(candidates.map((tx) => [tx.transaction_hash, BigInt(tx.tx_block_timestamp)]));
  const hashes = [...timestamps.keys()];
  const chunks = Array.from({ length: Math.ceil(hashes.length / HASHES_PER_REQUEST) }, (_, i) => hashes.slice(i * HASHES_PER_REQUEST, (i + 1) * HASHES_PER_REQUEST));
  type TxDetail = { transaction: { hash: string; signer_id: string; receiver_id: string; actions: unknown[] } };
  const pages = await Promise.all(chunks.map((tx_hashes) => post<{ transactions: TxDetail[] }>("/v0/transactions", { tx_hashes })));

  const calls: RecentCall[] = [];
  for (const { transaction } of pages.flatMap((page) => page.transactions)) {
    if (transaction.receiver_id !== contractId) continue;
    for (const action of transaction.actions) {
      const call = typeof action === "object" && action !== null && "FunctionCall" in action ? (action as { FunctionCall: { method_name: string; args: string } }).FunctionCall : null;
      if (!call || call.method_name !== method) continue;
      const bytes = base64ToBytes(call.args);
      let args: unknown = null;
      try {
        args = bytes ? JSON.parse(new TextDecoder().decode(bytes)) : null;
      } catch {
        args = null;
      }
      calls.push({ txHash: transaction.hash, signerId: transaction.signer_id, method, args, blockTimestampNs: timestamps.get(transaction.hash) ?? 0n });
    }
  }
  return calls.sort((a, b) => (a.blockTimestampNs === b.blockTimestampNs ? 0 : a.blockTimestampNs > b.blockTimestampNs ? -1 : 1));
}
