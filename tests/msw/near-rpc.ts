import { http, HttpResponse, type HttpHandler } from "msw";
import { baseEncode, decodeSignedTransaction } from "near-api-js";

/** What a view method answers: a JSON value, or a contract panic. */
export type ViewAnswer = { value: unknown } | { panic: string };

export type AccessKeyPermissionJson =
  | "FullAccess"
  | { FunctionCall: { allowance: string | null; receiver_id: string; method_names: string[] } };

export type SentCall = { signerId: string; receiverId: string; methodName: string; args: unknown; gas: bigint; deposit: bigint };

/** The answer to a submitted transaction: success, a contract failure, or an RPC error. */
export type SendAnswer = { status: "success"; logs?: string[] } | { status: "failure"; panic: string } | { error: "timeout" };

/**
 * A fake NEAR chain behind one JSON-RPC URL: view calls, access keys, blocks and `send_tx`, in the
 * wire format near-api-js parses. Tests mutate it and read `calls` / `sent`.
 */
export class FakeChain {
  views = new Map<string, (args: Record<string, unknown>) => ViewAnswer>();
  accessKeys = new Map<string, { nonce: number; permission: AccessKeyPermissionJson }>();
  block = { height: 190_000_000, timestampMs: Date.UTC(2026, 10, 13, 18, 0, 5) };
  onSend: (call: SentCall) => SendAnswer = () => ({ status: "success" });
  /** Every JSON-RPC request, in order. */
  readonly calls: { method: string; params: Record<string, unknown> }[] = [];
  readonly sent: SentCall[] = [];

  constructor(readonly contractId = "thecut.testnet") {}

  view(method: string, answer: ViewAnswer | ((args: Record<string, unknown>) => ViewAnswer)): this {
    this.views.set(method, typeof answer === "function" ? answer : () => answer);
    return this;
  }

  addKey(accountId: string, publicKey: string, permission: AccessKeyPermissionJson = "FullAccess"): this {
    this.accessKeys.set(`${accountId}/${publicKey}`, { nonce: 1, permission });
    return this;
  }

  handler(url: string): HttpHandler {
    return http.post(url, async ({ request }) => {
      const body = (await request.json()) as { id: string; method: string; params: Record<string, unknown> };
      this.calls.push({ method: body.method, params: body.params });
      const reply = (payload: object) => HttpResponse.json({ jsonrpc: "2.0", id: body.id, ...payload });
      return reply(this.answer(body.method, body.params));
    });
  }

  private blockHash(): string {
    return baseEncode(new Uint8Array(32).fill(7));
  }

  private handlerError(name: string, info: Record<string, unknown>) {
    return {
      error: {
        name: "HANDLER_ERROR",
        cause: { name, info: { ...info, block_height: this.block.height, block_hash: this.blockHash() } },
        code: -32000,
        message: "Server error",
      },
    };
  }

  private answer(method: string, params: Record<string, unknown>): object {
    if (method === "block") {
      const ns = BigInt(this.block.timestampMs) * 1_000_000n;
      return {
        result: {
          author: "node0",
          chunks: [],
          header: { height: this.block.height, hash: this.blockHash(), prev_hash: this.blockHash(), timestamp: Number(ns), timestamp_nanosec: ns.toString() },
        },
      };
    }
    if (method === "query" && params.request_type === "call_function") {
      const view = this.views.get(String(params.method_name));
      if (params.account_id !== this.contractId || !view) {
        return this.handlerError("CONTRACT_EXECUTION_ERROR", { vm_error: `MethodResolveError(MethodNotFound): ${String(params.method_name)}` });
      }
      const args = JSON.parse(Buffer.from(String(params.args_base64), "base64").toString("utf8") || "{}") as Record<string, unknown>;
      const answer = view(args);
      if ("panic" in answer) return this.handlerError("CONTRACT_EXECUTION_ERROR", { vm_error: `Smart contract panicked: ${answer.panic}` });
      const bytes = [...Buffer.from(JSON.stringify(answer.value), "utf8")];
      return { result: { result: bytes, logs: [], block_height: this.block.height, block_hash: this.blockHash() } };
    }
    if (method === "query" && params.request_type === "view_access_key") {
      const key = this.accessKeys.get(`${String(params.account_id)}/${String(params.public_key)}`);
      if (!key) return this.handlerError("UNKNOWN_ACCESS_KEY", { public_key: params.public_key });
      return { result: { nonce: key.nonce, permission: key.permission, block_height: this.block.height, block_hash: this.blockHash() } };
    }
    if (method === "send_tx") return this.send(String(params.signed_tx_base64));
    return { error: { name: "REQUEST_VALIDATION_ERROR", cause: { name: "METHOD_NOT_FOUND", info: { method_name: method } }, code: -32601, message: "Method not found" } };
  }

  private send(signedTxBase64: string): object {
    const { transaction } = decodeSignedTransaction(Buffer.from(signedTxBase64, "base64"));
    const call = transaction.actions[0]?.functionCall;
    const sent: SentCall = {
      signerId: transaction.signerId,
      receiverId: transaction.receiverId,
      methodName: call?.methodName ?? "",
      args: call ? JSON.parse(Buffer.from(call.args).toString("utf8") || "{}") : null,
      gas: call?.gas ?? 0n,
      deposit: call?.deposit ?? 0n,
    };
    this.sent.push(sent);
    const answer = this.onSend(sent);
    if ("error" in answer) {
      return { error: { name: "HANDLER_ERROR", cause: { name: "TIMEOUT_ERROR", info: {} }, code: -32000, message: "Server error" } };
    }
    const txHash = baseEncode(new Uint8Array(32).fill(this.sent.length));
    const outcome = (id: string, executor: string, logs: string[], status: object) => ({
      id,
      block_hash: this.blockHash(),
      outcome: { logs, receipt_ids: [], gas_burnt: 1, tokens_burnt: "0", executor_id: executor, status },
      proof: [],
    });
    const failure = { ActionError: { index: 0, kind: { FunctionCallError: { ExecutionError: `Smart contract panicked: ${"panic" in answer ? answer.panic : ""}` } } } };
    const receiptStatus = answer.status === "success" ? { SuccessValue: "" } : { Failure: failure };
    return {
      result: {
        final_execution_status: "EXECUTED_OPTIMISTIC",
        status: answer.status === "success" ? { SuccessValue: "" } : { Failure: failure },
        transaction: { hash: txHash, signer_id: sent.signerId, receiver_id: sent.receiverId },
        transaction_outcome: outcome(txHash, sent.signerId, [], { SuccessReceiptId: "receipt" }),
        receipts_outcome: [outcome("receipt", sent.receiverId, answer.status === "success" ? (answer.logs ?? []) : [], receiptStatus)],
      },
    };
  }
}
