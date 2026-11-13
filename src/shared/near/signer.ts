import "server-only";
import { Account, KeyPair, KeyPairSigner, actions, teraToGas, type KeyPairString } from "near-api-js";
import type { NearRpc } from "./rpc";

/** The configured key cannot be used: missing, full access, or not limited to the expected calls. */
export class SignerKeyError extends Error {
  override readonly name = "SignerKeyError";
}

export type CallOutcome =
  | { status: "success"; txHash: string; logs: string[] }
  | { status: "failure"; txHash: string; logs: string[]; failure: unknown }
  /** Submitted, but not executed by the time the RPC answered. */
  | { status: "pending"; txHash: string; logs: string[] };

export type FunctionCallSigner = {
  accountId: string;
  publicKey: string;
  receiverId: string;
  /** Calls one of the allowed methods on the receiver, with no deposit. Never throws for a contract failure. */
  call(method: string, args?: Record<string, unknown>, gas?: bigint): Promise<CallOutcome>;
};

export type FunctionCallSignerConfig = {
  rpc: NearRpc;
  accountId: string;
  privateKey: string;
  receiverId: string;
  /** Methods the key must be limited to. */
  methods: readonly string[];
};

const DEFAULT_GAS = teraToGas("300");

function isKeyPairString(value: string): value is KeyPairString {
  return /^(ed25519|secp256k1|ml-dsa-65):[1-9A-HJ-NP-Za-km-z]+$/.test(value);
}

/**
 * A server-side signer backed by a function-call access key. It checks the key on chain first and
 * refuses a full-access key, a key for another receiver, or one that allows any method, so a leaked
 * key can only make the calls it was created for (and never move NEAR: function-call keys cannot
 * attach deposits).
 */
export async function createFunctionCallSigner({ rpc, accountId, privateKey, receiverId, methods }: FunctionCallSignerConfig): Promise<FunctionCallSigner> {
  if (!isKeyPairString(privateKey)) throw new SignerKeyError("The private key must look like ed25519:<base58>.");
  let keyPair: KeyPair;
  try {
    keyPair = KeyPair.fromString(privateKey);
  } catch {
    throw new SignerKeyError("The private key could not be decoded.");
  }
  const publicKey = keyPair.getPublicKey().toString();

  const permission = await rpc.accessKey(accountId, publicKey);
  if (!permission) throw new SignerKeyError(`${publicKey} is not an access key of ${accountId}.`);
  if (permission.kind === "full") {
    throw new SignerKeyError(`Refusing the full-access key ${publicKey} of ${accountId}. Add a function-call key for ${methods.join(", ")} on ${receiverId}.`);
  }
  if (permission.receiverId !== receiverId) throw new SignerKeyError(`${publicKey} may call ${permission.receiverId}, not ${receiverId}.`);
  const missing = methods.filter((method) => !permission.methodNames.includes(method));
  if (permission.methodNames.length === 0 || missing.length > 0) {
    throw new SignerKeyError(`${publicKey} must be limited to ${methods.join(", ")} (it allows ${permission.methodNames.join(", ") || "any method"}).`);
  }

  const account = new Account(accountId, rpc.submissionProvider(), new KeyPairSigner(keyPair));

  return {
    accountId,
    publicKey,
    receiverId,
    async call(method, args = {}, gas = DEFAULT_GAS) {
      if (!methods.includes(method)) throw new SignerKeyError(`${method} is not one of the signer's methods.`);
      const response = await account.signAndSendTransaction({
        receiverId,
        actions: [actions.functionCall(method, args, gas, 0n)],
        throwOnFailure: false,
      });
      const txHash = response.transaction_outcome.id;
      const logs = [response.transaction_outcome, ...response.receipts_outcome].flatMap((o) => o.outcome.logs);
      const { status } = response;
      if (typeof status === "object" && "SuccessValue" in status) return { status: "success", txHash, logs };
      if (typeof status === "object" && "Failure" in status) return { status: "failure", txHash, logs, failure: status.Failure };
      return { status: "pending", txHash, logs };
    },
  };
}
