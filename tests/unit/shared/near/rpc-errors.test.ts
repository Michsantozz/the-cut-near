import { KeyPair, TypedError } from "near-api-js";
import { AccessKeyDoesNotExistError, AccountDoesNotExistError, InternalRpcError, NodeIsSyncingError, RpcError } from "near-api-js/rpc-errors";
import { describe, expect, it } from "vitest";
import { isTransientRpcError, RpcTimeoutError } from "@/shared/near/rpc";

describe("isTransientRpcError", () => {
  it.each([
    ["a timeout", new RpcTimeoutError("slow")],
    ["a syncing node", new NodeIsSyncingError()],
    ["an internal node error", new InternalRpcError("boom")],
    ["exhausted retries", new TypedError("Exceeded 2 attempts", "RetriesExceeded")],
    ["a network failure", new TypeError("fetch failed")],
    ["a non-JSON body", new SyntaxError("Unexpected token <")],
    ["HTTP 429 from near-api-js", new Error("Too many requests", { cause: 429 })],
  ])("fails over on %s", (_, error) => {
    expect(isTransientRpcError(error)).toBe(true);
  });

  it.each([
    ["an unknown account", new AccountDoesNotExistError("x.testnet", "hash", 1)],
    ["a generic RPC error", new RpcError("Unknown RPC error")],
    ["a signature check", new Error("Signature verification failed")],
    ["a bug in the caller", new TypeError("Cannot read properties of undefined")],
    ["a non-error", "boom"],
  ])("answers once on %s", (_, error) => {
    expect(isTransientRpcError(error)).toBe(false);
  });

  it("treats a missing access key as an answer", () => {
    const publicKey = KeyPair.fromRandom("ed25519").getPublicKey();
    expect(isTransientRpcError(new AccessKeyDoesNotExistError(publicKey, "hash", 1))).toBe(false);
  });
});
